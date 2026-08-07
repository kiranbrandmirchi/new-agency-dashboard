// supabase/functions/sync-health-check/index.ts
// Daily digest: email ops when recently-active accounts have no metric rows for yesterday.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ZeroFetchRow = {
  agency_id: string;
  agency_name: string | null;
  platform: string;
  customer_id: string;
  account_name: string | null;
  last_data_day: string | null;
};

function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseAuth(req: Request): string | null {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SB_URL = Deno.env.get("SUPABASE_URL") || "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SB_ANON_KEY") || "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
  const ALERT_FROM = Deno.env.get("ALERT_FROM") || "";
  const ALERT_TO = Deno.env.get("ALERT_TO") || "";
  const ALERT_ALWAYS = (Deno.env.get("ALERT_ALWAYS") || "").toLowerCase() === "true";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  try {
    if (!SB_URL || !SB_KEY) {
      return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const token = parseAuth(req);
    // Allow service role, anon (matches other pg_cron net.http_post jobs), or CRON_SECRET.
    const allowed =
      token &&
      (token === SB_KEY ||
        (ANON_KEY && token === ANON_KEY) ||
        (CRON_SECRET && token === CRON_SECRET));
    if (!allowed) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const dryRun = body.dry_run === true;
    const checkDate =
      typeof body.check_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.check_date)
        ? body.check_date
        : ymdUTC(new Date(Date.now() - 86400000));

    const headers = {
      apikey: SB_KEY,
      Authorization: "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    // Detect zero-fetch accounts (SQL RPC — ID normalization + 14-day lookback)
    const rpcRes = await fetch(SB_URL + "/rest/v1/rpc/find_sync_zero_fetch_accounts", {
      method: "POST",
      headers,
      body: JSON.stringify({ p_check_date: checkDate }),
    });
    if (!rpcRes.ok) {
      const err = await rpcRes.text();
      console.error("[sync-health-check] RPC failed:", err);
      return jsonResponse({ error: "find_sync_zero_fetch_accounts failed", detail: err.slice(0, 500) }, 500);
    }
    const anomalies = (await rpcRes.json()) as ZeroFetchRow[];
    if (!Array.isArray(anomalies)) {
      return jsonResponse({ error: "Unexpected RPC response" }, 500);
    }

    // Dedupe against sync_alert_log for this check_date
    let toAlert = anomalies;
    if (anomalies.length > 0) {
      const existingRes = await fetch(
        SB_URL +
          `/rest/v1/sync_alert_log?select=agency_id,platform,customer_id&checked_date=eq.${checkDate}`,
        { headers },
      );
      if (existingRes.ok) {
        const existing = (await existingRes.json()) as Array<{
          agency_id: string;
          platform: string;
          customer_id: string;
        }>;
        const seen = new Set(
          (existing || []).map(
            (r) => `${r.agency_id}|${r.platform}|${String(r.customer_id).replace(/-/g, "")}`,
          ),
        );
        toAlert = anomalies.filter(
          (a) => !seen.has(`${a.agency_id}|${a.platform}|${String(a.customer_id).replace(/-/g, "")}`),
        );
      }
    }

    console.log(
      `[sync-health-check] check_date=${checkDate} anomalies=${anomalies.length} new=${toAlert.length} dry_run=${dryRun}`,
    );

    const shouldEmail =
      !dryRun &&
      RESEND_API_KEY &&
      ALERT_FROM &&
      ALERT_TO &&
      (toAlert.length > 0 || ALERT_ALWAYS);

    let emailSent = false;
    let emailError: string | null = null;

    if (shouldEmail) {
      const recipients = ALERT_TO.split(",").map((s) => s.trim()).filter(Boolean);
      const subject =
        toAlert.length > 0
          ? `[Sync Alert] ${toAlert.length} account(s) missing data for ${checkDate}`
          : `[Sync Alert] All clear for ${checkDate}`;

      const rowsHtml =
        toAlert.length === 0
          ? `<p>No missing-data alerts for <strong>${escapeHtml(checkDate)}</strong>.</p>`
          : `<p>The following <strong>recently active</strong> accounts have <strong>no metric rows</strong> for <code>${escapeHtml(checkDate)}</code> (had activity in the prior 14 days):</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
<thead><tr>
  <th>Agency</th><th>Platform</th><th>Account</th><th>Customer ID</th><th>Last data day</th>
</tr></thead>
<tbody>
${toAlert
  .map(
    (a) => `<tr>
  <td>${escapeHtml(a.agency_name || a.agency_id)}</td>
  <td>${escapeHtml(a.platform)}</td>
  <td>${escapeHtml(a.account_name || "—")}</td>
  <td>${escapeHtml(a.customer_id)}</td>
  <td>${escapeHtml(a.last_data_day || "—")}</td>
</tr>`,
  )
  .join("\n")}
</tbody></table>
<p style="color:#666;font-size:12px">Rule: alert only if yesterday has zero rows AND the account had ≥1 row in the 14 days before. Cron fire-and-forget syncs do not write sync_log — this check reads daily metric tables.</p>`;

      const textBody =
        toAlert.length === 0
          ? `All clear for ${checkDate}.`
          : `Missing data for ${checkDate} (${toAlert.length} accounts):\n\n` +
            toAlert
              .map(
                (a) =>
                  `- [${a.platform}] ${a.agency_name || a.agency_id} / ${a.account_name || "?"} (${a.customer_id}) last=${a.last_data_day || "—"}`,
              )
              .join("\n");

      const mailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: ALERT_FROM,
          to: recipients,
          subject,
          html: rowsHtml,
          text: textBody,
        }),
      });
      if (!mailRes.ok) {
        emailError = (await mailRes.text()).slice(0, 500);
        console.error("[sync-health-check] Resend error:", emailError);
      } else {
        emailSent = true;
      }
    } else if (!dryRun && toAlert.length > 0 && (!RESEND_API_KEY || !ALERT_FROM || !ALERT_TO)) {
      emailError = "Missing RESEND_API_KEY, ALERT_FROM, or ALERT_TO — alerts detected but email not sent";
      console.warn("[sync-health-check]", emailError);
    }

    // Persist alert log for new anomalies (even on dry_run=false only)
    let logged = 0;
    if (!dryRun && toAlert.length > 0) {
      const payload = toAlert.map((a) => ({
        checked_date: checkDate,
        agency_id: a.agency_id,
        platform: a.platform,
        customer_id: a.customer_id,
        alerted_at: new Date().toISOString(),
        detail: {
          account_name: a.account_name,
          agency_name: a.agency_name,
          last_data_day: a.last_data_day,
          status: "missing_yesterday",
          email_sent: emailSent,
        },
      }));
      const ins = await fetch(SB_URL + "/rest/v1/sync_alert_log", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!ins.ok) {
        console.warn("[sync-health-check] sync_alert_log insert:", (await ins.text()).slice(0, 300));
      } else {
        logged = payload.length;
      }
    }

    return jsonResponse({
      ok: true,
      check_date: checkDate,
      anomalies_found: anomalies.length,
      new_alerts: toAlert.length,
      email_sent: emailSent,
      email_error: emailError,
      logged,
      dry_run: dryRun,
      sample: toAlert.slice(0, 20),
    });
  } catch (e) {
    console.error("[sync-health-check] FATAL:", e);
    return jsonResponse({ error: String((e as Error)?.message || e) }, 500);
  }
});
