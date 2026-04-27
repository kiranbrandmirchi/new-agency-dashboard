import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TT_API = "https://business-api.tiktok.com/open_api/v1.3";

/** TikTok `data` objects usually use snake_case; tolerate camelCase. */
function pickTokenString(obj: unknown, snake: string, camel: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const a = o[snake];
  const b = o[camel];
  if (typeof a === "string" && a.length) return a;
  if (typeof b === "string" && b.length) return b;
  return null;
}

function expiresInSeconds(d: Record<string, unknown>): number {
  const n = Number(d.expires_in ?? d.expiresIn);
  if (Number.isFinite(n) && n > 60) return Math.min(n, 365 * 24 * 3600);
  return 24 * 3600;
}

function scopeToText(d: Record<string, unknown>): string {
  const s = d.scope;
  if (Array.isArray(s)) return s.map(String).join(" ");
  if (typeof s === "string" && s.length) return s;
  return "tiktok marketing api";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const appId = Deno.env.get("TIKTOK_APP_ID") || Deno.env.get("TIKTOK_CLIENT_ID") || "";
  const appSecret = Deno.env.get("TIKTOK_APP_SECRET") || Deno.env.get("TIKTOK_CLIENT_SECRET") || "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("agency_id, role_id, is_super_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.agency_id) {
      return new Response(
        JSON.stringify({
          error: "User profile not found or no agency assigned",
          detail: profileError?.message || "agency_id is null",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const agencyId = profile.agency_id;
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (!appId || !appSecret) {
      return new Response(
        JSON.stringify({
          error: "TikTok app credentials not configured",
          detail: "Set TIKTOK_APP_ID and TIKTOK_APP_SECRET (or TIKTOK_CLIENT_ID / TIKTOK_CLIENT_SECRET) on the edge function.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "get_auth_url") {
      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
      const redirectUri = body.redirect_uri || `${origin}/oauth/callback` || "http://localhost:5173/oauth/callback";
      const stateObj = JSON.stringify({
        agency_id: agencyId,
        platform: "tiktok",
        redirect_uri: redirectUri,
      });
      const authUrl =
        `https://ads.tiktok.com/marketing_api/auth?app_id=${encodeURIComponent(appId)}` +
        `&state=${encodeURIComponent(stateObj)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`;
      return new Response(JSON.stringify({ url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "exchange_code") {
      const authCode = body.auth_code || body.code;
      if (!authCode) {
        return new Response(JSON.stringify({ error: "Missing auth_code / code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const redirectUriForToken = typeof body.redirect_uri === "string" ? body.redirect_uri.trim() : "";
      const tokenPayload: Record<string, string> = {
        app_id: appId,
        secret: appSecret,
        auth_code: String(authCode).trim(),
      };
      if (redirectUriForToken) {
        tokenPayload.redirect_uri = redirectUriForToken;
      }
      const tokenRes = await fetch(`${TT_API}/oauth2/access_token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenPayload),
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (tokenJson.code !== 0 && tokenJson.code !== undefined) {
        return new Response(
          JSON.stringify({
            error: "TikTok token exchange failed",
            detail: tokenJson.message || JSON.stringify(tokenJson),
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const d = (tokenJson.data ?? tokenJson) as Record<string, unknown>;
      const accessToken = pickTokenString(d, "access_token", "accessToken");
      const refreshToken = pickTokenString(d, "refresh_token", "refreshToken");
      if (!accessToken) {
        const dataKeys = d && typeof d === "object" ? Object.keys(d as object).join(", ") : "";
        return new Response(
          JSON.stringify({
            error: "TikTok token response missing access_token",
            detail: tokenJson.message || tokenJson.request_id || "",
            data_keys: dataKeys || undefined,
            hint: "Use a fresh auth_code (single-use).",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const dobj = d as Record<string, unknown>;
      const expSec = expiresInSeconds(dobj);
      const expiresAtIso = new Date(Date.now() + expSec * 1000).toISOString();

      // Cannot use upsert onConflict(agency_id, platform): DB uses partial unique index
      // uq_agency_platform_non_ga4 — Postgres reports no matching ON CONFLICT target.
      const { data: existingCredRows, error: credSelError } = await supabase
        .from("agency_platform_credentials")
        .select("id")
        .eq("agency_id", agencyId)
        .eq("platform", "tiktok")
        .limit(1);

      if (credSelError) {
        console.error("Credential lookup error:", credSelError.message);
        return new Response(JSON.stringify({ error: credSelError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenFields: Record<string, unknown> = {
        is_active: true,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        token_scopes: scopeToText(dobj),
      };
      if (refreshToken) {
        tokenFields.oauth_refresh_token = refreshToken;
        tokenFields.oauth_access_token = null;
        tokenFields.oauth_token_expires_at = null;
      } else {
        tokenFields.oauth_refresh_token = null;
        tokenFields.oauth_access_token = accessToken;
        tokenFields.oauth_token_expires_at = expiresAtIso;
      }

      const existingCredId = existingCredRows?.[0]?.id as string | undefined;
      if (existingCredId) {
        const { error: credError } = await supabase
          .from("agency_platform_credentials")
          .update(tokenFields)
          .eq("id", existingCredId);
        if (credError) {
          console.error("Credential save error:", credError.message);
          return new Response(JSON.stringify({ error: credError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const { error: credError } = await supabase.from("agency_platform_credentials").insert({
          agency_id: agencyId,
          platform: "tiktok",
          ...tokenFields,
        });
        if (credError) {
          console.error("Credential save error:", credError.message);
          return new Response(JSON.stringify({ error: credError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const advUrl = new URL(`${TT_API}/oauth2/advertiser/get/`);
      advUrl.searchParams.set("app_id", appId);
      advUrl.searchParams.set("secret", appSecret);
      advUrl.searchParams.set("access_token", accessToken);

      const advRes = await fetch(advUrl.toString(), { method: "GET" });
      const advJson = await advRes.json().catch(() => ({}));
      const advList = advJson?.data?.list || advJson?.data || [];
      const discovered: { id: string; name: string }[] = [];
      for (const row of Array.isArray(advList) ? advList : []) {
        const id = String(row.advertiser_id ?? row.advertiserId ?? row.id ?? "");
        if (!id) continue;
        const name = row.advertiser_name || row.advertiser_name_info || row.name || `TikTok ${id}`;
        discovered.push({ id, name });
      }

      for (const acct of discovered) {
        const { error: cpaError } = await supabase.from("client_platform_accounts").upsert(
          {
            agency_id: agencyId,
            platform: "tiktok",
            platform_customer_id: acct.id,
            account_name: acct.name,
            is_active: true,
          },
          { onConflict: "platform,platform_customer_id" },
        );
        if (cpaError) console.error("client_platform_accounts upsert:", cpaError.message);

        const { error: tcError } = await supabase.from("tiktok_customers").upsert(
          {
            customer_id: acct.id,
            account_name: acct.name,
            agency_id: agencyId,
            currency: "USD",
            timezone: "UTC",
          },
          { onConflict: "customer_id" },
        );
        if (tcError) console.error("tiktok_customers upsert:", tcError.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          accounts: discovered,
          message: `Found ${discovered.length} advertiser account(s)`,
          token_kind: refreshToken ? "refresh" : "access_only",
          token_note: refreshToken
            ? undefined
            : "TikTok did not return a refresh token; sync uses the access token until it expires (~24h). Reconnect in Settings when sync fails.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "disconnect") {
      await supabase.from("agency_platform_credentials").update({
        is_active: false,
        oauth_refresh_token: null,
        oauth_access_token: null,
        oauth_token_expires_at: null,
      }).eq("agency_id", agencyId).eq(
        "platform",
        "tiktok",
      );
      return new Response(JSON.stringify({ success: true, message: "Disconnected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tiktok-oauth-connect:", err);
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
