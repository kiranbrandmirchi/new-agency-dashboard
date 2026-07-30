# Agency Dashboard — Project Analysis

> Analysis only. No README sections. Produced for documentation planning.
> Date of analysis: 2026-07-29
> Repository path: `new-agency-dashboard`

---

## Critical stack correction

The assumed stack was **Next.js + Supabase + Vercel**.

**Verified from code:**

| Assumption | Verified reality |
|---|---|
| Next.js | **False.** No `next` dependency, no `app/` or `pages/` Next router, no `next.config.*`, no `middleware.ts`. |
| Frontend framework | **Vite 5 + React 18** SPA (`package.json` scripts: `vite`, `vite build`; entry `index.html` → `src/main.jsx`). |
| Routing | **react-router-dom v7** (`BrowserRouter` in `src/App.jsx`). Page switching is mostly in-app state (`AppContext.currentPage`), not URL-per-page (except `/login`, `/signup`, `/admin`, `/ppt-report`, `/oauth/callback`). |
| Supabase | **True.** `@supabase/supabase-js`, `supabase/` project, Edge Functions, Postgres schema/migrations, RLS helpers. |
| Vercel | **True.** `vercel.json` SPA rewrites + cache headers; OAuth fallback URL `https://new-agency-dashboard.vercel.app/oauth/callback`. |

**Package name:** `wow-dashboard` (npm).  
**UI / product branding in code:** “Chipper Digital” / “Chipper” (login logo, `index.html` title, `AppContext` defaults).  
**Brand asset folder:** Red Castle Services logos/guidelines under `brand/`.  
**Legacy README title:** “WowDashboard” (React conversion of an older HTML/CSS/JS dashboard).

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Vite/React SPA on Vercel)                             │
│  AuthProvider → AppProvider → App (react-router)                │
│  Pages + hooks read metrics via:                                │
│    • supabase-js client (PostgREST + Auth)                      │
│    • supabaseRest.js (paginated raw REST for large tables)      │
│    • fetch / functions.invoke → Edge Functions                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase                                                       │
│  • Auth (email/password)                                        │
│  • Postgres (multi-tenant agencies, RLS, sync_*_all RPCs)       │
│  • Edge Functions (OAuth connect + platform sync + reports)     │
│  • Cron (pg_cron) → SQL sync wrappers / net.http_post           │
│  • Vault secrets (project_url, anon_key for cron HTTP calls)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
 Google Ads / GA4 / GSC   Meta Graph API    Bing Ads SOAP
 Reddit Ads API           TikTok Marketing  GoHighLevel
 Google Business Profile  Hoot inventory    Google Drive (client OAuth)
