// supabase/functions/reddit-oauth-connect/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: object, status = 200) {
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const REDDIT_CLIENT_ID = Deno.env.get("REDDIT_CLIENT_ID");
    const REDDIT_CLIENT_SECRET = Deno.env.get("REDDIT_CLIENT_SECRET");

    if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
      return jsonResponse({ error: "Reddit OAuth credentials not configured." }, 500);
    }

    const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    let { data: profile, error: profileErr } = await sb
      .from("user_profiles")
      .select("id, agency_id, is_super_admin, role_id, roles(role_name)")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      const { data: defaultRole } = await sb.from("roles").select("id").eq("role_name", "viewer").limit(1).maybeSingle();
      const roleId = defaultRole?.id ?? (await sb.from("roles").select("id").limit(1).maybeSingle()).data?.id;
      if (roleId) {
        const { error: upsertErr } = await sb.from("user_profiles").upsert({
          id: user.id,
          email: user.email ?? null,
          full_name: (user.user_metadata as Record<string, unknown>)?.full_name as string ?? null,
          role_id: roleId,
        }, { onConflict: "id", ignoreDuplicates: true });
        if (!upsertErr) {
          const retry = await sb.from("user_profiles").select("id, agency_id, is_super_admin, role_id, roles(role_name)").eq("id", user.id).single();
          profile = retry.data;
        }
      }
    }
    if (!profile) {
      return jsonResponse({ error: "User profile not found. Please contact your administrator to set up your account." }, 403);
    }

    const roleName = (profile.roles?.role_name ?? "").toLowerCase();
    const isAdmin = !!profile.is_super_admin || roleName === "admin" || roleName === "super_admin";
    if (!isAdmin) {
      return jsonResponse({ error: "Admin privileges required." }, 403);
    }

    const agencyId = body.agency_id || profile.agency_id;
    if (!agencyId) {
      return jsonResponse({ error: "No agency associated with user." }, 400);
    }

    // ── get_auth_url ────────────────────────────────────────────────
    if (action === "get_auth_url") {
      const redirectUri = body.redirect_uri;
      if (!redirectUri) {
        return jsonResponse({ error: "redirect_uri is required" }, 400);
      }

      const state = JSON.stringify({ agency_id: agencyId, platform: "reddit" });
      const params = new URLSearchParams({
        client_id: REDDIT_CLIENT_ID,
        response_type: "code",
        state,
        redirect_uri: redirectUri,
        duration: "permanent",
        scope: "adsread",
      });

      const authUrl = `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
      return jsonResponse({ success: true, url: authUrl });
    }

    // ── exchange_code ───────────────────────────────────────────────
    if (action === "exchange_code") {
      const { code, redirect_uri } = body;
      if (!code || !redirect_uri) {
        return jsonResponse({ error: "code and redirect_uri are required" }, 400);
      }

      const basicAuth = btoa(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`);
      const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`,
          "User-Agent": "AgencyDashboard:1.0 (by /u/reddit_ads)",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.refresh_token) {
        console.error("[reddit-oauth-connect] Token exchange failed:", tokenData);
        return jsonResponse({
          error: tokenData.error || tokenData.message || "Token exchange failed. No refresh_token received.",
        }, 400);
      }

      const { error: upsertErr } = await sb.from("agency_platform_credentials").upsert(
        {
          agency_id: agencyId,
          platform: "reddit",
          oauth_refresh_token: tokenData.refresh_token,
          token_scopes: "adsread",
          is_active: true,
          connected_by: user.id,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "agency_id,platform", ignoreDuplicates: false }
      );

      if (upsertErr) {
        console.error("[reddit-oauth-connect] Upsert error:", upsertErr);
        return jsonResponse({ error: "Failed to save credentials: " + upsertErr.message }, 500);
      }

      return jsonResponse({ success: true });
    }

    // ── disconnect ──────────────────────────────────────────────────
    if (action === "disconnect") {
      const { error: updateErr } = await sb
        .from("agency_platform_credentials")
        .update({ is_active: false })
        .eq("agency_id", agencyId)
        .eq("platform", "reddit");

      if (updateErr) {
        console.error("[reddit-oauth-connect] Disconnect error:", updateErr);
        return jsonResponse({ error: "Failed to disconnect: " + updateErr.message }, 500);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[reddit-oauth-connect] Unhandled error:", err);
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
