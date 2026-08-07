# Cron jobs — platform sync reference

This document describes the **pg_cron** jobs that fetch / refresh agency data from ad and analytics platforms.

Schedules below match **production** (`SELECT * FROM cron.job`) as of Aug 2026.  
Repo snapshot [`supabase/Cron-jobs.json`](../supabase/Cron-jobs.json) may list fewer jobs — always trust `cron.job` in Supabase for live truth.

All times are **UTC**. IST = UTC + 5:30.

---

## Quick map: which job fetches which platform?

| Platform | Cron job(s) | SQL driver | Edge Function | Main tables populated |
| --- | --- | --- | --- | --- |
| **Google Ads** | `gads-daily-metrics` | `gads_metrics_sync_all()` | `gads-full-sync` | `gads_campaign_daily`, ad group / keyword / search term / conversion dailies, etc. |
| **Google Ads** (status) | `gads-daily-status` | `gads_status_sync_all()` | `gads-status-geo` | `gads_campaign_status`, `gads_adgroup_status`, `gads_keyword_status` |
| **Google Ads** (geo) | `gads-daily-geo` | `gads_geo_sync_all()` | `gads-status-geo` (`sync_type=geo`) | `gads_geo_location_daily` |
| **Google Ads** (geo names) | `gads-daily-geo-resolve` | `net.http_post` (inline) | `gads-geo-resolve` | `gads_geo_constants` (name resolution) |
| **Meta / Facebook** | `fb-daily-metrics` | `fb_metrics_sync_all()` | `fb-full-sync` | `fb_campaign_daily`, `fb_adset_daily`, `fb_ad_daily`, `fb_placement_daily` |
| **TikTok** | `tt_metrics_sync_all` | `tt_metrics_sync_all()` | `tiktok-full-sync` | `tiktok_campaign_daily` (+ related) |
| **Reddit** | `reddit-daily-metrics` | `reddit_metrics_sync_all()` | `reddit-full-sync` | `reddit_campaign_daily` (+ related) |
| **Bing / Microsoft** | `bing_metrics_sync_all` | `bing_metrics_sync_all()` | `bing-full-sync` | `bing_campaign_daily` (+ related) |
| **GA4** | `ga4-daily-metrics` | `ga4_metrics_sync_all()` | `ga4-sync` | `ga4_daily_summary` / GA4 raw/summary stores |
| **GoHighLevel** | `ghl-sync-daily` | `ghl_sync_all()` | `ghl-sync` | `ghl_contacts`, `ghl_calls`, `ghl_*_daily`, etc. |
| **Hoot inventory** | `hoot-daily-inventory-sync` | `hoot_inventory_sync_all()` | `hoot-inventory-sync` | `hoot_inventory`, feed-related tables |
| **Sync health alerts** | `sync-health-check-daily` | `net.http_post` (inline) | `sync-health-check` | Email digest + `sync_alert_log` (no metric writes) |

Dashboard / report pages **read** these tables; they do not call the ad APIs directly for historical sync.

---

## Daily schedule (production)

| UTC | IST (approx) | Job name | Platform |
| --- | --- | --- | --- |
| 04:00 | 09:30 | `gads-daily-status` | Google Ads |
| 04:15 | 09:45 | `gads-daily-geo` | Google Ads |
| 04:30 | 10:00 | `gads-daily-metrics` | Google Ads **(campaign spend / KPIs)** |
| 05:00 | 10:30 | `gads-daily-geo-resolve` | Google Ads |
| 05:00 | 10:30 | `hoot-daily-inventory-sync` | Hoot |
| 05:15 | 10:45 | `fb-daily-metrics` | Meta / Facebook |
| 05:20 | 10:50 | `tt_metrics_sync_all` | TikTok |
| 05:30 | 11:00 | `reddit-daily-metrics` | Reddit |
| 05:40 | 11:10 | `bing_metrics_sync_all` | Bing |
| 05:45 | 11:15 | `ga4-daily-metrics` | GA4 |
| 06:00 | 11:30 | `ghl-sync-daily` | GoHighLevel |
| 07:30 | 13:00 | `sync-health-check-daily` | **Zero-fetch email alerts** (all ad/GA4 platforms) |

**Total: 12 active jobs** (11 sync + 1 health check), once `sync-health-check-daily` is applied.

---

## How a metrics cron works (typical pattern)

```text
pg_cron job
  → SQL function (*_metrics_sync_all / *_sync_all)
    → finds active rows in client_platform_accounts (platform = …)
    → for each account (often day-by-day for last ~5 days)
      → net.http_post → Edge Function
        → calls Google / Meta / Bing / … API with agency OAuth
        → upserts into Postgres daily tables
```

- Scope is **all agencies** that have active linked accounts (not one agency at a time).
- OAuth / API secrets live in **`agency_platform_credentials`** + Edge Function env secrets (`GADS_*`, `FB_*`, etc.).
- **Settings → Sync Now** calls the same Edge Functions outside this schedule (manual backfill).

