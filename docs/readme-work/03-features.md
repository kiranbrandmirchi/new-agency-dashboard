# Agency Dashboard — Features

> Implemented functionality only, discovered from application code.  
> Placeholder / “Coming soon” nav items are listed under **Out of scope** and are not documented as features.  
> Does not modify the root `README.md`.

---

## Authentication

### Email / password sign-in

| | |
|---|---|
| **Description** | Users sign in at `/login` with email and password via Supabase Auth (`signInWithPassword`). Successful login navigates to the main app shell. |
| **User benefit** | Secure access to agency data without sharing platform console credentials. |
| **Related modules** | `src/pages/Login.jsx`, `src/context/AuthContext.jsx`, `src/lib/supabaseClient.js`, `src/App.jsx` (`LoginRedirect`) |
| **Important implementation notes** | Authenticated users visiting `/login` are redirected to `/`. App name on the login screen comes from `VITE_APP_NAME` (default “Agency Dashboard”). |

### User signup

| | |
|---|---|
| **Description** | `/signup` registers a new Auth user with full name, email, and password (`signUp`). UI prompts the user to check email when confirmation is required. |
| **User benefit** | Self-service account creation for new operators. |
| **Related modules** | `src/pages/Signup.jsx`, `src/context/AuthContext.jsx` |
| **Important implementation notes** | Application access still depends on a `user_profiles` row (agency/role). Missing profiles surface as pending-setup / limited access messaging in AuthContext—not a full onboarding wizard. |

### Session management & profile load

| | |
|---|---|
| **Description** | On load, the app restores the Supabase session, then loads `user_profiles` (with agency and role), role permissions, and allowed platform accounts. Agency branding CSS variables are applied when an agency is present. |
| **User benefit** | Persistent login and correctly scoped data after refresh or tab focus. |
| **Related modules** | `src/context/AuthContext.jsx`, `src/lib/supabaseClient.js` |
| **Important implementation notes** | Profile fetches use a 20s timeout, debounce, and a per-session “already loaded” short-circuit so `onAuthStateChange` (e.g. tab focus) does not repeatedly bounce users to “Failed to load profile.” |

### Sign out

| | |
|---|---|
| **Description** | Clears the Supabase session and local auth/profile state, then returns the user to login. |
| **User benefit** | Safe shared-workstation logout. |
| **Related modules** | `src/components/Header.jsx`, `src/pages/SettingsPage.jsx`, `src/context/AuthContext.jsx` (`signOut`) |
| **Important implementation notes** | Resets permissions, allowed accounts, agency switcher state, and profile-load caches. |

### Protected routes

| | |
|---|---|
| **Description** | Main app routes (`/`, `/admin`, `/ppt-report`) require an authenticated session. Unauthenticated users are sent to `/login`. Auth/profile errors show an “Account Issue” screen. |
| **User benefit** | Prevents anonymous access to dashboards and admin. |
| **Related modules** | `src/components/ProtectedRoute.jsx`, `src/App.jsx` |
| **Important implementation notes** | Admin content additionally requires `action.manage_users` inside the layout. |

### Auth bypass (demo / public mode)

| | |
|---|---|
| **Description** | When `VITE_AUTH_DISABLED` is `true`/`1`/`yes`, or `sessionStorage.auth_skip` is `1`, the app skips Supabase Auth and fabricates a public session with broad permissions. |
| **User benefit** | Local demos or environments that intentionally run without Auth. |
| **Related modules** | `src/context/AuthContext.jsx` |
| **Important implementation notes** | `hasPermission` and `isCustomerAllowed` always return true in this mode. Intended for non-production demos; not a substitute for real RBAC. |

### Platform OAuth callback

| | |
|---|---|
| **Description** | `/oauth/callback` completes marketing-platform OAuth (Google Ads, GA4, Meta, Reddit, TikTok, Bing) by exchanging codes with the matching Edge Function and optionally selecting accounts to link. |
| **User benefit** | Connects ad/analytics accounts without pasting refresh tokens manually (except TikTok paste-code path in Settings). |
| **Related modules** | `src/pages/OAuthCallback.jsx`, `supabase/functions/*-oauth-connect`, `src/pages/SettingsPage.jsx` |
| **Important implementation notes** | This is **platform connection** OAuth, not end-user login. Flow returns the operator to Settings after connect. |

---

## Dashboard

### Combined / executive dashboard

