// supabase/functions/fb-full-sync/index.ts
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
    const FB_APP_ID = Deno.env.get("FB_APP_ID") || "";
    const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET") || "";
    const FB_API_VERSION = "v21.0";
    const FB_BASE = `https://graph.facebook.com/${FB_API_VERSION}`;
    let body = {};
    try {
      body = await req.json();
    } catch  {
      body = {};
    }
    const customerId = body.customer_id || null;
    const mode = body.mode || "daily";
    let dateFrom = body.date_from || "";
    let dateTo = body.date_to || "";
    const daysBack = body.days_back || 5;
    log("=== FB FULL SYNC ===");
    log("Mode: " + mode + " | customer: " + customerId);
    if (!customerId) {
      log("ERROR: customer_id required");
      return textResponse(L.join("\n"), 400);
    }
    // Compute dates
    if (mode !== "backfill" || !dateFrom || !dateTo) {
      const now = new Date();
      dateTo = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
      dateFrom = new Date(now.getTime() - daysBack * 86400000).toISOString().split("T")[0];
    }
    log("Date range: " + dateFrom + " to " + dateTo);
    // --- Get credential from database (same pattern as gads-full-sync) ---
    const credRes = await fetch(SB_URL + "/rest/v1/client_platform_accounts?" + "platform_customer_id=eq." + customerId + "&platform=eq.facebook&is_active=eq.true" + "&select=credential_id,agency_id", {
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
    const credentialId = cpaRows[0].credential_id;
    const agencyCredRes = await fetch(SB_URL + "/rest/v1/agency_platform_credentials?" + "id=eq." + credentialId + "&is_active=eq.true" + "&select=id,oauth_refresh_token", {
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY
      }
    });
    const agencyCreds = await agencyCredRes.json();
    if (!agencyCreds || agencyCreds.length === 0 || !agencyCreds[0].oauth_refresh_token) {
      log("ERROR: No credential for credential_id " + credentialId);
      return textResponse(L.join("\n"), 400);
    }
    let accessToken = agencyCreds[0].oauth_refresh_token;
    const credDbId = agencyCreds[0].id;
    log("Credential found");
    // --- Refresh long-lived token ---
    try {
      const tokenRes = await fetch(FB_BASE + "/oauth/access_token?" + "grant_type=fb_exchange_token" + "&client_id=" + FB_APP_ID + "&client_secret=" + FB_APP_SECRET + "&fb_exchange_token=" + accessToken);
      const tokenData = await tokenRes.json();
      if (tokenData.access_token && tokenData.access_token !== accessToken) {
        accessToken = tokenData.access_token;
        // Update in DB
        await fetch(SB_URL + "/rest/v1/agency_platform_credentials?id=eq." + credDbId, {
          method: "PATCH",
          headers: {
            "apikey": SB_KEY,
            "Authorization": "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            oauth_refresh_token: accessToken,
            last_sync_at: new Date().toISOString()
          })
        });
        log("Token refreshed and saved");
      } else {
        log("Token still valid (no refresh needed)");
      }
    } catch (e) {
      log("Token refresh warning: " + e.message + " (using existing)");
    }
    log("Token OK");
    // --- Supabase upsert helper (same as gads) ---
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
    // --- FB Insights fetch helper with pagination ---
    async function fetchInsights(level, dateStr, breakdowns) {
      const allRows = [];
      const fields = [
        "campaign_id",
        "campaign_name",
        "adset_id",
        "adset_name",
        "ad_id",
        "ad_name",
        "impressions",
        "clicks",
        "spend",
        "cpc",
        "cpm",
        "ctr",
        "reach",
        "frequency",
        "actions",
        "action_values",
        "cost_per_action_type",
        "video_p25_watched_actions",
        "video_p50_watched_actions",
        "video_p75_watched_actions",
        "video_p100_watched_actions",
        "video_play_actions",
        "purchase_roas"
      ].join(",");
      let url = FB_BASE + "/act_" + customerId + "/insights" + "?fields=" + fields + "&level=" + level + "&time_range=" + encodeURIComponent('{"since":"' + dateStr + '","until":"' + dateStr + '"}') + "&limit=500" + "&access_token=" + accessToken;
      if (breakdowns) url += "&breakdowns=" + breakdowns;
      let page = 1;
      while(url){
        log("  Fetch " + level + " p" + page + (breakdowns ? " (" + breakdowns + ")" : ""));
        const res = await fetch(url);
        if (!res.ok) {
          const txt = await res.text();
          log("  Insights error " + res.status + ": " + txt.substring(0, 300));
          break;
        }
        const json = await res.json();
        const rows = json.data || [];
        allRows.push(...rows);
        log("  Page " + page + ": " + rows.length + " rows (total: " + allRows.length + ")");
        url = json.paging?.next || null;
        page++;
      }
      return allRows;
    }
    // --- Action helpers ---
    function getAct(actions, type) {
      if (!actions) return 0;
      const f = actions.find((a)=>a.action_type === type);
      return f ? Number(f.value) || 0 : 0;
    }
    function getActVal(vals, type) {
      if (!vals) return 0;
      const f = vals.find((a)=>a.action_type === type);
      return f ? Number(f.value) || 0 : 0;
    }
    function getCpa(costs, type) {
      if (!costs) return 0;
      const f = costs.find((a)=>a.action_type === type);
      return f ? Number(f.value) || 0 : 0;
    }
    function getRoas(roas) {
      if (!roas || !roas.length) return 0;
      return Number(roas[0].value) || 0;
    }
    function getVid(va) {
      if (!va) return 0;
      let t = 0;
      for (const a of va)t += Number(a.value) || 0;
      return t;
    }
    function metrics(r) {
      return {
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        spend: Number(r.spend || 0),
        cpc: Number(r.cpc || 0),
        cpm: Number(r.cpm || 0),
        ctr: Number(r.ctr || 0),
        reach: Number(r.reach || 0),
        frequency: Number(r.frequency || 0),
        link_clicks: getAct(r.actions, "link_click"),
        purchase_count: getAct(r.actions, "purchase"),
        purchase_value: getActVal(r.action_values, "purchase"),
        purchase_cost: getCpa(r.cost_per_action_type, "purchase"),
        lead_count: getAct(r.actions, "lead"),
        lead_cost: getCpa(r.cost_per_action_type, "lead"),
        add_to_cart_count: getAct(r.actions, "add_to_cart"),
        add_to_cart_value: getActVal(r.action_values, "add_to_cart"),
        view_content_count: getAct(r.actions, "view_content"),
        complete_registration_count: getAct(r.actions, "complete_registration"),
        initiate_checkout_count: getAct(r.actions, "initiate_checkout"),
        initiate_checkout_value: getActVal(r.action_values, "initiate_checkout"),
        purchase_roas: getRoas(r.purchase_roas),
        video_views: getVid(r.video_play_actions),
        video_p25_watched: getVid(r.video_p25_watched_actions),
        video_p50_watched: getVid(r.video_p50_watched_actions),
        video_p75_watched: getVid(r.video_p75_watched_actions),
        video_p100_watched: getVid(r.video_p100_watched_actions)
      };
    }
    // --- Build date list ---
    const dates = [];
    const d = new Date(dateFrom + "T00:00:00Z");
    const end = new Date(dateTo + "T00:00:00Z");
    while(d <= end){
      dates.push(d.toISOString().split("T")[0]);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    let totalRows = 0;
    for (const dateStr of dates){
      log("\n--- " + dateStr + " ---");
      // A. Campaign level
      try {
        log("A. Campaigns...");
        const rows = await fetchInsights("campaign", dateStr);
        const data = rows.map((r)=>({
            customer_id: customerId,
            campaign_id: r.campaign_id || "",
            campaign_name: r.campaign_name || "",
            report_date: dateStr,
            ...metrics(r),
            updated_at: new Date().toISOString()
          }));
        const n = await su("fb_campaign_daily", data, "customer_id,campaign_id,report_date");
        log("   OK: " + n);
        totalRows += n;
      } catch (e) {
        log("   ERR campaigns: " + e.message);
      }
      // B. Ad Set level
      try {
        log("B. Ad Sets...");
        const rows = await fetchInsights("adset", dateStr);
        const data = rows.map((r)=>({
            customer_id: customerId,
            campaign_id: r.campaign_id || "",
            campaign_name: r.campaign_name || "",
            adset_id: r.adset_id || "",
            adset_name: r.adset_name || "",
            report_date: dateStr,
            ...metrics(r),
            updated_at: new Date().toISOString()
          }));
        const n = await su("fb_adset_daily", data, "customer_id,campaign_id,adset_id,report_date");
        log("   OK: " + n);
        totalRows += n;
      } catch (e) {
        log("   ERR adsets: " + e.message);
      }
      // C. Ad level
      try {
        log("C. Ads...");
        const rows = await fetchInsights("ad", dateStr);
        const data = rows.map((r)=>({
            customer_id: customerId,
            campaign_id: r.campaign_id || "",
            campaign_name: r.campaign_name || "",
            adset_id: r.adset_id || "",
            adset_name: r.adset_name || "",
            ad_id: r.ad_id || "",
            ad_name: r.ad_name || "",
            report_date: dateStr,
            ...metrics(r),
            updated_at: new Date().toISOString()
          }));
        const n = await su("fb_ad_daily", data, "customer_id,campaign_id,adset_id,ad_id,report_date");
        log("   OK: " + n);
        totalRows += n;
      } catch (e) {
        log("   ERR ads: " + e.message);
      }
      // D. Placement level
      try {
        log("D. Placements...");
        const rows = await fetchInsights("campaign", dateStr, "publisher_platform,platform_position");
        const data = rows.map((r)=>({
            customer_id: customerId,
            campaign_id: r.campaign_id || "",
            campaign_name: r.campaign_name || "",
            publisher_platform: r.publisher_platform || "unknown",
            platform_position: r.platform_position || "unknown",
            report_date: dateStr,
            ...metrics(r),
            updated_at: new Date().toISOString()
          }));
        const n = await su("fb_placement_daily", data, "customer_id,campaign_id,publisher_platform,platform_position,report_date");
        log("   OK: " + n);
        totalRows += n;
      } catch (e) {
        log("   ERR placements: " + e.message);
      }
    }
    // Update last_sync_at on the credential
    await fetch(SB_URL + "/rest/v1/agency_platform_credentials?id=eq." + credDbId, {
      method: "PATCH",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success"
      })
    });
    log("\n=== DONE === Total: " + totalRows);
    return textResponse(L.join("\n"), 200);
  } catch (err) {
    log("FATAL: " + (err.message || String(err)));
    return textResponse(L.join("\n"), 500);
  }
});
