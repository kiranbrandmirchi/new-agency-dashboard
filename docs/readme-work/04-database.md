# Agency Dashboard — Database

> Documentation of Supabase / Postgres artifacts found in this repository.  
> Primary sources: `supabase/full_schema.sql`, `schema.sql`, `supabase/migrations/`, `supabase/config.toml`, `supabase/Cron-jobs.json`, and application usage under `src/` / `supabase/functions/`.  
> Does not modify the root `README.md`.

---

## Sources & caveats

| Artifact | Role |
|---|---|
| `supabase/full_schema.sql` | Newest large dump (~247KB); includes Bing/TikTok/Hoot tables |
| `schema.sql` | Older/alternate dump (~211KB); includes `ga4_classified_pages` / `ga4_page_rules` CREATE TABLE |
| `supabase/migrations/` | 21 files; **16 are empty (0 bytes)**; 5 contain real SQL |
| `supabase/config.toml` | Local CLI config (`project_id = "New_Agency_Dashboard"`, Postgres **17**) |
| Live Supabase | May include objects not fully captured in dumps (e.g. `gbp_performance`, Storage bucket policies, `auth.users` trigger wiring) |

**Do not treat either dump as a perfect live mirror.** Prefer migrations + live Studio for truth when they disagree. Application code also references objects that appear only in one dump or only in a policy migration.

---

## Database architecture

### Role in the system

Postgres (via Supabase) is the **system of record** for:

1. **Tenancy & identity** — agencies, users, roles, permissions, client↔platform account maps  
2. **Integration credentials** — OAuth tokens / MCC IDs per agency+platform  
3. **Synced metrics** — daily/status fact tables for ads, GA4, GHL, SEO/local, inventory  
4. **Reporting artifacts** — monthly report documents and related child rows  
5. **Ops** — `sync_log`, SQL sync-all drivers that HTTP-call Edge Functions (`pg_net` + Vault)

The Vite/React SPA talks to Postgres through **PostgREST** (`supabase-js` and paginated REST helpers). **Edge Functions** use the **service role** for upserts during sync. **Cron** (`pg_cron`) invokes SQL functions that orchestrate Edge calls.

### Logical layers

```text
┌─────────────────────────────────────────────────────────────┐
│  Identity & tenancy                                         │
│  agencies · user_profiles · roles · permissions ·           │
│  role_permissions · user_clients · clients ·                │
│  client_platform_accounts · agency_platform_credentials ·   │
│  agency_report_tabs                                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ platform_customer_id / location_id
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Platform fact / registry tables                            │
│  gads_* · fb_* · bing_* · tiktok_* · reddit_* · ga4_* ·     │
│  ghl_* · gsc_* · gmb_* · hoot_* · sync_log                  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│  Reporting domain                                           │
│  monthly_reports + accounts / sections / uploads            │
└─────────────────────────────────────────────────────────────┘
```

### Extensions (from `full_schema.sql`)

| Extension | Purpose in this project |
|---|---|
| `pg_cron` | Scheduled sync jobs |
| `pg_net` | HTTP POST from SQL to Edge Functions |
| `pgsodium` | Crypto primitives (Supabase default stack) |
| `pg_graphql` | GraphQL schema support (local/default; app uses REST, not GraphQL client) |

Vault secrets referenced by sync-all functions: `project_url`, `anon_key` (names only—values live in Supabase Vault).

---

## ER-style relationship explanations

### Core tenancy graph

```text
agencies 1───* user_profiles
    │              │
    │              ├──► roles 1───* role_permissions *───1 permissions
    │              │
    │              └───* user_clients *───► client_platform_accounts
    │                                              │
    ├───* clients 1───────────────────────────────┘ (optional client_id)
    │         │
    │         └───* monthly_reports
    │
    ├───* agency_platform_credentials 1───* client_platform_accounts (credential_id)
    │
    └───* agency_report_tabs
         sync_log
```

**Meaning**