| | |
|---|---|
| **Description** | Cross-platform overview with date range and optional compare period. Platform tabs appear when the user has accounts with data for Google Ads, Meta (Facebook), Reddit, TikTok, Bing, and/or GA4. Each tab shows an account-level metrics table; ad platforms support expandable campaign rows. |
| **User benefit** | One screen for spend and performance across clients and channels without opening each native console. |
| **Related modules** | `src/pages/CombinedDashboardPage.jsx`, `src/hooks/useCombinedDashboardData.js`, `src/components/CombinedDashboardAccountTable.jsx`, `src/components/DatePicker.jsx` |
| **Important implementation notes** | Requires `tab.combined_dashboard`. Users without it are redirected to the first permitted nav item. Metrics differ by platform (e.g. ads: spend/impressions/clicks/CTR/CPC/conversions/CPA; Meta adds reach/leads/purchase value; GA4: users/sessions/pageviews/conversions). Compare mode shows current, prior, delta, and %. This page is table-driven (no chart widgets on the combined dashboard itself). |

### Client / account switching (app shell)

| | |
|---|---|
| **Description** | Header/context client selector switches the active platform customer for reporting views that respect `currentClient` / allowed accounts. |
| **User benefit** | Fast focus on a single account while keeping agency-wide context available. |
| **Related modules** | `src/context/AppContext.jsx`, `src/components/Header.jsx`, platform pages/hooks |
| **Important implementation notes** | Allowed accounts come from AuthContext (`allowedClientAccounts` / platform maps), filtered by role and `user_clients` unless the user can view all customers. |

---

## User Management

### Admin user list & editing

| | |
|---|---|
| **Description** | Admin → Users lists agency users (searchable). Operators can update role, active status, and (for super admins) agency assignment. |
| **User benefit** | Central control of who can access the dashboard and at what privilege level. |
| **Related modules** | `src/pages/Admin.jsx` (`AdminUsersTab`) |
| **Important implementation notes** | Non–super-admin admins are scoped to their own agency. Requires Admin access (`action.manage_users`). |

### Create user

| | |
|---|---|
| **Description** | Admin can create a user via Auth signup, then patch `user_profiles` (role/agency), restoring the admin session afterward. |
| **User benefit** | Onboard staff without leaving the Admin UI. |
| **Related modules** | `src/pages/Admin.jsx` (`AdminUsersTab`) |
| **Important implementation notes** | Relies on Supabase Auth signup from the admin’s browser session; implementation carefully re-establishes the admin session after creating the user. |

### Assign clients / platform accounts to users

| | |
|---|---|
| **Description** | “Manage Clients” modal assigns `user_clients` rows so restricted users only see selected platform accounts. Assignments are grouped so selecting a client group can grant all related platform accounts. |
| **User benefit** | Least-privilege access for junior staff or client-specific roles. |
| **Related modules** | `src/pages/Admin.jsx`, `src/context/AuthContext.jsx` (load/filter via `user_clients` + `client_platform_accounts`) |
| **Important implementation notes** | `user_clients.client_id` points at `client_platform_accounts.id`; AuthContext expands sibling accounts that share the same logical `client_id` group. Users with view-all roles/permissions bypass these restrictions. |

---

## Admin

### Admin panel shell

| | |
|---|---|
| **Description** | Dedicated `/admin` area with tabs: Agencies (super admin), Users, Roles, Clients, Permissions. |
| **User benefit** | Operational control plane for tenancy and RBAC. |
| **Related modules** | `src/pages/Admin.jsx`, `src/App.jsx`, `src/components/Sidebar.jsx` |
| **Important implementation notes** | Gate: `action.manage_users`. Access-denied UI if permission missing. |

### Agency management (super admin)

| | |
|---|---|
| **Description** | Create/update agencies with white-label fields (name, colors, sidebar colors, font, logo URL/upload). Inspect related users/credentials in context of an agency. |
| **User benefit** | Operate multiple branded agency tenants from one deployment. |
| **Related modules** | `src/pages/Admin.jsx` (`AdminAgenciesTab`), `src/context/AuthContext.jsx` (`allAgencies`, `refreshAllAgencies`) |
| **Important implementation notes** | Only shown when `is_super_admin` / super_admin role. |

### Super-admin agency switcher

| | |
|---|---|
| **Description** | Sidebar control sets `activeAgencyId` so a super admin can scope the UI and data to a selected agency (or clear selection for global/admin behavior as implemented). |
| **User benefit** | Support and oversight across agencies without separate logins. |
| **Related modules** | `src/components/Sidebar.jsx`, `src/context/AuthContext.jsx` (`setActiveAgencyId`), `src/lib/agencyScope.js` |
| **Important implementation notes** | Branding CSS variables update for the active agency. Data hooks use `getEffectiveAgencyScopeId` for scoping. |

### Roles & permission assignment

