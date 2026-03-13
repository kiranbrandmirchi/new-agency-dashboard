// supabase/functions/reddit-full-sync/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
// From Supabase secrets
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REDDIT_CLIENT_ID = Deno.env.get("REDDIT_CLIENT_ID");
const REDDIT_CLIENT_SECRET = Deno.env.get("REDDIT_CLIENT_SECRET");
const REDDIT_ADS_API_URL = "https://ads-api.reddit.com/api/v3";
const USER_AGENT = "MyApp/1.0";
const BREAKDOWNS_AD_GROUP = [
  "DATE",
  "CAMPAIGN_ID",
  "AD_GROUP_ID"
];
const BREAKDOWNS_COMMUNITY = [
  "DATE",
  "CAMPAIGN_ID",
  "COMMUNITY"
];
const BREAKDOWNS_PLACEMENT = [
  "DATE",
  "CAMPAIGN_ID",
  "PLACEMENT"
];
const REPORT_FIELDS = [
  "IMPRESSIONS",
  "CLICKS",
  "SPEND",
  "CONVERSION_PURCHASE_VIEWS",
  "CONVERSION_PURCHASE_CLICKS",
  "CONVERSION_PURCHASE_TOTAL_VALUE"
];
// ============ HELPER FUNCTIONS ============
async function refreshAccessToken(refreshToken) {
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT
    },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`
  });
  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${text}`);
  }
  const result = await response.json();
  console.log("Access token refreshed successfully");
  return result.access_token;
}
async function fetchReport(accessToken, accountId, startDate, endDate, breakdowns) {
  const url = `${REDDIT_ADS_API_URL}/ad_accounts/${accountId}/reports`;
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json"
  };
  const body = {
    data: {
      starts_at: `${startDate}T00:00:00Z`,
      ends_at: `${endDate}T00:00:00Z`,
      breakdowns,
      fields: REPORT_FIELDS
    }
  };
  console.log(`Fetching report: breakdowns=${breakdowns.join(",")}, ${startDate} to ${endDate}`);
  let response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (response.status !== 200) {
    const text = await response.text();
    console.error(`Report error ${response.status}: ${text}`);
    return [];
  }
  let result = await response.json();
  const dataObj = result.data || {};
  const data = Array.isArray(dataObj.metrics) ? dataObj.metrics : [];
  console.log(`Got ${data.length} rows`);
  // Handle pagination
  let nextCursor = result.pagination?.next_cursor;
  while(nextCursor){
    console.log("Fetching next page...");
    body.data.cursor = nextCursor;
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    if (response.status !== 200) break;
    result = await response.json();
    const pageData = result.data?.metrics || [];
    data.push(...pageData);
    nextCursor = result.pagination?.next_cursor;
  }
  return data;
}
async function fetchJson(accessToken, url) {
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT
    }
  });
  if (response.status === 200) {
    const json = await response.json();
    return json.data || {};
  }
  return {};
}
async function buildLookups(accessToken, reportData) {
  const campaignIds = new Set();
  const adGroupIds = new Set();
  for (const row of reportData){
    if (row.campaign_id) campaignIds.add(row.campaign_id);
    if (row.ad_group_id) adGroupIds.add(row.ad_group_id);
  }
  console.log(`Building lookups: ${campaignIds.size} campaigns, ${adGroupIds.size} ad groups`);
  const campaigns = {};
  const adGroups = {};
  for (const cid of campaignIds){
    const c = await fetchJson(accessToken, `${REDDIT_ADS_API_URL}/campaigns/${cid}`);
    if (c.name) campaigns[cid] = c.name;
  }
  for (const agid of adGroupIds){
    const ag = await fetchJson(accessToken, `${REDDIT_ADS_API_URL}/ad_groups/${agid}`);
    if (ag.name) adGroups[agid] = ag.name;
  }
  return {
    campaigns,
    ad_groups: adGroups
  };
}
// ============ TRANSFORM FUNCTIONS ============
function transformRowAdGroup(row, lookups) {
  const spend = Number(row.spend || 0);
  const totalValue = Number(row.conversion_purchase_total_value || 0);
  return {
    campaign_name: lookups.campaigns[row.campaign_id] || null,
    ad_group_name: lookups.ad_groups[row.ad_group_id] || null,
    campaign_date: row.date,
    impressions: parseInt(row.impressions || "0"),
    clicks: parseInt(row.clicks || "0"),
    amount_spent_usd: spend / 1000000,
    purchase_view: parseInt(row.conversion_purchase_views || "0"),
    purchase_click: parseInt(row.conversion_purchase_clicks || "0"),
    total_value_purchase: totalValue / 1000000,
    currency: "USD"
  };
}
function transformRowCommunity(row, lookups) {
  const spend = Number(row.spend || 0);
  const totalValue = Number(row.conversion_purchase_total_value || 0);
  return {
    campaign_name: lookups.campaigns[row.campaign_id] || null,
    campaign_date: row.date,
    community: row.community,
    impressions: parseInt(row.impressions || "0"),
    clicks: parseInt(row.clicks || "0"),
    amount_spent_usd: spend / 1000000,
    purchase_view: parseInt(row.conversion_purchase_views || "0"),
    purchase_click: parseInt(row.conversion_purchase_clicks || "0"),
    total_value_purchase: totalValue / 1000000,
    currency: "USD"
  };
}
function transformRowPlacement(row, lookups) {
  const spend = Number(row.spend || 0);
  const totalValue = Number(row.conversion_purchase_total_value || 0);
  return {
    campaign_name: lookups.campaigns[row.campaign_id] || null,
    placement: row.placement || "",
    campaign_date: row.date,
    impressions: parseInt(row.impressions || "0"),
    clicks: parseInt(row.clicks || "0"),
    amount_spent_usd: spend / 1000000,
    purchase_view: parseInt(row.conversion_purchase_views || "0"),
    purchase_click: parseInt(row.conversion_purchase_clicks || "0"),
    total_value_purchase: totalValue / 1000000,
    currency: "USD"
  };
}
// ============ SAVE FUNCTIONS ============
async function saveAdGroupData(supabase, data, lookups) {
  if (!data.length) {
    console.log("No ad_group data to save");
    return 0;
  }
  const rows = data.filter((r)=>r.date).map((r)=>transformRowAdGroup(r, lookups));
  if (!rows.length) {
    console.log("No valid ad_group rows");
    return 0;
  }
  const { error } = await supabase.from("reddit_campaigns_ad_group").upsert(rows, {
    onConflict: "campaign_name,ad_group_name,campaign_date"
  });
  if (error) {
    console.error(`Ad group upsert failed: ${error.message}`);
    throw error;
  }
  console.log(`Saved ${rows.length} ad_group rows`);
  return rows.length;
}
async function saveCommunityData(supabase, data, lookups) {
  if (!data.length) {
    console.log("No community data to save");
    return 0;
  }
  const rows = data.filter((r)=>r.date && r.community).map((r)=>transformRowCommunity(r, lookups));
  if (!rows.length) {
    console.log("No valid community rows");
    return 0;
  }
  const { error } = await supabase.from("reddit_campaigns_community").upsert(rows, {
    onConflict: "campaign_name,community,campaign_date"
  });
  if (error) {
    console.error(`Community upsert failed: ${error.message}`);
    throw error;
  }
  console.log(`Saved ${rows.length} community rows`);
  return rows.length;
}
async function savePlacementData(supabase, data, lookups) {
  if (!data.length) {
    console.log("No placement data to save");
    return 0;
  }
  const rows = data.filter((r)=>r.date && r.placement).map((r)=>transformRowPlacement(r, lookups));
  if (!rows.length) {
    console.log("No valid placement rows");
    return 0;
  }
  const { error } = await supabase.from("reddit_campaigns_placement").upsert(rows, {
    onConflict: "campaign_name,placement,campaign_date"
  });
  if (error) {
    console.error(`Placement upsert failed: ${error.message}`);
    throw error;
  }
  console.log(`Saved ${rows.length} placement rows`);
  return rows.length;
}
// ============ DELETE FUNCTION ============
async function deleteDataForDate(supabase, targetDate) {
  let totalDeleted = 0;
  for (const table of [
    "reddit_campaigns_ad_group",
    "reddit_campaigns_community",
    "reddit_campaigns_placement"
  ]){
    const { data, error } = await supabase.from(table).delete().eq("campaign_date", targetDate).select("id");
    if (error) {
      console.error(`Error deleting from ${table}: ${error.message}`);
    } else {
      const count = data?.length || 0;
      totalDeleted += count;
      console.log(`Deleted ${count} rows from ${table} for ${targetDate}`);
    }
  }
  return totalDeleted;
}
// ============ MAIN HANDLER ============
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: "No auth header"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Get user profile -> agency_id
    const { data: profile } = await supabase.from("user_profiles").select("agency_id").eq("id", user.id).single();
    if (!profile?.agency_id) {
      return new Response(JSON.stringify({
        error: "No agency found"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Get Reddit credentials from agency_platform_credentials
    const { data: creds } = await supabase.from("agency_platform_credentials").select("id, agency_id, platform, oauth_refresh_token, platform_mcc_id, is_active").eq("agency_id", profile.agency_id).eq("platform", "reddit").eq("is_active", true).single();
    if (!creds) {
      return new Response(JSON.stringify({
        error: "No Reddit credentials found"
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const refreshToken = creds.oauth_refresh_token;
    if (!refreshToken) {
      return new Response(JSON.stringify({
        error: "No refresh token found"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Get Reddit account IDs from client_platform_accounts
    const { data: accounts } = await supabase.from("client_platform_accounts").select("platform_customer_id").eq("platform", "reddit").eq("is_active", true);
    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({
        error: "No active Reddit accounts"
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Parse request body for optional date overrides
    let startDate;
    let endDate;
    let mode = "daily";
    try {
      const body = await req.json();
      if (body.start_date && body.end_date) {
        startDate = body.start_date;
        endDate = body.end_date;
        mode = "date_range";
      }
    } catch  {
    // No body — use default daily mode
    }
    if (mode === "daily") {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const dayBefore = new Date(now);
      dayBefore.setDate(now.getDate() - 2);
      startDate = dayBefore.toISOString().split("T")[0];
      endDate = yesterday.toISOString().split("T")[0];
    }
    console.log("============================================================");
    console.log("Reddit Ads API v3 -> Supabase");
    console.log("============================================================");
    console.log(`Mode: ${mode}`);
    console.log(`Dates: ${startDate} to ${endDate}`);
    console.log(`Accounts: ${accounts.map((a)=>a.platform_customer_id).join(", ")}`);
    console.log("============================================================");
    // Refresh access token
    const accessToken = await refreshAccessToken(refreshToken);
    const results = {};
    for (const account of accounts){
      const accountId = account.platform_customer_id;
      console.log(`\nProcessing account: ${accountId}`);
      results[accountId] = {
        ad_group: 0,
        community: 0,
        placement: 0,
        errors: []
      };
      // Build date list
      const dates = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);
      while(current <= end){
        dates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
      // If daily mode, delete day-before-yesterday data first
      if (mode === "daily") {
        const dayBeforeStr = dates[0];
        console.log(`Deleting old data for ${dayBeforeStr}...`);
        await deleteDataForDate(supabase, dayBeforeStr);
      }
      for (const dateStr of dates){
        console.log(`\n--- Processing ${dateStr} ---`);
        // AD_GROUP breakdown
        try {
          console.log("Fetching AD_GROUP data...");
          const adGroupData = await fetchReport(accessToken, accountId, dateStr, dateStr, BREAKDOWNS_AD_GROUP);
          if (adGroupData.length) {
            const lookups = await buildLookups(accessToken, adGroupData);
            const saved = await saveAdGroupData(supabase, adGroupData, lookups);
            results[accountId].ad_group += saved;
            console.log(`✓ Saved ${saved} ad_group rows`);
          } else {
            console.log("⚠ No ad_group data");
          }
        } catch (e) {
          console.error(`✗ AD_GROUP error: ${e.message}`);
          results[accountId].errors.push(`AD_GROUP ${dateStr}: ${e.message}`);
        }
        // COMMUNITY breakdown
        try {
          console.log("Fetching COMMUNITY data...");
          const communityData = await fetchReport(accessToken, accountId, dateStr, dateStr, BREAKDOWNS_COMMUNITY);
          if (communityData.length) {
            const lookups = await buildLookups(accessToken, communityData);
            const saved = await saveCommunityData(supabase, communityData, lookups);
            results[accountId].community += saved;
            console.log(`✓ Saved ${saved} community rows`);
          } else {
            console.log("⚠ No community data");
          }
        } catch (e) {
          console.error(`✗ COMMUNITY error: ${e.message}`);
          results[accountId].errors.push(`COMMUNITY ${dateStr}: ${e.message}`);
        }
        // PLACEMENT breakdown
        try {
          console.log("Fetching PLACEMENT data...");
          const placementData = await fetchReport(accessToken, accountId, dateStr, dateStr, BREAKDOWNS_PLACEMENT);
          if (placementData.length) {
            const lookups = await buildLookups(accessToken, placementData);
            const saved = await savePlacementData(supabase, placementData, lookups);
            results[accountId].placement += saved;
            console.log(`✓ Saved ${saved} placement rows`);
          } else {
            console.log("⚠ No placement data");
          }
        } catch (e) {
          console.error(`✗ PLACEMENT error: ${e.message}`);
          results[accountId].errors.push(`PLACEMENT ${dateStr}: ${e.message}`);
        }
      }
    }
    console.log("\n============================================================");
    console.log("DONE");
    console.log(JSON.stringify(results, null, 2));
    console.log("============================================================");
    return new Response(JSON.stringify({
      success: true,
      results
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    console.error(`Fatal error: ${e.message}`);
    return new Response(JSON.stringify({
      success: false,
      error: e.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