- An **agency** is the white-label tenant (branding + ownership boundary).  
- A **user_profile** is 1:1 with `auth.users.id`, belongs to one agency (nullable until assigned), has one **role**, optional **super admin** flag.  
- **clients** group multiple **client_platform_accounts** (Google Ads CID, Meta ad account, GHL location, GA4 property, etc.) for reporting and access assignment.  
- **user_clients.client_id** FKs to **`client_platform_accounts.id`** (not `clients.id`)—naming is historical; AuthContext expands siblings that share the same `client_platform_accounts.client_id` group.  
- **agency_platform_credentials** hold OAuth refresh/access tokens used by Edge sync for that agency+platform (and optional MCC / Google email).

### Metrics linkage (logical, often no FK)

Most `*_daily` / status tables key on **`customer_id` text** matching `client_platform_accounts.platform_customer_id` (dashes normalized in app + `can_access_customer`). There is typically **no foreign key** from fact tables to `client_platform_accounts`, so cleanup is handled by `cleanup_orphaned_*` functions rather than cascading deletes.

```text
client_platform_accounts.platform_customer_id
        │
        │  (logical match on customer_id / location_id)
        ▼
gads_*_daily / fb_* / bing_* / tiktok_* / reddit_* / ga4_* / ghl_*
```

### Monthly report subgraph

```text
clients 1───* monthly_reports *───1 agencies
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
 monthly_report_  monthly_report_  monthly_report_
 accounts         sections         uploads
        │                               │
        └──► client_platform_accounts ◄─┘ (optional on uploads)
```

### GHL attribution views

```text
ghl_calls  ──LEFT JOIN──► ghl_contacts  ⇒  ghl_calls_view
ghl_form_submissions ──LEFT JOIN──► ghl_contacts  ⇒  ghl_form_submissions_view
ghl_contacts  ⇒  ghl_contacts_view
```

Views derive `clean_source`, `clean_medium`, `clean_lead_type` from contact `raw_data.attributionSource` (gclid/fbclid/sessionSource) with fallbacks to row source/medium.

---

## Tables

Grouped by domain. Column lists for large fact tables are summarized; see dumps for full DDL.

### Identity & access

| Table | Purpose | Notable columns |
|---|---|---|
| `agencies` | Tenant + white-label branding | `agency_name`, `agency_slug`, `client_code`, colors, `logo_url`, `font_family`, `is_active` |
| `user_profiles` | App user linked to Auth | `id` (= auth user), `email`, `full_name`, `role_id`, `agency_id`, `is_super_admin` |
| `roles` | Named roles | `role_name`, `description` |
| `permissions` | Permission catalog | `permission_key`, `permission_label`, `category` |
| `role_permissions` | M:N role↔permission | `role_id`, `permission_id` |
| `user_clients` | Restricted account access | `user_id`, `client_id` → `client_platform_accounts.id` |

### Client & integration registry

| Table | Purpose | Notable columns |
|---|---|---|
| `clients` | Logical client grouping | `agency_id`, `name`, `website_platform`, `vdp_url_pattern`, `logo_url` |
| `client_platform_accounts` | Platform account registry | `platform`, `platform_customer_id`, `credential_id`, `client_id`, `hipaa_compliant`, `platform_api_key`, sync status fields, `use_mcc`, `auto_sync_enabled` |
| `agency_platform_credentials` | OAuth credentials | `platform`, `oauth_refresh_token`, `oauth_access_token`, `oauth_token_expires_at`, `platform_mcc_id`, `google_email`, sync error fields |
| `agency_report_tabs` | Per-agency report tab config | `tab_key`, `platform`, `required_permission`, `is_visible`, `config_json` |
| `sync_log` | Sync attempt history | `platform`, `customer_id`, date range, `status`, `rows_synced`, timings |

### Google Ads (`gads_*`)