| | |
|---|---|
| **Description** | Create roles and assign permission keys grouped by category (global, actions, customer access, and per-platform report tabs). |
| **User benefit** | Tailor what each role can see (sidebar pages, report tabs, admin actions). |
| **Related modules** | `src/pages/Admin.jsx` (`AdminRolesTab`), `src/config/platformConfig.js` |
| **Important implementation notes** | Built-in elevated roles (`super_admin`, `admin`, `manager`) also receive broad UI access via AuthContext even when individual keys are checked. |

### Client & platform account registry

| | |
|---|---|
| **Description** | Admin → Clients manages `clients` grouping and `client_platform_accounts` (platform, customer IDs, names, GHL tokens, active flags, etc.). |
| **User benefit** | Single registry mapping business clients to ad/analytics/CRM account IDs. |
| **Related modules** | `src/pages/Admin.jsx` (`AdminClientsTab`) |
| **Important implementation notes** | Platform enum in Admin includes values beyond fully productized pages (e.g. Pinterest/Snapchat/LinkedIn listed in code); only platforms with pages + Edge Functions are fully operational end-to-end. |

### Permissions catalog sync

| | |
|---|---|
| **Description** | Admin → Permissions can seed/sync permission rows from `platformConfig` (global + report tabs), manage `agency_report_tabs`, remove legacy keys, and perform manual permission CRUD. |
| **User benefit** | Keep DB permissions aligned when new platforms/tabs are added in code. |
| **Related modules** | `src/pages/Admin.jsx` (`AdminPermissionsTab`), `src/config/platformConfig.js` (`getAllPlatformPermissions`) |
| **Important implementation notes** | Source of truth for keys is the frontend config file; sync writes into Supabase `permissions` / related tables. |

---

## Analytics

### Google Ads reporting

| | |
|---|---|
| **Description** | Dedicated Google Ads page with date presets/compare, KPIs (including compare deltas), Chart.js daily trends, and permission-filtered tabs for daily breakdown, campaign types, campaigns, ad groups, keywords, and conversions. |
| **User benefit** | Deep Google Ads analysis inside the agency UI with account scoping. |
| **Related modules** | `src/pages/GoogleAdsPage.jsx`, `src/hooks/useGoogleAdsData.js`, `src/hooks/useAgencyReportTabs.js`, `src/config/platformConfig.js` |
| **Important implementation notes** | Geo and search-terms reporting for Google Ads live on **Agency Reports** (excluded from this page’s default tab set). Sync is initiated from Settings / helpers, not as the primary page purpose. |

### Meta (Facebook) Ads reporting

| | |
|---|---|
| **Description** | Meta Ads page with campaigns, ad sets, ads, by-platform, placements, and daily tabs (permission-filtered), backed by `fb_*` daily tables. |
| **User benefit** | Meta performance review without leaving the dashboard. |
| **Related modules** | `src/pages/FacebookPage.jsx`, `src/hooks/useFacebookData.js` |
| **Important implementation notes** | Tab list matches `PLATFORM_REPORT_TABS.meta_ads`. |

### Bing / Microsoft Ads reporting

| | |
|---|---|
| **Description** | Bing page covering overview, campaigns, ad groups, ads, keywords, search terms, locations (geo), and conversions. |
| **User benefit** | Microsoft Advertising visibility alongside other paid channels. |
| **Related modules** | `src/pages/BingPage.jsx`, `src/hooks/useBingData.js` |
| **Important implementation notes** | Tabs align with `PLATFORM_REPORT_TABS.bing_ads`. Data synced via `bing-full-sync` and/or `bing_metrics_sync_all`. |

### TikTok Ads reporting

| | |
|---|---|
| **Description** | TikTok page with campaigns, ad groups, placements, and daily breakdown tabs. |
| **User benefit** | Short-form paid media metrics in the same RBAC model as other platforms. |
| **Related modules** | `src/pages/TikTokPage.jsx`, `src/hooks/useTikTokData.js` |
| **Important implementation notes** | Metrics tables omit some rate columns in DB; UI may derive CPC/CTR as needed. |

### Reddit Ads reporting

| | |
|---|---|
| **Description** | Reddit page with campaigns, ad groups, placements, and daily tabs. |
| **User benefit** | Reddit Ads performance for agencies running that channel. |
| **Related modules** | `src/pages/RedditPage.jsx`, `src/hooks/useRedditData.js` |
| **Important implementation notes** | Synced via `reddit-full-sync` after OAuth connect. |

### GA4 / web analytics

