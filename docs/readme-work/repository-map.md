# Repository Map — Agency Dashboard

Complete directory map with explanations. Companion to `00-project-analysis.md`.

Generated: 2026-07-29

---

## Root

```
new-agency-dashboard/
├── .env                        # Local Vite env (exists; NOT listed in .gitignore — security risk)
├── .env.example                # Documented frontend env template (safe to commit)
├── .gitignore                  # Ignores node_modules, dist, seeds; does not ignore .env
├── README_OLD.md               # Backup of previous README.md (WowDashboard setup notes)
├── brand logo.png              # Loose brand PNG at root (duplicate of public assets?)
├── index.html                  # Vite HTML shell; title "Chipper Digital — Dashboard"
├── package.json                # wow-dashboard; Vite/React scripts & deps
├── package-lock.json           # npm lockfile
├── schema.sql                  # Large Postgres schema dump (reference)
├── test-export.pptx            # Sample PPTX export artifact
├── vercel.json                 # Vercel SPA rewrites + cache headers
├── vite.config.js              # Vite + @vitejs/plugin-react (minimal)
├── brand/                      # Source brand kits (Red Castle)
├── docs/                       # Documentation work area
├── public/                     # Static assets copied to site root
├── scripts/                    # Ops / inspection scripts
├── src/                        # Frontend application (all UI)
├── supabase/                   # Supabase config, migrations, Edge Functions
├── .tmp-pptx-compare/          # Local PPTX diff inspection (not app source)
├── .tmp-pptx-inspect/          # Local PPTX unzip inspection
├── .tmp-sosrafa-inspect/       # Local PPTX/template inspection
├── .tmp-sosrafa-inspect.zip    # Archive of inspection
├── .tmp-sosrafa.zip            # Archive of inspection
└── node_modules/               # Dependencies (gitignored)
```

**Not present at root:** `next.config.*`, `middleware.ts`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml`, `.github/`, `app/`, `services/`, `repositories/`.

---

## `brand/`

```
brand/
├── RC-logo-new-.png
├── Red Castle Logo 2.png
├── Red Castle Logo.jpg
└── Red Castle Services Brand Guidelines 2023 (2).pdf
```

Agency/white-label source artwork and brand guidelines. Not the same as `public/` runtime logos (Chipper / RC variants served to the browser).

---

## `docs/`

```
docs/
└── readme-work/
    ├── 00-project-analysis.md   # Architecture & inventory analysis (this effort)
    └── repository-map.md        # This file