| Table | Grain / role |
|---|---|
| `gads_customers` | Registry (PK `customer_id`) |
| `gads_campaign_daily` | Campaign × date metrics |
| `gads_adgroup_daily` | Ad group × date |
| `gads_keyword_daily` | Keyword × date |
| `gads_search_term_daily` | Search term × date |
| `gads_conversion_daily` | Conversion metrics |
| `gads_conversion_actions` | Conversion action metadata |
| `gads_geo_location_daily` | Geo performance |
| `gads_geo_constants` | Geo ID → name lookup (PK `geo_id`) |
| `gads_campaign_status` / `gads_adgroup_status` / `gads_keyword_status` | Entity status snapshots |

### Meta (`fb_*`)

| Table | Role |
|---|---|
| `fb_customers` | Account registry |
| `fb_campaign_daily` / `fb_adset_daily` / `fb_ad_daily` / `fb_placement_daily` | Daily metrics |

### Bing (`bing_*`)

| Table | Role |
|---|---|
| `bing_customers` | Account registry |
| `bing_campaign_daily` / `bing_ad_daily` / `bing_keyword_daily` / `bing_search_term_daily` / `bing_geo_location_daily` | Daily metrics |

### TikTok / Reddit

| Table | Role |
|---|---|
| `tiktok_campaign_daily` / `tiktok_placement_daily` | TikTok metrics |
| `reddit_customers` | Reddit account registry |
| `reddit_campaign_daily` / `reddit_placement_daily` | Reddit metrics |

*(No `tiktok_customers` CREATE in `full_schema.sql`; TikTok accounts are managed via `client_platform_accounts`.)*

### GA4

| Table | Role | Dump notes |
|---|---|---|
| `ga4_raw` | Page/session-dimensional raw rows | In both dumps |
| `ga4_daily_summary` | Session-accurate aggregates | In both |
| `ga4_events` / `ga4_reporting_events` / `ga4_monthly_reports` | Events & monthly GA4 report artifacts | In `full_schema` |
| `ga4_classified_pages` | Classified/enriched page paths (VDP attributes) | **CREATE in `schema.sql`**; referenced by functions in `full_schema` |
| `ga4_page_rules` | URL classification rules | **CREATE in `schema.sql`** |

### GHL / CRM

| Table | Role |
|---|---|
| `ghl_contacts` / `ghl_calls` / `ghl_form_submissions` | Synced CRM entities |
| `ghl_leads_daily` / `ghl_activity_daily` | Daily aggregates |
| `ghl_hipaa_calls` / `ghl_hipaa_forms` | CSV-ingested HIPAA-path data |

### SEO / local / inventory

| Table | Role | Dump notes |
|---|---|---|
| `gsc_daily_summary` | Search Console daily | In dumps |
| `gmb_locations` / `gmb_insights_daily` | Business Profile | In dumps |
| `gbp_performance` | GBP performance for monthly SEO | **Referenced by migration + app; CREATE TABLE not in dumps** |
| `client_hoot_feeds` / `hoot_inventory` | Inventory feeds & rows | In `full_schema` |

### Monthly reports

| Table | Role |
|---|---|
| `monthly_reports` | Header (`agency_id`, `client_id`, `report_month`, `status`, `published_data`, …) |
| `monthly_report_accounts` | Platforms/accounts included |
| `monthly_report_sections` | Editable sections |
| `monthly_report_uploads` | Uploaded assets metadata |

---

## Relationships (foreign keys)

Declared FKs in `full_schema.sql` (27 constraint lines). Summary:

