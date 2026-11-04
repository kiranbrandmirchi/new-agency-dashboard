// supabase/functions/gads-temp-sync/index.ts
// Test pipeline for the verified Google Cloud OAuth app.
// One Google login (connection) can reach many ad accounts; each account is mapped
// to an agency and its daily campaign metrics are upserted into google_ads_temp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VER = "v23";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const MIC = 1_000_000;
const CRON_ACTIONS = ["check_tokens", "cron_sync"];
const CRON_TIME_BUDGET_MS = 100_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const m2d = (micros: unknown) => Math.round((Number(micros || 0) / MIC) * 100) / 100;
const pct = (ratio: unknown) => (ratio == null ? null : Math.round(Number(ratio) * 10000) / 100);
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function fetchT(url: string, init: RequestInit = {}, ms = 40_000) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") throw new Error(`Timed out after ${ms / 1000}s calling ${new URL(url).host}`);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLIENT_ID = Deno.env.get("GADS_TEST_CLIENT_ID") || "";
    const CLIENT_SECRET = Deno.env.get("GADS_TEST_CLIENT_SECRET") || "";
    const DEV_TOKEN = Deno.env.get("GADS_TEST_DEVELOPER_TOKEN") || Deno.env.get("GADS_DEVELOPER_TOKEN") || "";

    const sb = createClient(SB_URL, SB_KEY);

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = body.action || "status";

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const cronSecret = req.headers.get("x-cron-secret");
    let isCron = !!token && token === SB_KEY;
    if (!isCron && cronSecret) {
      const { data: valid } = await sb.rpc("gads_temp_verify_cron_secret", { p_secret: cronSecret });
      if (!valid) return json({ error: "Invalid cron secret" }, 401);
      isCron = true;
    }
    let userId: string | null = null;
    if (isCron) {
      if (!CRON_ACTIONS.includes(action)) return json({ error: `Action ${action} is not allowed for cron` }, 403);
    } else {
      const { data: { user }, error: userErr } = await sb.auth.getUser(token);
      if (userErr || !user) return json({ error: "Not authenticated" }, 401);
      const { data: profile } = await sb.from("user_profiles").select("is_super_admin, roles(role_name)").eq("id", user.id).single();
      const isSuperAdmin = !!profile?.is_super_admin || profile?.roles?.role_name?.toLowerCase() === "super_admin";
      if (!isSuperAdmin) return json({ error: "Super admin required" }, 403);
      userId = user.id;
    }
    console.log(`[gads-temp-sync] action=${action}${isCron ? " (cron)" : ""}`);

    const config = {
      client_id_set: !!CLIENT_ID,
      client_secret_set: !!CLIENT_SECRET,
      developer_token_set: !!DEV_TOKEN,
    };
    if (action !== "status" && (!CLIENT_ID || !CLIENT_SECRET)) {
      return json({ error: "Missing secrets: set GADS_TEST_CLIENT_ID and GADS_TEST_CLIENT_SECRET.", config }, 500);
    }

    // ── helpers ────────────────────────────────────────────────────
    async function accessToken(refreshToken: string) {
      const res = await fetchT("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const data = await res.json();
      if (!data.access_token) {
        throw new Error(`OAuth refresh failed: ${[data.error, data.error_description].filter(Boolean).join(" - ") || res.status}`);
      }
      return data.access_token as string;
    }

    function adsHeaders(at: string, loginCustomerId?: string | null) {
      const h: Record<string, string> = {
        Authorization: "Bearer " + at,
        "Content-Type": "application/json",
      };
      // Optional and ignored by Google: access level comes from the OAuth client's Cloud project.
      if (DEV_TOKEN) h["developer-token"] = DEV_TOKEN;
      if (loginCustomerId) h["login-customer-id"] = digits(loginCustomerId);
      return h;
    }

    async function gaql(at: string, cid: string, query: string, loginCustomerId?: string | null) {
      console.log(`[gads-temp-sync] GAQL customer=${digits(cid)} login=${loginCustomerId || "-"}`);
      const res = await fetchT(`https://googleads.googleapis.com/${VER}/customers/${digits(cid)}/googleAds:searchStream`, {
        method: "POST",
        headers: adsHeaders(at, loginCustomerId),
        body: JSON.stringify({ query }),
      }, 60_000);
      console.log(`[gads-temp-sync] GAQL status=${res.status}`);
      if (!res.ok) {
        const raw = await res.text();
        let detail = raw.substring(0, 400);
        try {
          const parsed = JSON.parse(raw);
          const err = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
          const msgs = (err?.details || []).flatMap((d: any) => (d.errors || []).map((x: any) => x.message)).filter(Boolean);
          if (msgs.length) detail = msgs.join(" | ");
          else if (err?.message) detail = err.message;
        } catch { /* keep raw text */ }
        throw new Error(`Google Ads ${res.status}: ${detail}`);
      }
      const batches = await res.json();
      const rows: any[] = [];
      if (Array.isArray(batches)) batches.forEach((b) => b.results && rows.push(...b.results));
      return rows;
    }

    async function getConnection(connectionId: string) {
      const { data, error } = await sb.from("google_ads_temp_connections")
        .select("id, google_email, mcc_id, refresh_token, is_active")
        .eq("id", connectionId).single();
      if (error || !data) throw new Error("Connection not found");
      if (!data.is_active) throw new Error("Connection is disconnected");
      return data;
    }

    async function discoverAccounts(connectionId: string) {
      const conn = await getConnection(connectionId);
      const at = await accessToken(conn.refresh_token);
      let accounts: any[] = [];

      if (conn.mcc_id) {
        const rows = await gaql(at, conn.mcc_id,
          "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, " +
          "customer_client.time_zone, customer_client.manager FROM customer_client " +
          "WHERE customer_client.status = 'ENABLED'", conn.mcc_id);
        accounts = rows.map((r) => ({
          customer_id: digits(r.customerClient?.id),
          descriptive_name: r.customerClient?.descriptiveName || null,
          currency_code: r.customerClient?.currencyCode || null,
          time_zone: r.customerClient?.timeZone || null,
          is_manager: !!r.customerClient?.manager,
        }));
      } else {
        const res = await fetchT(`https://googleads.googleapis.com/${VER}/customers:listAccessibleCustomers`, { headers: adsHeaders(at) });
        if (!res.ok) throw new Error(`listAccessibleCustomers ${res.status}: ${(await res.text()).substring(0, 300)}`);
        const names: string[] = (await res.json()).resourceNames || [];
        for (const rn of names.slice(0, 100)) {
          const cid = digits(rn);
          try {
            const [r] = await gaql(at, cid,
              "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer");
            accounts.push({
              customer_id: cid,
              descriptive_name: r?.customer?.descriptiveName || null,
              currency_code: r?.customer?.currencyCode || null,
              time_zone: r?.customer?.timeZone || null,
              is_manager: !!r?.customer?.manager,
            });
          } catch {
            accounts.push({ customer_id: cid, descriptive_name: null, currency_code: null, time_zone: null, is_manager: false });
          }
        }
      }

      accounts = accounts.filter((a) => a.customer_id);
      if (accounts.length) {
        const { error } = await sb.from("google_ads_temp_accounts").upsert(
          accounts.map((a) => ({ ...a, connection_id: conn.id })),
          { onConflict: "customer_id" },
        );
        if (error) throw new Error("Saving accounts failed: " + error.message);
      }
      return accounts.length;
    }

    async function syncAccount(customerId: string, dateFrom: string, dateTo: string) {
      console.log(`[gads-temp-sync] sync ${customerId} ${dateFrom}..${dateTo}`);
      const { data: acct } = await sb.from("google_ads_temp_accounts")
        .select("customer_id, connection_id, agency_id, descriptive_name, currency_code, time_zone, is_manager")
        .eq("customer_id", customerId).single();
      if (!acct) throw new Error(`Account ${customerId} not found`);
      if (acct.is_manager) throw new Error(`Account ${customerId} is a manager account (no campaign data)`);
      await sb.from("google_ads_temp_accounts").update({ last_sync_attempt_at: new Date().toISOString() }).eq("customer_id", customerId);

      const conn = await getConnection(acct.connection_id);
      const at = await accessToken(conn.refresh_token);

      const rows = await gaql(at, customerId,
        "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, " +
        "campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
        "campaign.advertising_channel_sub_type, campaign.bidding_strategy_type, campaign.start_date_time, campaign.end_date_time, " +
        "campaign_budget.id, campaign_budget.amount_micros, campaign_budget.period, segments.date, " +
        "metrics.impressions, metrics.clicks, metrics.interactions, metrics.cost_micros, metrics.conversions, " +
        "metrics.conversions_value, metrics.all_conversions, metrics.all_conversions_value, " +
        "metrics.view_through_conversions, metrics.ctr, metrics.average_cpc, metrics.average_cpm, " +
        "metrics.cost_per_conversion, metrics.search_impression_share " +
        `FROM campaign WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}' AND campaign.status != 'REMOVED'`,
        conn.mcc_id);
      console.log(`[gads-temp-sync] ${customerId}: ${rows.length} rows from Google`);

      const now = new Date().toISOString();
      const records = rows.map((r) => ({
        agency_id: acct.agency_id,
        customer_id: customerId,
        customer_name: r.customer?.descriptiveName ?? acct.descriptive_name,
        currency_code: r.customer?.currencyCode ?? acct.currency_code,
        time_zone: r.customer?.timeZone ?? acct.time_zone,
        campaign_id: String(r.campaign?.id),
        campaign_name: r.campaign?.name ?? null,
        campaign_status: r.campaign?.status ?? null,
        channel_type: r.campaign?.advertisingChannelType ?? null,
        channel_sub_type: r.campaign?.advertisingChannelSubType ?? null,
        bidding_strategy_type: r.campaign?.biddingStrategyType ?? null,
        budget_id: r.campaignBudget?.id ? String(r.campaignBudget.id) : null,
        budget_amount: r.campaignBudget?.amountMicros != null ? m2d(r.campaignBudget.amountMicros) : null,
        budget_period: r.campaignBudget?.period ?? null,
        start_date: r.campaign?.startDateTime ? String(r.campaign.startDateTime).slice(0, 10) : null,
        end_date: r.campaign?.endDateTime ? String(r.campaign.endDateTime).slice(0, 10) : null,
        date: r.segments?.date,
        impressions: Number(r.metrics?.impressions || 0),
        clicks: Number(r.metrics?.clicks || 0),
        interactions: Number(r.metrics?.interactions || 0),
        cost: m2d(r.metrics?.costMicros),
        conversions: Number(r.metrics?.conversions || 0),
        conversions_value: Number(r.metrics?.conversionsValue || 0),
        all_conversions: Number(r.metrics?.allConversions || 0),
        all_conversions_value: Number(r.metrics?.allConversionsValue || 0),
        view_through_conversions: Number(r.metrics?.viewThroughConversions || 0),
        ctr: pct(r.metrics?.ctr),
        avg_cpc: m2d(r.metrics?.averageCpc),
        avg_cpm: m2d(r.metrics?.averageCpm),
        cost_per_conversion: m2d(r.metrics?.costPerConversion),
        search_impression_share: pct(r.metrics?.searchImpressionShare),
        synced_at: now,
      }));

      for (let i = 0; i < records.length; i += 500) {
        const { error } = await sb.from("google_ads_temp")
          .upsert(records.slice(i, i + 500), { onConflict: "customer_id,campaign_id,date" });
        if (error) throw new Error("Upsert google_ads_temp failed: " + error.message);
      }

      await sb.from("google_ads_temp_accounts")
        .update({ last_synced_at: now, last_sync_rows: records.length, last_error: null })
        .eq("customer_id", customerId);
      return records.length;
    }

    // Refresh token check for one connection, then a 1-row query per account to confirm access.
    async function checkConnection(conn: { id: string; google_email: string; mcc_id: string | null; refresh_token: string }) {
      const now = new Date().toISOString();
      const { data: accts } = await sb.from("google_ads_temp_accounts")
        .select("customer_id").eq("connection_id", conn.id).eq("is_manager", false);
      const ids = (accts || []).map((a) => a.customer_id);

      let at: string;
      try {
        at = await accessToken(conn.refresh_token);
      } catch (e) {
        const msg = (e as Error).message;
        const tokenStatus = /invalid_grant|expired|revoked/i.test(msg) ? "expired_or_revoked" : "error";
        await sb.from("google_ads_temp_connections")
          .update({ token_status: tokenStatus, last_checked_at: now, last_error: msg }).eq("id", conn.id);
        if (ids.length) {
          await sb.from("google_ads_temp_accounts")
            .update({ access_ok: false, last_checked_at: now }).in("customer_id", ids);
        }
        return { connection_id: conn.id, google_email: conn.google_email, token_status: tokenStatus, error: msg, accounts_ok: 0, accounts_failed: ids.length, failed: [] as any[] };
      }
      await sb.from("google_ads_temp_connections")
        .update({ token_status: "ok", last_checked_at: now, last_error: null }).eq("id", conn.id);

      const failed: { customer_id: string; error: string }[] = [];
      let ok = 0;
      for (let i = 0; i < ids.length; i += 5) {
        await Promise.all(ids.slice(i, i + 5).map(async (cid) => {
          try {
            await gaql(at, cid, "SELECT customer.id FROM customer LIMIT 1", conn.mcc_id);
            ok++;
            await sb.from("google_ads_temp_accounts").update({ access_ok: true, last_checked_at: now }).eq("customer_id", cid);
          } catch (e) {
            const msg = (e as Error).message;
            failed.push({ customer_id: cid, error: msg });
            await sb.from("google_ads_temp_accounts")
              .update({ access_ok: false, last_checked_at: now, last_error: `Access check: ${msg}` }).eq("customer_id", cid);
          }
        }));
      }
      return { connection_id: conn.id, google_email: conn.google_email, token_status: "ok", error: null, accounts_ok: ok, accounts_failed: failed.length, failed };
    }

    // ── actions ────────────────────────────────────────────────────
    if (action === "check_tokens") {
      const { data: conns, error } = await sb.from("google_ads_temp_connections")
        .select("id, google_email, mcc_id, refresh_token").eq("is_active", true);
      if (error) return json({ error: error.message }, 500);
      const results = [];
      for (const c of conns || []) results.push(await checkConnection(c));
      return json({
        success: true,
        checked_at: new Date().toISOString(),
        all_ok: results.every((r) => r.token_status === "ok" && r.accounts_failed === 0),
        results,
      });
    }

    if (action === "cron_sync") {
      const started = Date.now();
      const daysBack = Math.min(Math.max(Number(body.days_back) || 3, 1), 30);
      const batchSize = Math.min(Math.max(Number(body.batch_size) || 8, 1), 25);
      const today = new Date().toISOString().slice(0, 10);
      const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
      const dateFrom = ago(daysBack);
      const dateTo = ago(1);
      const todayStart = `${today}T00:00:00Z`;

      const pending = () => sb.from("google_ads_temp_accounts")
        .select("customer_id, google_ads_temp_connections!inner(is_active)", { count: "exact" })
        .eq("google_ads_temp_connections.is_active", true)
        .eq("is_manager", false)
        .not("agency_id", "is", null)
        .or(`last_sync_attempt_at.is.null,last_sync_attempt_at.lt.${todayStart}`);

      const { data: queue, error } = await pending()
        .order("last_sync_attempt_at", { ascending: true, nullsFirst: true })
        .limit(batchSize);
      if (error) return json({ error: error.message }, 500);

      const results = [];
      let totalRows = 0;
      for (const { customer_id } of queue || []) {
        if (Date.now() - started > CRON_TIME_BUDGET_MS) break;
        try {
          const rows = await syncAccount(customer_id, dateFrom, dateTo);
          totalRows += rows;
          results.push({ customer_id, rows });
        } catch (e) {
          const msg = (e as Error).message;
          console.error(`[gads-temp-sync] cron ${customer_id} failed: ${msg}`);
          await sb.from("google_ads_temp_accounts").update({ last_error: msg }).eq("customer_id", customer_id);
          results.push({ customer_id, error: msg });
        }
      }
      const { count: remaining } = await pending().limit(1);
      console.log(`[gads-temp-sync] cron_sync done: ${results.length} accounts, ${totalRows} rows, ${remaining ?? "?"} remaining`);
      return json({ success: true, date_from: dateFrom, date_to: dateTo, total_rows: totalRows, remaining: remaining ?? null, results });
    }

    if (action === "status") {
      const [{ data: connections }, { data: accounts }] = await Promise.all([
        sb.from("google_ads_temp_connections")
          .select("id, google_email, mcc_id, is_active, connected_at, last_error, token_status, last_checked_at")
          .order("connected_at", { ascending: false }),
        sb.from("google_ads_temp_accounts")
          .select("customer_id, connection_id, agency_id, descriptive_name, currency_code, time_zone, is_manager, last_synced_at, last_sync_rows, last_error, access_ok, last_checked_at")
          .order("descriptive_name"),
      ]);
      return json({ config, connections: connections || [], accounts: accounts || [] });
    }

    if (action === "get_auth_url") {
      if (!body.redirect_uri) return json({ error: "redirect_uri is required" }, 400);
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: body.redirect_uri,
        response_type: "code",
        scope: SCOPE + " https://www.googleapis.com/auth/userinfo.email",
        access_type: "offline",
        prompt: "consent",
        state: String(body.state || ""),
      });
      return json({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
    }

    if (action === "exchange_code") {
      const { code, redirect_uri } = body;
      if (!code || !redirect_uri) return json({ error: "code and redirect_uri are required" }, 400);
      const tokenRes = await fetchT("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.refresh_token) {
        return json({ error: tokenData.error_description || tokenData.error || "No refresh_token returned. Remove the app at myaccount.google.com/permissions and connect again." }, 400);
      }
      const infoRes = await fetchT("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: "Bearer " + tokenData.access_token },
      });
      const email = infoRes.ok ? (await infoRes.json()).email : null;
      if (!email) return json({ error: "Could not read the Google account email" }, 400);

      const { data: conn, error } = await sb.from("google_ads_temp_connections").upsert({
        google_email: email,
        mcc_id: digits(body.mcc_id) || null,
        refresh_token: tokenData.refresh_token,
        token_scopes: tokenData.scope || SCOPE,
        is_active: true,
        connected_by: userId,
        connected_at: new Date().toISOString(),
        last_error: null,
      }, { onConflict: "google_email" }).select("id, google_email, mcc_id").single();
      if (error || !conn) return json({ error: "Saving connection failed: " + error?.message }, 500);

      let accountCount = 0;
      let discoverError: string | null = null;
      try { accountCount = await discoverAccounts(conn.id); } catch (e) {
        discoverError = (e as Error).message;
        await sb.from("google_ads_temp_connections").update({ last_error: discoverError }).eq("id", conn.id);
      }
      return json({ success: true, connection: conn, accounts_found: accountCount, discover_error: discoverError });
    }

    if (action === "refresh_accounts") {
      if (!body.connection_id) return json({ error: "connection_id is required" }, 400);
      try {
        const n = await discoverAccounts(body.connection_id);
        await sb.from("google_ads_temp_connections").update({ last_error: null }).eq("id", body.connection_id);
        return json({ success: true, accounts_found: n });
      } catch (e) {
        await sb.from("google_ads_temp_connections").update({ last_error: (e as Error).message }).eq("id", body.connection_id);
        return json({ error: (e as Error).message }, 400);
      }
    }

    if (action === "update_mcc") {
      if (!body.connection_id) return json({ error: "connection_id is required" }, 400);
      const { error } = await sb.from("google_ads_temp_connections")
        .update({ mcc_id: digits(body.mcc_id) || null }).eq("id", body.connection_id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "assign_agency") {
      if (!body.customer_id) return json({ error: "customer_id is required" }, 400);
      const agencyId = body.agency_id || null;
      const cid = digits(body.customer_id);
      const { error } = await sb.from("google_ads_temp_accounts").update({ agency_id: agencyId }).eq("customer_id", cid);
      if (error) return json({ error: error.message }, 400);
      await sb.from("google_ads_temp").update({ agency_id: agencyId }).eq("customer_id", cid);
      return json({ success: true });
    }

    if (action === "disconnect") {
      if (!body.connection_id) return json({ error: "connection_id is required" }, 400);
      const { error } = await sb.from("google_ads_temp_connections").update({ is_active: false }).eq("id", body.connection_id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "sync") {
      const { date_from, date_to } = body;
      if (!isDate(date_from) || !isDate(date_to)) return json({ error: "date_from and date_to (YYYY-MM-DD) are required" }, 400);

      let customerIds: string[] = [];
      if (body.customer_id) {
        customerIds = [digits(body.customer_id)];
      } else if (body.agency_id) {
        const { data } = await sb.from("google_ads_temp_accounts")
          .select("customer_id").eq("agency_id", body.agency_id).eq("is_manager", false);
        customerIds = (data || []).map((r) => r.customer_id);
      } else {
        return json({ error: "customer_id or agency_id is required" }, 400);
      }
      if (!customerIds.length) return json({ error: "No non-manager accounts mapped to this agency" }, 400);

      const results = [];
      let totalRows = 0;
      for (const cid of customerIds) {
        try {
          const rows = await syncAccount(cid, date_from, date_to);
          totalRows += rows;
          results.push({ customer_id: cid, rows });
        } catch (e) {
          const msg = (e as Error).message;
          console.error(`[gads-temp-sync] ${cid} failed: ${msg}`);
          await sb.from("google_ads_temp_accounts").update({ last_error: msg }).eq("customer_id", cid);
          results.push({ customer_id: cid, error: msg });
        }
      }
      return json({ success: results.some((r) => !("error" in r)), total_rows: totalRows, results });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[gads-temp-sync]", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