| | |
|---|---|
| **Description** | GA4 page with date compare, KPIs, charts/tables, CSV export paths, and core tabs such as Overview, Daily, Channels, Source/Medium, Campaigns, Devices, Geography, and Events. |
| **User benefit** | Website analytics next to paid media for full-funnel context. |
| **Related modules** | `src/pages/GA4Page.jsx`, `src/hooks/useGA4Data.js` |
| **Important implementation notes** | Permission keys include additional page/VDP/SRP tabs in `platformConfig`; not all config keys map 1:1 to core UI tabs. Events tab is implemented in UI. |

### GA4 Advanced (agency-specific)

| | |
|---|---|
| **Description** | Nav item “GA4 · Advanced (page / VDP)” appears only for the Wheeler agency and opens `GA4Page` in advanced mode with additional page/VDP analysis tabs (page details, VDP daily, VDP×channel/Google, make/model/RV type/condition). |
| **User benefit** | Dealer/VDP-oriented analytics for the agency that needs them. |
| **Related modules** | `src/config/navConfig.jsx` (`wheelerOnlyGa4`), `src/pages/GA4Page.jsx`, `src/hooks/useGA4Data.js` |
| **Important implementation notes** | Hard-gated by agency ID in nav/data logic—not a global feature for all tenants. |

### GHL Leads analytics

| | |
|---|---|
| **Description** | GHL Leads page with location selection, KPI cards (calls/forms/chat and compare), charts (daily stacked activity, lead-source breakdown), and detail tabs for leads, calls, form submissions, and chat widgets. Supports pagination and PII masking helpers. |
| **User benefit** | CRM lead volume and source quality tied to media accounts. |
| **Related modules** | `src/pages/GhlLeadsPage.jsx`, `src/hooks/useGhlData.js`, `src/utils/hipaa.js`, GHL views/tables via Supabase |
| **Important implementation notes** | `platformConfig` seeds only `tab.ghl.leads`; the UI exposes multiple detail tabs. HIPAA-compliant locations use CSV ingest instead of API sync (see Security / Integrations). |

### Shared date range controls

| | |
|---|---|
| **Description** | Reusable date preset / custom range / compare-period picker used across dashboard and platform pages. |
| **User benefit** | Consistent period selection and period-over-period analysis. |
| **Related modules** | `src/components/DatePicker.jsx`, `src/lib/datePresets.js` |
| **Important implementation notes** | Applied via filter state inside each page’s data hook. |

---

## Reports

### Agency Reports (Google Ads geo & search terms)

| | |
|---|---|
| **Description** | Dedicated Agency Reports page with tabs for Geo / Locations and Search Terms, client selector, date filters, on-demand sync, and paginated tables. |
| **User benefit** | Location and query-level insights useful for agency and client analysis without cluttering the main Google Ads tabs. |
| **Related modules** | `src/pages/AgencyReportsPage.jsx`, `src/hooks/useAgencyReportData.js`, `src/utils/syncHelper.js` (`syncGeo`, `resolveGeo`, `syncSearchTermsOnly`) |
| **Important implementation notes** | Sync calls `gads-status-geo` / `gads-full-sync` (search terms only) and geo resolve as needed. Client-side pagination (page size 50). |

### Monthly reports list & CRUD

| | |
|---|---|
| **Description** | Create, duplicate, open, and delete monthly reports tied to clients and months; manages related accounts, sections, and uploads in Supabase. |
| **User benefit** | Repeatable monthly client deliverable workflow. |
| **Related modules** | `src/pages/MonthlyReportsPage.jsx`, tables `monthly_reports`, `monthly_report_accounts`, `monthly_report_sections`, `monthly_report_uploads` |
| **Important implementation notes** | Gated by monthly-reports sidebar permission; create/publish actions use corresponding action permissions where enforced. |

### Monthly report editor & slides

| | |
|---|---|
| **Description** | Editor for monthly report content: paid media and SEO slide sections, previews, and publish flow. SEO content can pull GSC/GBP/GA4 via realtime Edge Function with DB fallbacks. |
| **User benefit** | Assemble client-ready monthly narratives from live synced data. |
| **Related modules** | `src/pages/MonthlyReportEditor.jsx`, `src/hooks/useMonthlyReport.js`, `src/components/MonthlySlidePreview.jsx`, `src/components/MonthlySeoSlides.jsx`, `src/utils/marketingReportRealtime.js`, `src/utils/monthlySeo*.js` |
| **Important implementation notes** | Invokes `marketing-report-realtime` and related helpers; GA4 realtime users via `ga4-realtime-users` where used in slide data. |

### Monthly export (PDF, PPTX, Google Drive)

