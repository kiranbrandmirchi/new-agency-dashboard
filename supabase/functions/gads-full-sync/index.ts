// supabase/functions/gads-full-sync/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain"
    }
  });
}
function jsonResponseOk(data, status = 200) {
  return new Response(JSON.stringify(data), {
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
  const L = [];
  const log = (msg)=>{
    L.push(msg);
    console.log(msg);
  };
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const DT = Deno.env.get("GADS_DEVELOPER_TOKEN") || "";
    const CI = Deno.env.get("GADS_CLIENT_ID") || "";
    const CS = Deno.env.get("GADS_CLIENT_SECRET") || "";
    const VER = "v23";
    const MIC = 1_000_000;
    let body = {};
    try {
      body = await req.json();
    } catch  {
      body = {};
    }
    const mode = body.mode || "daily";
    const dateFrom = body.date_from || "";
    const dateTo = body.date_to || "";
    const daysBack = body.days_back || 3;
    const customerId = body.customer_id || null;
    const listOnly = body.list_only || false;
    log("=== GADS FULL SYNC ===");
    log("Mode: " + mode + " | listOnly: " + listOnly);
    // --- Get credential from database ---
    let REFRESH_TOK = "";
    let MCC_ID = "";
    let USE_MCC = true;
    if (customerId && !listOnly) {
      const credRes = await fetch(SB_URL + "/rest/v1/client_platform_accounts?" + "platform_customer_id=eq." + String(customerId).replace(/-/g, "") + "&platform=eq.google_ads&is_active=eq.true" + "&select=credential_id,agency_id,use_mcc", {
        headers: {
          "apikey": SB_KEY,
          "Authorization": "Bearer " + SB_KEY
        }
      });
      const cpaRows = await credRes.json();
      if (!cpaRows || cpaRows.length === 0) {
        log("ERROR: No client_platform_account for customer " + customerId);
        return textResponse(L.join("\n"), 400);
      }
      const agencyId = cpaRows[0].agency_id;
      USE_MCC = cpaRows[0].use_mcc !== false; // default true
      const agencyCredRes = await fetch(SB_URL + "/rest/v1/agency_platform_credentials?" + "agency_id=eq." + agencyId + "&platform=eq.google_ads&is_active=eq.true" + "&select=oauth_refresh_token,platform_mcc_id", {
        headers: {
          "apikey": SB_KEY,
          "Authorization": "Bearer " + SB_KEY
        }
      });
      const agencyCreds = await agencyCredRes.json();
      if (!agencyCreds || agencyCreds.length === 0 || !agencyCreds[0].oauth_refresh_token) {
        log("ERROR: No credential for agency " + agencyId);
        return textResponse(L.join("\n"), 400);
      }
      REFRESH_TOK = agencyCreds[0].oauth_refresh_token;
      MCC_ID = (agencyCreds[0].platform_mcc_id || "").replace(/-/g, "");
      log("Credential found via agency. MCC: " + MCC_ID + " | use_mcc: " + USE_MCC);
    } else if (listOnly) {
      if (!body.agency_id) {
        log("ERROR: agency_id required for list_only");
        return textResponse(L.join("\n"), 400);
      }
      const credRes = await fetch(SB_URL + "/rest/v1/agency_platform_credentials?" + "agency_id=eq." + body.agency_id + "&platform=eq.google_ads&is_active=eq.true" + "&select=oauth_refresh_token,platform_mcc_id", {
        headers: {
          "apikey": SB_KEY,
          "Authorization": "Bearer " + SB_KEY
        }
      });
      const creds = await credRes.json();
      if (!creds || creds.length === 0 || !creds[0].oauth_refresh_token) {
        log("ERROR: No credential for agency " + body.agency_id);
        return textResponse(L.join("\n"), 400);
      }
      REFRESH_TOK = creds[0].oauth_refresh_token;
      MCC_ID = (creds[0].platform_mcc_id || "").replace(/-/g, "");
      log("Agency credential found. MCC: " + MCC_ID);
    }
    // --- OAuth token ---
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: CI,
        client_secret: CS,
        refresh_token: REFRESH_TOK,
        grant_type: "refresh_token"
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      log("ERROR: OAuth failed: " + JSON.stringify(tokenData).substring(0, 300));
      return textResponse(L.join("\n"), 400);
    }
    const TOKEN = tokenData.access_token;
    log("Token OK");
    // --- Google Ads query helper ---
    async function gq(cid, query) {
      const url = "https://googleads.googleapis.com/" + VER + "/customers/" + cid.replace(/-/g, "") + "/googleAds:searchStream";
      const headers = {
        "Authorization": "Bearer " + TOKEN,
        "developer-token": DT,
        "Content-Type": "application/json"
      };
      // Only include login-customer-id when using MCC
      if (USE_MCC && MCC_ID) {
        headers["login-customer-id"] = MCC_ID;
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query
        })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error("GAds " + res.status + ": " + err.substring(0, 200));
      }
      const json = await res.json();
      const rows = [];
      if (Array.isArray(json)) {
        json.forEach((b)=>{
          if (b.results) rows.push(...b.results);
        });
      }
      return rows;
    }
    // --- Supabase upsert helper ---
    async function su(table, data, conflict) {
      if (data.length === 0) return 0;
      let total = 0;
      const seen = new Set();
      const deduped = data.filter((row)=>{
        const keys = conflict.split(",").map((k)=>row[k.trim()] || "").join("|");
        if (seen.has(keys)) return false;
        seen.add(keys);
        return true;
      });
      for(let i = 0; i < deduped.length; i += 400){
        const chunk = deduped.slice(i, i + 400);
        const res = await fetch(SB_URL + "/rest/v1/" + table + "?on_conflict=" + conflict, {
          method: "POST",
          headers: {
            "apikey": SB_KEY,
            "Authorization": "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify(chunk)
        });
        if (!res.ok) {
          const err = await res.text();
          log("  WARN upsert " + table + ": " + err.substring(0, 150));
        } else {
          total += chunk.length;
        }
      }
      return total;
    }
    function m2d(micros) {
      return Math.round(Number(micros || 0) / MIC * 100) / 100;
    }
    function dateSql() {
      if (mode === "backfill" && dateFrom && dateTo) {
        return "segments.date BETWEEN '" + dateFrom + "' AND '" + dateTo + "'";
      }
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - daysBack);
      return "segments.date BETWEEN '" + from.toISOString().split("T")[0] + "' AND '" + now.toISOString().split("T")[0] + "'";
    }
    // === LIST ONLY MODE ===
    if (listOnly) {
      log("\nListing customers under MCC " + MCC_ID + "...");
      const custRows = await gq(MCC_ID, "SELECT customer_client.id, customer_client.descriptive_name, " + "customer_client.currency_code, customer_client.time_zone, " + "customer_client.manager, customer_client.status " + "FROM customer_client WHERE customer_client.status = 'ENABLED'");
      const customers = custRows.map((r)=>({
          customer_id: String(r.customerClient?.id || ""),
          descriptive_name: r.customerClient?.descriptiveName || "",
          currency_code: r.customerClient?.currencyCode || "USD",
          time_zone: r.customerClient?.timeZone || "",
          is_manager: r.customerClient?.manager || false,
          status: "ENABLED",
          synced_at: new Date().toISOString()
        }));
      try {
        await su("gads_customers", customers, "customer_id");
      } catch (e) {
        log("WARN: gads_customers upsert skipped: " + e.message);
      }
      const clients = customers.filter((c)=>!c.is_manager);
      log("Total non-manager clients: " + clients.length);
      return jsonResponseOk({
        customers: clients
      });
    }
    // === SYNC MODE ===
    if (!customerId) {
      log("ERROR: customer_id required");
      return textResponse(L.join("\n"), 400);
    }
    const DC = dateSql();
    log("Date filter: " + DC);
    let totalRows = 0;
    // A. Campaign daily
    try {
      log("\nA. Campaigns...");
      const rows = await gq(customerId, "SELECT campaign.id, campaign.name, campaign.advertising_channel_type, " + "campaign.status, segments.date, " + "metrics.impressions, metrics.clicks, metrics.cost_micros, " + "metrics.conversions, metrics.conversions_value, " + "metrics.all_conversions, metrics.all_conversions_value, " + "metrics.view_through_conversions, metrics.interactions, " + "metrics.ctr, metrics.average_cpc, metrics.average_cpm, " + "metrics.cost_per_conversion " + "FROM campaign WHERE " + DC + " AND campaign.status != 'REMOVED'");
      const data = rows.map((r)=>({
          customer_id: customerId,
          campaign_id: String(r.campaign?.id || ""),
          campaign_name: r.campaign?.name || "",
          campaign_type: r.campaign?.advertisingChannelType || "",
          date: r.segments?.date || "",
          impressions: Number(r.metrics?.impressions || 0),
          clicks: Number(r.metrics?.clicks || 0),
          cost: m2d(r.metrics?.costMicros),
          conversions: Number(r.metrics?.conversions || 0),
          conversions_value: Number(r.metrics?.conversionsValue || 0),
          all_conversions: Number(r.metrics?.allConversions || 0),
          all_conversions_value: Number(r.metrics?.allConversionsValue || 0),
          view_through_conversions: Number(r.metrics?.viewThroughConversions || 0),
          interactions: Number(r.metrics?.interactions || 0),
          ctr: Number(r.metrics?.ctr || 0) * 100,
          avg_cpc: m2d(r.metrics?.averageCpc),
          avg_cpm: m2d(r.metrics?.averageCpm),
          cost_per_conversion: m2d(r.metrics?.costPerConversion),
          synced_at: new Date().toISOString()
        }));
      const n = await su("gads_campaign_daily", data, "customer_id,campaign_id,date");
      log("   OK: " + n);
      totalRows += n;
    } catch (e) {
      log("   ERR campaigns: " + e.message);
    }
    // B. Campaign Status
    try {
      log("B. Campaign Status...");
      const rows = await gq(customerId, "SELECT campaign.id, campaign.name, campaign.advertising_channel_type, " + "campaign.status FROM campaign WHERE campaign.status != 'REMOVED'");
      const data = rows.map((r)=>({
          customer_id: customerId,
          campaign_id: String(r.campaign?.id || ""),
          campaign_name: r.campaign?.name || "",
          campaign_type: r.campaign?.advertisingChannelType || "",
          campaign_status: r.campaign?.status || "",
          synced_at: new Date().toISOString()
        }));
      const n = await su("gads_campaign_status", data, "customer_id,campaign_id");
      log("   OK: " + n);
      totalRows += n;
    } catch (e) {
      log("   ERR campaign_status: " + e.message);
    }
    // C. Ad Groups
    try {
      log("C. Ad Groups...");
      const rows = await gq(customerId, "SELECT campaign.id, campaign.name, " + "ad_group.id, ad_group.name, segments.date, " + "metrics.impressions, metrics.clicks, metrics.cost_micros, " + "metrics.conversions, metrics.conversions_value, " + "metrics.all_conversions, metrics.all_conversions_value, " + "metrics.interactions, metrics.ctr, metrics.average_cpc " + "FROM ad_group WHERE " + DC + " AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED'");
      const data = rows.map((r)=>({
          customer_id: customerId,
          campaign_id: String(r.campaign?.id || ""),
          campaign_name: r.campaign?.name || "",
          ad_group_id: String(r.adGroup?.id || ""),
          ad_group_name: r.adGroup?.name || "",
          date: r.segments?.date || "",
          impressions: Number(r.metrics?.impressions || 0),
          clicks: Number(r.metrics?.clicks || 0),
          cost: m2d(r.metrics?.costMicros),
          conversions: Number(r.metrics?.conversions || 0),
          conversions_value: Number(r.metrics?.conversionsValue || 0),
          all_conversions: Number(r.metrics?.allConversions || 0),
          all_conversions_value: Number(r.metrics?.allConversionsValue || 0),
          interactions: Number(r.metrics?.interactions || 0),
          ctr: Number(r.metrics?.ctr || 0) * 100,
          avg_cpc: m2d(r.metrics?.averageCpc),
          synced_at: new Date().toISOString()
        }));
      const n = await su("gads_adgroup_daily", data, "customer_id,ad_group_id,date");
      log("   OK: " + n);
      totalRows += n;
    } catch (e) {
      log("   ERR ad_groups: " + e.message);
    }
    // D. Keywords
    try {
      log("D. Keywords...");
      const rows = await gq(customerId, "SELECT campaign.id, campaign.name, " + "ad_group.id, ad_group.name, " + "ad_group_criterion.criterion_id, " + "ad_group_criterion.keyword.text, " + "ad_group_criterion.keyword.match_type, " + "segments.date, " + "metrics.impressions, metrics.clicks, metrics.cost_micros, " + "metrics.conversions, metrics.conversions_value, " + "metrics.all_conversions, metrics.ctr, metrics.average_cpc " + "FROM keyword_view WHERE " + DC + " AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED'");
      const data = rows.map((r)=>({
          customer_id: customerId,
          campaign_id: String(r.campaign?.id || ""),
          campaign_name: r.campaign?.name || "",
          ad_group_id: String(r.adGroup?.id || ""),
          ad_group_name: r.adGroup?.name || "",
          keyword_id: String(r.adGroupCriterion?.criterionId || ""),
          keyword_text: r.adGroupCriterion?.keyword?.text || "",
          keyword_match_type: r.adGroupCriterion?.keyword?.matchType || "",
          date: r.segments?.date || "",
          impressions: Number(r.metrics?.impressions || 0),
          clicks: Number(r.metrics?.clicks || 0),
          cost: m2d(r.metrics?.costMicros),
          conversions: Number(r.metrics?.conversions || 0),
          conversions_value: Number(r.metrics?.conversionsValue || 0),
          all_conversions: Number(r.metrics?.allConversions || 0),
          ctr: Number(r.metrics?.ctr || 0) * 100,
          avg_cpc: m2d(r.metrics?.averageCpc),
          synced_at: new Date().toISOString()
        }));
      const n = await su("gads_keyword_daily", data, "customer_id,ad_group_id,keyword_id,date");
      log("   OK: " + n);
      totalRows += n;
    } catch (e) {
      log("   ERR keywords: " + e.message);
    }
    // E. Search Terms
    try {
      log("E. Search Terms...");
      const rows = await gq(customerId, "SELECT campaign.id, campaign.name, " + "ad_group.id, search_term_view.search_term, segments.date, " + "metrics.impressions, metrics.clicks, metrics.cost_micros, " + "metrics.conversions, metrics.conversions_value, " + "metrics.all_conversions, metrics.ctr, metrics.average_cpc " + "FROM search_term_view WHERE " + DC + " AND campaign.status != 'REMOVED'");
      const data = rows.map((r)=>({
          customer_id: customerId,
          campaign_id: String(r.campaign?.id || ""),
          campaign_name: r.campaign?.name || "",
          ad_group_id: String(r.adGroup?.id || ""),
          search_term: r.searchTermView?.searchTerm || "",
          date: r.segments?.date || "",
          impressions: Number(r.metrics?.impressions || 0),
          clicks: Number(r.metrics?.clicks || 0),
          cost: m2d(r.metrics?.costMicros),
          conversions: Number(r.metrics?.conversions || 0),
          conversions_value: Number(r.metrics?.conversionsValue || 0),
          all_conversions: Number(r.metrics?.allConversions || 0),
          ctr: Number(r.metrics?.ctr || 0) * 100,
          avg_cpc: m2d(r.metrics?.averageCpc),
          synced_at: new Date().toISOString()
        }));
      const n = await su("gads_search_term_daily", data, "customer_id,campaign_id,ad_group_id,search_term,date");
      log("   OK: " + n);
      totalRows += n;
    } catch (e) {
      log("   ERR search_terms: " + e.message);
    }
    // F. Conversions by Action
    try {
      log("F. Conversions by Action...");
      const rows = await gq(customerId, "SELECT campaign.id, campaign.name, " + "segments.conversion_action, segments.conversion_action_name, " + "segments.conversion_action_category, segments.date, " + "metrics.conversions, metrics.conversions_value, " + "metrics.all_conversions, metrics.all_conversions_value " + "FROM campaign WHERE " + DC + " AND campaign.status != 'REMOVED' AND metrics.conversions > 0");
      const data = rows.map((r)=>{
        const res = r.segments?.conversionAction || "";
        const aid = res.split("/").pop() || "";
        return {
          customer_id: customerId,
          campaign_id: String(r.campaign?.id || ""),
          campaign_name: r.campaign?.name || "",
          conversion_action_id: aid,
          conversion_action_name: r.segments?.conversionActionName || "",
          conversion_action_category: r.segments?.conversionActionCategory || "",
          date: r.segments?.date || "",
          conversions: Number(r.metrics?.conversions || 0),
          conversions_value: Number(r.metrics?.conversionsValue || 0),
          all_conversions: Number(r.metrics?.allConversions || 0),
          all_conversions_value: Number(r.metrics?.allConversionsValue || 0),
          synced_at: new Date().toISOString()
        };
      });
      const n = await su("gads_conversion_daily", data, "customer_id,campaign_id,conversion_action_id,date");
      log("   OK: " + n);
      totalRows += n;
    } catch (e) {
      log("   ERR conversions: " + e.message);
    }
    // G. Conversion Actions (backfill only)
    if (mode === "backfill") {
      try {
        log("G. Conversion Actions...");
        const rows = await gq(customerId, "SELECT conversion_action.id, conversion_action.name, " + "conversion_action.category, conversion_action.type, " + "conversion_action.status " + "FROM conversion_action WHERE conversion_action.status = 'ENABLED'");
        const data = rows.map((r)=>({
            customer_id: customerId,
            conversion_action_id: String(r.conversionAction?.id || ""),
            conversion_action_name: r.conversionAction?.name || "",
            conversion_action_category: r.conversionAction?.category || "",
            conversion_action_type: r.conversionAction?.type || "",
            status: r.conversionAction?.status || "",
            synced_at: new Date().toISOString()
          }));
        const n = await su("gads_conversion_actions", data, "customer_id,conversion_action_id");
        log("   OK: " + n + " actions");
      } catch (e) {
        log("   ERR conv_actions: " + e.message);
      }
    }
    log("\n=== DONE === Total: " + totalRows);
    return textResponse(L.join("\n"), 200);
  } catch (err) {
    log("FATAL: " + (err.message || String(err)));
    return textResponse(L.join("\n"), 500);
  }
});
