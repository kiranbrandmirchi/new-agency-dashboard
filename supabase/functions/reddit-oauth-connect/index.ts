import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const REDDIT_CLIENT_ID = Deno.env.get("REDDIT_CLIENT_ID") || "";
const REDDIT_CLIENT_SECRET = Deno.env.get("REDDIT_CLIENT_SECRET") || "";
const USER_AGENT = "AgencyDashboard/1.0";
Deno.serve(async (req)=>{
  // ---- CORS preflight - must return 200 immediately ----
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceKey);
    // ---- Authenticate caller ----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError?.message);
      return new Response(JSON.stringify({
        error: "Unauthorized",
        detail: authError?.message
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    console.log("Authenticated user:", user.id, user.email);
    // ---- Get agency from user_profiles ----
    const { data: profile, error: profileError } = await supabase.from("user_profiles").select("agency_id, role_id, is_super_admin").eq("id", user.id).single();
    console.log("Profile lookup:", JSON.stringify(profile), "Error:", profileError?.message);
    if (profileError || !profile?.agency_id) {
      return new Response(JSON.stringify({
        error: "User profile not found or no agency assigned",
        user_id: user.id,
        detail: profileError?.message || "agency_id is null"
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const agencyId = profile.agency_id;
    console.log("Agency ID:", agencyId);
    // ---- Parse request body ----
    const body = await req.json();
    const { action, code } = body;
    console.log("Action:", action);
    // ================================================================
    // ACTION: get_auth_url
    // ================================================================
    if (action === "get_auth_url") {
      // Dynamic redirect URI from request origin
      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "https://new-dashboard-whitelabel.vercel.app";
      const redirectUri = `${origin}/oauth/callback`;
      const stateObj = JSON.stringify({
        agency_id: agencyId,
        platform: "reddit",
        redirect_uri: redirectUri
      });
      const authUrl = `https://www.reddit.com/api/v1/authorize` + `?client_id=${encodeURIComponent(REDDIT_CLIENT_ID)}` + `&response_type=code` + `&state=${encodeURIComponent(stateObj)}` + `&redirect_uri=${encodeURIComponent(redirectUri)}` + `&duration=permanent` + `&scope=adsread+identity`;
      console.log("Auth URL generated, redirect_uri:", redirectUri);
      return new Response(JSON.stringify({
        url: authUrl
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // ================================================================
    // ACTION: exchange_code
    // ================================================================
    if (action === "exchange_code") {
      if (!code) {
        return new Response(JSON.stringify({
          error: "Missing authorization code"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      // Determine redirect_uri - must match what was used in get_auth_url
      let redirectUri = "https://new-dashboard-whitelabel.vercel.app/oauth/callback";
      // Try to get it from state (passed back by Reddit)
      if (body.state) {
        try {
          const stateObj = typeof body.state === "string" ? JSON.parse(body.state) : body.state;
          if (stateObj.redirect_uri) redirectUri = stateObj.redirect_uri;
        } catch (e) {
          console.log("Could not parse state, using default redirect_uri");
        }
      }
      // Accept explicit redirect_uri from body as override
      if (body.redirect_uri) redirectUri = body.redirect_uri;
      console.log("Exchanging code, redirect_uri:", redirectUri);
      // Step 1: Exchange authorization code for tokens
      const tokenResp = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`),
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT
        },
        body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`
      });
      const tokenData = await tokenResp.json();
      console.log("Token response:", JSON.stringify({
        has_access_token: !!tokenData.access_token,
        has_refresh_token: !!tokenData.refresh_token,
        error: tokenData.error,
        scope: tokenData.scope
      }));
      if (tokenData.error) {
        return new Response(JSON.stringify({
          error: "Reddit token exchange failed",
          detail: tokenData.error
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      // Step 2: Save credentials
      const { error: credError } = await supabase.from("agency_platform_credentials").upsert({
        agency_id: agencyId,
        platform: "reddit",
        oauth_refresh_token: tokenData.refresh_token,
        is_active: true,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        token_scopes: tokenData.scope || "adsread identity"
      }, {
        onConflict: "agency_id,platform"
      });
      if (credError) {
        console.error("Credential save error:", credError.message);
      } else {
        console.log("Credentials saved successfully");
      }
      // Step 3: Discover ad accounts
      const accessToken = tokenData.access_token;
      let discoveredAccounts = [];
      // --- Strategy 1: Business Manager chain ---
      try {
        console.log("Strategy 1: Trying /api/v3/me...");
        const meResp = await fetch("https://ads-api.reddit.com/api/v3/me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": USER_AGENT
          }
        });
        const meData = await meResp.json();
        console.log("/api/v3/me status:", meResp.status, "data:", JSON.stringify(meData));
        const profileId = meData?.data?.id || meData?.id;
        if (profileId) {
          console.log("Profile ID:", profileId, "- fetching businesses...");
          const profResp = await fetch(`https://ads-api.reddit.com/api/v3/profiles/${profileId}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": USER_AGENT
            }
          });
          const profData = await profResp.json();
          console.log("/profiles status:", profResp.status, "data:", JSON.stringify(profData));
          // Extract businesses from various possible response shapes
          const businesses = profData?.data?.businesses || profData?.businesses || profData?.data?.business_ids?.map((id)=>({
              id
            })) || [];
          console.log("Found businesses:", businesses.length);
          for (const biz of businesses){
            const bizId = biz.id || biz.business_id;
            if (!bizId) continue;
            console.log("Fetching ad accounts for business:", bizId);
            const acctResp = await fetch(`https://ads-api.reddit.com/api/v3/businesses/${bizId}/ad_accounts`, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "User-Agent": USER_AGENT
              }
            });
            const acctData = await acctResp.json();
            console.log(`/businesses/${bizId}/ad_accounts status:`, acctResp.status, "data:", JSON.stringify(acctData));
            const accts = acctData?.data || [];
            for (const a of accts){
              const acctId = a.id || a.account_id;
              if (acctId) {
                discoveredAccounts.push({
                  id: acctId,
                  name: a.name || a.account_name || `Reddit ${acctId}`
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Strategy 1 (Business Manager) error:", e.message);
      }
      // --- Strategy 2: Flat /accounts endpoint ---
      if (discoveredAccounts.length === 0) {
        try {
          console.log("Strategy 2: Trying /api/v3/accounts...");
          const acctResp = await fetch("https://ads-api.reddit.com/api/v3/accounts", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": USER_AGENT
            }
          });
          const acctData = await acctResp.json();
          console.log("/api/v3/accounts status:", acctResp.status, "data:", JSON.stringify(acctData));
          const accts = acctData?.data || [];
          for (const a of accts){
            const acctId = a.id || a.account_id;
            if (acctId) {
              discoveredAccounts.push({
                id: acctId,
                name: a.name || a.account_name || `Reddit ${acctId}`
              });
            }
          }
        } catch (e) {
          console.error("Strategy 2 (/accounts) error:", e.message);
        }
      }
      // --- Strategy 3: /api/v1/me fallback ---
      if (discoveredAccounts.length === 0) {
        try {
          console.log("Strategy 3: Trying /api/v1/me fallback...");
          const meResp = await fetch("https://oauth.reddit.com/api/v1/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": USER_AGENT
            }
          });
          const meData = await meResp.json();
          console.log("/api/v1/me:", JSON.stringify({
            id: meData?.id,
            name: meData?.name
          }));
          if (meData?.id) {
            const accountId = `t2_${meData.id}`;
            console.log("WARNING: Using /v1/me fallback. ID:", accountId, "Name:", meData.name, "- This is the Reddit user ID, may not be the ad account ID.");
            discoveredAccounts.push({
              id: accountId,
              name: meData.name || "Reddit Account"
            });
          }
        } catch (e) {
          console.error("Strategy 3 (/v1/me) error:", e.message);
        }
      }
      console.log("Total discovered accounts:", discoveredAccounts.length, JSON.stringify(discoveredAccounts));
      // Step 4: Upsert accounts into DB
      for (const acct of discoveredAccounts){
        const { error: cpaError } = await supabase.from("client_platform_accounts").upsert({
          agency_id: agencyId,
          platform: "reddit",
          platform_customer_id: acct.id,
          account_name: acct.name,
          is_active: true
        }, {
          onConflict: "agency_id,platform,platform_customer_id"
        });
        if (cpaError) console.error("client_platform_accounts upsert error:", cpaError.message);
        const { error: rcError } = await supabase.from("reddit_customers").upsert({
          customer_id: acct.id,
          account_name: acct.name,
          agency_id: agencyId,
          currency: "USD",
          timezone: "UTC"
        }, {
          onConflict: "customer_id"
        });
        if (rcError) console.error("reddit_customers upsert error:", rcError.message);
      }
      return new Response(JSON.stringify({
        success: true,
        accounts: discoveredAccounts,
        message: `Found ${discoveredAccounts.length} account(s)`
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // ================================================================
    // ACTION: disconnect
    // ================================================================
    if (action === "disconnect") {
      await supabase.from("agency_platform_credentials").update({
        is_active: false
      }).eq("agency_id", agencyId).eq("platform", "reddit");
      return new Response(JSON.stringify({
        success: true,
        message: "Disconnected"
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // ================================================================
    // Unknown action
    // ================================================================
    return new Response(JSON.stringify({
      error: `Unknown action: ${action}`
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Unhandled error:", err.message, err.stack);
    return new Response(JSON.stringify({
      error: "Internal server error",
      detail: err.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