| | |
|---|---|
| **Description** | Export monthly reports as PDF or PPTX; optional upload to Google Drive as Slides using browser Google Identity Services. |
| **User benefit** | Deliver polished files to clients or a shared Drive folder. |
| **Related modules** | `src/utils/generateMonthlyPdf.ts`, `src/utils/generateMonthlyPptx.js`, `src/utils/monthlyPptxBuilder.ts`, `src/utils/monthlySeoPptxBuilder.ts`, `src/utils/googleDriveExport.js` |
| **Important implementation notes** | Requires `VITE_GOOGLE_CLIENT_ID` (or `VITE_GA4_CLIENT_ID` fallback) for Drive; optional `VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID`. Edge Function `google-drive-upload` also exists for server-side upload. |

### PPT Report builder

| | |
|---|---|
| **Description** | PPT Report page (`/ppt-report`) selects client and month, previews defined slides, fetches live Google Ads/GA4 performance for key slides, and downloads PPTX or PDF. |
| **User benefit** | Fast marketing deck generation from dashboard data. |
| **Related modules** | `src/pages/PptReportPage.jsx`, `src/data/reportData.ts`, `src/utils/generatePptx.ts`, `src/utils/generatePdf.ts`, `src/utils/fetchPptSlide5GadsData.ts`, `src/utils/fetchPptSlide6PerformanceData.ts`, `src/components/SlidePreview.jsx`, `src/components/SlidePreviewGrid.jsx` |
| **Important implementation notes** | Editable preview fields are session-oriented (not a full persisted slide CMS). Permission: `sidebar.ppt_report`. |

---

## Notifications

### In-app toast notifications

| | |
|---|---|
| **Description** | Ephemeral toast messages (welcome, sync results, errors, account switches) stacked in the main layout. |
| **User benefit** | Immediate feedback without blocking the UI. |
| **Related modules** | `src/context/AppContext.jsx` (`showNotification`), `src/components/Notification.jsx`, mounted in `src/App.jsx` |
| **Important implementation notes** | Not a persistent notification center, email system, or inbox—toasts only, with optional duration. |

---

## Settings

### White-label branding settings

| | |
|---|---|
| **Description** | Settings section to edit agency display name, colors, sidebar colors, font, and logo (URL/upload), applying CSS variables live. |
| **User benefit** | Brand the product for each agency tenant. |
| **Related modules** | `src/pages/SettingsPage.jsx`, `src/context/AppContext.jsx`, `src/utils/agencyBranding.js`, Admin Agencies for super-admin branding |
| **Important implementation notes** | Local storage migration keys exist for legacy brand defaults; agency row from Auth ultimately drives CSS vars when available. |

### Platform connection & credential management

| | |
|---|---|
| **Description** | Settings → Platforms connects/disconnects Google Ads, Meta, Reddit, TikTok, Bing, and GA4; lists credentials/accounts; TikTok supports paste `auth_code` path; GHL uses location token / PIT configuration. |
| **User benefit** | Self-serve integration setup for agency admins. |
| **Related modules** | `src/pages/SettingsPage.jsx`, `src/components/PlatformManagementSection.jsx`, `src/pages/OAuthCallback.jsx` |
| **Important implementation notes** | Visible to admin/manager-style operators as implemented in Settings. Credentials stored in Supabase (`agency_platform_credentials` / related account tables). |

### Manual data sync with progress

| | |
|---|---|
| **Description** | Per-account and bulk sync with chunked date windows, progress UI, and writes to `sync_log`. Supports Google Ads (including sync-all), Reddit, TikTok, Bing, GA4, and GHL (including all-time mode). |
| **User benefit** | Backfill or refresh metrics without waiting solely for cron. |
| **Related modules** | `src/pages/SettingsPage.jsx`, `src/utils/syncHelper.js`, Edge `*-full-sync` / `ga4-sync` / `ghl-sync` |
| **Important implementation notes** | Google Ads chunking defaults ~5 days; GHL dated sync ~7 days. HIPAA GHL locations skip API sync and use CSV upload instead. |

### GHL HIPAA CSV upload (Settings / platforms)

| | |
|---|---|
| **Description** | For HIPAA-flagged GHL locations, operators upload call/form CSVs that upsert into `ghl_hipaa_*` tables. |
| **User benefit** | Lead reporting when API sync is disallowed for compliance reasons. |
| **Related modules** | `src/components/GhlHipaaCsvUpload.jsx`, `src/utils/ghlHipaaCsv.js`, `src/utils/ghlHipaaAttribution.js`, `PlatformManagementSection.jsx` |
| **Important implementation notes** | Chunked upserts; pairs with frontend PII masking on the GHL Leads page. |

---

## Webhooks