| From | To | On delete (as declared) |
|---|---|---|
| `agency_platform_credentials.agency_id` | `agencies.id` | CASCADE |
| `agency_platform_credentials.connected_by` | `user_profiles.id` | (default) |
| `agency_report_tabs.agency_id` | `agencies.id` | CASCADE |
| `bing_customers.agency_id` | `agencies.id` | SET NULL |
| `client_hoot_feeds.client_id` | `clients.id` | CASCADE |
| `client_platform_accounts.agency_id` | `agencies.id` | CASCADE |
| `client_platform_accounts.client_id` | `clients.id` | SET NULL |
| `client_platform_accounts.credential_id` | `agency_platform_credentials.id` | (default) |
| `clients.agency_id` | `agencies.id` | CASCADE |
| `fb_customers.agency_id` / `reddit_customers.agency_id` | `agencies.id` | (default) |
| `ga4_raw.agency_id` | `agencies.id` | (default) |
| `hoot_inventory.client_id` | `clients.id` | CASCADE |
| `monthly_reports.agency_id` / `client_id` | `agencies` / `clients` | CASCADE |
| `monthly_report_accounts.report_id` / `platform_account_id` | `monthly_reports` / `client_platform_accounts` | CASCADE |
| `monthly_report_sections.report_id` | `monthly_reports` | CASCADE |
| `monthly_report_uploads.report_id` | `monthly_reports` | CASCADE |
| `monthly_report_uploads.platform_account_id` | `client_platform_accounts` | SET NULL |
| `role_permissions.role_id` / `permission_id` | `roles` / `permissions` | CASCADE |
| `sync_log.agency_id` | `agencies.id` | (default) |
| `user_clients.user_id` | `user_profiles.id` | CASCADE |
| `user_clients.client_id` | `client_platform_accounts.id` | CASCADE |
| `user_profiles.agency_id` | `agencies.id` | (default) |
| `user_profiles.role_id` | `roles.id` | (default) |

**Implicit relationship:** `user_profiles.id` aligns with `auth.users.id` (Auth). The `handle_new_user` function is written as an Auth insert trigger body; **trigger DDL is not present in the SQL dumps**.

---

## Constraints

### Primary keys

Every listed public table has a primary key (mostly surrogate `id`). Notable exceptions/composites:

| Table | Primary key |
|---|---|
| `gads_customers` | `customer_id` |
| `gads_geo_constants` | `geo_id` |
| `ghl_activity_daily` | `(location_id, report_date, activity_type, subtype)` |
| `ghl_leads_daily` | `(location_id, report_date, lead_type)` |

### Unique constraints (selected)

| Constraint | Enforces |
|---|---|
| `agencies_agency_slug_key` / `agencies_client_code_key` | Unique agency identifiers |
| `permissions_permission_key_key` / `roles_role_name_key` | Unique RBAC names |
| `role_permissions_role_id_permission_id_key` | No duplicate role grants |
| `user_clients_user_id_client_id_key` | One assignment row per user↔account |
| `client_platform_accounts_platform_platform_customer_id_key` | One row per platform+customer ID |
| `agency_report_tabs_agency_platform_tab_key_key` | Unique tab per agency/platform |
| `uq_agency_platform_ga4_email` / `uq_agency_platform_non_ga4` | Credential uniqueness patterns |
| Many `gads_*` / `fb_*` / `bing_*` / `reddit_*` / `tiktok_*` `*_uq` or `*_key` | Upsert-safe natural keys (customer + entity + date, etc.) |
| `monthly_report_accounts_report_id_platform_account_id_key` | Account once per report |
| GSC/GMB unique keys | Customer/agency/date/metric (or query) uniqueness |

### Check / NOT NULL

Core NOT NULL columns include agency names/slugs, `client_platform_accounts.platform` + `platform_customer_id`, `user_profiles.role_id`, and date/customer fields on fact tables. Full CHECK catalog is in the dump DDL.

---

## Indexes

Indexes in `full_schema.sql` focus on **query paths used by dashboards and sync**:

- **Customer + date** composites for nearly all `*_daily` tables (`idx_*_cust_date`, `idx_*_cid_date`)  
- **Agency** filters on GA4 summary/raw, GSC, GMB, sync_log, Bing customers  
- **CPA lookups:** `idx_cpa_agency_active_custid`, `idx_cpa_platform_custid_active`, `idx_client_platform_accounts_client_id`  
- **GHL:** location, date, direction, form type, HIPAA loc+date  
- **Hoot:** client, VIN, URL path, active  
- **Monthly reports:** agency+client, report_month, child report_id indexes  
- **Unique indexes** doubling as upsert targets (`bing_*_uq`, `fb_*_uq`, `reddit_*_uq`, `tiktok_*_uq`, …)