```

**Data flow (typical):**

1. Admin connects platform OAuth in Settings → `*-oauth-connect` Edge Function stores refresh tokens in `agency_platform_credentials` and discovers accounts into `*_customers` / `client_platform_accounts`.
2. Manual or scheduled sync → `*-full-sync` / `*-sync` Edge Functions pull API metrics and upsert into `*_daily` (and related) tables.
3. Dashboard pages use React hooks (`useGoogleAdsData`, `useFacebookData`, etc.) to query Supabase tables/views, scoped by agency + allowed platform accounts from AuthContext.
4. Report builders (PPT / monthly / agency reports) aggregate DB data (and sometimes live Edge Functions like `marketing-report-realtime`, `ga4-realtime-users`) and export PDF/PPTX (and optionally Google Drive).

**Not present:** Next.js API routes, Docker, GitHub Actions, Node backend server, GraphQL client (schema mentions `graphql_public` for local Supabase only).

---

## Folder inventory

| Path | Role |
|---|---|
| `src/` | Entire frontend application |
| `src/pages/` | Route/page components (dashboard, platforms, reports, admin, auth) |
| `src/pages/backups/` | Abandoned alternate `loadClients` snippets for PPT report |
| `src/components/` | Shared UI (sidebar, header, gates, previews, uploaders) |
| `src/hooks/` | Data-fetching hooks per platform / report |
| `src/utils/` | Export builders, sync helpers, SEO/HIPAA/Google helpers |
| `src/lib/` | Supabase clients, REST pagination, agency scope, date presets |
| `src/context/` | Auth, app chrome/branding, report branding |
| `src/config/` | Nav items, platform permission catalog |
| `src/data/` | Static titles / sample report shapes |
| `src/styles/` | Global CSS (inlined at runtime) + report preview CSS |
| `supabase/functions/` | 19 Deno Edge Functions |
| `supabase/migrations/` | 21 SQL migration files |
| `supabase/full_schema.sql` | Dump-style full schema (~247KB) |
| `schema.sql` | Root-level schema dump (~211KB); overlap with `full_schema.sql` |
| `supabase/Cron-jobs.json` | Documented pg_cron job definitions |
| `supabase/config.toml` | Local Supabase CLI config (`project_id = "New_Agency_Dashboard"`, Postgres 17) |
| `public/` | Static brand logos served at `/` |
| `brand/` | Source brand assets + PDF guidelines (not necessarily served) |
| `scripts/` | Bing backfill PowerShell, PPTX inspect, Reddit SQL verify |
| `docs/readme-work/` | This analysis workspace |
| `.tmp-pptx-*`, `.tmp-sosrafa-*` | Local PPTX inspection artifacts (not app source) |
| `vercel.json` | SPA hosting config |
| `vite.config.js` | Minimal Vite + React plugin |
| `.env` / `.env.example` | Frontend Vite env vars |
| `README_OLD.md` | Prior README (backed up from `README.md`) |
| `test-export.pptx` | Sample export artifact |

**Absent (checked):** `app/` (Next), `services/`, `repositories/`, `middleware.ts`, `tsconfig.json`, `.github/workflows`, `Dockerfile`, `docker-compose.yml`.

---

## Technology inventory

### Frontend

| Tech | Version / notes |
|---|---|
| React | ^18.2.0 |
| React DOM | ^18.2.0 |
| Vite | ^5.0.0 |
| @vitejs/plugin-react | ^4.2.0 |
| react-router-dom | ^7.13.1 |
| @supabase/supabase-js | ^2.45.0 |
| chart.js | ^4.4.0 |
| recharts | ^3.7.0 |
| html2canvas | ^1.4.1 |
| jspdf | ^4.2.1 |
| pptxgenjs | ^4.0.1 |
| papaparse | ^5.5.3 |
| TypeScript | Partial — some `.ts` utils; no project `tsconfig.json`; most app is `.jsx`/`.js` |
| Fonts | Google Fonts: Poppins, Roboto Mono (`index.html`) |

### Backend / platform

| Tech | Notes |
|---|---|
| Supabase Auth | Email/password; session persistence; optional `VITE_AUTH_DISABLED` |
| Supabase Postgres | Multi-tenant; RLS; many RPCs for sync/reporting |
| Supabase Edge Functions | Deno; service role for upserts |
| Supabase CLI | `supabase` ^2.77.0 (devDependency) |
| pg_cron | Jobs listed in `Cron-jobs.json` |
| Vercel | Static SPA + rewrites |

### Language mix

- **JSX/JS** dominates the UI.
- **TypeScript** used in export/slide utilities and all Edge Functions (`index.ts`).
- **SQL** for schema, migrations, cron, verification scripts.
- **PowerShell** for Bing backfill script.

---

## External integrations

| Platform | OAuth / connect function | Sync / data function | Primary storage |
|---|---|---|---|
| Google Ads | `oauth-connect` | `gads-full-sync`, `gads-status-geo`, `gads-geo-resolve` | `gads_*` tables |
| Google Analytics 4 | `ga4-oauth-connect` | `ga4-sync`, `ga4-realtime-users` | `ga4_*` tables |
| Meta / Facebook Ads | `fb-oauth-connect` | `fb-full-sync` | `fb_*` tables |
| Reddit Ads | `reddit-oauth-connect` | `reddit-full-sync` | `reddit_*` tables |
| TikTok Ads | `tiktok-oauth-connect` | `tiktok-full-sync` | `tiktok_*` tables |
| Bing / Microsoft Ads | `bing-oauth-connect` | `bing-full-sync` (+ SQL `bing_metrics_sync_all`) | `bing_*` tables |
| GoHighLevel (GHL) | Credentials via Settings / accounts | `ghl-sync` | `ghl_*` + HIPAA tables + views |
| Google Search Console | Via GA4/Google OAuth ecosystem + `marketing-report-realtime` | realtime edge + `gsc_daily_summary` | `gsc_daily_summary` |
| Google Business Profile | Same SEO pipeline | `marketing-report-realtime` / DB fallbacks | `gmb_*`, `gbp_performance` (table referenced; not fully in root `schema.sql` CREATE list) |
| Hoot inventory | — | `hoot-inventory-sync` (+ SQL `hoot_inventory_sync_all`) | `hoot_inventory`, `client_hoot_feeds` |
| Google Drive / Slides | Browser OAuth (`VITE_GOOGLE_CLIENT_ID`) | `google-drive-upload` edge exists; frontend also uploads via Drive REST in `googleDriveExport.js` | External Drive folder |

**Edge Function env secrets (from function headers / KT doc; not from reading `.env`):**  
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GADS_*`, `GA4_*`, `FB_APP_*`, `REDDIT_*`, `TIKTOK_*` / `TIKTOK_CLIENT_*`, `BING_*`, plus whatever GHL/Hoot/Drive functions require.