**No webhook features found.**  
Repository search under `src/` and `supabase/` returned no webhook handlers, inbound webhook routes, or webhook configuration UI. Platform data enters via OAuth + sync Edge Functions and scheduled SQL/HTTP jobs—not webhooks.

---

## Background Jobs

### Scheduled Google Ads sync jobs

| | |
|---|---|
| **Description** | pg_cron entries run daily Google Ads status, geo, metrics sync-all RPCs, then geo-resolve via HTTP to the Edge Function. |
| **User benefit** | Fresh Google Ads data without manual sync every day. |
| **Related modules** | `supabase/Cron-jobs.json`, SQL `gads_status_sync_all`, `gads_geo_sync_all`, `gads_metrics_sync_all`, `supabase/functions/gads-geo-resolve` |
| **Important implementation notes** | Schedules (UTC): status 06:00, geo 06:15, metrics 06:30, geo-resolve 07:00. Cron HTTP uses Vault secrets for project URL / anon key as defined in the job JSON. |

### Scheduled Bing metrics sync

| | |
|---|---|
| **Description** | Daily `bing_metrics_sync_all()` cron job. |
| **User benefit** | Automated Microsoft Ads metric refresh. |
| **Related modules** | `supabase/Cron-jobs.json`, `supabase/migrations/20260504120100_bing_metrics_sync_all.sql` |
| **Important implementation notes** | Scheduled 05:40 UTC in the checked-in cron JSON. |

### SQL sync-all routines (available; not all cron-listed)

| | |
|---|---|
| **Description** | Database functions exist to invoke platform-wide sync orchestration for Meta, Reddit, TikTok, GA4, GHL, Hoot inventory, etc. |
| **User benefit** | Operators can schedule or manually invoke bulk refreshes at the database layer. |
| **Related modules** | `supabase/full_schema.sql` (`fb_metrics_sync_all`, `reddit_metrics_sync_all`, `tt_metrics_sync_all`, `ga4_metrics_sync_all`, `ghl_sync_all`, `hoot_inventory_sync_all`, …) |
| **Important implementation notes** | Only the jobs listed in `Cron-jobs.json` are documented as scheduled in-repo; other `*_sync_all` functions may be invoked manually or via unlisted remote cron. |

### On-demand Edge sync workers

| | |
|---|---|
| **Description** | Deno Edge Functions perform OAuth connect and metric ingestion for each platform when called from Settings, Agency Reports, or cron HTTP. |
| **User benefit** | Server-side API calls with service-role upserts; keeps secrets off the browser. |
| **Related modules** | `supabase/functions/gads-full-sync`, `gads-status-geo`, `fb-full-sync`, `reddit-full-sync`, `tiktok-full-sync`, `bing-full-sync`, `ga4-sync`, `ghl-sync`, `hoot-inventory-sync`, plus OAuth/report helpers |
| **Important implementation notes** | Frontend passes the user Bearer token; functions use service role for writes. See Integrations for platform mapping. |

---

## Integrations

### Google Ads

| | |
|---|---|
| **Description** | OAuth connect (`oauth-connect`), full metrics sync, status/geo sync, geo name resolve; reporting UI + agency geo/search-term reports. |
| **User benefit** | Primary paid-search integration for most agencies. |
| **Related modules** | `oauth-connect`, `gads-full-sync`, `gads-status-geo`, `gads-geo-resolve`, `GoogleAdsPage.jsx`, `AgencyReportsPage.jsx`, `SettingsPage.jsx` |
| **Important implementation notes** | Agency-level credentials with optional MCC; documented further in `supabase/functions/gads-full-sync/KTdoc.md`. |

### Meta / Facebook Ads

| | |
|---|---|
| **Description** | Facebook Login → long-lived token; Marketing API sync into `fb_*` tables; Meta Ads page. |
| **User benefit** | Social paid performance in the same dashboard. |
| **Related modules** | `fb-oauth-connect`, `fb-full-sync`, `FacebookPage.jsx`, Settings |
| **Important implementation notes** | Graph API version pinned in the Edge Function (e.g. v21.0). |

### Reddit Ads

| | |
|---|---|
| **Description** | Reddit OAuth + ads API sync; Reddit Ads page; Settings connect/sync. |
| **User benefit** | Reddit channel coverage. |
| **Related modules** | `reddit-oauth-connect`, `reddit-full-sync`, `RedditPage.jsx` |
| **Important implementation notes** | Redirect URI can come from env, request body, or production fallback hostname in the function. |

### TikTok Ads

