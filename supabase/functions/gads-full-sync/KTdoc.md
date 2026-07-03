# KT Doc — `gads-full-sync` Edge Function

Knowledge-transfer document for the Google Ads sync Supabase Edge Function located at
`supabase/functions/gads-full-sync/index.ts`.

This function is the **primary ingestion pipeline for Google Ads data** in the agency
dashboard. It pulls metrics from the Google Ads API (v23, `searchStream`) and upserts
them into a set of `gads_*` tables in Supabase.

---

## 1. High-Level Purpose

| | |
|---|---|
| **Runtime** | Deno (Supabase Edge Function) |
| **Endpoint** | `POST {SUPABASE_URL}/functions/v1/gads-full-sync` |
| **Google Ads API** | `googleads.googleapis.com/v23/customers/{cid}/googleAds:searchStream` |
| **OAuth flow** | Server-side refresh-token exchange against `oauth2.googleapis.com/token` |
| **Auth model** | Agency-level OAuth credentials, optional MCC (`login-customer-id`) |
| **Storage** | PostgREST upserts into `gads_*` tables on Supabase |

The function has **two operating modes**:

1. **`list_only`** — discover all (non-manager) customer accounts under an MCC.
2. **Sync mode** (`daily` or `backfill`) — pull metrics for a single `customer_id`
   across the standard report set (campaigns, ad groups, keywords, search terms,
   conversion actions, etc.) and upsert them.

---

## 2. Environment Variables