---

## Job details by platform

### Google Ads (4 jobs)

#### 1. `gads-daily-metrics` — **primary data for Dashboard / Google Ads pages**

| | |
| --- | --- |
| **Schedule** | `30 4 * * *` UTC |
| **SQL** | `SELECT public.gads_metrics_sync_all()` |
| **Edge** | `gads-full-sync` |
| **Accounts** | Active `client_platform_accounts` where `platform = 'google_ads'` **and** linked active credential |
| **Window** | Each of the last **5 calendar days** (yesterday back), one HTTP call per account per day |
| **Writes** | `gads_campaign_daily` (and other metrics tables from full sync) |

If an account has no rows in `gads_campaign_daily` for a date range, either this job has not successfully written campaigns for that account/day, or Google returned no campaign metrics (`OK: 0`).

#### 2. `gads-daily-status`

| | |
| --- | --- |
| **Schedule** | `0 4 * * *` UTC |
| **SQL** | `gads_status_sync_all()` |
| **Edge** | `gads-status-geo` with `sync_type` = campaigns / adgroups / keywords |
| **Purpose** | Refresh campaign / ad group / keyword **status** (not daily spend) |

#### 3. `gads-daily-geo`

| | |
| --- | --- |
| **Schedule** | `15 4 * * *` UTC |
| **SQL** | `gads_geo_sync_all()` |
| **Edge** | `gads-status-geo` (`sync_type = geo`) |
| **Window** | Last 5 days, per account |
| **Writes** | `gads_geo_location_daily` |

#### 4. `gads-daily-geo-resolve`

| | |
| --- | --- |
| **Schedule** | `0 5 * * *` UTC |
| **Command** | Direct `net.http_post` to `/functions/v1/gads-geo-resolve` |
| **Purpose** | Resolve geo IDs to human-readable names (`gads_geo_constants`) |

---

### Meta / Facebook — `fb-daily-metrics`

| | |
| --- | --- |
| **Schedule** | `15 5 * * *` UTC |
| **SQL** | `fb_metrics_sync_all()` |
| **Edge** | `fb-full-sync` |
| **Accounts** | Active CPA where `platform = 'facebook'` |
| **Window** | Last 5 days (day-by-day) |
| **Writes** | `fb_campaign_daily`, `fb_adset_daily`, `fb_ad_daily`, `fb_placement_daily` |

Powers **Meta Ads** pages and Dashboard **Facebook** tab.

---

### TikTok — `tt_metrics_sync_all`

| | |
| --- | --- |
| **Schedule** | `20 5 * * *` UTC |
| **SQL** | `tt_metrics_sync_all()` |
| **Edge** | `tiktok-full-sync` |
| **Accounts** | Active CPA where `platform = 'tiktok'` |
| **Window** | Last 5 days (day-by-day) |
| **Writes** | `tiktok_campaign_daily` (+ related) |

---

### Reddit — `reddit-daily-metrics`

| | |
| --- | --- |
| **Schedule** | `30 5 * * *` UTC |
| **SQL** | `reddit_metrics_sync_all()` |
| **Edge** | `reddit-full-sync` |
| **Accounts** | Active CPA where `platform = 'reddit'` |
| **Window** | Last 5 days (day-by-day) |
| **Writes** | `reddit_campaign_daily` (+ related) |

---

### Bing / Microsoft Ads — `bing_metrics_sync_all`

| | |
| --- | --- |
| **Schedule** | `40 5 * * *` UTC |
| **SQL** | `bing_metrics_sync_all()` |
| **Edge** | `bing-full-sync` (`mode = backfill`) |
| **Accounts** | Active CPA where `platform = 'bing'` |
| **Window** | Last 5 days (day-by-day) |
| **Writes** | `bing_campaign_daily` (+ related) |

---

### GA4 — `ga4-daily-metrics`

| | |
| --- | --- |
| **Schedule** | `45 5 * * *` UTC |
| **SQL** | `ga4_metrics_sync_all()` |
| **Edge** | `ga4-sync` |
| **Accounts** | Active CPA where `platform = 'ga4'` with active credential |
| **Window** | Single request covering last 5 days (`date_from` … `date_to`) |
| **Writes** | GA4 summary / daily stores used by GA4 reports and Dashboard GA4 |

---

### GoHighLevel — `ghl-sync-daily`

| | |
| --- | --- |
| **Schedule** | `0 6 * * *` UTC |
| **SQL** | `ghl_sync_all()` |
| **Edge** | `ghl-sync` (`mode = full`) |
| **Accounts** | Active CPA where `platform = 'ghl'` |
| **Writes** | GHL contacts, calls, forms, daily aggregates |

---

### Hoot inventory — `hoot-daily-inventory-sync`

| | |
| --- | --- |
| **Schedule** | `0 5 * * *` UTC |
| **SQL** | `hoot_inventory_sync_all()` |
| **Edge** | `hoot-inventory-sync` (body `{}` — processes **all** active feeds) |
| **Writes** | `hoot_inventory` / related feed tables |