---

## Views

| View | Definition summary |
|---|---|
| `ghl_calls_view` | `ghl_calls` ⟕ `ghl_contacts` with cleaned attribution fields |
| `ghl_contacts_view` | `ghl_contacts` with cleaned source/medium/lead_type |
| `ghl_form_submissions_view` | `ghl_form_submissions` ⟕ `ghl_contacts` with cleaned attribution |
| `merged_migration_data` | Join `client_hoot_feeds` ⋈ `clients` filtered to a **hard-coded agency UUID** (migration helper; not a general app API) |

The React GHL Leads UI reads these views heavily (`useGhlData.js`).

---

## Materialized Views

**None found** in `schema.sql` or `supabase/full_schema.sql` (no `CREATE MATERIALIZED VIEW`).

---

## Functions

### Access helpers (RLS / Auth)

| Function | Returns | Role |
|---|---|---|
| `can_access_customer(text)` | boolean | Super admin **or** active CPA in user’s agency **or** assigned via `user_clients` (including sibling `client_id` group) |
| `get_user_agency_id()` | uuid | Current user’s agency |
| `is_admin()` / `is_agency_admin(uuid)` / `is_super_admin()` | boolean | Role checks |
| `get_platform_credential(customer_id, platform)` | refresh_token, mcc_id, credential_id | Resolve OAuth material for sync |
| `classify_ghl_lead_type(source, medium)` | text | Lead type classification |
| `extract_url_path(full_url)` | text | URL path helper |
| `get_missing_geo_ids()` | setof text | Geo IDs needing resolve |

### Sync orchestration (HTTP → Edge via Vault)

| Function | Calls / behavior |
|---|---|
| `gads_metrics_sync_all` / `gads_status_sync_all` / `gads_geo_sync_all` | Drive Google Ads Edge syncs for eligible accounts |
| `bing_metrics_sync_all` | Loops active `platform = 'bing'` CPAs; POSTs `bing-full-sync` |
| `fb_metrics_sync_all` / `reddit_metrics_sync_all` / `tt_metrics_sync_all` | Meta / Reddit / TikTok bulk sync drivers |
| `ga4_metrics_sync_all` / `ghl_sync_all` / `hoot_inventory_sync_all` | GA4 / GHL / Hoot drivers |

### Analytics / enrichment

| Function | Role |
|---|---|
| `ga4_summary_report` / `ga4_advanced_report` / `ga4_events_report` | JSONB report payloads for GA4 UI/RPC |
| `ga4_classify_and_enrich` / `ga4_backfill_page_types` / `reclassify_ga4_pages` | Page classification pipeline |
| `ga4_build_monthly_reports` | Build monthly GA4 report rows |
| `vdp_backfill_one_client(uuid)` | Tag `ga4_raw.page_type` using `clients.vdp_url_pattern` |

### Maintenance

| Function | Role |
|---|---|
| `cleanup_orphaned_gads_data` / `_fb_` / `_bing_` / `_reddit_` / `_tiktok_` / `_all_ad_platforms` | Remove metrics for customers no longer in CPA |
| `handle_new_user()` | **Trigger function**: insert `user_profiles` with default `viewer` role from `auth.users` insert |

---

## Triggers

| Item | Status in repo |
|---|---|
| `handle_new_user()` function | **Present** (SECURITY DEFINER); inserts profile with `viewer` role |
| `CREATE TRIGGER … ON auth.users` | **Not found** in `schema.sql` / `full_schema.sql` |
| Other `CREATE TRIGGER` statements | **None** in dumps |

**Implication:** Live projects may attach `handle_new_user` to `auth.users` outside these dumps. Confirm in Supabase Dashboard → Auth/Database triggers. Admin “Create User” also patches `user_profiles` from the app.

---

## Row Level Security

