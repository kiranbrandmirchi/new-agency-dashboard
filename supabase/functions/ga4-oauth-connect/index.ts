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
    const GA4_CLIENT_ID = Deno.env.get("GA4_CLIENT_ID");
    const GA4_CLIENT_SECRET = Deno.env.get("GA4_CLIENT_SECRET");
    if (!GA4_CLIENT_ID || !GA4_CLIENT_SECRET) {
      return jsonResponse({
        error: "GA4 OAuth client credentials not configured."
      }, 500);
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { action } = body;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) return jsonResponse({
      error: "Not authenticated"
    }, 401);
    const { data: profile, error: profileErr } = await sb.from("user_profiles").select("id, agency_id, is_super_admin, role_id, roles(role_name)").eq("id", user.id).single();
    if (profileErr || !profile) return jsonResponse({
      error: "User profile not found"
    }, 403);
    const roleName = profile.roles?.role_name?.toLowerCase() ?? "";
    const isSuperAdmin = !!profile.is_super_admin;
    const isAdmin = isSuperAdmin || roleName === "admin" || roleName === "super_admin";
    if (!isAdmin) return jsonResponse({
      error: "Admin privileges required."
    }, 403);
    const agencyId = body.agency_id || profile.agency_id;
    if (!agencyId) return jsonResponse({
      error: "No agency associated with user."
    }, 400);
    const scope = "https://www.googleapis.com/auth/analytics.readonly";
    // ── get_auth_url ──
    if (action === "get_auth_url") {
      const redirectUri = body.redirect_uri;
      if (!redirectUri) return jsonResponse({
        error: "redirect_uri is required"
      }, 400);
      const stateObj = {
        agency_id: agencyId,
        platform: "ga4"
      };
      if (body.credential_id) {
        stateObj.credential_id = body.credential_id;
      } else if (body.state) {
        try {
          const parsed = JSON.parse(body.state);
          if (parsed.credential_id) stateObj.credential_id = parsed.credential_id;
        } catch  {}
      }
      const params = new URLSearchParams({
        client_id: GA4_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope,
        access_type: "offline",
        prompt: "consent",
        state: JSON.stringify(stateObj)
      });
      return jsonResponse({
        success: true,
        auth_url: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString()
      });
    }
    // ── exchange_code ──
    if (action === "exchange_code") {
      const { code, redirect_uri, credential_id: existingCredId } = body;
      if (!code || !redirect_uri) return jsonResponse({
        error: "code and redirect_uri are required"
      }, 400);
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: GA4_CLIENT_ID,
          client_secret: GA4_CLIENT_SECRET,
          redirect_uri,
          grant_type: "authorization_code"
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.refresh_token) {
        console.error("[ga4-oauth-connect] Token exchange failed:", tokenData);
        return jsonResponse({
          error: tokenData.error_description || tokenData.error || "Token exchange failed."
        }, 400);
      }
      let googleEmail = "unknown";
      let displayName = "";
      try {
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: {
            Authorization: "Bearer " + tokenData.access_token
          }
        });
        const userinfo = await userinfoRes.json();
        if (userinfo.email) googleEmail = userinfo.email.toLowerCase();
        if (userinfo.name) displayName = userinfo.name;
      } catch (e) {
        console.warn("[ga4-oauth-connect] Could not fetch email:", e);
      }
      const credLabel = displayName ? displayName + " (" + googleEmail + ")" : googleEmail;
      // ── RECONNECT: if credential_id provided, UPDATE that row directly ──
      if (existingCredId) {
        const updatePayload = {
          oauth_refresh_token: tokenData.refresh_token,
          is_active: true,
          connected_by: user.id,
          connected_at: new Date().toISOString(),
          last_sync_status: null,
          last_error: null
        };
        if (googleEmail !== "unknown") {
          updatePayload.google_email = googleEmail;
          updatePayload.credential_label = credLabel;
        }
        const { data: updated, error: updateErr } = await sb.from("agency_platform_credentials").update(updatePayload).eq("id", existingCredId).eq("agency_id", agencyId).select("id, google_email").single();
        if (updateErr) {
          console.error("[ga4-oauth-connect] Update error:", updateErr);
          return jsonResponse({
            error: "Failed to update credential: " + updateErr.message
          }, 500);
        }
        console.log("[ga4-oauth-connect] Reconnected credential id=" + updated.id);
        return jsonResponse({
          success: true,
          credential_id: updated.id,
          google_email: updated.google_email,
          credential_label: credLabel
        });
      }
      // ── NEW CONNECTION: upsert by email (unchanged) ──
      const { data: upserted, error: upsertErr } = await sb.from("agency_platform_credentials").upsert({
        agency_id: agencyId,
        platform: "ga4",
        google_email: googleEmail,
        credential_label: credLabel,
        oauth_refresh_token: tokenData.refresh_token,
        platform_mcc_id: null,
        token_scopes: scope,
        is_active: true,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        last_sync_status: null,
        last_error: null
      }, {
        onConflict: "agency_id,platform,google_email",
        ignoreDuplicates: false
      }).select("id").single();
      if (upsertErr) {
        console.error("[ga4-oauth-connect] Upsert error:", upsertErr);
        return jsonResponse({
          error: "Failed to save credentials: " + upsertErr.message
        }, 500);
      }
      console.log("[ga4-oauth-connect] Saved credential for " + googleEmail + " id=" + upserted.id);
      return jsonResponse({
        success: true,
        credential_id: upserted.id,
        google_email: googleEmail,
        credential_label: credLabel
      });
    }
    // ── disconnect ──
    if (action === "disconnect") {
      const credentialId = body.credential_id;
      if (credentialId) {
        const { error: updateErr } = await sb.from("agency_platform_credentials").update({
          is_active: false
        }).eq("id", credentialId).eq("agency_id", agencyId);
        if (updateErr) return jsonResponse({
          error: "Failed to disconnect: " + updateErr.message
        }, 500);
      } else {
        const { error: updateErr } = await sb.from("agency_platform_credentials").update({
          is_active: false
        }).eq("agency_id", agencyId).eq("platform", "ga4");
        if (updateErr) return jsonResponse({
          error: "Failed to disconnect: " + updateErr.message
        }, 500);
      }
      return jsonResponse({
        success: true
      });
    }
    // ── list_credentials ──
    if (action === "list_credentials") {
      const { data, error: listErr } = await sb.from("agency_platform_credentials").select("id, credential_label, google_email, is_active, connected_at, last_sync_at").eq("agency_id", agencyId).eq("platform", "ga4").order("connected_at", {
        ascending: true
      });
      if (listErr) return jsonResponse({
        error: listErr.message
      }, 500);
      return jsonResponse({
        success: true,
        credentials: data || []
      });
    }
    return jsonResponse({
      error: `Unknown action: ${action}`
    }, 400);
  } catch (err) {
    console.error("[ga4-oauth-connect] Unhandled error:", err);
    return jsonResponse({
      error: err.message || "Internal server error"
    }, 500);
  }
});
