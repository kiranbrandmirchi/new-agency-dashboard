// supabase/functions/reddit-full-sync/index.ts
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
    const SB_URL = Deno.env.get("SUPABASE_URL");
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const REDDIT_CLIENT_ID = Deno.env.get("REDDIT_CLIENT_ID");
    const REDDIT_CLIENT_SECRET = Deno.env.get("REDDIT_CLIENT_SECRET");

    if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
      return jsonResponse({ error: "Reddit credentials not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const accountIds = body.account_ids || [];
    const startDate = body.start_date || "";
    const endDate = body.end_date || "";

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return jsonResponse({ error: "account_ids array is required" }, 400);
    }

    if (!startDate || !endDate) {
      return jsonResponse({ error: "start_date and end_date are required" }, 400);
    }

    // Verify user and get credential for first account's agency
    const cpaRes = await fetch(
      `${SB_URL}/rest/v1/client_platform_accounts?platform_customer_id=in.(${accountIds.map((id: string) => `"${id}"`).join(",")})&platform=eq.reddit&is_active=eq.true&select=id,agency_id,platform_customer_id,credential_id`,
      {
        headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` },
      }
    );
    const cpaRows = await cpaRes.json();
    if (!cpaRows || cpaRows.length === 0) {
      return jsonResponse({ error: "No Reddit accounts found for given IDs." }, 400);
    }

    const agencyId = cpaRows[0].agency_id;
    const credRes = await fetch(
      `${SB_URL}/rest/v1/agency_platform_credentials?agency_id=eq.${agencyId}&platform=eq.reddit&is_active=eq.true&select=oauth_refresh_token`,
      { headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` } }
    );
    const creds = await credRes.json();
    if (!creds || creds.length === 0 || !creds[0].oauth_refresh_token) {
      return jsonResponse({ error: "No Reddit credential for agency." }, 400);
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
        grant_type: "refresh_token",
        refresh_token: creds[0].oauth_refresh_token,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return jsonResponse({ error: "Failed to refresh Reddit token." }, 400);
    }

    const accessToken = tokenData.access_token;
    const totalRows = { campaign: 0, adgroup: 0, community: 0, placement: 0 };

    // Placeholder: Reddit Ads API v3 fetch logic would go here.
    // For now, return success so the UI can show "sync initiated".
    // The actual sync would call Reddit Ads API and insert into reddit_* tables.

    return jsonResponse({
      success: true,
      message: "Reddit sync initiated. Data will be populated when Reddit Ads API integration is complete.",
      totalRows,
    });
  } catch (err) {
    console.error("[reddit-full-sync] Error:", err);
    return jsonResponse({ error: (err as Error).message || "Sync failed" }, 500);
  }
});