```

Scratch space for README rewrite work. No published user-facing docs yet.

---

## `public/`

```
public/
├── brand-logo.png      # Auth / app logo (Chipper Digital path in ProtectedRoute)
├── rc-brand-logo.png   # Red Castle / alternate brand marks
├── rc-logo-full.png
├── rc-logo-rcs.jpg
└── rc-logo.png
```

Static files served at `/filename`. Used for login branding and white-label display.

---

## `scripts/`

```
scripts/
├── bing-backfill.ps1           # PowerShell helper to backfill Bing metrics
├── inspect-pptx.mjs            # Node script to inspect PPTX structure
└── verify-reddit-jan-data.sql  # Ad-hoc SQL check for Reddit January data
```

Operator utilities; not part of the Vite build.

---

## `src/` — Frontend application

```
src/
├── main.jsx                 # React bootstrap; inlines global CSS; providers
├── App.jsx                  # react-router routes + dashboard shell / page switcher
├── components/
├── config/
├── context/
├── data/
├── hooks/
├── lib/
├── pages/
├── styles/
└── utils/
```

### `src/components/`

| File | Explanation |
|---|---|
| `Sidebar.jsx` | Main nav from `navConfig`; permission-filtered |
| `Header.jsx` | Title bar, client selector, actions |
| `Notification.jsx` | Toast container / notifications |
| `ProtectedRoute.jsx` | Requires Supabase session; shows auth errors |
| `PermissionGate.jsx` | Renders children only if permission key granted |
| `ErrorBoundary.jsx` | Top-level React error boundary |
| `DatePicker.jsx` | Shared date range control |
| `PlatformLogos.jsx` | SVG logos for Google/Meta/Microsoft/Reddit |
| `PlatformManagementSection.jsx` | Settings UI for platform accounts / sync controls |
| `CombinedDashboardAccountTable.jsx` | Cross-platform account table on dashboard |
| `CsvUploader.jsx` | Generic CSV upload helper |
| `GhlHipaaCsvUpload.jsx` | HIPAA-mode GHL CSV ingest UI |
| `ReportPreview.jsx` | Report preview chrome |
| `reportPreviewContext.js` | Context for report preview state |
| `SlidePreview.jsx` | Single PPT slide preview |
| `SlidePreviewGrid.jsx` | Grid of slide previews |
| `MonthlySlidePreview.jsx` | Monthly report slide preview |
| `MonthlySeoSlides.jsx` | SEO slide set for monthly reports |

### `src/config/`

| File | Explanation |
|---|---|
| `navConfig.jsx` | Sidebar NAV_ITEMS (sections, permissions, logos) |
| `platformConfig.js` | Permission catalog + per-platform report tabs; Admin “Sync Platform Config” source |
| `auth.js` | Stub note pointing to Supabase Auth |

### `src/context/`

| File | Explanation |
|---|---|
| `AuthContext.jsx` | Session, profile, RBAC, agency switcher, allowed accounts |
| `AppContext.jsx` | Current page, sidebar, branding colors, notifications, client selection |
| `ReportBrandingContext.jsx` | Branding context for report exports/previews |

### `src/data/`

| File | Explanation |
|---|---|
| `staticData.js` | Page titles and static UI strings |
| `reportData.ts` | Typed shapes / sample data for report builders |

### `src/hooks/`

| File | Explanation |
|---|---|
| `useCombinedDashboardData.js` | Aggregates multi-platform metrics for dashboard |
| `useGoogleAdsData.js` | Google Ads table queries |
| `useFacebookData.js` | Meta Ads queries |
| `useBingData.js` | Bing Ads queries |
| `useTikTokData.js` | TikTok Ads queries |
| `useRedditData.js` | Reddit Ads queries |
| `useGA4Data.js` | GA4 analytics queries / RPCs |
| `useGhlData.js` | GHL leads/calls/forms (+ HIPAA) |
| `useAgencyReportData.js` | Agency Reports data loading |
| `useAgencyReportTabs.js` | Agency report tab configuration |
| `useMonthlyReport.js` | Monthly report entity + metrics for editor |

### `src/lib/`

| File | Explanation |
|---|---|
| `supabaseClient.js` | Creates browser Supabase client from `VITE_*` |
| `supabase.js` | Re-export of client |
| `supabaseRest.js` | Paginated PostgREST fetch helpers + query builders |
| `agencyScope.js` | Resolves effective agency id for super-admin vs normal users |
| `datePresets.js` | Shared date range presets |

### `src/pages/`

| File | Explanation |
|---|---|
| `Login.jsx` | Email/password sign-in |
| `Signup.jsx` | Registration |
| `OAuthCallback.jsx` | Completes Google Ads / GA4 / Meta / Reddit / TikTok / Bing OAuth |
| `CombinedDashboardPage.jsx` | Executive / combined dashboard |
| `GoogleAdsPage.jsx` | Google Ads reporting UI |
| `FacebookPage.jsx` | Meta Ads reporting UI |
| `BingPage.jsx` | Bing / Microsoft Ads UI |
| `TikTokPage.jsx` | TikTok Ads UI |
| `RedditPage.jsx` | Reddit Ads UI |
| `GA4Page.jsx` | GA4 analytics (+ advanced mode) |
| `GhlLeadsPage.jsx` | GoHighLevel leads |
| `AgencyReportsPage.jsx` | Agency-level reports |
| `MonthlyReportsPage.jsx` | Monthly report list / CRUD |
| `MonthlyReportEditor.jsx` | Monthly report editor |
| `PptReportPage.jsx` | PPT marketing report builder |
| `SettingsPage.jsx` | White-label + OAuth connect + sync |
| `Admin.jsx` | Agencies / Users / Roles / Clients / Permissions |
| `PlaceholderPage.jsx` | Stub for unimplemented nav items |
| `backups/` | Historical alternate client-loading snippets for PPT page |

### `src/pages/backups/`

```
backups/
├── PptReportPage-loadClients.client-platform-accounts.backup.js
└── PptReportPage-loadClients.clients-table.backup.js
```

Not imported by the app; kept for reference during PPT client-loading refactors.

### `src/styles/`

| File | Explanation |
|---|---|
| `style.css` | Primary application stylesheet (inlined in `main.jsx`) |
| `utilities.css` | Utility classes (inlined) |
| `pptSlidePreview.css` | PPT slide preview layout |
| `monthlySlidePreview.css` | Monthly slide preview |
| `monthlyReportEditor.css` | Monthly report editor |

### `src/utils/`

Grouped by concern:

**Formatting / errors**

- `format.js` — currency, numbers, percents
- `apiErrorMessage.js` — normalize API errors for UI

**Sync**

- `syncHelper.js` — chunked Google Ads / GHL sync + status/geo helpers

**Agency / HIPAA / GHL CSV**

- `agencyBranding.js`
- `hipaa.js`
- `ghlHipaaCsv.js`
- `ghlHipaaAttribution.js`

**Google Drive / Sheets**

- `googleDriveExport.js` — browser OAuth + Drive upload
- `googleSheetsEmbed.js`
- `auctionInsightsSheet.js`
- `keywordSheetCapture.js`

**PPT / PDF exports (classic PPT report)**

- `generatePptx.ts`, `generatePdf.ts`
- `fetchPptSlide5GadsData.ts`, `fetchPptSlide6PerformanceData.ts`
- `slideDimensions.ts`, `loadImageDataUrl.ts`, `reportFileName.ts`

**Monthly report exports & SEO**

- `generateMonthlyPptx.js`, `generateMonthlyPdf.ts`
- `monthlyPptxBuilder.ts`, `monthlySeoPptxBuilder.ts`
- `monthlySlideData.js`, `monthlySeoSlideData.js`, `monthlySlideCapture.ts`
- `monthlyClientSeoConfig.js`, `monthlySeoDbFallback.js`
- `monthlyReportHelpers.js`, `buildMonthlyExportData.js`, `mapMonthlyExportToReportData.js`
- `marketingReportRealtime.js` — invokes `marketing-report-realtime`

---

## `supabase/`

```
supabase/
├── config.toml              # Local Supabase CLI project config
├── Cron-jobs.json           # Documented pg_cron job definitions
├── full_schema.sql          # Full schema dump (functions, tables, RLS, grants)
├── migrations/              # Ordered SQL migrations
└── functions/               # Deno Edge Functions (one folder per function)
```

`seed.sql` is referenced by `config.toml` but gitignored (not in tree).

### `supabase/migrations/`

| File | Likely purpose (from name / header) |
|---|---|
| `00000000000000_.sql` | Baseline / bootstrap migration |
| `20260308180929_.sql` … `20260429193500_.sql` | Incremental schema/auth/platform evolution (unnamed) |
| `20260504120000_bing_ads_reporting.sql` | Bing tables + RLS |
| `20260504120100_bing_metrics_sync_all.sql` | Bing metrics sync-all RPC |
| `20260529120000_gsc_gmb_read_policies.sql` | Authenticated read policies for GSC/GMB |
| `20260530120000_gbp_performance_read_policy.sql` | Authenticated read on `gbp_performance` |
| `20260713143500_bing_role_permissions.sql` | Seed Bing sidebar/tab permissions for roles |

### `supabase/functions/`

Each folder is a deployable Edge Function with `index.ts`:

| Folder | Explanation |
|---|---|
| `oauth-connect/` | Google Ads OAuth connect |
| `ga4-oauth-connect/` | GA4 Google OAuth connect |
| `fb-oauth-connect/` | Meta OAuth → long-lived token |
| `reddit-oauth-connect/` | Reddit Ads OAuth |
| `tiktok-oauth-connect/` | TikTok Marketing OAuth |
| `bing-oauth-connect/` | Microsoft Ads OAuth + account discovery |
| `gads-full-sync/` | Google Ads metrics sync (+ `KTdoc.md` knowledge transfer) |
| `gads-status-geo/` | Status entities + geo performance sync |
| `gads-geo-resolve/` | Resolve geo IDs to names |
| `ga4-sync/` | GA4 data sync into `ga4_*` |
| `ga4-realtime-users/` | Realtime/active users for slides |
| `fb-full-sync/` | Meta Ads metrics sync |
| `reddit-full-sync/` | Reddit metrics sync |
| `tiktok-full-sync/` | TikTok metrics sync |
| `bing-full-sync/` | Bing Reporting API SOAP/CSV sync |
| `ghl-sync/` | GoHighLevel sync |
| `hoot-inventory-sync/` | Hoot inventory feed sync |
| `marketing-report-realtime/` | SEO marketing report (GSC/GBP/GA4) |
| `google-drive-upload/` | Drive upload helper |

Only documented KT doc in-repo: `gads-full-sync/KTdoc.md`.

---

## Temporary / non-source trees

```
.tmp-pptx-compare/     # Unzipped PPTX compare (old vs new slides, rels, notes)
.tmp-pptx-inspect/     # Unzipped PPTX inspection
.tmp-sosrafa-inspect/  # Another PPTX/template inspection tree
*.zip                  # Archives of the above
```

Used for slide-structure debugging. Safe to exclude from documentation audiences and ideally from version control if not already ignored.

---

## Mental model: where to look for X

| Need | Look here |
|---|---|
| Add a sidebar page | `src/config/navConfig.jsx` + page under `src/pages/` + `App.jsx` `CurrentPage` |
| Add a permission / report tab | `src/config/platformConfig.js` → Admin → Sync Platform Config |
| Change auth / tenancy | `src/context/AuthContext.jsx` + `user_profiles` / RLS SQL |
| Change dashboard metrics | `src/hooks/useCombinedDashboardData.js` |
| Connect a new ad platform | Settings + new `*-oauth-connect` + `*-full-sync` + tables/migrations |
| Google Ads sync details | `supabase/functions/gads-full-sync/` (+ `KTdoc.md`) |
| Cron schedule | `supabase/Cron-jobs.json` + SQL `*_sync_all` functions |
| Deploy frontend | `vercel.json` + `npm run build` |
| Env for local UI | `.env.example` → `.env` (`VITE_*` only) |
| Env for Edge Functions | Supabase project secrets (not in Vite `.env`) |

---

## End of map