These must be set on the Supabase project (Edge Functions secrets):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Base URL used for PostgREST calls (`/rest/v1/...`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for reading credentials + upserts. |
| `GADS_DEVELOPER_TOKEN` | Google Ads developer token (`developer-token` header). |
| `GADS_CLIENT_ID` | OAuth client ID used to exchange refresh tokens. |
| `GADS_CLIENT_SECRET` | OAuth client secret. |

Internal constants:

- `VER = "v23"` — Google Ads API version. Bump here when upgrading.
- `MIC = 1_000_000` — micros-to-currency divisor (Google Ads returns money in micros).

---

## 3. Request Contract

`POST` body (JSON, all fields optional unless noted):

```json
{
  "mode": "daily | backfill",
  "date_from": "YYYY-MM-DD",
  "date_to": "YYYY-MM-DD",
  "days_back": 3,
  "customer_id": "1234567890",
  "agency_id": "<uuid>",
  "list_only": false
}
```

Field semantics:

- **`mode`**
  - `"daily"` (default) — uses `days_back` (default `3`) to compute the date window:
    `[today - days_back, today]`.
  - `"backfill"` — requires `date_from` + `date_to`. Also triggers section **G**
    (conversion actions metadata).
- **`days_back`** — used only in `daily` mode (default `3`).
- **`customer_id`** — Google Ads CID (with or without dashes). **Required** for sync
  mode. Dashes are stripped before use.
- **`agency_id`** — **Required only when `list_only = true`** (so we can look up the
  agency credential to use the MCC).
- **`list_only`** — when `true`, the function returns the list of non-manager
  customers under the MCC and upserts them into `gads_customers`.

### Responses

- **List-only success**: `200 application/json` with `{ "customers": [...] }`.
- **Sync mode success**: `200 text/plain` with the human-readable log.
- **Validation errors** (missing customer / credential / agency): `400 text/plain`
  with the log explaining the failure.
- **Unhandled errors**: `500 text/plain` with `FATAL: ...` in the log.

All responses include CORS headers
(`Access-Control-Allow-Origin: *`, plus standard headers, `POST, OPTIONS`).

---

## 4. Execution Flow

```
┌────────────────────────────────────────────────────────────┐
│ 1. Parse request body, log inputs                          │
│ 2. Resolve credentials (per mode)                          │
│ 3. Exchange refresh_token → access_token (OAuth)           │
│ 4. Build date filter (dateSql)                             │
│ 5. Branch:                                                 │
│    a) list_only → list customers + upsert gads_customers   │
│    b) sync     → run sections A–G (G only on backfill)     │
│ 6. Return text log (or JSON for list_only)                 │
└────────────────────────────────────────────────────────────┘
```

### 4.1 Credential resolution

There are two credential lookup paths:

**Sync mode (`customer_id` present, `list_only = false`):**
1. Query `client_platform_accounts` filtered by
   `platform_customer_id = customer_id` (dashes stripped), `platform = 'google_ads'`,
   `is_active = true`. Selects `credential_id, agency_id, use_mcc`.
2. From `agency_platform_credentials`, look up the agency's
   `oauth_refresh_token` + `platform_mcc_id`.
3. `USE_MCC` defaults to `true` and falls back to the `use_mcc` flag on
   `client_platform_accounts`. When `false`, the `login-customer-id` header is
   omitted (used for direct, non-MCC accounts).

**List-only mode (`list_only = true`):**
1. Requires `agency_id` in the body.
2. Reads `agency_platform_credentials` directly.

If any of these lookups fail, the function returns `400` with a descriptive log line.

### 4.2 OAuth token exchange

A standard `refresh_token` grant against `https://oauth2.googleapis.com/token`. The
returned `access_token` is used as the `Authorization: Bearer ...` header for all
Google Ads calls in the request. The function does **not** persist the access
token — it is fetched fresh per invocation.

### 4.3 Google Ads query helper (`gq`)

```
POST https://googleads.googleapis.com/v23/customers/{cid}/googleAds:searchStream
Headers:
  Authorization: Bearer <access_token>
  developer-token: <GADS_DEVELOPER_TOKEN>
  login-customer-id: <MCC_ID>   ← only when USE_MCC = true and MCC_ID is set
Body: { "query": "<GAQL>" }
```

`searchStream` returns an **array of batches**, each with a `results` field. The
helper concatenates `results` across all batches and returns a flat array. Non-2xx
responses throw `GAds <status>: <truncated body>`.

### 4.4 Date filter (`dateSql`)

- **Backfill**: `segments.date BETWEEN '<date_from>' AND '<date_to>'`.
- **Daily**: `segments.date BETWEEN '<today - days_back>' AND '<today>'`.

Uses local `Date` arithmetic and `toISOString().split('T')[0]` for `YYYY-MM-DD`
formatting (UTC date boundaries).

### 4.5 Upsert helper (`su`)

- In-process **dedupe** by the `on_conflict` key (composite, comma-joined).
- Chunks rows into batches of **400**.
- Uses PostgREST with `Prefer: resolution=merge-duplicates` and
  `on_conflict=<keys>` to upsert.
- Failed chunks are **logged but not thrown** — partial success is acceptable.
- Returns the number of rows successfully upserted.

### 4.6 Micros conversion (`m2d`)

`micros / 1_000_000`, rounded to 2 decimals. Applied to:
`cost_micros`, `average_cpc`, `average_cpm`, `cost_per_conversion`.

---

## 5. Sections A–G (what is synced)

Each section is wrapped in its own `try/catch` — one failure does not abort the
others. Errors are logged as `ERR <section>: <message>` and the run continues.

### A. Campaigns daily — `gads_campaign_daily`

- **Source**: `FROM campaign`
- **Filter**: date filter + `campaign.status != 'REMOVED'`
- **Conflict key**: `customer_id, campaign_id, date`
- **Notable metrics**: impressions, clicks, cost (from micros), conversions,
  conversions_value, all_conversions(+value), view_through_conversions,
  interactions, **`ctr × 100`** (stored as percent), avg_cpc, avg_cpm,
  cost_per_conversion.

### B. Campaign status — `gads_campaign_status`

- **Source**: `FROM campaign` (no metrics, no date filter)
- **Filter**: `campaign.status != 'REMOVED'`
- **Conflict key**: `customer_id, campaign_id`
- Stores the latest known status of each campaign.

### C. Ad groups daily — `gads_adgroup_daily`

- **Source**: `FROM ad_group`
- **Filter**: date filter + both campaign and ad group `status != 'REMOVED'`
- **Conflict key**: `customer_id, ad_group_id, date`

### D. Keywords daily — `gads_keyword_daily`

- **Source**: `FROM keyword_view`
- Pulls `ad_group_criterion.criterion_id`, keyword text + match type.
- **Conflict key**: `customer_id, ad_group_id, keyword_id, date`

### E. Search terms daily — `gads_search_term_daily`

- **Source**: `FROM search_term_view`
- **Filter**: date filter + `campaign.status != 'REMOVED'`
- **Conflict key**: `customer_id, campaign_id, ad_group_id, search_term, date`
- **Note**: `syncHelper.js` sends `skip_search_terms: true` on backfill chunks,
  but the function currently **does not read this flag**. See **§9 Known issues**.

### F. Conversions by action — `gads_conversion_daily`

- **Source**: `FROM campaign` with `metrics.conversions > 0` (data still segmented
  by `segments.conversion_action`).
- Parses `conversion_action_id` from the trailing path segment of
  `segments.conversion_action` (`.../conversionActions/<id>`).
- **Conflict key**: `customer_id, campaign_id, conversion_action_id, date`

### G. Conversion actions metadata — `gads_conversion_actions` *(backfill only)*

- **Source**: `FROM conversion_action WHERE status = 'ENABLED'`
- **Conflict key**: `customer_id, conversion_action_id`
- Skipped in `daily` mode to keep daily runs cheap.

### List-only — `gads_customers`

- Triggered when `list_only = true`.
- **Source**: `FROM customer_client WHERE status = 'ENABLED'` (run against MCC).
- Upserts every account; filters out manager accounts for the response payload.
- **Conflict key**: `customer_id`

---

## 6. Database tables touched

All defined in `supabase/migrations/00000000000000_full_schema.sql`:

- `gads_campaign_daily`
- `gads_campaign_status`
- `gads_adgroup_daily`
- `gads_keyword_daily`
- `gads_search_term_daily`
- `gads_conversion_daily`
- `gads_conversion_actions`
- `gads_customers`

Read for credentials:
- `client_platform_accounts` (filtered by `platform = 'google_ads'`,
  `is_active = true`).
- `agency_platform_credentials` (filtered by `platform = 'google_ads'`,
  `is_active = true`).

Related schema helpers (not invoked here, useful context):
- `cleanup_orphaned_gads_data()` — purges rows whose `customer_id` no longer maps
  to an active `client_platform_accounts` row.
- `gads_metrics_sync_all()` — pg_cron-style entrypoint that loops over active
  Google Ads accounts and calls this function in `backfill` mode for the last
  5 days, one day per request.
- `gads_status_sync_all()` — sister function that calls a separate
  `gads-status-geo` edge function for status/geo data.

---

## 7. How it is called from the app / scheduler

### Frontend (`src/utils/syncHelper.js`)

- `syncGadsWithChunking(...)` walks a date range in chunks and POSTs each chunk:

```js
fetch(`${SUPABASE_URL}/functions/v1/gads-full-sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json',
             Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({
    customer_id, agency_id,
    date_from, date_to,
    mode: 'backfill',
    skip_search_terms: true,
  }),
});
```

- `src/pages/OAuthCallback.jsx` calls the function in **`list_only`** mode after
  the agency completes the Google Ads OAuth handshake, to populate the account
  picker.

### Database (`gads_metrics_sync_all` plpgsql function)

Runs on a cron schedule (see `pg_cron`/Supabase schedules). For each active
Google Ads account, it loops day-by-day over `CURRENT_DATE - 5d → CURRENT_DATE - 1d`
and fires one `net.http_post` per day in `backfill` mode. This guarantees we
re-sync the trailing window every night so that final conversion attributions
land in our tables.

---

## 8. Logging & response model

- Every meaningful step appends to an in-memory array `L` and also `console.log`s
  the line, so logs are visible both in the Supabase edge function logs **and** in
  the response body.
- Final response (sync mode) is `text/plain` containing the joined log — this is
  intentional so callers can surface the log directly to the user / operator.
- Frontend tries `res.json()` first and falls back; if you change the response
  shape, audit `src/utils/syncHelper.js` (`data?.total_rows ?? data?.log?.length`).

---

## 9. Known issues / gotchas

1. **`skip_search_terms` is unused.** The frontend passes it but the function
   never reads `body.skip_search_terms`. Section **E** always runs. If we want
   the optimization, gate section E on `if (!body.skip_search_terms) { ... }`.
2. **`total_rows` is not returned in the JSON.** Sync mode returns `text/plain`,
   so `syncHelper.js`'s `data?.total_rows` is always `undefined` and falls back
   to `log?.length`. If we want a reliable row count to the UI, return JSON in
   sync mode (e.g. `{ ok: true, total_rows: totalRows, log: L }`).
3. **CTR is multiplied by 100 at write time.** Downstream queries / charts must
   treat the stored value as a **percent**, not a ratio.
4. **Date arithmetic is UTC.** `new Date()` + `toISOString()` means the daily
   window is computed in UTC, not the customer's timezone. This is usually fine
   because Google Ads' `segments.date` is reported in the **account timezone**,
   but the bounds we send are UTC dates — there can be a one-day skew for
   accounts in far-east/west timezones near midnight UTC.
5. **`searchStream` paging.** We rely on `searchStream` returning all results in
   a single HTTP response (an array of batches). For very large accounts /
   long backfill windows, this can exceed the edge function memory/time budget.
   Mitigation: stay on day-sized chunks (which `gads_metrics_sync_all` and
   `syncHelper` already do).
6. **No retries on upstream errors.** A single 5xx from Google Ads aborts that
   section (but not the run). For idempotency, callers should re-invoke the same
   day/customer; conflict keys make it safe.
7. **`customer_id` normalization is inconsistent.** Dashes are stripped before
   the Google Ads call and before the `client_platform_accounts` lookup, but the
   raw `customerId` (with whatever the caller sent) is stored on every row's
   `customer_id` column. Always normalize on read (the `cleanup_orphaned_gads_data`
   function and joins use `REPLACE(customer_id, '-', '')` for this reason).
8. **Service-role key in the function.** This function bypasses RLS via the
   service role; any logic that filters by agency must happen here, not in the DB.
9. **No `customer_id` validation against the resolved agency.** A caller with a
   valid access token can pass any `customer_id` — the function will still try to
   sync as long as a matching `client_platform_accounts` row exists. Agency
   isolation is enforced by the credential lookup, not by an explicit check.

---

## 10. Quick reference — invocation recipes

**List customers under an agency's MCC** (run once after OAuth):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/gads-full-sync" \
  -H "Authorization: Bearer $ANON_OR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "list_only": true, "agency_id": "<agency-uuid>" }'
```

**Daily sync (last 3 days)** for one customer:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/gads-full-sync" \
  -H "Authorization: Bearer $ANON_OR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "customer_id": "1234567890", "mode": "daily", "days_back": 3 }'
```

**Backfill a specific date range** (also pulls conversion-action metadata):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/gads-full-sync" \
  -H "Authorization: Bearer $ANON_OR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "customer_id": "1234567890",
        "mode": "backfill",
        "date_from": "2026-05-01",
        "date_to":   "2026-05-07"
      }'
```

---

## 11. Where to look next

- **Source**: `supabase/functions/gads-full-sync/index.ts`
- **Frontend caller**: `src/utils/syncHelper.js` → `syncGadsWithChunking`
- **OAuth handshake / list-only call**: `src/pages/OAuthCallback.jsx`
- **Schema + helpers**: `supabase/migrations/00000000000000_full_schema.sql`
  (search for `gads_`, `cleanup_orphaned_gads_data`, `gads_metrics_sync_all`,
  `gads_status_sync_all`).
- **Sister status/geo edge function**: `gads-status-geo` (not in this doc).

If you upgrade the Google Ads API version, change `VER` and re-test each
section's GAQL — field names occasionally change between versions.
