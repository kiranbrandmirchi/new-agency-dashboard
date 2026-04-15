const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders
  });
  const L = [];
  const log = (m)=>{
    L.push(m);
    console.log(m);
  };
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const CI = Deno.env.get("GA4_CLIENT_ID") || "";
    const CS = Deno.env.get("GA4_CLIENT_SECRET") || "";
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
    log("=== GA4 SYNC V6 (triple report) ===");
    log("Mode: " + mode + " | customer: " + customerId);
    if (!customerId) return jsonRes({
      error: "customer_id required"
    }, 400);
    if (mode !== "backfill" || !dateFrom || !dateTo) {
      const now = new Date();
      dateTo = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
      dateFrom = new Date(now.getTime() - daysBack * 86400000).toISOString().split("T")[0];
    }
    log("Date range: " + dateFrom + " to " + dateTo);
    // --- Credential lookup ---
    const cpaRows = await sbGet(SB_URL, SB_KEY, `client_platform_accounts?platform_customer_id=eq.${customerId}&platform=eq.ga4&is_active=eq.true&select=credential_id,agency_id,client_id,clients(website_platform)`);
    if (!cpaRows?.length) return jsonRes({
      error: "No GA4 account for " + customerId
    }, 400);
    const { credential_id: credentialId, agency_id: agencyId } = cpaRows[0];
    const websitePlatform = cpaRows[0]?.clients?.website_platform || "custom";
    log("Platform: " + websitePlatform);
    if (!credentialId) return jsonRes({
      error: "No credential_id linked"
    }, 400);
    const agencyCreds = await sbGet(SB_URL, SB_KEY, `agency_platform_credentials?id=eq.${credentialId}&is_active=eq.true&select=id,oauth_refresh_token`);
    if (!agencyCreds?.length || !agencyCreds[0].oauth_refresh_token) return jsonRes({
      error: "No credential for " + credentialId
    }, 400);
    const REFRESH_TOK = agencyCreds[0].oauth_refresh_token;
    const credDbId = agencyCreds[0].id;
    log("Credential found");
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
      return jsonRes({
        error: "OAuth failed",
        detail: tokenData
      }, 400);
    }
    const TOKEN = tokenData.access_token;
    log("Token OK");
    // --- Helpers ---
    async function runReport(reportBody) {
      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${customerId}:runReport`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(reportBody)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error("GA4 " + res.status + ": " + txt.substring(0, 300));
      }
      return await res.json();
    }
    function intVal(mv, idx) {
      return parseInt(mv?.[idx]?.value || "0", 10) || 0;
    }
    function floatVal(mv, idx) {
      return parseFloat(mv?.[idx]?.value || "0") || 0;
    }
    async function sbDelete(table, filter) {
      await fetch(SB_URL + "/rest/v1/" + table + "?" + filter, {
        method: "DELETE",
        headers: {
          apikey: SB_KEY,
          Authorization: "Bearer " + SB_KEY,
          Prefer: "return=minimal"
        }
      });
    }
    async function sbInsertChunked(table, data) {
      let inserted = 0;
      for(let i = 0; i < data.length; i += 400){
        const chunk = data.slice(i, i + 400);
        const res = await fetch(SB_URL + "/rest/v1/" + table, {
          method: "POST",
          headers: {
            apikey: SB_KEY,
            Authorization: "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify(chunk)
        });
        if (!res.ok) {
          const err = await res.text();
          log("  WARN " + table + " insert: " + err.substring(0, 150));
        } else {
          inserted += chunk.length;
        }
      }
      return inserted;
    }
    // --- Load page rules ---
    const rules = await sbGet(SB_URL, SB_KEY, `ga4_page_rules?or=(customer_id.eq.${customerId},and(customer_id.is.null,platform.eq.${websitePlatform}),and(customer_id.is.null,platform.eq.custom))&is_active=eq.true&order=priority.asc`) || [];
    rules.sort((a, b)=>{
      const aSpec = a.customer_id ? 0 : a.platform === websitePlatform ? 1 : 2;
      const bSpec = b.customer_id ? 0 : b.platform === websitePlatform ? 1 : 2;
      if (aSpec !== bSpec) return aSpec - bSpec;
      return (a.priority || 100) - (b.priority || 100);
    });
    log("Page rules loaded: " + rules.length);
    function classifyPage(_loc, pagePath) {
      if (!rules?.length) return null;
      for (const rule of rules){
        try {
          if (new RegExp(rule.url_pattern, "i").test(pagePath)) return rule.page_type;
        } catch  {}
      }
      return null;
    }
    // --- Date list ---
    const dates = [];
    const d = new Date(dateFrom + "T00:00:00Z");
    const end = new Date(dateTo + "T00:00:00Z");
    while(d <= end){
      dates.push(d.toISOString().split("T")[0]);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    let totalSummaryRows = 0;
    let totalPageRows = 0;
    let totalEventRows = 0;
    for (const dateStr of dates){
      log("\n--- " + dateStr + " ---");
      try {
        // ========== REPORT 1: Session-level (accurate KPIs) ==========
        log("  R1: Session-level...");
        const r1 = await runReport({
          dateRanges: [
            {
              startDate: dateStr,
              endDate: dateStr
            }
          ],
          dimensions: [
            {
              name: "sessionDefaultChannelGroup"
            },
            {
              name: "sessionSource"
            },
            {
              name: "sessionMedium"
            },
            {
              name: "sessionCampaignName"
            },
            {
              name: "deviceCategory"
            },
            {
              name: "city"
            },
            {
              name: "region"
            }
          ],
          metrics: [
            {
              name: "sessions"
            },
            {
              name: "totalUsers"
            },
            {
              name: "newUsers"
            },
            {
              name: "activeUsers"
            },
            {
              name: "engagedSessions"
            },
            {
              name: "bounceRate"
            },
            {
              name: "engagementRate"
            },
            {
              name: "averageSessionDuration"
            },
            {
              name: "eventCount"
            },
            {
              name: "screenPageViews"
            }
          ],
          limit: "100000",
          offset: "0"
        });
        const r1b = await runReport({
          dateRanges: [
            {
              startDate: dateStr,
              endDate: dateStr
            }
          ],
          dimensions: [
            {
              name: "sessionDefaultChannelGroup"
            },
            {
              name: "sessionSource"
            },
            {
              name: "sessionMedium"
            },
            {
              name: "sessionCampaignName"
            },
            {
              name: "deviceCategory"
            },
            {
              name: "city"
            },
            {
              name: "region"
            }
          ],
          metrics: [
            {
              name: "keyEvents"
            },
            {
              name: "userEngagementDuration"
            }
          ],
          limit: "100000",
          offset: "0"
        });
        const summaryRows = r1.rows || [];
        const summaryRows2 = r1b.rows || [];
        log("  R1 rows: " + summaryRows.length);
        const s2Map = new Map();
        for (const row of summaryRows2){
          const key = (row.dimensionValues || []).map((d)=>d.value || "").join("|");
          s2Map.set(key, row.metricValues);
        }
        if (summaryRows.length > 0) {
          const summaryData = [];
          for (const row of summaryRows){
            const dv = row.dimensionValues;
            const mv = row.metricValues;
            const dimKey = (dv || []).map((d)=>d.value || "").join("|");
            const mv2 = s2Map.get(dimKey) || [];
            const source = dv?.[1]?.value || "(direct)";
            const medium = dv?.[2]?.value || "(none)";
            summaryData.push({
              customer_id: customerId,
              agency_id: agencyId,
              report_date: dateStr,
              channel_group: dv?.[0]?.value || "unknown",
              source,
              medium,
              source_medium: source + " / " + medium,
              campaign_name: dv?.[3]?.value || "(not set)",
              device_category: dv?.[4]?.value || "unknown",
              city: dv?.[5]?.value || "unknown",
              region: dv?.[6]?.value || "unknown",
              country: "US",
              sessions: intVal(mv, 0),
              total_users: intVal(mv, 1),
              new_users: intVal(mv, 2),
              active_users: intVal(mv, 3),
              engaged_sessions: intVal(mv, 4),
              bounce_rate: floatVal(mv, 5),
              engagement_rate: floatVal(mv, 6),
              avg_session_duration: floatVal(mv, 7),
              event_count: intVal(mv, 8),
              screen_page_views: intVal(mv, 9),
              key_events: intVal(mv2, 0),
              user_engagement_duration: floatVal(mv2, 1),
              synced_at: new Date().toISOString()
            });
          }
          await sbDelete("ga4_daily_summary", "customer_id=eq." + customerId + "&report_date=eq." + dateStr);
          const ins1 = await sbInsertChunked("ga4_daily_summary", summaryData);
          log("  R1 inserted: " + ins1);
          totalSummaryRows += ins1;
        }
        // ========== REPORT 2: Page-level (for pages/VDP tabs) ==========
        log("  R2: Page-level...");
        const r2 = await runReport({
          dateRanges: [
            {
              startDate: dateStr,
              endDate: dateStr
            }
          ],
          dimensions: [
            {
              name: "pageLocation"
            },
            {
              name: "pageTitle"
            },
            {
              name: "sessionDefaultChannelGroup"
            },
            {
              name: "sessionSource"
            },
            {
              name: "sessionMedium"
            },
            {
              name: "sessionCampaignName"
            },
            {
              name: "deviceCategory"
            },
            {
              name: "city"
            },
            {
              name: "region"
            }
          ],
          metrics: [
            {
              name: "screenPageViews"
            },
            {
              name: "totalUsers"
            },
            {
              name: "newUsers"
            },
            {
              name: "sessions"
            },
            {
              name: "eventCount"
            },
            {
              name: "activeUsers"
            }
          ],
          limit: "100000",
          offset: "0"
        });
        const pageRows = r2.rows || [];
        log("  R2 rows: " + pageRows.length);
        if (pageRows.length > 0) {
          const pageData = [];
          for (const row of pageRows){
            const dv = row.dimensionValues;
            const mv = row.metricValues;
            const pageLocation = dv?.[0]?.value || "";
            const pagePath = (()=>{
              try {
                return new URL(pageLocation).pathname;
              } catch  {
                return pageLocation;
              }
            })();
            const source = dv?.[3]?.value || "(direct)";
            const medium = dv?.[4]?.value || "(none)";
            const pageType = classifyPage(pageLocation, pagePath);
            pageData.push({
              customer_id: customerId,
              agency_id: agencyId,
              report_date: dateStr,
              page_location: pageLocation,
              page_path: pagePath,
              page_title: dv?.[1]?.value || "",
              channel_group: dv?.[2]?.value || "unknown",
              source,
              medium,
              source_medium: source + " / " + medium,
              campaign_name: dv?.[5]?.value || "(not set)",
              device_category: dv?.[6]?.value || "unknown",
              country: "US",
              city: dv?.[7]?.value || "unknown",
              region: dv?.[8]?.value || "unknown",
              page_views: intVal(mv, 0),
              total_users: intVal(mv, 1),
              new_users: intVal(mv, 2),
              sessions: intVal(mv, 3),
              event_count: intVal(mv, 4),
              active_users: intVal(mv, 5),
              page_type: pageType,
              synced_at: new Date().toISOString()
            });
          }
          await sbDelete("ga4_raw", "customer_id=eq." + customerId + "&report_date=eq." + dateStr);
          const ins2 = await sbInsertChunked("ga4_raw", pageData);
          log("  R2 inserted: " + ins2);
          totalPageRows += ins2;
        }
        // ========== REPORT 3: Event-level (event name × channel × source/medium) ==========
        log("  R3: Event-level...");
        const r3 = await runReport({
          dateRanges: [
            {
              startDate: dateStr,
              endDate: dateStr
            }
          ],
          dimensions: [
            {
              name: "eventName"
            },
            {
              name: "sessionDefaultChannelGroup"
            },
            {
              name: "sessionSource"
            },
            {
              name: "sessionMedium"
            }
          ],
          metrics: [
            {
              name: "eventCount"
            },
            {
              name: "totalUsers"
            },
            {
              name: "sessions"
            }
          ],
          limit: "100000",
          offset: "0"
        });
        const eventRows = r3.rows || [];
        log("  R3 rows: " + eventRows.length);
        if (eventRows.length > 0) {
          const eventData = [];
          for (const row of eventRows){
            const dv = row.dimensionValues;
            const mv = row.metricValues;
            const source = dv?.[2]?.value || "(direct)";
            const medium = dv?.[3]?.value || "(none)";
            eventData.push({
              customer_id: customerId,
              agency_id: agencyId,
              report_date: dateStr,
              event_name: dv?.[0]?.value || "unknown",
              channel_group: dv?.[1]?.value || "unknown",
              source,
              medium,
              source_medium: source + " / " + medium,
              event_count: intVal(mv, 0),
              total_users: intVal(mv, 1),
              sessions: intVal(mv, 2),
              synced_at: new Date().toISOString()
            });
          }
          await sbDelete("ga4_events", "customer_id=eq." + customerId + "&report_date=eq." + dateStr);
          const ins3 = await sbInsertChunked("ga4_events", eventData);
          log("  R3 inserted: " + ins3);
          totalEventRows += ins3;
        }
      } catch (e) {
        log("  ERR: " + e.message);
      }
    }
    // Update last_sync_at
    await fetch(SB_URL + "/rest/v1/agency_platform_credentials?id=eq." + credDbId, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        last_sync_at: new Date().toISOString()
      })
    });
    log("\n=== DONE === Summary: " + totalSummaryRows + " | Pages: " + totalPageRows + " | Events: " + totalEventRows);
    return jsonRes({
      success: true,
      summary_rows: totalSummaryRows,
      page_rows: totalPageRows,
      event_rows: totalEventRows,
      log: L
    });
  } catch (err) {
    log("FATAL: " + (err.message || String(err)));
    return jsonRes({
      error: err.message,
      log: L
    }, 500);
  }
  function jsonRes(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  async function sbGet(url, key, path) {
    const res = await fetch(url + "/rest/v1/" + path, {
      headers: {
        apikey: key,
        Authorization: "Bearer " + key
      }
    });
    return await res.json();
  }
});