Not an ad-platform spend sync; inventory only.

---

## Sync health alerts — `sync-health-check-daily`

Emails ops when **recently active** accounts have **no metric rows for yesterday** after the nightly sync window.

| | |
| --- | --- |
| **Schedule** | `30 7 * * *` UTC (after GHL at 06:00) |
| **Command** | `net.http_post` → `/functions/v1/sync-health-check` |
| **Detection RPC** | `find_sync_zero_fetch_accounts(p_check_date)` |
| **Log table** | `sync_alert_log` (dedupe per agency / platform / customer / day) |
| **Platforms** | Google Ads, Meta (`facebook`), Bing, Reddit, TikTok, GA4 |
| **Skipped (v1)** | Hoot, GHL |

### Alert rule

For each **active** `client_platform_accounts` row on a covered platform, alert if:

1. **No rows** in that platform’s daily table for **yesterday** (`CURRENT_DATE - 1`), **and**
2. The account had **≥1 row in the prior 14 days** (was producing data recently).

Idle linked accounts with no recent history are ignored.

| Platform | Fact table | Date column |
| --- | --- | --- |
| google_ads | `gads_campaign_daily` | `date` |
| facebook | `fb_campaign_daily` | `report_date` |
| bing | `bing_campaign_daily` | `report_date` |
| reddit | `reddit_campaign_daily` | `report_date` |
| tiktok | `tiktok_campaign_daily` | `report_date` |
| ga4 | `ga4_daily_summary` | `report_date` |

### Required secrets

| Secret | Where | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Edge Function secrets | Send digest via [Resend](https://resend.com) |
| `ALERT_FROM` | Edge Function secrets | Verified sender, e.g. `alerts@yourdomain.com` |
| `ALERT_TO` | Edge Function secrets | One or more recipients, comma-separated |
| `ALERT_ALWAYS` | Edge Function secrets (optional) | If `true`, email even when there are no anomalies |
| `CRON_SECRET` | Edge Function secrets (optional) | Extra Bearer token allowed for invokes |
| Vault `project_url` | Supabase Vault | Cron HTTP URL base |
| Vault `anon_key` or `service_role_key` | Supabase Vault | Cron `Authorization` Bearer (function accepts both) |

Migration: [`supabase/migrations/20260807153000_sync_health_check_alerts.sql`](../supabase/migrations/20260807153000_sync_health_check_alerts.sql)  
Edge Function: [`supabase/functions/sync-health-check/`](../supabase/functions/sync-health-check/)

### Manual test

```bash
# Dry run (no email, no log insert)
curl -X POST "$SUPABASE_URL/functions/v1/sync-health-check" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'

# Real run for a specific date
curl -X POST "$SUPABASE_URL/functions/v1/sync-health-check" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"check_date": "2026-08-06"}'
```

```sql
-- Preview anomalies without emailing
SELECT * FROM public.find_sync_zero_fetch_accounts(CURRENT_DATE - 1);

-- Recent alerts
SELECT * FROM public.sync_alert_log ORDER BY alerted_at DESC LIMIT 50;
```

---

## Manual sync vs cron

| Action | Same Edge Function as cron? | Typical use |
| --- | --- | --- |
| Settings → **Sync Now** / Sync All | Yes (per platform) | Backfill longer ranges; fix one account immediately |
| Nightly cron | Yes | Keep last ~5 days fresh for all active linked accounts |
| Dashboard / report UI | No (reads DB only) | Displays already-synced rows |

**Note:** Google Ads Settings Sync Now can request a custom date preset (e.g. Last 30 / 90 days). Cron only covers roughly **D-5 … D-1**.

---

## Inspect live jobs & recent runs

```sql
-- Currently scheduled
SELECT jobid, jobname, schedule, active, command
FROM cron.job
ORDER BY jobname;

-- Recent run history (if available on your plan)
SELECT jobid, job_pid, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 50;
```

Edge Function logs (Supabase Dashboard → Edge Functions → e.g. `gads-full-sync`) show per-account API success/failure (`OK: N`, `ERR campaigns:…`).

---

## Related files

| Path | Role |
| --- | --- |
| [`supabase/Cron-jobs.json`](../supabase/Cron-jobs.json) | Partial checked-in job list (may lag production) |
| [`supabase/migrations/20260807153000_sync_health_check_alerts.sql`](../supabase/migrations/20260807153000_sync_health_check_alerts.sql) | `sync_alert_log`, detection RPC, health-check cron |
| [`supabase/functions/sync-health-check/`](../supabase/functions/sync-health-check/) | Zero-fetch email digest |
| `schema.sql` / `supabase/full_schema.sql` | SQL `*_sync_all` function definitions |
| `supabase/migrations/20260504120100_bing_metrics_sync_all.sql` | Bing cron driver + schedule |
| `supabase/functions/*-full-sync/` / `gads-full-sync/` / `ga4-sync/` / `ghl-sync/` | Platform fetch + upsert logic |
