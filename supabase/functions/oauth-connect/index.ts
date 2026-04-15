// supabase/functions/oauth-connect/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GADS_CLIENT_ID = Deno.env.get("GADS_CLIENT_ID");
    const GADS_CLIENT_SECRET = Deno.env.get("GADS_CLIENT_SECRET");
    if (!GADS_CLIENT_ID || !GADS_CLIENT_SECRET) {
      return jsonResponse({
        error: "OAuth client credentials not configured on the server."
      }, 500);
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { action } = body;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) {
      return jsonResponse({
        error: "Not authenticated"
      }, 401);
    }
    const { data: profile, error: profileErr } = await sb.from("user_profiles").select("id, agency_id, is_super_admin, role_id, roles(role_name)").eq("id", user.id).single();
    if (profileErr || !profile) {
      return jsonResponse({
        error: "User profile not found"
      }, 403);
    }
    const roleName = profile.roles?.role_name?.toLowerCase() ?? "";
    const isSuperAdmin = !!profile.is_super_admin;
    const isAdmin = isSuperAdmin || roleName === "admin" || roleName === "super_admin";
    if (!isAdmin) {
      return jsonResponse({
        error: "Admin privileges required to manage connections."
      }, 403);
    }
    const agencyId = body.agency_id || profile.agency_id;
    if (!agencyId) {
      return jsonResponse({
        error: "No agency associated with user."
      }, 400);
    }
    const platform = body.platform || "google_ads";
    const SCOPES = {
      google_ads: "https://www.googleapis.com/auth/adwords"
    };
    const scope = SCOPES[platform] || SCOPES.google_ads;
    // ── get_auth_url ────────────────────────────────────────────────
    if (action === "get_auth_url") {
      const redirectUri = body.redirect_uri;
      if (!redirectUri) {
        return jsonResponse({
          error: "redirect_uri is required"
        }, 400);
      }
      const params = new URLSearchParams({
        client_id: GADS_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scope + " https://www.googleapis.com/auth/userinfo.email",
        access_type: "offline",
        prompt: "consent",
        state: JSON.stringify({
          agency_id: agencyId,
          platform
        })
      });
      const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
      return jsonResponse({
        success: true,
        auth_url: authUrl
      });
    }
    // ── exchange_code ───────────────────────────────────────────────
    if (action === "exchange_code") {
      const { code, redirect_uri, mcc_id } = body;
      if (!code || !redirect_uri) {
        return jsonResponse({
          error: "code and redirect_uri are required"
        }, 400);
      }
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: GADS_CLIENT_ID,
          client_secret: GADS_CLIENT_SECRET,
          redirect_uri,
          grant_type: "authorization_code"
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.refresh_token) {
        console.error("[oauth-connect] Token exchange failed:", tokenData);
        return jsonResponse({
          error: tokenData.error_description || tokenData.error || "Token exchange failed. No refresh_token received. Try revoking access at myaccount.google.com/permissions and reconnecting."
        }, 400);
      }
      // Fetch Google email for this token
      let googleEmail = null;
      try {
        const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`
          }
        });
        if (infoRes.ok) {
          const info = await infoRes.json();
          googleEmail = info.email || null;
        }
      } catch (e) {
        console.warn("[oauth-connect] Failed to fetch Google email:", e);
      }
      // ── Upsert matching the existing unique constraint ─────────────
      const { error: upsertErr } = await sb.from("agency_platform_credentials").upsert({
        agency_id: agencyId,
        platform,
        google_email: googleEmail,
        oauth_refresh_token: tokenData.refresh_token,
        platform_mcc_id: mcc_id || null,
        token_scopes: scope,
        is_active: true,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        last_sync_status: null,
        last_error: null
      }, {
        onConflict: "agency_id,platform,google_email",
        ignoreDuplicates: false
      });
      if (upsertErr) {
        console.error("[oauth-connect] Upsert error:", upsertErr);
        return jsonResponse({
          error: "Failed to save credentials: " + upsertErr.message
        }, 500);
      }
      return jsonResponse({
        success: true
      });
    }
    // ── disconnect ──────────────────────────────────────────────────
    if (action === "disconnect") {
      const disconnectPlatform = body.platform;
      if (!disconnectPlatform) {
        return jsonResponse({
          error: "platform is required"
        }, 400);
      }
      const { error: updateErr } = await sb.from("agency_platform_credentials").update({
        is_active: false
      }).eq("agency_id", agencyId).eq("platform", disconnectPlatform);
      if (updateErr) {
        console.error("[oauth-connect] Disconnect error:", updateErr);
        return jsonResponse({
          error: "Failed to disconnect: " + updateErr.message
        }, 500);
      }
      return jsonResponse({
        success: true
      });
    }
    return jsonResponse({
      error: `Unknown action: ${action}`
    }, 400);
  } catch (err) {
    console.error("[oauth-connect] Unhandled error:", err);
    return jsonResponse({
      error: err.message || "Internal server error"
    }, 500);
  }
});
