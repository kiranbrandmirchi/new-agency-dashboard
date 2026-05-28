import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
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
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS
    });
  }
  try {
    const { customer_id, date_from, date_to, compare_date_from, compare_date_to, breakdown = "none" } = await req.json();
    if (!customer_id || !date_from || !date_to) {
      return jsonRes({
        error: "customer_id, date_from, date_to required"
      }, 400);
    }
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const GA_CID = Deno.env.get("GA4_CLIENT_ID") || "";
    const GA_SECRET = Deno.env.get("GA4_CLIENT_SECRET") || "";
    /* ── 1. Get GA4 account ── */ const cpaRows = await sbGet(SB_URL, SB_KEY, `client_platform_accounts?platform_customer_id=eq.${customer_id}&platform=eq.ga4&is_active=eq.true&select=credential_id,agency_id,client_id`);
    if (!cpaRows?.length) return jsonRes({
      error: "No GA4 account for " + customer_id
    }, 404);
    const { credential_id } = cpaRows[0];
    if (!credential_id) return jsonRes({
      error: "No credential_id linked"
    }, 400);
    /* ── 2. Get refresh token ── */ const agencyCreds = await sbGet(SB_URL, SB_KEY, `agency_platform_credentials?id=eq.${credential_id}&is_active=eq.true&select=id,oauth_refresh_token`);
    if (!agencyCreds?.length || !agencyCreds[0].oauth_refresh_token) {
      return jsonRes({
        error: "No credential for " + credential_id
      }, 400);
    }
    const REFRESH_TOK = agencyCreds[0].oauth_refresh_token;
    /* ── 3. OAuth access token ── */ const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: GA_CID,
        client_secret: GA_SECRET,
        refresh_token: REFRESH_TOK,
        grant_type: "refresh_token"
      })
    });
    const tokenData = await tokRes.json();
    if (!tokenData.access_token) {
      return jsonRes({
        error: "OAuth failed",
        detail: tokenData
      }, 500);
    }
    const TOKEN = tokenData.access_token;
    /* ── 4. Build dimensions ── */ const dimensions = [];
    switch(breakdown){
      case "channel":
        dimensions.push({
          name: "sessionDefaultChannelGroup"
        });
        break;
      case "source_medium":
        dimensions.push({
          name: "sessionSource"
        }, {
          name: "sessionMedium"
        });
        break;
      case "campaign":
        dimensions.push({
          name: "sessionDefaultChannelGroup"
        }, {
          name: "sessionCampaignName"
        });
        break;
      case "daily":
        dimensions.push({
          name: "date"
        });
        break;
      case "daily_channel":
        dimensions.push({
          name: "date"
        }, {
          name: "sessionDefaultChannelGroup"
        });
        break;
      case "page":
        dimensions.push({
          name: "pagePath"
        }, {
          name: "pageTitle"
        });
        break;
      case "device":
        dimensions.push({
          name: "deviceCategory"
        });
        break;
      case "event":
        dimensions.push({
          name: "eventName"
        });
        break;
      case "geo":
        dimensions.push({
          name: "country"
        }, {
          name: "region"
        }, {
          name: "city"
        });
        break;
      case "none":
      default:
        break;
    }
    /* ── 5. Metrics split into two batches (max 10 each) ── */ const metricsBatch1 = [
      {
        name: "totalUsers"
      },
      {
        name: "sessions"
      },
      {
        name: "screenPageViews"
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
        name: "screenPageViewsPerSession"
      }
    ];
    let metricsBatch2 = [
      {
        name: "userEngagementDuration"
      },
      {
        name: "keyEvents"
      },
      {
        name: "eventCount"
      }
    ];
    if (breakdown === "event") {
      metricsBatch2.push({
        name: "eventValue"
      });
    }
    /* ── 6. Helper: run a single GA4 report ── */ async function runReport(startDate, endDate, metrics) {
      const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${customer_id}:runReport`, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dateRanges: [
            {
              startDate,
              endDate
            }
          ],
          dimensions,
          metrics,
          limit: 10000,
          keepEmptyRows: false
        })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error("GA4 " + res.status + ": " + txt.substring(0, 500));
      }
      return await res.json();
    }
    /* ── 7. Helper: parse one period's data from two batches ── */ function parsePeriod(report1, report2) {
      const b2Map = new Map();
      for (const row of report2.rows || []){
        const key = (row.dimensionValues || []).map((d)=>d.value || "").join("|");
        b2Map.set(key, row.metricValues || []);
      }
      const rows = [];
      for (const row of report1.rows || []){
        const dv = row.dimensionValues || [];
        const mv1 = row.metricValues || [];
        const dimKey = dv.map((d)=>d.value || "").join("|");
        const mv2 = b2Map.get(dimKey) || [];
        const obj = {};
        // Parse dimensions
        let di = 0;
        switch(breakdown){
          case "channel":
            obj.channel_group = dv[di++]?.value || "(not set)";
            break;
          case "source_medium":
            obj.source = dv[di++]?.value || "(not set)";
            obj.medium = dv[di++]?.value || "(not set)";
            obj.source_medium = `${obj.source} / ${obj.medium}`;
            break;
          case "campaign":
            obj.channel_group = dv[di++]?.value || "(not set)";
            obj.campaign_name = dv[di++]?.value || "(not set)";
            break;
          case "daily":
            obj.date = dv[di++]?.value || "";
            break;
          case "daily_channel":
            obj.date = dv[di++]?.value || "";
            obj.channel_group = dv[di++]?.value || "(not set)";
            break;
          case "page":
            obj.page_path = dv[di++]?.value || "/";
            obj.page_title = dv[di++]?.value || "";
            break;
          case "device":
            obj.device_category = dv[di++]?.value || "(not set)";
            break;
          case "event":
            obj.event_name = dv[di++]?.value || "(not set)";
            break;
          case "geo":
            obj.country = dv[di++]?.value || "(not set)";
            obj.region = dv[di++]?.value || "(not set)";
            obj.city = dv[di++]?.value || "(not set)";
            break;
        }
        // Batch 1 metrics
        obj.total_users = parseInt(mv1[0]?.value || "0");
        obj.sessions = parseInt(mv1[1]?.value || "0");
        obj.screen_page_views = parseInt(mv1[2]?.value || "0");
        obj.new_users = parseInt(mv1[3]?.value || "0");
        obj.active_users = parseInt(mv1[4]?.value || "0");
        obj.engaged_sessions = parseInt(mv1[5]?.value || "0");
        obj.bounce_rate = parseFloat(mv1[6]?.value || "0");
        obj.engagement_rate = parseFloat(mv1[7]?.value || "0");
        obj.avg_session_duration = parseFloat(mv1[8]?.value || "0");
        obj.pages_per_session = parseFloat(mv1[9]?.value || "0");
        // Batch 2 metrics
        obj.user_engagement_duration = parseFloat(mv2[0]?.value || "0");
        obj.key_events = parseInt(mv2[1]?.value || "0");
        obj.event_count = parseInt(mv2[2]?.value || "0");
        if (breakdown === "event") {
          obj.event_value = parseFloat(mv2[3]?.value || "0");
        }
        rows.push(obj);
      }
      return rows;
    }
    /* ── 8. Run all API calls in parallel ── */ const hasCompare = compare_date_from && compare_date_to;
    const calls = [
      runReport(date_from, date_to, metricsBatch1),
      runReport(date_from, date_to, metricsBatch2)
    ];
    if (hasCompare) {
      calls.push(runReport(compare_date_from, compare_date_to, metricsBatch1));
      calls.push(runReport(compare_date_from, compare_date_to, metricsBatch2));
    }
    const results = await Promise.all(calls);
    const currentB1 = results[0];
    const currentB2 = results[1];
    if (currentB1.error) return jsonRes({
      error: currentB1.error.message,
      detail: currentB1.error
    }, 500);
    if (currentB2.error) return jsonRes({
      error: currentB2.error.message,
      detail: currentB2.error
    }, 500);
    const current = parsePeriod(currentB1, currentB2);
    let previous = [];
    if (hasCompare) {
      const prevB1 = results[2];
      const prevB2 = results[3];
      if (prevB1.error) return jsonRes({
        error: prevB1.error.message,
        detail: prevB1.error
      }, 500);
      if (prevB2.error) return jsonRes({
        error: prevB2.error.message,
        detail: prevB2.error
      }, 500);
      previous = parsePeriod(prevB1, prevB2);
    }
    return jsonRes({
      success: true,
      customer_id,
      date_from,
      date_to,
      compare_date_from: compare_date_from || null,
      compare_date_to: compare_date_to || null,
      breakdown,
      current,
      previous,
      row_count: {
        current: current.length,
        previous: previous.length
      }
    });
  } catch (e) {
    return jsonRes({
      error: e.message || "Unknown error"
    }, 500);
  }
});
