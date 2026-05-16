import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Bing / Microsoft Advertising OAuth + account discovery.
 *
 * Microsoft Identity (Entra) OAuth 2.0 with Bing Ads scope:
 *   https://ads.microsoft.com/msads.manage offline_access
 *
 * Account discovery uses Customer Management v13:
 *   POST https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Search
 *   Header: AuthenticationToken (OAuth access token), DeveloperToken
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MS_OAUTH_SCOPE = "https://ads.microsoft.com/msads.manage offline_access";

function expiresInSeconds(d: Record<string, unknown>): number {
  const n = Number(d.expires_in);
  if (Number.isFinite(n) && n > 60) return Math.min(n, 365 * 24 * 3600);
  return 3600;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const clientId = Deno.env.get("BING_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("BING_CLIENT_SECRET") || "";
  const developerToken = Deno.env.get("BING_DEVELOPER_TOKEN") || "";
  const tenant = Deno.env.get("BING_TENANT") || "common";

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

    if (!clientId || !clientSecret || !developerToken) {
      return new Response(
        JSON.stringify({
          error: "Bing app credentials not configured",
          detail: "Set BING_CLIENT_ID, BING_CLIENT_SECRET, BING_DEVELOPER_TOKEN on the edge function.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ================================================================
    // ACTION: get_auth_url
    // ================================================================
    if (action === "get_auth_url") {
      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
      const redirectUri = body.redirect_uri || `${origin}/oauth/callback` || "http://localhost:5173/oauth/callback";
      const stateObj = JSON.stringify({
        agency_id: agencyId,
        platform: "bing",
        redirect_uri: redirectUri,
      });
      const authUrl =
        `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_mode=query` +
        `&scope=${encodeURIComponent(MS_OAUTH_SCOPE)}` +
        `&state=${encodeURIComponent(stateObj)}` +
        `&prompt=select_account`;
      return new Response(JSON.stringify({ url: authUrl, auth_url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ================================================================
    // ACTION: exchange_code
    // ================================================================
    if (action === "exchange_code") {
      const code = body.code || body.auth_code;
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing authorization code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const redirectUri = String(body.redirect_uri || "").trim();
      if (!redirectUri) {
        return new Response(JSON.stringify({ error: "Missing redirect_uri" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenForm = new URLSearchParams();
      tokenForm.set("client_id", clientId);
      tokenForm.set("client_secret", clientSecret);
      tokenForm.set("code", String(code).trim());
      tokenForm.set("redirect_uri", redirectUri);
      tokenForm.set("grant_type", "authorization_code");
      tokenForm.set("scope", MS_OAUTH_SCOPE);

      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenForm.toString(),
        },
      );
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        return new Response(
          JSON.stringify({
            error: "Bing token exchange failed",
            detail: tokenJson.error_description || tokenJson.error || JSON.stringify(tokenJson),
            hint: "Ensure the Azure app redirect URI matches exactly and the code has not been used.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const accessToken = String(tokenJson.access_token || "");
      const refreshToken = String(tokenJson.refresh_token || "");
      if (!accessToken || !refreshToken) {
        return new Response(
          JSON.stringify({
            error: "Bing token response missing access_token or refresh_token",
            detail: "Make sure the consent screen was completed with the offline_access scope.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const expSec = expiresInSeconds(tokenJson);
      const expiresAtIso = new Date(Date.now() + expSec * 1000).toISOString();

      // ----------------------------------------------------------------
      // Save credential row (mirror tiktok-oauth-connect: cannot use upsert
      // onConflict(agency_id, platform) due to partial unique index).
      // ----------------------------------------------------------------
      const { data: existingCredRows, error: credSelError } = await supabase
        .from("agency_platform_credentials")
        .select("id")
        .eq("agency_id", agencyId)
        .eq("platform", "bing")
        .limit(1);

      if (credSelError) {
        return new Response(JSON.stringify({ error: credSelError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenFields: Record<string, unknown> = {
        is_active: true,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        token_scopes: MS_OAUTH_SCOPE,
        oauth_refresh_token: refreshToken,
        oauth_access_token: accessToken,
        oauth_token_expires_at: expiresAtIso,
      };

      const existingCredId = existingCredRows?.[0]?.id as string | undefined;
      if (existingCredId) {
        const { error: credError } = await supabase
          .from("agency_platform_credentials")
          .update(tokenFields)
          .eq("id", existingCredId);
        if (credError) {
          return new Response(JSON.stringify({ error: credError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const { error: credError } = await supabase.from("agency_platform_credentials").insert({
          agency_id: agencyId,
          platform: "bing",
          ...tokenFields,
        });
        if (credError) {
          return new Response(JSON.stringify({ error: credError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // ----------------------------------------------------------------
      // Discover advertiser accounts via Customer Management v13.
      // SearchAccounts with no predicates returns all accounts the user can access.
      // ----------------------------------------------------------------
      let discovered: { id: string; name: string }[] = [];
      try {
        const searchRes = await fetch(
          "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Search",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              AuthenticationToken: accessToken,
              DeveloperToken: developerToken,
            },
            body: JSON.stringify({
              Predicates: [],
              Ordering: [{ Field: "Id", Order: "Ascending" }],
              PageInfo: { Index: 0, Size: 100 },
            }),
          },
        );
        const searchJson = await searchRes.json().catch(() => ({}));
        const accounts = (searchJson.Accounts || searchJson.accounts || []) as Array<Record<string, unknown>>;
        for (const a of accounts) {
          const id = String(a.Id ?? a.id ?? "");
          if (!id) continue;
          const name = String(a.Name ?? a.name ?? `Bing ${id}`);
          discovered.push({ id, name });
        }
      } catch (err) {
        console.error("Bing account search error:", err);
      }

      for (const acct of discovered) {
        const { error: cpaError } = await supabase.from("client_platform_accounts").upsert(
          {
            agency_id: agencyId,
            platform: "bing",
            platform_customer_id: acct.id,
            account_name: acct.name,
            is_active: true,
          },
          { onConflict: "platform,platform_customer_id" },
        );
        if (cpaError) console.error("client_platform_accounts upsert:", cpaError.message);

        const { error: bcError } = await supabase.from("bing_customers").upsert(
          {
            customer_id: acct.id,
            account_name: acct.name,
            agency_id: agencyId,
            currency: "USD",
            timezone: "UTC",
          },
          { onConflict: "customer_id" },
        );
        if (bcError) console.error("bing_customers upsert:", bcError.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          accounts: discovered,
          message: `Found ${discovered.length} Bing advertiser account(s)`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ================================================================
    // ACTION: disconnect
    // ================================================================
    if (action === "disconnect") {
      await supabase.from("agency_platform_credentials").update({
        is_active: false,
        oauth_refresh_token: null,
        oauth_access_token: null,
        oauth_token_expires_at: null,
      }).eq("agency_id", agencyId).eq("platform", "bing");
      return new Response(JSON.stringify({ success: true, message: "Disconnected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bing-oauth-connect:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String((err as Error)?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
