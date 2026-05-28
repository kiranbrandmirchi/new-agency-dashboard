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
  const r = await fetch(url + "/rest/v1/" + path, {
    headers: {
      apikey: key,
      Authorization: "Bearer " + key
    }
  });
  return await r.json();
}
function intV(mv, i) {
  return parseInt(mv?.[i]?.value || "0", 10) || 0;
}
function floatV(mv, i) {
  return parseFloat(mv?.[i]?.value || "0") || 0;
}
function getGA4DimsAndParser(bd) {
  if (bd === "summary") return {
    dims: [],
    dp: ()=>({})
  };
  if (bd === "channel") return {
    dims: [
      {
        name: "sessionDefaultChannelGroup"
      }
    ],
    dp: (dv)=>({
        channel_group: dv[0]?.value || "(not set)"
      })
  };
  if (bd === "source_medium") return {
    dims: [
      {
        name: "sessionSource"
      },
      {
        name: "sessionMedium"
      }
    ],
    dp: (dv)=>({
        source: dv[0]?.value || "(not set)",
        medium: dv[1]?.value || "(not set)",
        source_medium: (dv[0]?.value || "(not set)") + " / " + (dv[1]?.value || "(not set)")
      })
  };
  if (bd === "daily") return {
    dims: [
      {
        name: "date"
      }
    ],
    dp: (dv)=>({
        date: dv[0]?.value || ""
      })
  };
  if (bd === "daily_channel") return {
    dims: [
      {
        name: "date"
      },
      {
        name: "sessionDefaultChannelGroup"
      }
    ],
    dp: (dv)=>({
        date: dv[0]?.value || "",
        channel_group: dv[1]?.value || "(not set)"
      })
  };
  if (bd === "page") return {
    dims: [
      {
        name: "pagePath"
      },
      {
        name: "pageTitle"
      }
    ],
    dp: (dv)=>({
        page_path: dv[0]?.value || "/",
        page_title: dv[1]?.value || ""
      })
  };
  if (bd === "landing_page") return {
    dims: [
      {
        name: "landingPagePlusQueryString"
      }
    ],
    dp: (dv)=>({
        landing_page: dv[0]?.value || "/"
      })
  };
  if (bd === "geo") return {
    dims: [
      {
        name: "country"
      },
      {
        name: "region"
      },
      {
        name: "city"
      }
    ],
    dp: (dv)=>({
        country: dv[0]?.value || "(not set)",
        region: dv[1]?.value || "(not set)",
        city: dv[2]?.value || "(not set)"
      })
  };
  if (bd === "device") return {
    dims: [
      {
        name: "deviceCategory"
      }
    ],
    dp: (dv)=>({
        device_category: dv[0]?.value || "(not set)"
      })
  };
  if (bd === "event") return {
    dims: [
      {
        name: "eventName"
      }
    ],
    dp: (dv)=>({
        event_name: dv[0]?.value || "(not set)"
      })
  };
  return null;
}
function parseGA4(r1, r2, dp) {
  const m2 = new Map();
  for (const row of r2.rows || []){
    m2.set((row.dimensionValues || []).map((d)=>d.value || "").join("|"), row.metricValues || []);
  }
  const rows = [];
  for (const row of r1.rows || []){
    const dv = row.dimensionValues || [];
    const mv1 = row.metricValues || [];
    const mv2 = m2.get(dv.map((d)=>d.value || "").join("|")) || [];
    const o = dp(dv);
    o.total_users = intV(mv1, 0);
    o.sessions = intV(mv1, 1);
    o.screen_page_views = intV(mv1, 2);
    o.new_users = intV(mv1, 3);
    o.active_users = intV(mv1, 4);
    o.engaged_sessions = intV(mv1, 5);
    o.bounce_rate = floatV(mv1, 6);
    o.engagement_rate = floatV(mv1, 7);
    o.avg_session_duration = floatV(mv1, 8);
    o.pages_per_session = floatV(mv1, 9);
    o.user_engagement_duration = floatV(mv2, 0);
    o.key_events = intV(mv2, 1);
    o.event_count = intV(mv2, 2);
    rows.push(o);
  }
  return rows;
}
function parseGSC(data, dimNames) {
  return (data.rows || []).map((row)=>{
    const o = {};
    (row.keys || []).forEach((k, i)=>{
      if (dimNames[i]) o[dimNames[i]] = k;
    });
    o.clicks = row.clicks || 0;
    o.impressions = row.impressions || 0;
    o.ctr = row.ctr || 0;
    o.position = row.position || 0;
    return o;
  });
}
function parseGBPRaw(raw) {
  const metrics = {};
  const daily = {};
  for (const series of raw.multiDailyMetricTimeSeries || []){
    for (const ts of series.dailyMetricTimeSeries || []){
      const metric = ts.dailyMetric || "UNKNOWN";
      let total = 0;
      const points = [];
      for (const dp of ts.timeSeries?.datedValues || []){
        const val = parseInt(dp.value || "0", 10) || 0;
        total += val;
        const ds = dp.date.year + "-" + String(dp.date.month).padStart(2, "0") + "-" + String(dp.date.day).padStart(2, "0");
        points.push({
          date: ds,
          value: val
        });
        if (!daily[ds]) daily[ds] = {};
        daily[ds][metric] = val;
      }
      metrics[metric] = {
        total,
        daily: points
      };
    }
  }
  return {
    metrics,
    daily
  };
}
function buildGBPSummary(m) {
  return {
    impressions_desktop_maps: m.BUSINESS_IMPRESSIONS_DESKTOP_MAPS?.total || 0,
    impressions_desktop_search: m.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH?.total || 0,
    impressions_mobile_maps: m.BUSINESS_IMPRESSIONS_MOBILE_MAPS?.total || 0,
    impressions_mobile_search: m.BUSINESS_IMPRESSIONS_MOBILE_SEARCH?.total || 0,
    total_impressions_maps: (m.BUSINESS_IMPRESSIONS_DESKTOP_MAPS?.total || 0) + (m.BUSINESS_IMPRESSIONS_MOBILE_MAPS?.total || 0),
    total_impressions_search: (m.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH?.total || 0) + (m.BUSINESS_IMPRESSIONS_MOBILE_SEARCH?.total || 0),
    total_impressions: (m.BUSINESS_IMPRESSIONS_DESKTOP_MAPS?.total || 0) + (m.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH?.total || 0) + (m.BUSINESS_IMPRESSIONS_MOBILE_MAPS?.total || 0) + (m.BUSINESS_IMPRESSIONS_MOBILE_SEARCH?.total || 0),
    direction_requests: m.BUSINESS_DIRECTION_REQUESTS?.total || 0,
    call_clicks: m.CALL_CLICKS?.total || 0,
    website_clicks: m.WEBSITE_CLICKS?.total || 0,
    conversations: m.BUSINESS_CONVERSATIONS?.total || 0,
    bookings: m.BUSINESS_BOOKINGS?.total || 0,
    food_orders: m.BUSINESS_FOOD_ORDERS?.total || 0,
    food_menu_clicks: m.BUSINESS_FOOD_MENU_CLICKS?.total || 0
  };
}
function gbpApiUrl(locationPath, metricsParams, sd, ed) {
  const [sy, sm, sday] = sd.split("-").map(Number);
  const [ey, em, eday] = ed.split("-").map(Number);
  return "https://businessprofileperformance.googleapis.com/v1/" + locationPath + ":fetchMultiDailyMetricsTimeSeries?" + metricsParams + "&dailyRange.start_date.year=" + sy + "&dailyRange.start_date.month=" + sm + "&dailyRange.start_date.day=" + sday + "&dailyRange.end_date.year=" + ey + "&dailyRange.end_date.month=" + em + "&dailyRange.end_date.day=" + eday;
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: CORS
  });
  const L = [];
  const log = (m)=>{
    L.push(m);
    console.log(m);
  };
  try {
    const body = await req.json();
    const customer_id = body.customer_id;
    const date_from = body.date_from;
    const date_to = body.date_to;
    const compare_date_from = body.compare_date_from || null;
    const compare_date_to = body.compare_date_to || null;
    const services = body.services || [
      "ga4",
      "gsc",
      "gbp"
    ];
    const ga4_breakdown = body.ga4_breakdown || "all";
    const gsc_site_url = body.gsc_site_url || "";
    const gbp_location_id = body.gbp_location_id || "";
    if (!customer_id || !date_from || !date_to) return jsonRes({
      error: "customer_id, date_from, date_to required"
    }, 400);
    log("=== MARKETING REPORT REALTIME V1 ===");
    log("Services: " + services.join(", ") + " | GA4: " + customer_id + " | " + date_from + " to " + date_to);
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const GA_CID = Deno.env.get("GA4_CLIENT_ID") || "";
    const GA_SECRET = Deno.env.get("GA4_CLIENT_SECRET") || "";
    // OAuth
    const cpaRows = await sbGet(SB_URL, SB_KEY, "client_platform_accounts?platform_customer_id=eq." + customer_id + "&platform=eq.ga4&is_active=eq.true&select=credential_id,agency_id,client_id");
    if (!cpaRows?.length) return jsonRes({
      error: "No GA4 account for " + customer_id
    }, 404);
    const credential_id = cpaRows[0].credential_id;
    if (!credential_id) return jsonRes({
      error: "No credential_id linked"
    }, 400);
    const agencyCreds = await sbGet(SB_URL, SB_KEY, "agency_platform_credentials?id=eq." + credential_id + "&is_active=eq.true&select=id,oauth_refresh_token");
    if (!agencyCreds?.length || !agencyCreds[0].oauth_refresh_token) return jsonRes({
      error: "No credential for " + credential_id
    }, 400);
    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: GA_CID,
        client_secret: GA_SECRET,
        refresh_token: agencyCreds[0].oauth_refresh_token,
        grant_type: "refresh_token"
      })
    });
    const tokenData = await tokRes.json();
    if (!tokenData.access_token) return jsonRes({
      error: "OAuth failed",
      detail: tokenData
    }, 500);
    const TOKEN = tokenData.access_token;
    log("OAuth token OK");
    const hasCompare = !!(compare_date_from && compare_date_to);
    const result = {
      success: true,
      customer_id: customer_id,
      date_from: date_from,
      date_to: date_to,
      compare_date_from: compare_date_from,
      compare_date_to: compare_date_to
    };
    // GA4 report runner
    async function ga4Report(sd, ed, dims, metrics) {
      const res = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + customer_id + ":runReport", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dateRanges: [
            {
              startDate: sd,
              endDate: ed
            }
          ],
          dimensions: dims,
          metrics: metrics,
          limit: 10000,
          keepEmptyRows: false
        })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error("GA4 " + res.status + ": " + t.substring(0, 500));
      }
      return await res.json();
    }
    const mb1 = [
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
    const mb2 = [
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
    async function fetchGA4(sd, ed, dims, dp) {
      const [r1, r2] = await Promise.all([
        ga4Report(sd, ed, dims, mb1),
        ga4Report(sd, ed, dims, mb2)
      ]);
      return parseGA4(r1, r2, dp);
    }
    // ── GA4 ──
    if (services.includes("ga4")) {
      log("── GA4 ──");
      try {
        const bds = ga4_breakdown === "all" ? [
          "summary",
          "channel",
          "source_medium",
          "daily",
          "page",
          "landing_page",
          "geo",
          "device",
          "event"
        ] : [
          ga4_breakdown
        ];
        const ga4 = {};
        for (const bd of bds){
          const cfg = getGA4DimsAndParser(bd);
          if (!cfg) continue;
          log("  GA4 " + bd + "...");
          const cur = await fetchGA4(date_from, date_to, cfg.dims, cfg.dp);
          let prev = [];
          if (hasCompare) prev = await fetchGA4(compare_date_from, compare_date_to, cfg.dims, cfg.dp);
          ga4[bd] = {
            current: cur,
            previous: prev,
            row_count: {
              current: cur.length,
              previous: prev.length
            }
          };
          log("  GA4 " + bd + ": " + cur.length + " cur, " + prev.length + " prev");
        }
        result.ga4 = ga4;
        log("GA4 done");
      } catch (e) {
        log("GA4 ERROR: " + e.message);
        result.ga4 = {
          error: e.message
        };
      }
    }
    // ── GSC ──
    if (services.includes("gsc") && gsc_site_url) {
      log("── GSC ──");
      try {
        const es = encodeURIComponent(gsc_site_url);
        async function gscQ(sd, ed, dims, rl) {
          const res = await fetch("https://www.googleapis.com/webmasters/v3/sites/" + es + "/searchAnalytics/query", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + TOKEN,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              startDate: sd,
              endDate: ed,
              dimensions: dims,
              rowLimit: rl,
              dataState: "all"
            })
          });
          if (!res.ok) {
            const t = await res.text();
            throw new Error("GSC " + res.status + ": " + t.substring(0, 500));
          }
          return await res.json();
        }
        const gsc = {};
        const sections = [
          [
            "summary",
            [],
            1
          ],
          [
            "queries",
            [
              "query"
            ],
            500
          ],
          [
            "pages",
            [
              "page"
            ],
            500
          ],
          [
            "daily",
            [
              "date"
            ],
            500
          ],
          [
            "device",
            [
              "device"
            ],
            100
          ],
          [
            "country",
            [
              "country"
            ],
            100
          ]
        ];
        for (const sec of sections){
          const sName = sec[0];
          const sDims = sec[1];
          const sLimit = sec[2];
          log("  GSC " + sName + "...");
          const cur = parseGSC(await gscQ(date_from, date_to, sDims, sLimit), sDims);
          let prev = [];
          if (hasCompare) prev = parseGSC(await gscQ(compare_date_from, compare_date_to, sDims, sLimit), sDims);
          gsc[sName] = {
            current: cur,
            previous: prev
          };
        }
        result.gsc = gsc;
        log("GSC done — " + (gsc.queries?.current?.length || 0) + " queries");
      } catch (e) {
        log("GSC ERROR: " + e.message);
        result.gsc = {
          error: e.message
        };
      }
    } else if (services.includes("gsc")) {
      result.gsc = {
        error: "gsc_site_url required"
      };
    }
    // ── GBP ──
    if (services.includes("gbp") && gbp_location_id) {
      log("── GBP ──");
      try {
        const allM = [
          "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
          "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
          "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
          "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
          "BUSINESS_DIRECTION_REQUESTS",
          "CALL_CLICKS",
          "WEBSITE_CLICKS",
          "BUSINESS_CONVERSATIONS",
          "BUSINESS_BOOKINGS",
          "BUSINESS_FOOD_ORDERS",
          "BUSINESS_FOOD_MENU_CLICKS"
        ];
        const lp = gbp_location_id.startsWith("locations/") ? gbp_location_id : "locations/" + gbp_location_id;
        const mp = allM.map(function(m) {
          return "dailyMetrics=" + m;
        }).join("&");
        log("  GBP current period...");
        const gbpRes = await fetch(gbpApiUrl(lp, mp, date_from, date_to), {
          headers: {
            Authorization: "Bearer " + TOKEN
          }
        });
        if (!gbpRes.ok) {
          const t = await gbpRes.text();
          throw new Error("GBP " + gbpRes.status + ": " + t.substring(0, 500));
        }
        const cur = parseGBPRaw(await gbpRes.json());
        let prevSummary = null;
        if (hasCompare) {
          log("  GBP comparison period...");
          const gbpPRes = await fetch(gbpApiUrl(lp, mp, compare_date_from, compare_date_to), {
            headers: {
              Authorization: "Bearer " + TOKEN
            }
          });
          if (gbpPRes.ok) {
            const prev = parseGBPRaw(await gbpPRes.json());
            prevSummary = buildGBPSummary(prev.metrics);
          }
        }
        log("  GBP search keywords...");
        let keywords = [];
        try {
          const kwRes = await fetch("https://businessprofileperformance.googleapis.com/v1/" + lp + "/searchkeywords/impressions/monthly", {
            headers: {
              Authorization: "Bearer " + TOKEN
            }
          });
          if (kwRes.ok) {
            const kwData = await kwRes.json();
            keywords = (kwData.searchKeywordsCounts || []).map(function(kw) {
              return {
                keyword: kw.searchKeyword || "",
                impressions: parseInt(kw.insightsValue?.value || "0", 10) || 0,
                threshold: kw.insightsValue?.threshold || 0
              };
            });
          }
        } catch (_e) {}
        result.gbp = {
          summary: buildGBPSummary(cur.metrics),
          previous_summary: prevSummary,
          daily: Object.entries(cur.daily).map(function(entry) {
            return Object.assign({
              date: entry[0]
            }, entry[1]);
          }),
          search_keywords: keywords,
          detailed_metrics: cur.metrics
        };
        log("GBP done — calls: " + result.gbp.summary.call_clicks + ", directions: " + result.gbp.summary.direction_requests);
      } catch (e) {
        log("GBP ERROR: " + e.message);
        result.gbp = {
          error: e.message
        };
      }
    } else if (services.includes("gbp")) {
      result.gbp = {
        error: "gbp_location_id required"
      };
    }
    result.log = L;
    log("=== DONE ===");
    return jsonRes(result);
  } catch (e) {
    log("FATAL: " + (e.message || String(e)));
    return jsonRes({
      error: e.message,
      log: L
    }, 500);
  }
});