| | |
|---|---|
| **Description** | TikTok Marketing OAuth (and paste-code path); sync to campaign/placement daily tables; TikTok page. |
| **User benefit** | TikTok Ads reporting for agencies buying that inventory. |
| **Related modules** | `tiktok-oauth-connect`, `tiktok-full-sync`, `TikTokPage.jsx`, Settings |
| **Important implementation notes** | Accepts `TIKTOK_APP_*` or `TIKTOK_CLIENT_*` secret names. |

### Bing / Microsoft Advertising

| | |
|---|---|
| **Description** | Microsoft identity OAuth, account discovery, Reporting API SOAP/CSV sync; Bing page; cron metrics sync-all. |
| **User benefit** | Microsoft Ads parity with other search channels. |
| **Related modules** | `bing-oauth-connect`, `bing-full-sync`, `BingPage.jsx`, `scripts/bing-backfill.ps1` |
| **Important implementation notes** | Distinguishes manager customer IDs vs advertiser account IDs during sync. |

### Google Analytics 4

| | |
|---|---|
| **Description** | GA4 OAuth connect, historical sync, realtime users helper, GA4 reporting UI, monthly slide support. |
| **User benefit** | Site analytics alongside media. |
| **Related modules** | `ga4-oauth-connect`, `ga4-sync`, `ga4-realtime-users`, `GA4Page.jsx`, monthly SEO/slide utils |
| **Important implementation notes** | Large-table reads use paginated REST helpers with elevated row caps for summaries. |

### GoHighLevel (GHL)

| | |
|---|---|
| **Description** | Location credential/PIT configuration, `ghl-sync` for contacts/calls/forms, leads UI, HIPAA CSV alternative. |
| **User benefit** | Lead and call attribution next to ad spend. |
| **Related modules** | `ghl-sync`, `GhlLeadsPage.jsx`, `useGhlData.js`, Settings / PlatformManagementSection |
| **Important implementation notes** | Not OAuth-based like ads platforms; uses stored location tokens. |

### Google Search Console & Business Profile (report pipeline)

| | |
|---|---|
| **Description** | SEO data used in monthly marketing/SEO slides via `marketing-report-realtime` and DB tables/fallbacks (`gsc_daily_summary`, `gmb_*`, `gbp_performance`). Platform labels exist in `platformConfig`. |
| **User benefit** | Organic/local performance sections in client monthly decks. |
| **Related modules** | `marketing-report-realtime`, `src/utils/marketingReportRealtime.js`, `monthlySeoSlideData.js`, `monthlySeoDbFallback.js`, RLS migrations for GSC/GMB/GBP reads |
| **Important implementation notes** | No standalone “SEO Performance” page (that nav item is a placeholder). Capability is implemented inside monthly report SEO slides. |

### Hoot inventory sync

| | |
|---|---|
| **Description** | Edge Function + SQL `hoot_inventory_sync_all` sync inventory feeds into `hoot_inventory` / `client_hoot_feeds`. |
| **User benefit** | Inventory data available for reporting contexts that use it. |
| **Related modules** | `supabase/functions/hoot-inventory-sync`, schema tables/RPCs |
| **Important implementation notes** | No dedicated primary nav page named for Hoot; integration is backend/sync oriented. |

### Google Drive upload

| | |
|---|---|
| **Description** | Browser OAuth upload of monthly PPTX to Drive (optionally convert to Slides); optional Edge `google-drive-upload`. |
| **User benefit** | File delivery into a shared agency Drive folder. |
| **Related modules** | `src/utils/googleDriveExport.js`, `supabase/functions/google-drive-upload` |
| **Important implementation notes** | Frontend path is wired into monthly export UX; ensure Google Cloud OAuth client + Sheets/Drive APIs as noted in `.env.example`. |

---

## Security

### Role-based access control (RBAC)

| | |
|---|---|
| **Description** | Permissions loaded from `role_permissions` into a Set; `hasPermission(key)` gates sidebar, tabs, and actions. Elevated roles and `is_super_admin` receive broad access. |
| **User benefit** | Controlled exposure of sensitive client data and admin tools. |
| **Related modules** | `src/context/AuthContext.jsx`, `src/config/platformConfig.js`, Admin Roles |
| **Important implementation notes** | Keys cover sidebar entries, report tabs (`tab.<platform>.<tab>`), actions (`action.*`), and `customer.view_all`. |

### PermissionGate & sidebar filtering

| | |
|---|---|
| **Description** | `PermissionGate` hides UI without a key; Sidebar filters `NAV_ITEMS` by permission (plus Wheeler-only GA4 advanced rule). |
| **User benefit** | Users only see navigation they are allowed to use. |
| **Related modules** | `src/components/PermissionGate.jsx`, `src/components/Sidebar.jsx`, `src/config/navConfig.jsx` |
| **Important implementation notes** | Missing permission renders nothing (gate) or omits nav items—no separate “upgrade” upsell UI. |