### Coverage

RLS is **enabled** on most public tables in `full_schema.sql`.  

**Created in dump but without `ENABLE ROW LEVEL SECURITY` in that dump:**

- `ga4_events`  
- `ga4_monthly_reports`  
- `ga4_reporting_events`  
- `ghl_hipaa_calls`  
- `ghl_hipaa_forms`  

Migrations add authenticated-read policies for `gsc_daily_summary`, `gmb_insights_daily`, and `gbp_performance` (table must already exist remotely).

### Policy patterns (names from dump)

| Pattern | Examples |
|---|---|
| Super admin manage | Agencies, roles, permissions, all profiles/credentials |
| Agency admin manage | Credentials, tabs, accounts, clients, monthly report tables |
| Agency members read | Accounts, tabs, sync log |
| Users read own | Own profile, own `user_clients`, own agency |
| `can_access_customer` gated | Bing/Reddit/TikTok/Meta select (and some insert) policies |
| Broad authenticated read | `Allow authenticated read ga4_raw`, `ga4_daily_summary`; GSC/GMB/GBP migrations |
| Anyone reads | `permissions`, `roles`, `role_permissions`, `gads_geo_constants` |
| Service role full | Service-role bypass-style policies for sync writers |

Exact `USING` expressions vary; inspect dump around each `CREATE POLICY` for production hardening reviews.

---

## Storage Buckets

| Item | Evidence |
|---|---|
| SQL `storage.buckets` inserts / policies | **Not found** in `schema.sql` or `full_schema.sql` |
| Application usage | `supabase.storage.from('agency-logos').upload(...)` + `getPublicUrl` in `Admin.jsx` and `SettingsPage.jsx` |
| Stored reference | Public URL written to `agencies.logo_url` |

**Documented expectation:** a public (or appropriately policy’d) Storage bucket named **`agency-logos`** must exist in the Supabase project. Bucket creation/policies are managed outside the checked-in SQL dumps.

Client logos may also use `clients.logo_url` as a URL string without a separate documented bucket in SQL.

---

## Migrations

Path: `supabase/migrations/`

| File | Content |
|---|---|
| `00000000000000_.sql` … `20260429193500_.sql` (16 files) | **Empty (0 bytes)** — likely migration history placeholders from remote |
| `20260504120000_bing_ads_reporting.sql` | Creates Bing tables, indexes, RLS policies, grants |
| `20260504120100_bing_metrics_sync_all.sql` | Defines `bing_metrics_sync_all()` cron driver |
| `20260529120000_gsc_gmb_read_policies.sql` | Authenticated SELECT policies for GSC/GMB if tables exist |
| `20260530120000_gbp_performance_read_policy.sql` | Authenticated SELECT on `gbp_performance` if present |
| `20260713143500_bing_role_permissions.sql` | Seeds Bing permission keys + grants to named roles |

`config.toml` enables migrations and references `./seed.sql` for seeds; **seed files are gitignored** and not present in the tree.

Scheduled jobs that depend on DB functions are listed in `supabase/Cron-jobs.json` (GAds status/geo/metrics/geo-resolve + Bing metrics).

---

## How the application interacts with the database

### Read path (browser → PostgREST)

1. User authenticates; JWT stored by `supabase-js`.  
2. `AuthContext` loads `user_profiles` (embed `agencies`, `roles`), `role_permissions`, `client_platform_accounts`, `user_clients`, and optionally all `agencies`.  
3. Page hooks query fact tables/views filtered by allowed `customer_id`s / `location_id`s and date ranges.  
4. Heavy tables use `src/lib/supabaseRest.js` pagination (1000-row pages, caps, retries).  
5. Some GA4 analytics call RPCs such as `ga4_summary_report` / advanced report functions.

### Write path (app)

