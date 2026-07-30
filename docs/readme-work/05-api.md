# Agency Dashboard — API Reference

> Custom HTTP APIs in this repository are **Supabase Edge Functions** only.  
> There are **no** Next.js / Express / `pages/api` / App Router route handlers.  
> Does not modify the root `README.md`.

---

## Base URL

```text
{SUPABASE_URL}/functions/v1/{function-name}
```

Example:

```text
https://<project-ref>.supabase.co/functions/v1/oauth-connect
```

`SUPABASE_URL` is the same project URL used as `VITE_SUPABASE_URL` in the frontend.

---

## Middleware & cross-cutting behavior

This stack has **no application middleware.ts**. Behavior shared across functions:

### CORS (most functions)

| Header | Value |
|---|---|
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Headers` | `authorization, x-client-info, apikey, content-type` |
| `Access-Control-Allow-Methods` | `POST, OPTIONS` |

- **OPTIONS** → usually `200` with body `ok` (plain text).  
- **`ga4-realtime-users`** / **`marketing-report-realtime`**: OPTIONS → `204` empty; may include `Access-Control-Max-Age: 86400`.  
- **`gads-status-geo`** / **`gads-geo-resolve`**: **no CORS headers** and **no OPTIONS handler** in code.

### Authentication layers

1. **Supabase Edge gateway** — Callers (and `supabase.functions.invoke`) normally send:
   - `Authorization: Bearer <jwt>` (user access token or anon key)
   - `apikey: <anon_or_service_key>`  
   Gateway JWT verification is project-configured (not overridden in this repo’s `config.toml`).
2. **Function-level auth** (documented per route):
   - **User JWT validated** via `auth.getUser(token)` (+ often admin/profile checks)
   - **No in-function user check** — uses service role internally; suitable for cron / trusted callers holding a valid gateway JWT

### Content types

| Pattern | Functions |
|---|---|
| JSON in / JSON out | OAuth connectors, most `*-sync`, reports, Drive |
| JSON in / **text/plain** log out | `gads-full-sync` (sync path), `gads-status-geo`, `gads-geo-resolve`, `fb-full-sync` |
| JSON in / JSON out (`list_only`) | `gads-full-sync` when `list_only: true` |

### Not documented as custom APIs

| Surface | Notes |
|---|---|
| **PostgREST** `/rest/v1/{table}` | Auto-generated from Postgres; used heavily by the SPA. Not custom route code. |
| **SPA paths** (`/login`, `/admin`, …) | Frontend routes, not HTTP APIs. |
| **Frontend-only fields** | e.g. `syncHelper.js` may send `sync_only` / `skip_search_terms` / GHL `date_from`—**ignored** if the Edge Function does not read them (noted where relevant). |

---

## API groups

1. [Platform OAuth — connect / disconnect](#1-platform-oauth--connect--disconnect)  
2. [Google Ads sync & geo](#2-google-ads-sync--geo)  
3. [Other platform sync](#3-other-platform-sync)  
4. [Analytics & marketing reports](#4-analytics--marketing-reports)  
5. [Utilities](#5-utilities)

---

## 1. Platform OAuth — connect / disconnect

Shared pattern: **POST** JSON with `action`, plus `Authorization: Bearer <user_access_token>`.

---

### `oauth-connect` — Google Ads OAuth

| | |
|---|---|
| **Method** | `POST` (also `OPTIONS`) |
| **Route** | `/functions/v1/oauth-connect` |
| **Purpose** | Obtain Google Ads OAuth URL, exchange code for refresh token, or disconnect agency credentials |
| **Authentication** | Bearer user JWT → `getUser`. Requires `user_profiles` and **admin** (`is_super_admin` or role `admin` / `super_admin`) |

#### Request parameters

None (path/query). All input in JSON body.

#### Request body (common)

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string | Yes | `get_auth_url` \| `exchange_code` \| `disconnect` |
| `agency_id` | uuid | No | Defaults to caller’s `profile.agency_id` |
| `platform` | string | No | Default `google_ads` |

##### `action = "get_auth_url"`

| Field | Required | Description |
|---|---|---|
| `redirect_uri` | Yes | Must match Google Cloud OAuth client |

##### `action = "exchange_code"`

| Field | Required | Description |
|---|---|---|
| `code` | Yes | Authorization code |
| `redirect_uri` | Yes | Same as authorize step |
| `mcc_id` | No | Stored as `platform_mcc_id` |

##### `action = "disconnect"`

Uses agency (and platform) to deactivate credentials.

#### Response

**Success `get_auth_url` (200)**

```json
{ "success": true, "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

**Success `exchange_code` / `disconnect` (200)**

```json
{ "success": true }
```

#### Error responses

| Status | Example body |
|---|---|
| 401 | `{ "error": "Not authenticated" }` |
| 403 | `{ "error": "User profile not found" }` / `{ "error": "Admin privileges required to manage connections." }` |
| 400 | `{ "error": "No agency associated with user." }` / `{ "error": "redirect_uri is required" }` / `{ "error": "code and redirect_uri are required" }` |
| 500 | `{ "error": "OAuth client credentials not configured on the server." }` / save/disconnect failures |

#### Example request

```http
POST /functions/v1/oauth-connect HTTP/1.1
Authorization: Bearer <USER_ACCESS_TOKEN>
apikey: <ANON_KEY>
Content-Type: application/json

{
  "action": "get_auth_url",
  "redirect_uri": "https://new-agency-dashboard.vercel.app/oauth/callback",
  "agency_id": "11111111-2222-3333-4444-555555555555"
}
```

#### Example response

```json
{
  "success": true,
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=..."
}
```

---

### `ga4-oauth-connect` — GA4 / Google Analytics OAuth

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/ga4-oauth-connect` |
| **Purpose** | Connect/list/disconnect GA4 Google OAuth credentials for an agency |
| **Authentication** | Bearer user JWT; **admin-only** (same rule as Google Ads connect) |

#### Request body

| Field | Required | Description |
|---|---|---|
| `action` | Yes | `get_auth_url` \| `exchange_code` \| `disconnect` \| `list_credentials` |
| `agency_id` | No | Defaults to profile agency |
| `redirect_uri` | For auth/exchange | OAuth redirect |
| `code` | For exchange | Auth code |
| `credential_id` | No | Target credential (reconnect/disconnect); may also arrive via `state` |
| `state` | No | May encode `credential_id` |

#### Response

**`get_auth_url`:** `{ "success": true, "auth_url": "..." }`  

**`exchange_code`:**

```json
{
  "success": true,
  "credential_id": "uuid",
  "google_email": "user@example.com",
  "credential_label": "..."
}
```

**`list_credentials`:**

```json
{
  "success": true,
  "credentials": [
    {
      "id": "uuid",
      "credential_label": "...",
      "google_email": "...",
      "is_active": true,
      "connected_at": "...",
      "last_sync_at": null
    }
  ]
}
```

**`disconnect`:** `{ "success": true }`

#### Error responses

401 Not authenticated; 403 profile/admin; 400 missing agency/redirect/code; 500 GA4 client credentials not configured / DB errors.

#### Example request

```json
{
  "action": "list_credentials",
  "agency_id": "11111111-2222-3333-4444-555555555555"
}
```

#### Example response

```json
{ "success": true, "credentials": [] }
```

---

### `fb-oauth-connect` — Meta / Facebook OAuth

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/fb-oauth-connect` |
| **Purpose** | Meta Login → long-lived token storage for Marketing API sync |
| **Authentication** | Bearer user JWT; **admin-only** |

#### Request body

| Field | Required | Description |
|---|---|---|
| `action` | Yes | `get_auth_url` \| `exchange_code` \| `disconnect` |
| `agency_id` | No | |
| `redirect_uri` | Auth/exchange | |
| `code` | Exchange | |

#### Response

- `get_auth_url`: `{ "success": true, "auth_url": "...", "url": "..." }` (both set)  
- `exchange_code` / `disconnect`: `{ "success": true }`

#### Error responses

401/403 admin checks; 400 missing fields / Facebook exchange failures; 500 `FB_APP_ID and FB_APP_SECRET must be set for Meta OAuth.`

#### Example request

```json
{
  "action": "exchange_code",
  "code": "<AUTH_CODE>",
  "redirect_uri": "https://example.com/oauth/callback"
}
```

#### Example response

```json
{ "success": true }
```

---

### `reddit-oauth-connect` — Reddit Ads OAuth

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/reddit-oauth-connect` |
| **Purpose** | Reddit Ads OAuth connect, status, disconnect; returns discovered accounts on exchange |
| **Authentication** | Bearer user JWT → `getUser` (**not** admin-gated in function code); requires profile + agency |

#### Request body

| Field | Required | Description |
|---|---|---|
| `action` | Yes | `get_auth_url` \| `exchange_code` \| `connection_status` \| `disconnect` |
| `agency_id` | No | |
| `code` | For exchange | |
| `redirect_uri` | Optional | Else env / Origin / referer / hardcoded Vercel fallback |
| `state` | Optional | May carry redirect |

#### Response

**`get_auth_url`:** `{ "url": "...", "redirect_uri": "..." }`  

**`exchange_code`:**

```json
{
  "success": true,
  "accounts": [{ "id": "...", "name": "..." }],
  "message": "Found N account(s)"
}
```

**`connection_status`:** `{ "connected": true, "connected_at": "..." }`  

**`disconnect`:** `{ "success": true, "message": "Disconnected" }`

#### Error responses

| Status | Example |
|---|---|
| 401 | `{ "error": "Unauthorized", "detail": "..." }` |
| 404 | `{ "error": "User profile not found", "user_id": "...", "detail": "..." }` |
| 400 | Missing code / token exchange failed / no agency |
| 500 | Reddit credentials not configured / internal error |

#### Example request

```json
{ "action": "connection_status" }
```

#### Example response

```json
{ "connected": false, "connected_at": null }
```

---

### `tiktok-oauth-connect` — TikTok Marketing OAuth

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/tiktok-oauth-connect` |
| **Purpose** | TikTok OAuth URL, exchange `auth_code`/`code`, disconnect |
| **Authentication** | Bearer user JWT; profile + agency required (**not** admin-gated in code) |

#### Request body

| Field | Required | Description |
|---|---|---|
| `action` | Yes | `get_auth_url` \| `exchange_code` \| `disconnect` |
| `agency_id` | No | |
| `redirect_uri` | Optional | |
| `auth_code` or `code` | For exchange | |

#### Response

- `get_auth_url`: `{ "url": "..." }`  
- `exchange_code`: `{ "success": true, "accounts": [...], "message": "...", "token_kind": "refresh"|"access_only", "token_note": "..." }`  
- `disconnect`: `{ "success": true, "message": "Disconnected" }`

#### Error responses

401 Unauthorized; 404 profile; 400 missing code / token response issues; 500 TikTok app credentials not configured.

#### Example request

```json
{
  "action": "exchange_code",
  "auth_code": "<TIKTOK_AUTH_CODE>"
}
```

#### Example response

```json
{
  "success": true,
  "accounts": [],
  "message": "Found 0 account(s)",
  "token_kind": "refresh"
}
```

---

### `bing-oauth-connect` — Microsoft Advertising OAuth

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/bing-oauth-connect` |
| **Purpose** | Microsoft identity OAuth + Bing account discovery |
| **Authentication** | Bearer user JWT; profile + agency (**not** admin-gated in code) |

#### Request body

| Field | Required | Description |
|---|---|---|
| `action` | Yes | `get_auth_url` \| `exchange_code` \| `disconnect` |
| `agency_id` | No | |
| `redirect_uri` | Required for exchange | |
| `code` or `auth_code` | For exchange | |

#### Response

- `get_auth_url`: `{ "url": "...", "auth_url": "..." }`  
- `exchange_code`: `{ "success": true, "accounts": [...], "message": "..." }`  
- `disconnect`: `{ "success": true, "message": "Disconnected" }`

#### Error responses

401/404/400 (missing code/redirect_uri, token failures); 500 Bing app credentials not configured.

#### Example request

```json
{
  "action": "get_auth_url",
  "redirect_uri": "https://example.com/oauth/callback"
}
```

#### Example response

```json
{
  "url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?...",
  "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?..."
}
```

---

## 2. Google Ads sync & geo

---

### `gads-full-sync` — Google Ads metrics sync / MCC list

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/gads-full-sync` |
| **Purpose** | Pull Google Ads metrics into `gads_*` tables, or list MCC child customers (`list_only`) |
| **Authentication** | No in-function `getUser`; uses service role. Callers typically still send a gateway JWT (user or anon). |

#### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `customer_id` | string | Yes for sync | Google Ads CID (dashes stripped) |
| `mode` | string | No | `daily` (default) or `backfill` |
| `days_back` | number | No | Default `3` for daily window |
| `date_from` / `date_to` | string (YYYY-MM-DD) | For backfill | Inclusive window |
| `list_only` | boolean | No | If true, list non-manager customers under MCC |
| `agency_id` | uuid | **Required when `list_only`** | Credential lookup |

**Note:** Frontend may send `skip_search_terms` or `sync_only`; **current function code does not read these fields** (see `KTdoc.md`).

#### Response

**Sync success (200)** — `Content-Type: text/plain` newline log, ending with `=== DONE === Total: N`.

**`list_only` success (200)** — JSON:

```json
{
  "customers": [
    {
      "customer_id": "1234567890",
      "descriptive_name": "Account Name",
      "currency_code": "USD",
      "time_zone": "America/New_York",
      "is_manager": false,
      "status": "...",
      "synced_at": "..."
    }
  ]
}
```

#### Error responses

| Status | Body |
|---|---|
| 400 | text/plain log including `ERROR: customer_id required` / no CPA / no credential / OAuth failed / `agency_id required for list_only` |
| 500 | text/plain log with `FATAL: ...` |

#### Example request (sync)

```http
POST /functions/v1/gads-full-sync HTTP/1.1
Authorization: Bearer <USER_OR_ANON_JWT>
apikey: <ANON_KEY>
Content-Type: application/json

{
  "customer_id": "123-456-7890",
  "mode": "backfill",
  "date_from": "2026-01-01",
  "date_to": "2026-01-07",
  "agency_id": "11111111-2222-3333-4444-555555555555"
}
```

#### Example response (sync)

```text
=== GADS FULL SYNC ===
Mode: backfill | listOnly: false
Credential found via agency. MCC: ... | use_mcc: true
Token OK
...
=== DONE === Total: 1234
```

---

### `gads-status-geo` — Status entities & geo metrics

| | |
|---|---|
| **Method** | `POST` (no OPTIONS/CORS in code) |
| **Route** | `/functions/v1/gads-status-geo` |
| **Purpose** | Sync campaign/ad group/keyword status and/or geo daily performance |
| **Authentication** | No in-function user auth; service role + `get_platform_credential` RPC |

#### Request body

| Field | Required | Description |
|---|---|---|
| `customer_id` | Yes | Dashes stripped |
| `sync_type` | No | Default `all` |
| `date_from` / `date_to` | No | Used for geo; code defaults apply if omitted |

**`sync_type` values**

| Value | Behavior |
|---|---|
| `all` | Campaigns + ad groups + keywords status + geo |
| `status` | All three status syncs |
| `campaigns` / `adgroups` / `keywords` | Single status type |
| `geo` | Geo daily only |

#### Response

**Success (200):** `text/plain` log ending with `=== DONE ===`.

#### Error responses

| Status | Body |
|---|---|
| 400 | `missing customer_id` or text log `ERROR: No credential...` |
| 500 | text log + `FATAL: ...` |

#### Example request

```json
{
  "customer_id": "1234567890",
  "sync_type": "geo",
  "date_from": "2026-01-01",
  "date_to": "2026-01-31"
}
```

#### Example response

```text
=== STATUS-GEO  customer=1234567890  type=geo ===
Token OK
...
=== DONE ===
```

---

### `gads-geo-resolve` — Resolve geo constant names

| | |
|---|---|
| **Method** | `POST` (no OPTIONS/CORS; **body unused**) |
| **Route** | `/functions/v1/gads-geo-resolve` |
| **Purpose** | Resolve missing geo IDs into `gads_geo_constants` via Google Ads API |
| **Authentication** | No in-function user auth |

#### Request parameters / body

None required. Typically `{}`. Uses first active Google Ads credential and RPC `get_missing_geo_ids`.

#### Response

**Success (200):** text/plain log (`Nothing to resolve` or `Total resolved: N`).

#### Error responses

400 — no credential / OAuth failed (text log); 500 — `FATAL: ...`.

#### Example request

```json
{}
```

#### Example response

```text
Nothing to resolve
```

---

## 3. Other platform sync

---

### `fb-full-sync` — Meta Ads metrics

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/fb-full-sync` |
| **Purpose** | Sync Meta campaign/ad set/ad/placement daily metrics |
| **Authentication** | No in-function user auth |

#### Request body

| Field | Required | Description |
|---|---|---|
| `customer_id` | Yes | Meta ad account id |
| `mode` | No | `daily` (default) or `backfill` |
| `days_back` | No | Default `5` |
| `date_from` / `date_to` | Backfill | |

#### Response

**Success (200):** `text/plain` log `=== DONE === Total: N`.

#### Error responses

400 text log (missing customer / account / credential); 401 token failures; 500 FATAL / exchange failures.

#### Example request

```json
{
  "customer_id": "act_123456789",
  "mode": "daily",
  "days_back": 5
}
```

#### Example response

```text
=== FB FULL SYNC ===
Mode: daily | customer: act_123456789
...
=== DONE === Total: 420
```

---

### `reddit-full-sync`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/reddit-full-sync` |
| **Purpose** | Sync Reddit Ads metrics into `reddit_*` tables |
| **Authentication** | No in-function user auth |

#### Request body

| Field | Required | Description |
|---|---|---|
| `customer_id` | Yes | |
| `mode` | No | `daily` / `backfill` |
| `days_back` | No | Default `5` |
| `date_from` / `date_to` | Backfill | |

#### Response

**Success (200):**

```json
{ "success": true, "total_rows": 100, "log": ["..."] }
```

#### Error responses

400 — `customer_id required` / no account / no credential / token refresh failed; 500 — `{ "success": false, "error": "...", "log": [...] }`.

#### Example request

```json
{
  "customer_id": "t2_example",
  "mode": "backfill",
  "date_from": "2026-01-01",
  "date_to": "2026-01-07"
}
```

#### Example response

```json
{ "success": true, "total_rows": 56, "log": ["=== REDDIT FULL SYNC ==="] }
```

---

### `tiktok-full-sync`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/tiktok-full-sync` |
| **Purpose** | Sync TikTok campaign/placement daily metrics |
| **Authentication** | No in-function user auth |

#### Request body

Same shape as Reddit: `customer_id` (required), `mode`, `days_back`, `date_from`, `date_to`.

#### Response

**Success:** `{ "success": true, "total_rows": N, "log": [...] }`

#### Error responses

400 — missing account/credential/token; 500 — TikTok env not configured / `{ "success": false, "error": "...", "log": [...] }`.

#### Example request

```json
{ "customer_id": "7123456789012345678", "mode": "daily" }
```

#### Example response

```json
{ "success": true, "total_rows": 88, "log": [] }
```

---

### `bing-full-sync`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/bing-full-sync` |
| **Purpose** | Microsoft Advertising Reporting API → `bing_*` tables |
| **Authentication** | No in-function user auth |

#### Request body

| Field | Required | Description |
|---|---|---|
| `customer_id` | Yes | Advertiser account id |
| `mode` | No | `daily` / `backfill` |
| `days_back` | No | |
| `date_from` / `date_to` | Backfill | Explicit dates apply when `mode = backfill` |
| `debug` | No | Extra logging |

#### Response

**Success:**

```json
{
  "success": true,
  "total_rows": 200,
  "breakdown": { },
  "log": ["..."]
}
```

#### Error responses

400 — no account/credential/token; 500 — env not configured / internal error.

#### Example request

```json
{
  "customer_id": "254866687",
  "mode": "backfill",
  "date_from": "2026-01-01",
  "date_to": "2026-01-07"
}
```

#### Example response

```json
{ "success": true, "total_rows": 150, "breakdown": {}, "log": [] }
```

---

### `ga4-sync`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/ga4-sync` |
| **Purpose** | Sync GA4 data into `ga4_*` tables |
| **Authentication** | No in-function user auth |

#### Request body

| Field | Required | Description |
|---|---|---|
| `customer_id` | Yes | GA4 property id |
| `mode` | No | `daily` (default) or `backfill` |
| `days_back` | No | Default `5` (through yesterday) when not backfill |
| `date_from` / `date_to` | Backfill | |

#### Response

**Success (200):**

```json
{
  "success": true,
  "summary_rows": 10,
  "page_rows": 100,
  "event_rows": 20,
  "log": ["..."]
}
```

#### Error responses

400 — customer/account/credential/OAuth failures; 500 — `{ "error": "...", "log": [...] }`.

#### Example request

```json
{ "customer_id": "123456789", "mode": "daily", "days_back": 5 }
```

#### Example response

```json
{
  "success": true,
  "summary_rows": 12,
  "page_rows": 340,
  "event_rows": 45,
  "log": []
}
```

---

### `ghl-sync`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/ghl-sync` |
| **Purpose** | Sync GoHighLevel contacts, calls, forms, activity aggregates |
| **Authentication** | No in-function user auth |

#### Request body

| Field | Required | Description |
|---|---|---|
| `customer_id` | Yes | GHL location id |
| `mode` | No | Default `full` — **logged only; not branched in code** |

**Note:** Frontend chunking may send `date_from` / `date_to` / `all_time`; **current function does not read those fields**.

#### Response

**Success:**

```json
{
  "success": true,
  "total_contacts": 100,
  "total_calls": 40,
  "total_forms": 25,
  "activity_rows": 10,
  "leads_daily_rows": 10,
  "log": ["..."]
}
```

**HIPAA skip (still 200):**

```json
{
  "success": true,
  "skipped": true,
  "reason": "HIPAA compliant account – data must be uploaded via CSV, not synced via API.",
  "location_id": "...",
  "log": ["..."]
}
```

#### Error responses

400 — `customer_id required` / `No API key`; 404 — `GHL account not found`; 500 — `{ "error": "...", "log": [...] }`.

#### Example request

```json
{ "customer_id": "loc_abc123", "mode": "full" }
```

#### Example response

```json
{
  "success": true,
  "total_contacts": 50,
  "total_calls": 12,
  "total_forms": 8,
  "activity_rows": 5,
  "leads_daily_rows": 5,
  "log": []
}
```

---

### `hoot-inventory-sync`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/hoot-inventory-sync` |
| **Purpose** | Fetch dealer inventory feeds into `hoot_inventory` |
| **Authentication** | No in-function user auth |

#### Request body

| Field | Required | Description |
|---|---|---|
| `client_id` | No | If set, sync that client’s feeds only; else all active feeds |

#### Response

**No feeds:** `{ "success": true, "message": "No feeds", "log": [...] }`  

**Done:**

```json
{
  "success": true,
  "total_upserted": 100,
  "total_errors": 0,
  "feeds_processed": 2,
  "log": ["..."]
}
```

#### Error responses

500 — `{ "error": "...", "log": [...] }`.

#### Example request

```json
{ "client_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }
```

#### Example response

```json
{
  "success": true,
  "total_upserted": 42,
  "total_errors": 0,
  "feeds_processed": 1,
  "log": []
}
```

---

## 4. Analytics & marketing reports

---

### `ga4-realtime-users`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` (`204`) |
| **Route** | `/functions/v1/ga4-realtime-users` |
| **Purpose** | Live GA4 Reporting API pull for slide/report windows (current + optional compare) |
| **Authentication** | No in-function user auth |

#### Request body

| Field | Required | Description |
|---|---|---|
| `customer_id` | Yes | GA4 property |
| `date_from` / `date_to` | Yes | |
| `compare_date_from` / `compare_date_to` | No | Prior period |
| `breakdown` | No | Default `none` |

**`breakdown`:** `none` \| `channel` \| `source_medium` \| `campaign` \| `daily` \| `daily_channel` \| `page` \| `device` \| `event` \| `geo`

#### Response

**Success (200):**

```json
{
  "success": true,
  "customer_id": "123456789",
  "date_from": "2026-01-01",
  "date_to": "2026-01-31",
  "compare_date_from": "",
  "compare_date_to": "",
  "breakdown": "none",
  "current": [{ "total_users": 100, "sessions": 120 }],
  "previous": [],
  "row_count": { "current": 1, "previous": 0 }
}
```

#### Error responses

400 — missing fields / no credential; 404 — no GA4 account; 500 — OAuth / GA4 API errors.

#### Example request

```json
{
  "customer_id": "123456789",
  "date_from": "2026-01-01",
  "date_to": "2026-01-31",
  "breakdown": "channel"
}
```

#### Example response

```json
{
  "success": true,
  "customer_id": "123456789",
  "date_from": "2026-01-01",
  "date_to": "2026-01-31",
  "breakdown": "channel",
  "current": [{ "channel_group": "Organic Search", "sessions": 50 }],
  "previous": [],
  "row_count": { "current": 1, "previous": 0 }
}
```

---

### `marketing-report-realtime` — SEO / marketing report V2

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` (`204`) |
| **Route** | `/functions/v1/marketing-report-realtime` |
| **Purpose** | Assemble GA4 + GSC + GBP payloads for monthly SEO slides |
| **Authentication** | No in-function user auth (Bearer may be sent by client; unused by handler) |

#### Request body

| Field | Required | Description |
|---|---|---|
| `date_from` / `date_to` | Yes | |
| `client_id` | Yes unless `customer_id` | Resolves GA4/GSC/GBP from `client_platform_accounts` |
| `customer_id` | Optional | GA4 property override / legacy |
| `compare_date_from` / `compare_date_to` | No | |
| `services` | No | Default `["ga4","gsc","gbp"]` |
| `gsc_site_url` | No | Override Search Console site URL |

#### Response

**Success (200)** — top-level:

```json
{
  "success": true,
  "client_id": "uuid",
  "customer_id": "123456789",
  "date_from": "2026-01-01",
  "date_to": "2026-01-31",
  "compare_date_from": "",
  "compare_date_to": "",
  "ga4": {
    "all_channels": { "current": [], "previous": [] },
    "organic_summary": { "current": {}, "previous": {} },
    "landing_pages": { "current": [], "previous": [] },
    "cities": { "current": [], "previous": [] }
  },
  "gsc": {
    "summary": {},
    "queries": [],
    "pages": [],
    "source": "api"
  },
  "gbp": {
    "report_month": "2026-01",
    "summary": {},
    "locations": [],
    "source": "gbp_performance"
  },
  "log": ["=== MARKETING REPORT REALTIME V2 ==="]
}
```

Per-service failures may appear as nested `{ "error": "..." }` while HTTP status remains 200.

#### Error responses

| Status | Example |
|---|---|
| 400 | `{ "error": "date_from, date_to required" }` / `{ "error": "client_id or customer_id required" }` / `{ "error": "No credential found" }` |
| 404 | `{ "error": "No platform accounts found for client ..." }` |
| 500 | `{ "error": "OAuth failed", "detail": ... }` / `{ "error": "...", "log": [...] }` |

#### Example request

```json
{
  "client_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "date_from": "2026-01-01",
  "date_to": "2026-01-31",
  "services": ["ga4", "gsc", "gbp"]
}
```

#### Example response

```json
{
  "success": true,
  "client_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "customer_id": "123456789",
  "date_from": "2026-01-01",
  "date_to": "2026-01-31",
  "ga4": { "all_channels": { "current": [], "previous": [] } },
  "gsc": { "source": "api" },
  "gbp": { "source": "gbp_performance" },
  "log": []
}
```

---

## 5. Utilities

---

### `google-drive-upload`

| | |
|---|---|
| **Method** | `POST` / `OPTIONS` |
| **Route** | `/functions/v1/google-drive-upload` |
| **Purpose** | Upload a base64 file to Google Drive (optionally convert to Slides) using a stored GA4/Google refresh token |
| **Authentication** | Bearer user JWT → `getUser` (**not** admin-gated) |

#### Request body

| Field | Required | Description |
|---|---|---|
| `file_name` | Yes | Destination filename |
| `file_base64` | Yes | File contents |
| `agency_id` | No | Resolve credential |
| `client_id` | No | Resolve via GA4 CPA |
| `folder_id` | No | Else env `GOOGLE_DRIVE_REPORTS_FOLDER_ID` |
| `convert_to_slides` | No | Default `true` |

#### Response

**Success (200):**

```json
{
  "success": true,
  "file_id": "...",
  "file_name": "Report.pptx",
  "web_view_link": "https://drive.google.com/...",
  "mime_type": "...",
  "folder_id": "..."
}
```

#### Error responses

401 Not authenticated; 400 missing file fields / no GA4 credential / missing refresh token; 500 Google OAuth not configured / Drive upload failed.

#### Example request

```json
{
  "file_name": "Monthly-Report.pptx",
  "file_base64": "<BASE64>",
  "agency_id": "11111111-2222-3333-4444-555555555555",
  "convert_to_slides": true
}
```

#### Example response

```json
{
  "success": true,
  "file_id": "1abc...",
  "file_name": "Monthly-Report.pptx",
  "web_view_link": "https://drive.google.com/file/d/1abc.../view",
  "mime_type": "application/vnd.google-apps.presentation",
  "folder_id": "0Bxyz..."
}
```

---

## Endpoint index

| Method | Route | Group | Auth (in-function) |
|---|---|---|---|
| POST | `/functions/v1/oauth-connect` | OAuth | User JWT + admin |
| POST | `/functions/v1/ga4-oauth-connect` | OAuth | User JWT + admin |
| POST | `/functions/v1/fb-oauth-connect` | OAuth | User JWT + admin |
| POST | `/functions/v1/reddit-oauth-connect` | OAuth | User JWT |
| POST | `/functions/v1/tiktok-oauth-connect` | OAuth | User JWT |
| POST | `/functions/v1/bing-oauth-connect` | OAuth | User JWT |
| POST | `/functions/v1/gads-full-sync` | Google Ads | Service (no getUser) |
| POST | `/functions/v1/gads-status-geo` | Google Ads | Service |
| POST | `/functions/v1/gads-geo-resolve` | Google Ads | Service |
| POST | `/functions/v1/fb-full-sync` | Sync | Service |
| POST | `/functions/v1/reddit-full-sync` | Sync | Service |
| POST | `/functions/v1/tiktok-full-sync` | Sync | Service |
| POST | `/functions/v1/bing-full-sync` | Sync | Service |
| POST | `/functions/v1/ga4-sync` | Sync | Service |
| POST | `/functions/v1/ghl-sync` | Sync | Service |
| POST | `/functions/v1/hoot-inventory-sync` | Sync | Service |
| POST | `/functions/v1/ga4-realtime-users` | Reports | Service |
| POST | `/functions/v1/marketing-report-realtime` | Reports | Service |
| POST | `/functions/v1/google-drive-upload` | Utility | User JWT |

**Total custom Edge Function routes documented: 19.**

---

*End of API draft.*
