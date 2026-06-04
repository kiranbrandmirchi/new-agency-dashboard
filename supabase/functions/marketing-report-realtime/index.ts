import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonRes(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sbGet(url: string, key: string, path: string) {
  const r = await fetch(url + "/rest/v1/" + path, {
    headers: { apikey: key, Authorization: "Bearer " + key },
  });
  return await r.json();
}

function intV(mv: any[], i: number): number {
  return parseInt(mv?.[i]?.value || "0", 10) || 0;
}
function floatV(mv: any[], i: number): number {
  return parseFloat(mv?.[i]?.value || "0") || 0;
}

function ga4HttpError(status: number, body: string): string {
  const trimmed = (body || "").trim();
  if (/^<\s*(!DOCTYPE|html)/i.test(trimmed)) {
    if (status === 502 || status === 503 || status === 504) {
      return `Google Analytics is temporarily unavailable (${status}). Please try again in a few minutes.`;
    }
    if (status === 429) return "Google Analytics rate limit exceeded. Please try again later.";
    if (status === 401 || status === 403) {
      return `Google Analytics authorization failed (${status}). Reconnect the account in settings.`;
    }
    return `Google Analytics request failed (${status}).`;
  }
  try {
    const parsed = JSON.parse(trimmed);
    const apiMsg = parsed?.error?.message || parsed?.message;
    if (apiMsg) return `GA4 ${status}: ${String(apiMsg).slice(0, 200)}`;
  } catch {
    /* plain text */
  }
  const plain = trimmed.replace(/\s+/g, " ").slice(0, 200);
  return plain ? `GA4 ${status}: ${plain}` : `GA4 request failed (${status}).`;
}

function normalizeGa4PropertyId(id: string): string {
  const s = String(id || "").trim();
  if (!s) return "";
  const m = s.match(/properties\/(\d+)/);
  return m ? m[1] : s.replace(/\D/g, "") || s;
}

function isGscPlatform(platform: string): boolean {
  const p = String(platform || "").toLowerCase();
  return p === "gsc" || p === "search_console";
}

function isGbpPlatform(platform: string): boolean {
  const p = String(platform || "").toLowerCase();
  return p === "gbp" || p === "gmb";
}

function looksLikeGscSiteUrl(value: string): boolean {
  const s = String(value || "").trim();
  return (
    s.startsWith("sc-domain:") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  );
}

function getGA4DimsAndParser(
  bd: string
): { dims: any[]; dp: (dv: any[]) => any } | null {
  if (bd === "summary") return { dims: [], dp: () => ({}) };
  if (bd === "channel")
    return {
      dims: [{ name: "sessionDefaultChannelGroup" }],
      dp: (dv: any[]) => ({
        channel_group: dv[0]?.value || "(not set)",
      }),
    };
  if (bd === "source_medium")
    return {
      dims: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      dp: (dv: any[]) => ({
        source: dv[0]?.value || "(not set)",
        medium: dv[1]?.value || "(not set)",
        source_medium:
          (dv[0]?.value || "(not set)") +
          " / " +
          (dv[1]?.value || "(not set)"),
      }),
    };
  if (bd === "daily")
    return {
      dims: [{ name: "date" }],
      dp: (dv: any[]) => ({ date: dv[0]?.value || "" }),
    };
  if (bd === "daily_channel")
    return {
      dims: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      dp: (dv: any[]) => ({
        date: dv[0]?.value || "",
        channel_group: dv[1]?.value || "(not set)",
      }),
    };
  if (bd === "page")
    return {
      dims: [{ name: "pagePath" }, { name: "pageTitle" }],
      dp: (dv: any[]) => ({
        page_path: dv[0]?.value || "/",
        page_title: dv[1]?.value || "",
      }),
    };
  if (bd === "landing_page")
    return {
      dims: [{ name: "landingPagePlusQueryString" }],
      dp: (dv: any[]) => ({ landing_page: dv[0]?.value || "/" }),
    };
  if (bd === "geo")
    return {
      dims: [{ name: "country" }, { name: "region" }, { name: "city" }],
      dp: (dv: any[]) => ({
        country: dv[0]?.value || "(not set)",
        region: dv[1]?.value || "(not set)",
        city: dv[2]?.value || "(not set)",
      }),
    };
  if (bd === "city")
    return {
      dims: [{ name: "city" }],
      dp: (dv: any[]) => ({ city: dv[0]?.value || "(not set)" }),
    };
  if (bd === "device")
    return {
      dims: [{ name: "deviceCategory" }],
      dp: (dv: any[]) => ({
        device_category: dv[0]?.value || "(not set)",
      }),
    };
  if (bd === "event")
    return {
      dims: [{ name: "eventName" }],
      dp: (dv: any[]) => ({ event_name: dv[0]?.value || "(not set)" }),
    };
  return null;
}

function parseGA4(r1: any, r2: any, dp: (dv: any[]) => any): any[] {
  const m2 = new Map<string, any[]>();
  for (const row of r2.rows || []) {
    m2.set(
      (row.dimensionValues || []).map((d: any) => d.value || "").join("|"),
      row.metricValues || []
    );
  }
  const rows: any[] = [];
  for (const row of r1.rows || []) {
    const dv = row.dimensionValues || [];
    const mv1 = row.metricValues || [];
    const mv2 =
      m2.get(dv.map((d: any) => d.value || "").join("|")) || [];
    const o: any = dp(dv);
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

function parseGSC(data: any, dimNames: string[]): any[] {
  return (data.rows || []).map((row: any) => {
    const o: any = {};
    (row.keys || []).forEach((k: string, i: number) => {
      if (dimNames[i]) o[dimNames[i]] = k;
    });
    o.clicks = row.clicks || 0;
    o.impressions = row.impressions || 0;
    o.ctr = row.ctr || 0;
    o.position = row.position || 0;
    return o;
  });
}

function aggregateGbp(rows: any[]): any {
  const agg: any = {
    location_count: rows.length,
    impressions_search_mobile: 0,
    impressions_search_desktop: 0,
    impressions_maps_mobile: 0,
    impressions_maps_desktop: 0,
    total_impressions_search: 0,
    total_impressions_maps: 0,
    total_impressions: 0,
    calls: 0,
    messages: 0,
    bookings: 0,
    directions: 0,
    website_clicks: 0,
    food_orders: 0,
    food_menu_clicks: 0,
    hotel_bookings: 0,
  };
  for (const row of rows) {
    agg.impressions_search_mobile += row.impressions_search_mobile || 0;
    agg.impressions_search_desktop += row.impressions_search_desktop || 0;
    agg.impressions_maps_mobile += row.impressions_maps_mobile || 0;
    agg.impressions_maps_desktop += row.impressions_maps_desktop || 0;
    agg.total_impressions_search +=
      (row.impressions_search_mobile || 0) +
      (row.impressions_search_desktop || 0);
    agg.total_impressions_maps +=
      (row.impressions_maps_mobile || 0) +
      (row.impressions_maps_desktop || 0);
    agg.total_impressions +=
      (row.impressions_search_mobile || 0) +
      (row.impressions_search_desktop || 0) +
      (row.impressions_maps_mobile || 0) +
      (row.impressions_maps_desktop || 0);
    agg.calls += row.calls || 0;
    agg.messages += row.messages || 0;
    agg.bookings += row.bookings || 0;
    agg.directions += row.directions || 0;
    agg.website_clicks += row.website_clicks || 0;
    agg.food_orders += row.food_orders || 0;
    agg.food_menu_clicks += row.food_menu_clicks || 0;
    agg.hotel_bookings += row.hotel_bookings || 0;
  }
  return agg;
}

function aggregateGbpFromLocations(locations: any[]) {
  const agg = {
    location_count: locations.length,
    calls: 0,
    directions: 0,
    website_clicks: 0,
    total_impressions: 0,
    total_impressions_search: 0,
    total_impressions_maps: 0,
    impressions_search_mobile: 0,
    impressions_search_desktop: 0,
    impressions_maps_mobile: 0,
    impressions_maps_desktop: 0,
    messages: 0,
    bookings: 0,
    food_orders: 0,
    food_menu_clicks: 0,
    hotel_bookings: 0,
  };
  for (const l of locations) {
    agg.calls += l.calls || 0;
    agg.directions += l.directions || 0;
    agg.website_clicks += l.website_clicks || 0;
    agg.total_impressions += l.total_impressions || 0;
  }
  return agg;
}

function normalizeGbpKey(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mapGbpPerformanceRow(row: any) {
  return {
    business_name: row.business_name,
    address: row.address,
    store_code: row.store_code,
    impressions_search:
      (row.impressions_search_mobile || 0) +
      (row.impressions_search_desktop || 0),
    impressions_maps:
      (row.impressions_maps_mobile || 0) +
      (row.impressions_maps_desktop || 0),
    total_impressions:
      (row.impressions_search_mobile || 0) +
      (row.impressions_search_desktop || 0) +
      (row.impressions_maps_mobile || 0) +
      (row.impressions_maps_desktop || 0),
    calls: row.calls || 0,
    messages: row.messages || 0,
    bookings: row.bookings || 0,
    directions: row.directions || 0,
    website_clicks: row.website_clicks || 0,
  };
}

function gbpLocationSignature(value: string): string {
  let s = normalizeGbpKey(value);
  s = s.replace(/^urgent care of the palm beaches\s+/, "");
  s = s.replace(/^urgent care of the palm beaches\s+/, "");
  s = s.replace(/^urgent care palm beaches\s+/, "");
  s = s.replace(/\bpb\b/g, "palm beach");
  return s.replace(/\s+/g, " ").trim();
}

const GBP_STOP_WORDS_TS = new Set([
  "urgent", "care", "the", "of", "palm", "beaches", "location", "llc", "inc",
]);

function distinctiveTokensTs(text: string): string[] {
  return gbpLocationSignature(text)
    .split(" ")
    .filter((t) => t.length > 1 && !GBP_STOP_WORDS_TS.has(t));
}

function gbpRegionHintTs(text: string): string {
  const sig = gbpLocationSignature(text);
  if (/\bwest\b/.test(sig) || sig.includes("west palm")) return "west";
  if (/\bnorth\b/.test(sig) || sig.includes("north palm")) return "north";
  if (sig.includes("palm springs")) return "palm_springs";
  if (/\bcentral\b/.test(sig) && /palm|beach|pb|urgent/.test(sig)) return "palm_springs";
  if (
    /\bcentral\b/.test(sig) ||
    sig.includes("lake worth") ||
    sig.includes("boynton") ||
    sig.includes("boca")
  ) return "central";
  return "";
}

function urgentCareGbpAliasScoreTs(
  row: any,
  acc: { account_name: string; store_code: string },
): number {
  const locName = normalizeGbpKey(row?.business_name || "");
  const accText = normalizeGbpKey(
    `${acc.account_name || ""} ${acc.store_code || ""}`,
  );
  if (
    !locName.includes("urgent care") &&
    !accText.includes("urgent care") &&
    !accText.includes("palm")
  ) return 0;
  const aliases: Array<{ acc: RegExp; row: RegExp }> = [
    { acc: /north|north pb|north palm/, row: /north palm beach/ },
    { acc: /west|west pb|west palm/, row: /west palm beach/ },
    { acc: /central|central pb|palm springs/, row: /palm springs/ },
  ];
  for (const { acc: accRe, row: rowRe } of aliases) {
    if (accRe.test(accText) && rowRe.test(locName)) return 80;
  }
  return 0;
}

function regionOnlyMatchScoreTs(row: any, acc: { account_name: string; store_code: string }): number {
  const lh = gbpRegionHintTs(`${row?.business_name || ""} ${row?.store_code || ""}`);
  const ah = gbpRegionHintTs(`${acc.account_name || ""} ${acc.store_code || ""}`);
  if (lh && ah && lh === ah) return 55;
  return 0;
}

function scoreGbpMatch(
  row: any,
  acc: { account_name: string; store_code: string },
): number {
  const locName = normalizeGbpKey(row?.business_name || "");
  const locStore = normalizeGbpKey(row?.store_code || "");
  const needles = [
    normalizeGbpKey(acc.account_name),
    normalizeGbpKey(acc.store_code),
  ].filter(Boolean);

  for (const needle of needles) {
    for (const key of [locName, locStore].filter(Boolean)) {
      if (key === needle) return 100;
      if (key.includes(needle) || needle.includes(key)) return 75;
    }
  }

  const locSig = gbpLocationSignature(row?.business_name || row?.store_code || "");
  let best = 0;
  for (const field of [acc.account_name, acc.store_code]) {
    const accSig = gbpLocationSignature(field);
    if (!accSig || !locSig) continue;
    if (locSig === accSig) best = Math.max(best, 90);
    else if (locSig.includes(accSig) || accSig.includes(locSig)) best = Math.max(best, 70);
    else {
      const tokens = distinctiveTokensTs(field);
      if (tokens.length && tokens.every((t) => locSig.includes(t))) {
        best = Math.max(best, 50 + tokens.length * 5);
      }
    }
  }
  return Math.max(best, regionOnlyMatchScoreTs(row, acc), urgentCareGbpAliasScoreTs(row, acc));
}

function filterGbpRowsForLinked(
  rows: any[],
  linked: Array<{ account_name: string; store_code: string }>,
) {
  if (!linked.length) return rows || [];
  return (rows || []).filter((row) =>
    linked.some((acc) => scoreGbpMatch(row, acc) >= 50)
  );
}

function mergeGbpLocationsWithLinkedAccounts(
  apiRows: any[],
  linked: Array<{ account_name: string; store_code: string }>,
) {
  if (!linked.length) return (apiRows || []).map(mapGbpPerformanceRow);

  const rows = apiRows || [];
  const pairs: Array<{ ai: number; li: number; score: number }> = [];
  linked.forEach((acc, ai) => {
    rows.forEach((row, li) => {
      const score = scoreGbpMatch(row, acc);
      if (score >= 50) pairs.push({ ai, li, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);

  const usedAcc = new Set<number>();
  const usedLoc = new Set<number>();
  const assign = new Map<number, number>();

  for (const { ai, li } of pairs) {
    if (usedAcc.has(ai) || usedLoc.has(li)) continue;
    usedAcc.add(ai);
    usedLoc.add(li);
    assign.set(ai, li);
  }

  return linked.map((acc, ai) => {
    const displayName = acc.account_name || acc.store_code || "Location";
    const li = assign.get(ai);
    if (li != null) {
      const mapped = mapGbpPerformanceRow(rows[li]);
      return {
        ...mapped,
        business_name: displayName || mapped.business_name,
        store_code: acc.store_code || mapped.store_code,
      };
    }
    return {
      business_name: displayName,
      store_code: acc.store_code,
      address: "",
      calls: 0,
      directions: 0,
      website_clicks: 0,
      total_impressions: 0,
      impressions_search: 0,
      impressions_maps: 0,
      messages: 0,
      bookings: 0,
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  const L: string[] = [];
  const log = (m: string) => {
    L.push(m);
    console.log(m);
  };

  try {
    const body = await req.json();

    const client_id: string = body.client_id || "";
    let customer_id: string = body.customer_id || "";
    const date_from: string = body.date_from;
    const date_to: string = body.date_to;
    const compare_date_from: string = body.compare_date_from || "";
    const compare_date_to: string = body.compare_date_to || "";
    const services: string[] = body.services || ["ga4", "gsc", "gbp"];
    let gsc_site_url: string = body.gsc_site_url || "";

    if (!date_from || !date_to)
      return jsonRes({ error: "date_from, date_to required" }, 400);
    if (!client_id && !customer_id)
      return jsonRes(
        { error: "client_id or customer_id required" },
        400
      );

    log("=== MARKETING REPORT REALTIME V2 ===");
    log(
      "Services: " +
        services.join(", ") +
        " | client_id: " +
        client_id +
        " | " +
        date_from +
        " to " +
        date_to
    );

    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const GA_CID = Deno.env.get("GA4_CLIENT_ID") || "";
    const GA_SECRET = Deno.env.get("GA4_CLIENT_SECRET") || "";

    let credential_id = "";
    let agency_id = "";
    const gbpStoreCodes: string[] = [];
    const gbpBizNames: string[] = [];
    const gbpLinkedAccounts: Array<{ account_name: string; store_code: string }> = [];

    if (client_id) {
      log("Resolving platforms for client_id: " + client_id);

      const allAccounts = await sbGet(
        SB_URL,
        SB_KEY,
        "client_platform_accounts?client_id=eq." +
          client_id +
          "&is_active=eq.true&select=platform,platform_customer_id,account_name,credential_id,agency_id"
      );

      if (!allAccounts?.length) {
        return jsonRes(
          { error: "No platform accounts found for client " + client_id },
          404
        );
      }

      for (const acc of allAccounts) {
        if (acc.platform === "ga4" && !customer_id) {
          customer_id = normalizeGa4PropertyId(acc.platform_customer_id);
          credential_id = acc.credential_id;
          agency_id = acc.agency_id;
          log("  GA4 property: " + customer_id);
        }
        if (isGscPlatform(acc.platform) && !gsc_site_url) {
          for (const candidate of [
            acc.platform_customer_id,
            acc.account_name,
          ]) {
            if (looksLikeGscSiteUrl(candidate)) {
              gsc_site_url = String(candidate).trim();
              break;
            }
          }
          if (!credential_id && acc.credential_id) {
            credential_id = acc.credential_id;
          }
          log("  GSC site: " + gsc_site_url);
        }
        if (isGbpPlatform(acc.platform)) {
          const storeCode = String(acc.platform_customer_id || "").trim();
          const accountName = String(acc.account_name || "").trim();
          gbpLinkedAccounts.push({ account_name: accountName, store_code: storeCode });
          if (storeCode) gbpStoreCodes.push(storeCode);
          if (accountName) gbpBizNames.push(accountName);
          if (!accountName && storeCode) gbpBizNames.push(storeCode);
          log(
            "  GBP location: " +
              (acc.account_name || acc.platform_customer_id)
          );
        }
      }
    }

    if (body.gsc_site_url && looksLikeGscSiteUrl(body.gsc_site_url)) {
      gsc_site_url = String(body.gsc_site_url).trim();
    }

    if (!credential_id && customer_id) {
      const cpaRows = await sbGet(
        SB_URL,
        SB_KEY,
        "client_platform_accounts?platform_customer_id=eq." +
          customer_id +
          "&platform=eq.ga4&is_active=eq.true&select=credential_id,agency_id,client_id"
      );
      if (!cpaRows?.length) {
        const cpaRows2 = await sbGet(
          SB_URL,
          SB_KEY,
          "client_platform_accounts?platform_customer_id=ilike.*" +
            customer_id +
            "*&platform=eq.ga4&is_active=eq.true&select=credential_id,agency_id,platform_customer_id"
        );
        if (cpaRows2?.length) {
          credential_id = cpaRows2[0].credential_id;
          agency_id = cpaRows2[0].agency_id;
          customer_id = normalizeGa4PropertyId(
            cpaRows2[0].platform_customer_id
          );
        }
      } else {
        credential_id = cpaRows[0].credential_id;
        agency_id = cpaRows[0].agency_id;
      }
    }

    customer_id = normalizeGa4PropertyId(customer_id);

    if (!credential_id)
      return jsonRes({ error: "No credential found" }, 400);

    const agencyCreds = await sbGet(
      SB_URL,
      SB_KEY,
      "agency_platform_credentials?id=eq." +
        credential_id +
        "&is_active=eq.true&select=id,oauth_refresh_token"
    );
    if (!agencyCreds?.length || !agencyCreds[0].oauth_refresh_token)
      return jsonRes(
        { error: "No credential for " + credential_id },
        400
      );

    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GA_CID,
        client_secret: GA_SECRET,
        refresh_token: agencyCreds[0].oauth_refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokRes.json();
    if (!tokenData.access_token)
      return jsonRes({ error: "OAuth failed", detail: tokenData }, 500);
    const TOKEN = tokenData.access_token;
    log("OAuth token OK");

    const hasCompare = !!(compare_date_from && compare_date_to);
    const result: any = {
      success: true,
      client_id,
      customer_id,
      date_from,
      date_to,
      compare_date_from: compare_date_from || null,
      compare_date_to: compare_date_to || null,
    };

    const mb1 = [
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "newUsers" },
      { name: "activeUsers" },
      { name: "engagedSessions" },
      { name: "bounceRate" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
    ];
    const mb2 = [
      { name: "userEngagementDuration" },
      { name: "keyEvents" },
      { name: "eventCount" },
    ];

    async function ga4Report(
      sd: string,
      ed: string,
      dims: any[],
      metrics: any[],
      dimensionFilter?: any
    ): Promise<any> {
      const reqBody: any = {
        dateRanges: [{ startDate: sd, endDate: ed }],
        dimensions: dims,
        metrics,
        limit: 10000,
        keepEmptyRows: false,
      };
      if (dimensionFilter) reqBody.dimensionFilter = dimensionFilter;

      const res = await fetch(
        "https://analyticsdata.googleapis.com/v1beta/properties/" +
          customer_id +
          ":runReport",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(reqBody),
        }
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(ga4HttpError(res.status, t));
      }
      return await res.json();
    }

    async function fetchGA4(
      sd: string,
      ed: string,
      dims: any[],
      dp: (dv: any[]) => any,
      dimensionFilter?: any
    ): Promise<any[]> {
      const [r1, r2] = await Promise.all([
        ga4Report(sd, ed, dims, mb1, dimensionFilter),
        ga4Report(sd, ed, dims, mb2, dimensionFilter),
      ]);
      return parseGA4(r1, r2, dp);
    }

    const organicFilter = {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: "Organic Search" },
      },
    };

    if (services.includes("ga4") && customer_id) {
      log("── GA4 ──");
      try {
        const ga4: any = {};

        log("  GA4 all_channels...");
        const allChannelsCfg = getGA4DimsAndParser("channel")!;
        const allChannelsCur = await fetchGA4(
          date_from,
          date_to,
          allChannelsCfg.dims,
          allChannelsCfg.dp
        );
        let allChannelsPrev: any[] = [];
        if (hasCompare)
          allChannelsPrev = await fetchGA4(
            compare_date_from,
            compare_date_to,
            allChannelsCfg.dims,
            allChannelsCfg.dp
          );
        ga4.all_channels = {
          current: allChannelsCur,
          previous: allChannelsPrev,
        };

        log("  GA4 organic_summary...");
        const orgSumCur = await fetchGA4(
          date_from,
          date_to,
          [],
          () => ({}),
          organicFilter
        );
        let orgSumPrev: any[] = [];
        if (hasCompare)
          orgSumPrev = await fetchGA4(
            compare_date_from,
            compare_date_to,
            [],
            () => ({}),
            organicFilter
          );
        ga4.organic_summary = {
          current: orgSumCur[0] || {},
          previous: orgSumPrev[0] || {},
        };

        log("  GA4 landing_pages...");
        const lpCfg = getGA4DimsAndParser("landing_page")!;
        const lpCur = await fetchGA4(
          date_from,
          date_to,
          lpCfg.dims,
          lpCfg.dp
        );
        let lpPrev: any[] = [];
        if (hasCompare)
          lpPrev = await fetchGA4(
            compare_date_from,
            compare_date_to,
            lpCfg.dims,
            lpCfg.dp
          );
        ga4.landing_pages = { current: lpCur, previous: lpPrev };

        log("  GA4 cities...");
        const cityCfg = getGA4DimsAndParser("city")!;
        const cityCur = await fetchGA4(
          date_from,
          date_to,
          cityCfg.dims,
          cityCfg.dp
        );
        let cityPrev: any[] = [];
        if (hasCompare)
          cityPrev = await fetchGA4(
            compare_date_from,
            compare_date_to,
            cityCfg.dims,
            cityCfg.dp
          );
        ga4.cities = { current: cityCur, previous: cityPrev };

        result.ga4 = ga4;
        log("GA4 done");
      } catch (e: any) {
        log("GA4 ERROR: " + e.message);
        result.ga4 = { error: e.message };
      }
    } else if (services.includes("ga4")) {
      result.ga4 = { error: "No GA4 property linked for this client" };
    }

    if (services.includes("gsc") && gsc_site_url) {
      log("── GSC (" + gsc_site_url + ") ──");
      try {
        const es = encodeURIComponent(gsc_site_url);

        async function gscQ(
          sd: string,
          ed: string,
          dims: string[],
          rl: number,
          brandFilter?: "branded" | "non_branded"
        ): Promise<any> {
          const body: Record<string, unknown> = {
            startDate: sd,
            endDate: ed,
            dimensions: dims,
            rowLimit: rl,
            dataState: "all",
          };
          if (brandFilter) {
            body.dimensionFilterGroups = [{
              groupType: "and",
              filters: [{
                dimension: "query",
                operator: brandFilter === "branded" ? "isBranded" : "isNonBranded",
              }],
            }];
          }
          const res = await fetch(
            "https://www.googleapis.com/webmasters/v3/sites/" +
              es +
              "/searchAnalytics/query",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer " + TOKEN,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            }
          );
          if (!res.ok) {
            const t = await res.text();
            throw new Error(
              "GSC " + res.status + ": " + t.substring(0, 500)
            );
          }
          return await res.json();
        }

        async function gscBrandQueries(
          sd: string,
          ed: string,
          brandFilter: "branded" | "non_branded",
          rl: number
        ): Promise<any[]> {
          try {
            return parseGSC(await gscQ(sd, ed, ["query"], rl, brandFilter), ["query"]);
          } catch (e: any) {
            log("GSC " + brandFilter + " filter unavailable: " + e.message);
            return [];
          }
        }

        const gsc: any = {};
        const sections: Array<[string, string[], number]> = [
          ["summary", [], 1],
          ["queries", ["query"], 500],
          ["pages", ["page"], 500],
          ["daily", ["date"], 500],
          ["device", ["device"], 100],
          ["country", ["country"], 100],
        ];

        for (const sec of sections) {
          const sName = sec[0];
          const sDims = sec[1];
          const sLimit = sec[2];
          const cur = parseGSC(
            await gscQ(date_from, date_to, sDims, sLimit),
            sDims
          );
          let prev: any[] = [];
          if (hasCompare)
            prev = parseGSC(
              await gscQ(
                compare_date_from,
                compare_date_to,
                sDims,
                sLimit
              ),
              sDims
            );
          gsc[sName] = { current: cur, previous: prev };
        }

        gsc.branded_queries = {
          current: await gscBrandQueries(date_from, date_to, "branded", 100),
          previous: hasCompare
            ? await gscBrandQueries(compare_date_from, compare_date_to, "branded", 100)
            : [],
        };
        gsc.non_branded_queries = {
          current: await gscBrandQueries(date_from, date_to, "non_branded", 100),
          previous: hasCompare
            ? await gscBrandQueries(compare_date_from, compare_date_to, "non_branded", 100)
            : [],
        };

        result.gsc = gsc;
        result.gsc.source = "api";
        log(
          "GSC done — " + (gsc.queries?.current?.length || 0) + " queries"
        );
      } catch (e: any) {
        log("GSC ERROR: " + e.message);
        result.gsc = { error: e.message };
      }
    } else if (services.includes("gsc")) {
      result.gsc = {
        error: gsc_site_url
          ? "GSC failed"
          : "No GSC site_url found for this client",
      };
    }

    if (services.includes("gbp")) {
      log("── GBP (gbp_performance) ──");
      try {
        if (!gbpStoreCodes.length && !gbpBizNames.length) {
          result.gbp = {
            error: "No GBP accounts linked for this client",
          };
          log("  GBP skipped — no GBP/GMB accounts");
        } else {
          const curMonth = date_from.substring(0, 7) + "-01";
          let prevMonth = "";
          if (hasCompare) {
            prevMonth = compare_date_from.substring(0, 7) + "-01";
          }

          gbpLinkedAccounts.sort((a, b) =>
            (a.account_name || a.store_code || "").localeCompare(
              b.account_name || b.store_code || "",
            ),
          );

          const gbpMonthFilter = (month: string) => {
            let path = "gbp_performance?report_month=eq." + month + "&select=*";
            if (agency_id) path += "&agency_id=eq." + agency_id;
            return path;
          };

          const curGbpAll = await sbGet(SB_URL, SB_KEY, gbpMonthFilter(curMonth));

          let prevGbpAll: any[] = [];
          if (prevMonth) {
            prevGbpAll = await sbGet(SB_URL, SB_KEY, gbpMonthFilter(prevMonth)) || [];
          }

          const locations = mergeGbpLocationsWithLinkedAccounts(
            curGbpAll || [],
            gbpLinkedAccounts,
          );
          const prevLocationRows = mergeGbpLocationsWithLinkedAccounts(
            prevGbpAll,
            gbpLinkedAccounts,
          );

          log(
            "  GBP rows for month: " +
              (curGbpAll?.length || 0) +
              " raw, " +
              locations.length +
              " linked accounts",
          );

          const curAgg = aggregateGbpFromLocations(locations);
          const prevAgg =
            prevLocationRows.length > 0
              ? aggregateGbpFromLocations(prevLocationRows)
              : null;
          const previous_locations = locations.map((loc: any, idx: number) => {
            const prev = prevLocationRows[idx];
            if (prev) return prev;
            return {
              business_name: loc.business_name,
              store_code: loc.store_code,
              address: "",
              calls: 0,
              directions: 0,
              website_clicks: 0,
              total_impressions: 0,
            };
          });

          result.gbp = {
            report_month: curMonth,
            compare_month: prevMonth || null,
            summary: curAgg,
            previous_summary: prevAgg,
            locations,
            previous_locations,
            source: "gbp_performance",
          };

          log(
            "GBP done — " +
              locations.length +
              " locations, calls: " +
              curAgg.calls +
              ", directions: " +
              curAgg.directions
          );
        }
      } catch (e: any) {
        log("GBP ERROR: " + e.message);
        result.gbp = { error: e.message };
      }
    }

    result.log = L;
    log("=== DONE ===");
    return jsonRes(result);
  } catch (e: any) {
    log("FATAL: " + (e.message || String(e)));
    return jsonRes({ error: e.message, log: L }, 500);
  }
});