| Actor | Writes |
|---|---|
| Admin / Settings UI | `agencies`, `user_profiles`, `roles`, `permissions`, `role_permissions`, `clients`, `client_platform_accounts`, `user_clients`, `agency_report_tabs`, branding fields |
| Settings sync UI | Inserts `sync_log`; triggers Edge Functions (not direct metric upserts from browser) |
| Monthly report UI | CRUD `monthly_reports` and child tables; may store `published_data` JSON |
| HIPAA CSV upload | Upserts `ghl_hipaa_calls` / `ghl_hipaa_forms` |
| Storage | Uploads to `agency-logos`; URL → `agencies.logo_url` |

### Write path (Edge Functions / cron)

1. Function authenticates caller (user JWT) or accepts cron/anon bearer as designed.  
2. Loads credentials via service role (`agency_platform_credentials` / `get_platform_credential`).  
3. Pulls external APIs; **upserts** into `*_daily` / status / GHL / GA4 tables using natural unique keys.  
4. Updates sync timestamps/status on credentials or CPA rows; may write `sync_log`.  
5. SQL `*_sync_all` functions discover active CPAs and `net.http_post` to functions.

### Security interaction model

```text
UI PermissionGate / hasPermission  (application RBAC)
        +
PostgREST RLS policies             (database RBAC)
        +
Service role in Edge Functions     (bypass RLS for trusted sync)
```

`can_access_customer` is the shared predicate tying **platform customer IDs** to **agency membership** and **user_clients** assignments (including client-group expansion).

### Dump divergence checklist (for operators)

| Object | App uses? | In `full_schema` CREATE? | In `schema.sql` CREATE? | Notes |
|---|---|---|---|---|
| Bing / TikTok / Hoot tables | Yes | Yes | No | Prefer `full_schema` |
| `ga4_classified_pages` / `ga4_page_rules` | Yes (functions/UI) | Referenced, not CREATE | Yes | Prefer `schema.sql` + live |
| `gbp_performance` | Yes (monthly SEO) | No | No | Policy migration only |
| `agency-logos` bucket | Yes | No | No | Create in Storage UI/CLI |
| `auth.users` → `handle_new_user` trigger | Expected | Function only | Function only | Verify live |

---

## Quick reference — table inventory (`full_schema.sql`)

**60 tables** created in `full_schema.sql`:  
`agencies`, `agency_platform_credentials`, `agency_report_tabs`, `bing_ad_daily`, `bing_campaign_daily`, `bing_customers`, `bing_geo_location_daily`, `bing_keyword_daily`, `bing_search_term_daily`, `client_hoot_feeds`, `client_platform_accounts`, `clients`, `fb_ad_daily`, `fb_adset_daily`, `fb_campaign_daily`, `fb_customers`, `fb_placement_daily`, `ga4_daily_summary`, `ga4_events`, `ga4_monthly_reports`, `ga4_raw`, `ga4_reporting_events`, `gads_adgroup_daily`, `gads_adgroup_status`, `gads_campaign_daily`, `gads_campaign_status`, `gads_conversion_actions`, `gads_conversion_daily`, `gads_customers`, `gads_geo_constants`, `gads_geo_location_daily`, `gads_keyword_daily`, `gads_keyword_status`, `gads_search_term_daily`, `ghl_activity_daily`, `ghl_calls`, `ghl_contacts`, `ghl_form_submissions`, `ghl_hipaa_calls`, `ghl_hipaa_forms`, `ghl_leads_daily`, `gmb_insights_daily`, `gmb_locations`, `gsc_daily_summary`, `hoot_inventory`, `monthly_report_accounts`, `monthly_report_sections`, `monthly_report_uploads`, `monthly_reports`, `permissions`, `reddit_campaign_daily`, `reddit_customers`, `reddit_placement_daily`, `role_permissions`, `roles`, `sync_log`, `tiktok_campaign_daily`, `tiktok_placement_daily`, `user_clients`, `user_profiles`.

**Plus from `schema.sql` CREATE:** `ga4_classified_pages`, `ga4_page_rules`.  
**Plus app/migration-known:** `gbp_performance` (definition not in dumps).

---

*End of database draft.*
