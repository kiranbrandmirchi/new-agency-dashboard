// supabase/functions/fb-oauth-connect/index.ts — Facebook Login → long-lived user token for Marketing API sync
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FB_API_VERSION = "v21.0";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const FB_APP_ID = Deno.env.get("FB_APP_ID") || "";
    const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET") || "";

    if (!FB_APP_ID || !FB_APP_SECRET) {
      return jsonResponse({ error: "FB_APP_ID and FB_APP_SECRET must be set for Meta OAuth." }, 500);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { data: profile, error: profileErr } = await sb
      .from("user_profiles")
      .select("id, agency_id, is_super_admin, role_id, roles(role_name)")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return jsonResponse({ error: "User profile not found" }, 403);
    }

    const roleName = (profile as { roles?: { role_name?: string } }).roles?.role_name?.toLowerCase() ?? "";
    const isSuperAdmin = !!(profile as { is_super_admin?: boolean }).is_super_admin;
    const isAdmin = isSuperAdmin || roleName === "admin" || roleName === "super_admin";
    if (!isAdmin) {
      return jsonResponse({ error: "Admin privileges required to manage connections." }, 403);
    }

    const agencyId = body.agency_id || (profile as { agency_id?: string }).agency_id;
    if (!agencyId) {
      return jsonResponse({ error: "No agency associated with user." }, 400);
    }

    const graphBase = `https://graph.facebook.com/${FB_API_VERSION}`;

    if (action === "get_auth_url") {
      const redirectUri = body.redirect_uri as string | undefined;
      if (!redirectUri) {
        return jsonResponse({ error: "redirect_uri is required" }, 400);
      }
      const state = JSON.stringify({
        agency_id: agencyId,
        platform: "facebook",
        redirect_uri: redirectUri,
      });
      const params = new URLSearchParams({
        client_id: FB_APP_ID,
        redirect_uri: redirectUri,
        state,
        response_type: "code",
        scope: "ads_read",
      });
      const authUrl = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?${params.toString()}`;
      return jsonResponse({ success: true, auth_url: authUrl, url: authUrl });
    }

    if (action === "exchange_code") {
      const code = body.code as string | undefined;
      const redirectUri = body.redirect_uri as string | undefined;
      if (!code || !redirectUri) {
        return jsonResponse({ error: "code and redirect_uri are required" }, 400);
      }

      const shortParams = new URLSearchParams({
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      });
      const shortRes = await fetch(`${graphBase}/oauth/access_token?${shortParams.toString()}`);
      const shortData = await shortRes.json().catch(() => ({}));
      if (shortData.error || !shortData.access_token) {
        const msg = typeof shortData.error === "object"
          ? (shortData.error as { message?: string }).message
          : shortData.error?.message || JSON.stringify(shortData).slice(0, 400);
        return jsonResponse({ error: msg || "Facebook code exchange failed" }, 400);
      }

      let longToken = shortData.access_token as string;
      const exParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        fb_exchange_token: longToken,
      });
      const longRes = await fetch(`${graphBase}/oauth/access_token?${exParams.toString()}`);
      const longData = await longRes.json().catch(() => ({}));
      if (longData.access_token) {
        longToken = longData.access_token;
      }

      // Cannot use PostgREST upsert onConflict(agency_id, platform): DB only has a *partial* unique index
      // uq_agency_platform_non_ga4, which does not satisfy ON CONFLICT — use update-or-insert instead.
      const { data: existingRows, error: selErr } = await sb
        .from("agency_platform_credentials")
        .select("id")
        .eq("agency_id", agencyId)
        .eq("platform", "facebook")
        .limit(1);

      if (selErr) {
        console.error("[fb-oauth-connect] select:", selErr);
        return jsonResponse({ error: "Failed to look up credentials: " + selErr.message }, 500);
      }

      const tokenPayload = {
        oauth_refresh_token: longToken,
        is_active: true,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        token_scopes: "ads_read",
        last_sync_status: null,
        last_error: null,
      };

      const existingId = existingRows?.[0]?.id as string | undefined;
      if (existingId) {
        const { error: updErr } = await sb
          .from("agency_platform_credentials")
          .update(tokenPayload)
          .eq("id", existingId);
        if (updErr) {
          console.error("[fb-oauth-connect] update:", updErr);
          return jsonResponse({ error: "Failed to save credentials: " + updErr.message }, 500);
        }
      } else {
        const { error: insErr } = await sb.from("agency_platform_credentials").insert({
          agency_id: agencyId,
          platform: "facebook",
          ...tokenPayload,
        });
        if (insErr) {
          console.error("[fb-oauth-connect] insert:", insErr);
          return jsonResponse({ error: "Failed to save credentials: " + insErr.message }, 500);
        }
      }
      return jsonResponse({ success: true });
    }

    if (action === "disconnect") {
      const { error: updateErr } = await sb
        .from("agency_platform_credentials")
        .update({ is_active: false })
        .eq("agency_id", agencyId)
        .eq("platform", "facebook");
      if (updateErr) {
        return jsonResponse({ error: "Failed to disconnect: " + updateErr.message }, 500);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const e = err as Error;
    console.error("[fb-oauth-connect]", e);
    return jsonResponse({ error: e.message || "Internal server error" }, 500);
  }
});
