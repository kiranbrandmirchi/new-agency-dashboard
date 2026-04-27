/**
 * TikTok Marketing API → tiktok_campaign_daily / tiktok_placement_daily
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TIKTOK_APP_ID, TIKTOK_APP_SECRET
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TT_API = "https://business-api.tiktok.com/open_api/v1.3";

function pickTokenString(obj: unknown, snake: string, camel: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const a = o[snake];
  const b = o[camel];
  if (typeof a === "string" && a.length) return a;
  if (typeof b === "string" && b.length) return b;
  return null;
}

function jsonRes(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Fields aligned with tiktok_campaign_daily / tiktok_placement_daily (no cpc/ctr columns; UI derives those). */
function pickMetrics(m: Record<string, unknown>) {
  const spend = num(m.spend);
  const impressions = Math.round(num(m.impressions));
  const clicks = Math.round(num(m.clicks));
  const reach = Math.round(num(m.reach));
  const purchaseClicks = Math.round(
    num(m.complete_payment) || num(m.conversion) || num(m.result) || num(m.app_install),
  );
  const purchaseVal = num(
    m.complete_payment_value ?? m.value_per_complete_payment ?? m.total_purchase_value ?? m.shopping_value ?? 0,
  );
  return {
    impressions,
    clicks,
    spend,
    reach,
    purchase_views: 0,
    purchase_clicks: purchaseClicks,
    purchase_total_value: purchaseVal,
    currency: String(m.currency || m.billing_currency || "USD").slice(0, 8),
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const L: string[] = [];
  const log = (msg: string) => {
    L.push(msg);
    console.log(msg);
  };

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const appId = Deno.env.get("TIKTOK_APP_ID") || Deno.env.get("TIKTOK_CLIENT_ID") || "";
    const appSecret = Deno.env.get("TIKTOK_APP_SECRET") || Deno.env.get("TIKTOK_CLIENT_SECRET") || "";

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const customerId = (body.customer_id as string) || null;
    const mode = (body.mode as string) || "daily";
    const daysBack = num(body.days_back) || 5;
    let dateFrom = (body.date_from as string) || "";
    let dateTo = (body.date_to as string) || "";

    if (!customerId) return jsonRes({ error: "customer_id required", log: L }, 400);
    if (!(mode === "backfill" && dateFrom && dateTo)) {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - daysBack);
      const to = new Date(now);
      to.setDate(to.getDate() - 1);
      dateFrom = from.toISOString().split("T")[0];
      dateTo = to.toISOString().split("T")[0];
    }

    if (!appId || !appSecret) {
      return jsonRes({ error: "TIKTOK_APP_ID / TIKTOK_APP_SECRET not configured", log: L }, 500);
    }

    log(`=== TIKTOK FULL SYNC === ${customerId} | ${dateFrom} → ${dateTo}`);

    const cpaRes = await fetch(
      `${SB_URL}/rest/v1/client_platform_accounts?platform_customer_id=eq.${encodeURIComponent(customerId)}&platform=eq.tiktok&is_active=eq.true&select=agency_id`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    );
    const cpaRows = await cpaRes.json();
    if (!Array.isArray(cpaRows) || !cpaRows.length) {
      return jsonRes({ error: "No active TikTok account found for customer_id", log: L }, 400);
    }
    const agencyId = cpaRows[0].agency_id as string;

    const credRes = await fetch(
      `${SB_URL}/rest/v1/agency_platform_credentials?agency_id=eq.${agencyId}&platform=eq.tiktok&is_active=eq.true&select=oauth_refresh_token,oauth_access_token,oauth_token_expires_at,id`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    );
    const credRows = await credRes.json();
    const credRow = Array.isArray(credRows) ? credRows[0] : null;
    if (!credRow?.id) {
      return jsonRes({ error: "No TikTok credential (connect TikTok in Settings)", log: L }, 400);
    }

    const credRowId = credRow.id as string;
    let refreshToken = (credRow.oauth_refresh_token as string) || "";
    const storedAccess = (credRow.oauth_access_token as string) || "";
    const expAt = credRow.oauth_token_expires_at as string | null;

    let accessToken: string;

    if (refreshToken) {
      const refreshRes = await fetch(`${TT_API}/oauth2/refresh_token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: appId,
          secret: appSecret,
          refresh_token: refreshToken,
        }),
      });
      const refreshJson = await refreshRes.json().catch(() => ({}));
      if (refreshJson.code !== 0) {
        return jsonRes({
          error: "TikTok refresh failed: " + (refreshJson.message || JSON.stringify(refreshJson)),
          log: L,
        }, 400);
      }
      const rd = refreshJson.data ?? refreshJson;
      accessToken = pickTokenString(rd, "access_token", "accessToken") || "";
      const newRefresh = pickTokenString(rd, "refresh_token", "refreshToken");
      if (!accessToken) return jsonRes({ error: "No access_token from refresh", log: L }, 400);
      if (newRefresh && newRefresh !== refreshToken) {
        refreshToken = newRefresh;
        await fetch(`${SB_URL}/rest/v1/agency_platform_credentials?id=eq.${credRowId}`, {
          method: "PATCH",
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ oauth_refresh_token: newRefresh }),
        });
      }
    } else if (storedAccess && (!expAt || new Date(expAt).getTime() > Date.now() + 30_000)) {
      accessToken = storedAccess;
      log("Using stored TikTok access_token (no refresh_token on this connection).");
    } else {
      return jsonRes({
        error:
          "TikTok access token expired or missing. Reconnect TikTok in Settings (this app received access-only tokens from TikTok).",
        log: L,
      }, 400);
    }

    async function su(table: string, rows: Record<string, unknown>[], conflict: string) {
      if (!rows.length) return 0;
      const seen = new Set<string>();
      const deduped = rows.filter((row) => {
        const key = conflict.split(",").map((k) => String(row[k.trim()] ?? "")).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      let total = 0;
      for (let i = 0; i < deduped.length; i += 400) {
        const chunk = deduped.slice(i, i + 400);
        const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
          method: "POST",
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) {
          log(`WARN upsert ${table}: ${(await res.text()).slice(0, 240)}`);
        } else {
          total += chunk.length;
        }
      }
      return total;
    }

    async function fetchReportPages(params: {
      start: string;
      end: string;
      reportType: string;
      dataLevel: string;
      dimensions: string[];
      metrics: string[];
    }) {
      const all: Record<string, unknown>[] = [];
      let page = 1;
      const pageSize = 1000;
      while (true) {
        const qs = new URLSearchParams();
        qs.set("advertiser_id", customerId as string);
        qs.set("service_type", "AUCTION");
        qs.set("report_type", params.reportType);
        qs.set("data_level", params.dataLevel);
        qs.set("dimensions", JSON.stringify(params.dimensions));
        qs.set("metrics", JSON.stringify(params.metrics));
        qs.set("start_date", params.start);
        qs.set("end_date", params.end);
        qs.set("page", String(page));
        qs.set("page_size", String(pageSize));
        const url = `${TT_API}/report/integrated/get/?${qs.toString()}`;
        const res = await fetch(url, { headers: { "Access-Token": accessToken } });
        const j = await res.json().catch(() => ({}));
        if (j.code !== 0) {
          log(`Report error page ${page}: ${j.message || res.status} ${JSON.stringify(j).slice(0, 200)}`);
          break;
        }
        const list = (j.data?.list || []) as Record<string, unknown>[];
        for (const row of list) all.push(row);
        const pi = j.data?.page_info || {};
        const totalPage = num(pi.total_page) || 1;
        if (page >= totalPage) break;
        page++;
        await new Promise((r) => setTimeout(r, 200));
      }
      return all;
    }

    /** campaign_id is not a valid dimension alongside adgroup_id; map adgroup → campaign via Ad Group API. */
    async function fetchAdgroupCampaignMap(advertiserId: string, token: string): Promise<Record<string, string>> {
      const map: Record<string, string> = {};
      let page = 1;
      const pageSize = 1000;
      while (true) {
        const qs = new URLSearchParams();
        qs.set("advertiser_id", advertiserId);
        qs.set("page", String(page));
        qs.set("page_size", String(pageSize));
        const url = `${TT_API}/adgroup/get/?${qs.toString()}`;
        const res = await fetch(url, { headers: { "Access-Token": token } });
        const j = await res.json().catch(() => ({}));
        if (j.code !== 0) {
          log(`adgroup/get page ${page}: ${j.message || res.status} ${JSON.stringify(j).slice(0, 200)}`);
          break;
        }
        const list = (j.data?.list || []) as Record<string, unknown>[];
        for (const row of list) {
          const aid = String(row.adgroup_id ?? "");
          const cid = String(row.campaign_id ?? "");
          if (aid && cid) map[aid] = cid;
        }
        const pi = j.data?.page_info || {};
        const totalPage = num(pi.total_page) || 1;
        if (page >= totalPage) break;
        page++;
        await new Promise((r) => setTimeout(r, 150));
      }
      return map;
    }

    // One time dimension + one ID dimension per TikTok integrated-report rules.
    const metricsAdgroup = [
      "campaign_name",
      "adgroup_name",
      "spend",
      "cpc",
      "cpm",
      "impressions",
      "clicks",
      "ctr",
      "reach",
      "frequency",
      "conversion",
    ];

    const dates: string[] = [];
    const cur = new Date(dateFrom);
    const endD = new Date(dateTo);
    while (cur <= endD) {
      dates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }

    let totalRows = 0;
    const dimsAg = ["stat_time_day", "adgroup_id"];
    const adgroupToCampaign = await fetchAdgroupCampaignMap(customerId, accessToken);
    log(`adgroup→campaign map: ${Object.keys(adgroupToCampaign).length} ad groups`);

    for (const day of dates) {
      log(`--- ${day} ---`);
      try {
        const rows = await fetchReportPages({
          start: day,
          end: day,
          reportType: "BASIC",
          dataLevel: "AUCTION_ADGROUP",
          dimensions: dimsAg,
          metrics: metricsAdgroup,
        });

        const campaignRows: Record<string, unknown>[] = [];
        for (const raw of rows) {
          const dims = (raw.dimensions || {}) as Record<string, unknown>;
          const met = (raw.metrics || raw) as Record<string, unknown>;
          const statDay = String(dims.stat_time_day || dims.stat_time_day_utc || day).slice(0, 10);
          const agId = String(dims.adgroup_id ?? "");
          const campId = String(dims.campaign_id ?? adgroupToCampaign[agId] ?? "");
          const pm = pickMetrics(met);
          campaignRows.push({
            customer_id: customerId,
            campaign_id: campId,
            campaign_name: met.campaign_name != null ? String(met.campaign_name) : null,
            ad_group_id: agId || "",
            ad_group_name: met.adgroup_name != null ? String(met.adgroup_name) : null,
            report_date: statDay,
            country: "ALL",
            ...pm,
          });
        }
        const n = await su("tiktok_campaign_daily", campaignRows, "customer_id,campaign_id,ad_group_id,report_date");
        log(`campaign_daily: ${n}`);
        totalRows += n;
      } catch (e) {
        log(`campaign_daily ERR: ${(e as Error).message}`);
      }

      try {
        const prow = await fetchReportPages({
          start: day,
          end: day,
          reportType: "AUDIENCE",
          dataLevel: "AUCTION_CAMPAIGN",
          dimensions: ["stat_time_day", "campaign_id", "placement"],
          metrics: [
            "campaign_name",
            "spend",
            "impressions",
            "clicks",
            "cpc",
            "ctr",
            "reach",
            "conversion",
          ],
        });
        const placementRows: Record<string, unknown>[] = [];
        for (const raw of prow) {
          const dims = (raw.dimensions || {}) as Record<string, unknown>;
          const met = (raw.metrics || raw) as Record<string, unknown>;
          const statDay = String(dims.stat_time_day || day).slice(0, 10);
          const campId = String(dims.campaign_id ?? "");
          const placement = String(dims.placement ?? met.placement ?? "Unknown");
          const pm = pickMetrics(met);
          placementRows.push({
            customer_id: customerId,
            campaign_id: campId,
            campaign_name: met.campaign_name != null ? String(met.campaign_name) : null,
            placement,
            report_date: statDay,
            country: "ALL",
            ...pm,
          });
        }
        const pn = await su("tiktok_placement_daily", placementRows, "customer_id,campaign_id,placement,report_date");
        log(`placement_daily: ${pn}`);
        totalRows += pn;
      } catch (e) {
        log(`placement_daily skip: ${(e as Error).message}`);
      }

      if (dates.length > 1) await new Promise((r) => setTimeout(r, 400));
    }

    log(`=== DONE === ${totalRows}`);
    return jsonRes({ success: true, total_rows: totalRows, log: L });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    L.push("FATAL: " + msg);
    return jsonRes({ success: false, error: msg, log: L }, 500);
  }
});