**Frontend env (from `.env.example` only):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_NAME` (optional)
- `VITE_AUTH_DISABLED` (optional)
- `VITE_GOOGLE_CLIENT_ID` (optional)
- `VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID` (optional)

---

## Database summary

### Tenancy & auth model

- **`agencies`** — white-label agencies (colors, fonts, branding).
- **`user_profiles`** — linked to Supabase Auth users; `agency_id`, `role_id`, `is_super_admin`.
- **`roles` / `permissions` / `role_permissions`** — RBAC; permission keys defined in `src/config/platformConfig.js` and syncable from Admin.
- **`clients`** — logical client entities (used heavily by monthly/PPT reports).
- **`client_platform_accounts`** — maps clients ↔ platform customer IDs (`google_ads`, `meta`, `bing`, `tiktok`, `reddit`, `ga4`, `gsc`, `gbp`, `ghl`, …).
- **`user_clients`** — restricts non–view-all users to assigned accounts (assignment IDs expand to sibling accounts in same `client_id` group).
- **`agency_platform_credentials`** — OAuth refresh tokens / MCC IDs per agency+platform.
- **`agency_report_tabs`** — configurable report tabs.
- **`sync_log`** — sync attempt history.

### Platform metrics (daily / status)

- Google Ads: `gads_campaign_daily`, `gads_adgroup_daily`, `gads_keyword_daily`, `gads_search_term_daily`, `gads_conversion_*`, `gads_geo_*`, `gads_*_status`, `gads_customers`, `gads_geo_constants`
- Meta: `fb_campaign_daily`, `fb_adset_daily`, `fb_ad_daily`, `fb_placement_daily`, `fb_customers`
- Reddit: `reddit_campaign_daily`, `reddit_placement_daily`, `reddit_customers`
- TikTok: `tiktok_campaign_daily`, `tiktok_placement_daily` (customers likely via CPA / related tables)
- Bing: `bing_campaign_daily`, `bing_ad_daily`, `bing_keyword_daily`, `bing_search_term_daily`, `bing_geo_location_daily`, `bing_customers`
- GA4: `ga4_raw`, `ga4_daily_summary`, `ga4_classified_pages`, `ga4_page_rules`, `ga4_events`, `ga4_reporting_events`, `ga4_monthly_reports`
- GHL: `ghl_contacts`, `ghl_calls`, `ghl_form_submissions`, `ghl_leads_daily`, `ghl_activity_daily`, `ghl_hipaa_calls`, `ghl_hipaa_forms`
- SEO / local: `gsc_daily_summary`, `gmb_locations`, `gmb_insights_daily`, `gbp_performance` (RLS migration present)
- Inventory: `hoot_inventory`, `client_hoot_feeds`
- Reports: `monthly_reports`, `monthly_report_accounts`, `monthly_report_sections`, `monthly_report_uploads`

### Views

- `ghl_calls_view`, `ghl_contacts_view`, `ghl_form_submissions_view`
- `merged_migration_data`

### Notable RPCs / SQL helpers

- Sync-all wrappers: `gads_metrics_sync_all`, `gads_status_sync_all`, `gads_geo_sync_all`, `fb_metrics_sync_all`, `reddit_metrics_sync_all`, `tt_metrics_sync_all`, `bing_metrics_sync_all`, `ga4_metrics_sync_all`, `ghl_sync_all`, `hoot_inventory_sync_all`
- Access: `can_access_customer`, `get_user_agency_id`, `is_admin`, `is_agency_admin`, `is_super_admin`, `get_platform_credential`
- GA4 analytics: `ga4_summary_report`, `ga4_advanced_report`, `ga4_events_report`, classify/backfill helpers
- Auth trigger: `handle_new_user`
- Cleanup: `cleanup_orphaned_*_data`

### Migrations (21 files)

Most early migrations are timestamp-only names (`20260308…`–`20260429…`). Named ones:

- `20260504120000_bing_ads_reporting.sql` — Bing tables + RLS
- `20260504120100_bing_metrics_sync_all.sql` — Bing cron sync RPC
- `20260529120000_gsc_gmb_read_policies.sql` — authenticated read on GSC/GMB
- `20260530120000_gbp_performance_read_policy.sql` — authenticated read on `gbp_performance`
- `20260713143500_bing_role_permissions.sql` — seed Bing permission keys for roles

### Cron (from `supabase/Cron-jobs.json`)

| Job | Schedule (UTC) | Action |
|---|---|---|
| `gads-daily-status` | 06:00 | `gads_status_sync_all()` |
| `gads-daily-geo` | 06:15 | `gads_geo_sync_all()` |
| `gads-daily-metrics` | 06:30 | `gads_metrics_sync_all()` |
| `gads-daily-geo-resolve` | 07:00 | HTTP POST → `gads-geo-resolve` |
| `bing_metrics_sync_all` | 05:40 | `bing_metrics_sync_all()` |

Other platforms have SQL `*_sync_all` functions; only GAds + Bing are listed in the checked-in cron JSON.

### Schema dump caveat

`schema.sql` and `supabase/full_schema.sql` are large dumps and may lag or diverge from live Supabase + later migrations (e.g. `gbp_performance` appears in migrations/app code but not in the CREATE TABLE scan of those dumps). Treat dumps as reference, migrations + live DB as source of truth.

---

## API inventory

There are **no Next.js/Express API routes**. The “API surface” is:

### A. Supabase PostgREST

Frontend reads/writes tables and RPCs via:

- `src/lib/supabaseClient.js` — primary JS client
- `src/lib/supabaseRest.js` — paginated REST (handles 1000-row default, caps, GA4 large fetches)

### B. Supabase Edge Functions (`POST /functions/v1/...`)

| Function | Purpose |
|---|---|
| `oauth-connect` | Google Ads OAuth connect / token exchange / account linking |
| `ga4-oauth-connect` | GA4 (Google) OAuth connect |
| `fb-oauth-connect` | Meta OAuth → long-lived token |
| `reddit-oauth-connect` | Reddit Ads OAuth |
| `tiktok-oauth-connect` | TikTok Marketing OAuth |
| `bing-oauth-connect` | Microsoft Ads OAuth + account discovery |
| `gads-full-sync` | Google Ads metrics ingestion (documented in `KTdoc.md`) |
| `gads-status-geo` | Campaign/ad group/keyword status + geo sync |
| `gads-geo-resolve` | Resolve geo constant names |
| `ga4-sync` | GA4 historical sync |
| `ga4-realtime-users` | Live GA4 users for report slides |
| `fb-full-sync` | Meta Ads metrics sync |
| `reddit-full-sync` | Reddit metrics sync |
| `tiktok-full-sync` | TikTok metrics sync |
| `bing-full-sync` | Bing Reporting API SOAP → CSV → upsert |
| `ghl-sync` | GoHighLevel contacts/calls/forms sync |
| `hoot-inventory-sync` | Inventory feed sync |
| `marketing-report-realtime` | SEO report (GSC/GBP/GA4) for monthly slides |
| `google-drive-upload` | Server-side Drive upload helper |

### C. Frontend SPA routes (`src/App.jsx`)

| Path | Access | Content |
|---|---|---|
| `/` | Protected | Main dashboard shell + in-app pages |
| `/login` | Public (redirect if authed) | Login |
| `/signup` | Public (redirect if authed) | Signup |
| `/oauth/callback` | Public (OAuth return) | Completes platform OAuth |
| `/dashboard` | Redirect → `/` | — |
| `/admin` | Protected + `action.manage_users` | Admin panel |
| `/ppt-report` | Protected | PPT report page (also synced via `currentPage`) |
| `*` | Redirect → `/` | — |

In-app page IDs (not separate URLs): `dashboard`, `google-ads`, `meta-ads`, `bing-ads`, `tiktok-ads`, `reddit-ads`, `agency-reports`, `monthly-reports`, `ppt-report`, `ga4`, `ga4-advanced`, `ghl`, `settings`, plus placeholders (`dsp`, `dating-apps`, `ctv`, `email`, `ott`, `seo`, `creatives`, `events`).

---

## Feature inventory

### Implemented (live UI + data hooks)

1. **Combined / Executive Dashboard** — cross-platform spend & performance (`CombinedDashboardPage`, `useCombinedDashboardData`).
2. **Google Ads reporting** — campaigns, ad groups, keywords, conversions, geo, daily, sync from Settings (`GoogleAdsPage`, `useGoogleAdsData`).
3. **Meta Ads reporting** — campaigns, ad sets, ads, placements, daily (`FacebookPage`, `useFacebookData`).
4. **Bing / Microsoft Ads reporting** — overview through conversions tabs (`BingPage`, `useBingData`).
5. **TikTok Ads reporting** (`TikTokPage`, `useTikTokData`).
6. **Reddit Ads reporting** (`RedditPage`, `useRedditData`).
7. **GA4 / Web Analytics** — overview + advanced Wheeler-only page/VDP views (`GA4Page`, `useGA4Data`).
8. **GHL Leads** — calls/forms, attribution, HIPAA CSV path (`GhlLeadsPage`, `useGhlData`, `GhlHipaaCsvUpload`).
9. **Agency Reports** — multi-tab agency reporting (`AgencyReportsPage`, related hooks).
10. **Monthly Reports** — CRUD reports, accounts, sections, uploads; editor (`MonthlyReportsPage`, `MonthlyReportEditor`, `useMonthlyReport`).
11. **PPT Report** — slide preview + PPTX/PDF generation (`PptReportPage`, many `generate*` / `monthly*` utils).
12. **White-Label Settings** — branding + platform OAuth connect + per-account sync (`SettingsPage`, `PlatformManagementSection`).
13. **Admin** — Agencies (super admin), Users, Roles, Clients, Permissions sync from `platformConfig` (`Admin.jsx`).
14. **RBAC / PermissionGate** — sidebar + tab permissions; customer account scoping.
15. **Super-admin agency switcher** — impersonate agency scope (`AuthContext.setActiveAgencyId`).
16. **Exports** — PDF (jsPDF + html2canvas), PPTX (pptxgenjs), optional Google Drive upload.
17. **SEO slides for monthly reports** — GSC/GBP/GA4 via `marketing-report-realtime` + DB fallbacks.
18. **Auth** — login, signup, protected routes, optional auth bypass.

### Placeholder / nav-only (no full implementation)

From `PLACEHOLDER_PAGES` / nav: DSP, Dating Apps, CTV, Email, OTT/Vimeo, SEO (as standalone page — SEO exists inside monthly reports), Creative Analysis, Events.

### Admin-listed platforms not fully productized

`Admin.jsx` includes platform enum values like `pinterest_ads`, `snapchat_ads`, `linkedin_ads` that do not have Edge Functions or dedicated pages in this repo.

---

## Authentication summary

| Aspect | Detail |
|---|---|
| Provider | Supabase Auth (`signInWithPassword`, `signUp`, `signOut`, `onAuthStateChange`) |
| Profile | `user_profiles` joined to `agencies` + `roles` |
| Permissions | `role_permissions` → `permissions.permission_key` Set in AuthContext |
| Elevated access | `is_super_admin` OR role in `super_admin` / `admin` / `manager` → broad permissions; also `customer.view_all` / admin action keys |
| Client scoping | `user_clients` + `client_platform_accounts`; `isCustomerAllowed(platform, id)` |
| UI guards | `ProtectedRoute`, `PermissionGate`, Admin permission check |
| Bypass | `VITE_AUTH_DISABLED=true` or `sessionStorage.auth_skip=1` → fake public admin-like session |
| Branding | Agency colors applied to CSS variables on profile load |
| OAuth callback | Separate from Auth — platform marketing OAuth returns to `/oauth/callback` |

No Next.js middleware; no custom JWT layer beyond Supabase session tokens passed to Edge Functions.

---

## Deployment summary

| Item | Detail |
|---|---|
| Hosting | **Vercel** (SPA) — `vercel.json` rewrites all routes to `/index.html` |
| Build | `npm run build` → Vite → `dist/` |
| Dev | `npm run dev` → Vite default (README_OLD cites `localhost:5173`) |
| Cache | HTML `no-cache`; hashed `/assets/*` long-cache immutable |
| Backend deploy | Supabase project (remote); Edge Functions + migrations deployed via Supabase tooling (not automated in-repo CI) |
| CI/CD | **No** `.github/workflows` in repo |
| Containers | **No** Docker files |
| Known prod URL hint | `https://new-agency-dashboard.vercel.app` (Reddit OAuth fallback) |

---

## Unknown areas / gaps

1. **Live Supabase project ID / environment mapping** — not fully documented in-repo beyond local `config.toml` project_id and Vercel hostname hint.
2. **Divergence between `schema.sql`, `full_schema.sql`, migrations, and production** — especially `gbp_performance` and any tables created only in remote.
3. **Which cron jobs actually run in production** — checked-in JSON may be incomplete vs live Dashboard cron.
4. **Secret inventory completeness** — Edge Function secrets for GHL, Hoot, Drive not exhaustively cataloged from source headers alone.
5. **Purpose of `.tmp-*` PPTX trees and `test-export.pptx`** — local inspection artifacts; unclear if needed for builds.
6. **Brand identity for README** — Chipper Digital vs WowDashboard vs Red Castle vs Agency Dashboard naming conflict.
7. **`.env` presence at repo root** — file exists locally; `.gitignore` does **not** list `.env` (only `*.local`). Risk of accidental commit of secrets; verify git tracking status before documenting env setup.
8. **`google-drive-upload` Edge Function vs browser Drive upload** — both exist; which path is canonical in production is unclear.
9. **Seed data** — `config.toml` references `./seed.sql` but seeds are gitignored.
10. **TypeScript adoption** — mixed `.ts`/`.js` without `tsconfig`; typechecking story undefined.
11. **Placeholder platforms** — roadmap vs abandoned nav items unknown.
12. **HIPAA mode** — CSV upload path exists; compliance/process expectations not documented in code.

---

## Questions (for stakeholders / before writing README)

1. What is the **official product name** for documentation: Agency Dashboard, Chipper Digital, WowDashboard, or Red Castle–branded white-label?
2. Confirm primary **production URLs** (Vercel + Supabase project ref).
3. Should README target **agency end-users**, **developers**, or **both** (separate docs)?
4. Are placeholder nav items (DSP, CTV, etc.) planned features or should they be hidden?
5. Is `VITE_AUTH_DISABLED` intended for demos only, and should it be documented?
6. Which Edge Function secrets are required for a **minimal** vs **full** platform deployment?
7. Should `schema.sql` / `full_schema.sql` be treated as canonical, or only `supabase/migrations/`?
8. Is there an intended process for deploying Edge Functions and cron (CLI commands, dashboard only)?
9. Should Red Castle brand assets / PDF guidelines be public in the repo, or moved out of the open tree?
10. Confirm whether `.env` should be gitignored and rotated if it was ever committed.

---

## Analysis work completed (repo prep)

- Created `docs/readme-work/`.
- Renamed existing `README.md` → `README_OLD.md` (no `README.backup.md` needed).
- Did **not** recreate or modify `README.md`.
- Companion map: `docs/readme-work/repository-map.md`.