### Customer / account allowlisting

| | |
|---|---|
| **Description** | `isCustomerAllowed(platform, customerId)` and AuthContext account maps restrict which platform customer IDs appear in selectors and queries for non–view-all users. |
| **User benefit** | Prevents cross-client data leakage within an agency. |
| **Related modules** | `src/context/AuthContext.jsx`, Admin user-client assignment |
| **Important implementation notes** | View-all by role or explicit permissions (`customer.view_all`, certain admin actions). |

### Row Level Security helpers (database)

| | |
|---|---|
| **Description** | Postgres helpers such as `can_access_customer`, `get_user_agency_id`, `is_admin`, `is_agency_admin`, `is_super_admin` support RLS policies on tenant and metrics tables. |
| **User benefit** | Defense in depth beyond UI gating when using the anon/authenticated keys. |
| **Related modules** | `supabase/full_schema.sql`, platform migrations (e.g. Bing RLS) |
| **Important implementation notes** | Some read policies (e.g. GSC/GMB/GBP) are “authenticated read” style—review policies when hardening. |

### HIPAA-oriented GHL handling

| | |
|---|---|
| **Description** | Per-account HIPAA flag disables API sync; CSV upload path; UI masking for names/phones/emails on GHL views. |
| **User benefit** | Safer handling of sensitive lead PII for restricted locations. |
| **Related modules** | `src/utils/hipaa.js`, `GhlHipaaCsvUpload.jsx`, `ghl-sync` (skip behavior), GHL page |
| **Important implementation notes** | This is an application control path—not a claim of full HIPAA certification or BAA coverage. |

---

## Performance

### Paginated PostgREST fetching

| | |
|---|---|
| **Description** | `supabaseRest.js` pages at 1000 rows (Supabase default), with retries, optional avoidance of expensive exact counts, and max-row caps (including higher caps for GA4 summary). |
| **User benefit** | Large date ranges remain usable without single huge payloads failing. |
| **Related modules** | `src/lib/supabaseRest.js` |
| **Important implementation notes** | Parallel page batches (e.g. 8) when total count is known; logs when fetches hit caps. |

### Client-side table pagination

| | |
|---|---|
| **Description** | Platform and Agency Reports tables paginate in the UI (typical page sizes ~25–50); GHL uses additional server/client pagination patterns in its hook. |
| **User benefit** | Responsive tables for dense campaign/keyword/lead lists. |
| **Related modules** | Platform pages, `AgencyReportsPage.jsx`, `useGhlData.js` |
| **Important implementation notes** | Pagination is mostly client-side after fetch unless the hook implements server limits. |

### Chunked sync windows

| | |
|---|---|
| **Description** | Long backfills are split into sequential date chunks to avoid Edge timeouts and oversized API pulls. |
| **User benefit** | Reliable historical sync with progress visibility. |
| **Related modules** | `src/utils/syncHelper.js`, Settings sync handlers |
| **Important implementation notes** | Failures can continue subsequent chunks; errors collected per window. |

### Production asset caching (Vercel)

| | |
|---|---|
| **Description** | `vercel.json` sets HTML to no-cache and hashed `/assets/*` to long-cache immutable. |
| **User benefit** | Fast repeat loads with safer HTML updates after deploys. |
| **Related modules** | `vercel.json`, `src/main.jsx` (`vite:preloadError` reload) |
| **Important implementation notes** | Preload error handler reloads once when a stale `index.html` references removed chunks after deploy. |

### Inline critical CSS load

| | |
|---|---|
| **Description** | Global CSS is imported inline in `main.jsx` and injected as a `<style>` tag to avoid missing CSS chunk issues behind proxies. |
| **User benefit** | More reliable styling in constrained hosting/preview environments. |
| **Related modules** | `src/main.jsx`, `src/styles/style.css`, `src/styles/utilities.css` |
| **Important implementation notes** | Comment in `main.jsx` documents the motivation explicitly. |

---

## Out of scope (not implemented as features)

The following appear in navigation or `PLACEHOLDER_PAGES` as **“Coming soon”** stubs via `PlaceholderPage.jsx` and are **not** documented as product features:

- DSP / Programmatic (TTD / DV360)  
- Dating Apps / Direct  
- CTV Campaigns  
- Email Marketing  
- OTT / Vimeo  
- Standalone SEO Performance page  
- Creative Analysis  
- Events / Special  
- Amazon Ads / Geographic View entries present only as placeholders  

SEO-related **monthly slide** functionality is implemented under Reports and is documented there—not as the standalone SEO nav page.

---

*End of features draft.*
