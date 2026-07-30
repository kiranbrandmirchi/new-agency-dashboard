# Agency Dashboard — Developer Guide

> Practical guide for engineers working in this repository.  
> Based on the actual toolchain and conventions observed in code—not aspirational tooling.  
> Does not modify the root `README.md`.

---

## Folder explanations

```text
new-agency-dashboard/
├── src/                    # Entire React SPA
├── supabase/               # DB config, migrations, Edge Functions
├── public/                 # Static assets served at site root
├── brand/                  # Source brand kits (not always shipped as /public)
├── scripts/                # Ops helpers (PowerShell / Node / SQL)
├── docs/readme-work/       # Documentation drafts (this guide lives here)
├── index.html              # Vite HTML entry
├── package.json            # Scripts & dependencies
├── package-lock.json       # Locked npm tree (commit this)
├── vite.config.js          # Vite + React plugin
├── vercel.json             # SPA rewrites + cache headers
├── .env.example            # Frontend env template
├── schema.sql              # Schema dump (reference)
└── supabase/full_schema.sql
```

### `src/` (application code)

| Path | Purpose |
|---|---|
| `src/main.jsx` | Bootstrap: inline CSS, providers, ErrorBoundary, root render |
| `src/App.jsx` | `BrowserRouter`, auth routes, dashboard shell, `currentPage` switcher |
| `src/pages/` | Feature screens (`*Page.jsx`, Admin, auth, editors) |
| `src/pages/backups/` | Historical snippets—**not imported**; do not treat as live code |
| `src/components/` | Shared UI (Sidebar, Header, gates, previews, uploaders) |
| `src/hooks/` | Data-fetching / view-model hooks (`use*Data.js`) |
| `src/context/` | `AuthContext`, `AppContext`, report branding |
| `src/lib/` | Supabase clients, REST pagination, agency scope, date presets |
| `src/utils/` | Sync, exports (PDF/PPTX), SEO/HIPAA/Drive helpers |
| `src/config/` | Nav items + permission/platform catalog |
| `src/data/` | Static titles / report slide definitions |
| `src/styles/` | Global CSS (inlined at runtime) + report preview CSS |

### `supabase/`

| Path | Purpose |
|---|---|
| `config.toml` | Local Supabase CLI project settings |
| `migrations/` | SQL migrations (several empty placeholders + later Bing/GSC/GBP files) |
| `functions/<name>/index.ts` | One Deno Edge Function per folder |
| `Cron-jobs.json` | Documented pg_cron job definitions |
| `full_schema.sql` | Large schema dump |

### Other

| Path | Notes |
|---|---|
| `public/` | Logos referenced as `/brand-logo.png`, etc. |
| `scripts/` | e.g. `bing-backfill.ps1`, `inspect-pptx.mjs`, verify SQL |
| `.tmp-*` | Local PPTX inspection artifacts—exclude from reviews/PRs when possible |
| `README_OLD.md` | Prior README backup |

There is **no** `app/` (Next), `services/`, `repositories/`, or `.github/workflows` in this repo.

---

## Coding conventions

Observed patterns (informal—there is no enforced style guide file):

1. **SPA-first** — All UI is client React. Server work goes in Edge Functions or SQL.  
2. **Feature colocated with hooks** — Page + `useXData` hook + optional utils.  
3. **Named exports for pages** — e.g. `export function GoogleAdsPage()`. Default export mainly for `App`.  
4. **Context for cross-cutting state** — Auth and app chrome, not Redux/Zustand.  
5. **Permissions in config** — Add keys to `platformConfig.js`, then Admin → **Sync Platform Config**.  
6. **Nav + routing** — Add `NAV_ITEMS` in `navConfig.jsx`; wire `CurrentPage` in `App.jsx` if URL-less; add a Route only when a dedicated path is needed (`/admin`, `/ppt-report`, …).  
7. **Supabase access** — Prefer `supabase` from `lib/supabaseClient.js`; use `supabaseRest.js` for large paginated reads.  
8. **Edge Functions** — Deno `Deno.serve`, CORS helpers, JSON or text/plain responses; secrets via `Deno.env`.  
9. **Comments** — Prefer explaining non-obvious sync/auth/HIPAA behavior; avoid narrating obvious JSX.  
10. **Placeholders** — Unbuilt nav targets use `PlaceholderPage`; do not pretend they are live features.

### Language mix

| Area | Language |
|---|---|
| Most UI | `.jsx` / `.js` |
| Export / slide helpers | Often `.ts` |
| Edge Functions | TypeScript (`index.ts`) without a root `tsconfig.json` |
| Schema | SQL |

There is **no** project-wide TypeScript strict mode or path aliases configured in Vite.

---

## Naming conventions

| Kind | Convention | Examples |
|---|---|---|
| Page components | PascalCase + `Page` suffix | `GoogleAdsPage.jsx`, `SettingsPage.jsx` |
| Shared components | PascalCase | `PermissionGate.jsx`, `DatePicker.jsx` |
| Hooks | `use` + PascalCase domain | `useGoogleAdsData.js`, `useGhlData.js` |
| Context | `*Context.jsx` + `*Provider` / `use*` | `AuthContext.jsx` → `useAuth` |
| Utils | camelCase file names | `syncHelper.js`, `generatePptx.ts` |
| Config constants | SCREAMING_SNAKE or exported const objects | `PLATFORM_REPORT_TABS`, `NAV_ITEMS` |
| Permission keys | dotted lowercase | `sidebar.google_ads`, `tab.bing_ads.campaigns` |
| Platform IDs (DB/UI) | snake_case | `google_ads`, `bing`, `ga4`, `ghl` |
| Edge Function folders | kebab-case | `gads-full-sync`, `bing-oauth-connect` |
| SQL tables | snake_case | `gads_campaign_daily`, `client_platform_accounts` |
| CSS | existing global classes in `style.css` | Prefer existing BEM-like / utility classes over new frameworks |

**Inconsistent but present:** Meta UI uses page id `meta-ads` / permission `sidebar.facebook_ads` / platform key `meta` or `facebook_ads` in places—check surrounding code before adding a new platform string.

---

## Package scripts

From `package.json` (only these exist):

| Script | Command | Use |
|---|---|---|
| `npm run dev` | `vite` | Local development server (default [http://localhost:5173](http://localhost:5173)) |
| `npm run build` | `vite build` | Production bundle → `dist/` |
| `npm run preview` | `vite preview` | Serve `dist/` locally |

There are **no** `lint`, `test`, `format`, or `typecheck` scripts.

---

## Dependency overview

### Runtime (`dependencies`)

| Package | Role |
|---|---|
| `react` / `react-dom` | UI |
| `react-router-dom` | Auth + shell routing |
| `@supabase/supabase-js` | Auth, PostgREST, `functions.invoke` |
| `chart.js` / `recharts` | Charts |
| `jspdf` / `html2canvas` | PDF / screenshot export |
| `pptxgenjs` | PowerPoint generation |
| `papaparse` | CSV parsing (HIPAA uploads, etc.) |

### Development (`devDependencies`)

| Package | Role |
|---|---|
| `vite` | Bundler / dev server |
| `@vitejs/plugin-react` | React Fast Refresh |
| `supabase` | CLI for local/remote Supabase workflows |

Package manager: **npm** (`package-lock.json`). Prefer `npm ci` in clean CI-like installs.

---

## Development workflow

### First-time setup

```bash
git clone <repo-url>
cd new-agency-dashboard
npm install
cp .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

You need a reachable Supabase project (Auth + schema +, for sync features, deployed Edge Functions and secrets). See `02-installation.md`.

### Day-to-day loop

1. `npm run dev`  
2. Change UI under `src/` — HMR via Vite  
3. Verify with a real user that has `user_profiles` + permissions  
4. For Edge Function changes: edit `supabase/functions/<name>/index.ts`, deploy with Supabase CLI/Dashboard, then retest from Settings/sync  
5. `npm run build` before shipping frontend to catch bundle errors  

### Frontend env changes

Restart Vite after editing `.env`. Only `VITE_*` variables are exposed to the browser.

### Security note

`.env` is **not** listed in `.gitignore` (only `*.local` and seeds). Do **not** commit secrets. Prefer adding `.env` to ignore locally/team-wide and rotate keys if exposed.

---

## Git workflow

Observed remote: `origin` → GitHub (`new-agency-dashboard`). Recent commits are short, feature-oriented messages (no Conventional Commits enforcement).

**Suggested practice (not enforced by CI):**

1. Create a branch from the team’s mainline (`feature/…`, `fix/…`).  
2. Keep commits focused (UI vs Edge Function vs SQL when possible).  
3. Open a PR for review.  
4. Deploy frontend via Vercel; deploy Supabase artifacts separately.  

**No in-repo automation:** no `.github/workflows`, no required status checks defined here, no Husky/pre-commit hooks.

**Do not commit:** `node_modules/`, `dist/`, seed dumps, `.tmp-*` inspection trees, real `.env` values, or large binary PPTX experiments unless intentional.

---

## Code quality

Quality today relies on:

- Manual review  
- Running the app against a real Supabase project  
- `npm run build` as a smoke check  
- Edge Function logs in Supabase Dashboard  

There is **no** automated quality gate (lint/test/typecheck) in `package.json`.

When changing permissions or platforms, keep **`platformConfig.js`**, **Admin sync**, **nav**, **page tabs**, and **Edge/SQL** aligned—drift is a common source of “missing tab” bugs.

---

## Linting

**Not configured.**

- No ESLint / Biome config files  
- No `eslint` dependency in `package.json`  
- No `npm run lint`  

If you add linting, introduce it as an explicit team decision (config + script + CI), rather than assuming it exists.

---

## Formatting

**Not configured.**

- No Prettier / EditorConfig in repo  
- Formatting is whatever the author/editor produces  

Match surrounding file style (quotes, semicolons, indentation) when editing.

---

## Testing

**No automated test suite found.**

- No `*.test.*` / `*.spec.*` files in app source  
- No Jest / Vitest / Playwright / Cypress dependencies or scripts  

Validation is manual:

| Area | How to test manually |
|---|---|
| Auth | Login/logout; user without profile; permission-restricted role |
| Dashboard | Date range + compare; multi-platform accounts |
| Sync | Settings → sync one account; check `sync_log` + tables |
| OAuth | Connect platform → callback → credentials row |
| Reports | Monthly/PPT export PDF & PPTX |
| Admin | Create user, assign clients, sync permissions |
| RLS | Restricted user must not see other customers’ metrics |

Optional ops scripts under `scripts/` can help verify platform data (e.g. Bing backfill, Reddit SQL checks).

---

## Debugging tips

### Frontend

1. **Blank / auth loop** — Check Network for Supabase Auth; confirm `VITE_SUPABASE_*`; inspect `AuthContext` console warnings (`[Auth] …`).  
2. **“Failed to load profile”** — Profile query timeout or missing `user_profiles`; temporary network blips are mitigated by debounce—hard refresh if stuck.  
3. **Empty metrics** — Verify `client_platform_accounts` for the agency, user allowlist/`customer.view_all`, date range, and that sync populated `*_daily` tables.  
4. **Permission missing** — Role lacks key; run Admin → Permissions sync from `platformConfig.js`.  
5. **Wrong agency data (super admin)** — Check sidebar agency switcher / `activeAgencyId`.  
6. **Stale UI after deploy** — Hard refresh; `vite:preloadError` should reload once if chunks 404.  
7. **CSS missing** — Global CSS is inlined in `main.jsx`; avoid assuming separate CSS chunk URLs.  
8. **React DevTools** — Inspect `AuthContext` / `AppContext` values.

### Edge Functions

1. Supabase Dashboard → Edge Functions → Logs.  
2. Many sync endpoints return **text/plain** logs (`gads-full-sync`, `fb-full-sync`, `gads-status-geo`)—read the body, not only status.  
3. Confirm secrets (`GADS_*`, `FB_*`, `BING_*`, …) are set on the **project**, not only in Vite `.env`.  
4. OAuth failures — redirect URI mismatch; admin-only functions require admin role.  
5. Local invoke: use Supabase CLI (`supabase functions serve` / `deploy`) per CLI docs—functions are Deno, not Vite.

### Database

1. Studio SQL for row counts by `customer_id` / date.  
2. Compare dumps vs live (`gbp_performance`, classified pages)—dumps can lag.  
3. RLS denials look like empty arrays—test with service role only in controlled environments.

### Useful breakpoints

| Symptom | Start here |
|---|---|
| Can’t see sidebar item | `navConfig.jsx` + `hasPermission` |
| Sync button fails | `SettingsPage.jsx` + `syncHelper.js` + function logs |
| GHL empty / HIPAA | `hipaa_compliant` flag + CSV path vs `ghl-sync` skip |
| PPT empty slides | `PptReportPage` + `fetchPptSlide*` utils |

---

## Common development tasks

### Add a sidebar page (existing data)

1. Add item to `NAV_ITEMS` in `src/config/navConfig.jsx` (permission key).  
2. Add permission to `PLATFORM_PERMISSIONS` if new.  
3. Create `src/pages/MyFeaturePage.jsx`.  
4. Branch it in `App.jsx` `CurrentPage`.  
5. Admin → Sync Platform Config; grant role permission.  

### Add a report tab to an existing platform

1. Extend `PLATFORM_REPORT_TABS` in `platformConfig.js`.  
2. Sync permissions in Admin.  
3. Render the tab in the platform page (filter via `hasPermission`).  

### Add a new ad platform (full stack)

1. Tables + RLS migration under `supabase/migrations/`.  
2. Edge Functions: `*-oauth-connect`, `*-full-sync`.  
3. Secrets in Supabase.  
4. Settings UI connect/sync in `SettingsPage` / `PlatformManagementSection`.  
5. Hook + page + nav + `platformConfig`.  
6. Wire OAuth callback platform branch in `OAuthCallback.jsx`.  

### Change white-label defaults

- Agency row fields / Settings white-label section.  
- CSS variables applied in `AuthContext` / branding utils.  

### Chunked backfill

- Use Settings sync UI or `scripts/bing-backfill.ps1` (expects env URL/key).  
- Prefer small date windows to avoid Edge timeouts.  

### Deploy frontend

- Push to the branch connected to Vercel (or Vercel CLI).  
- Ensure Vercel env has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (and optional Google client IDs).  

### Deploy Edge Function

```bash
# Example — use your installed Supabase CLI & project ref
npx supabase functions deploy gads-full-sync
```

(Exact login/link flags depend on your CLI version and project.)

### Inspect schema

- Prefer live Studio + `supabase/migrations/` for changes.  
- Use `schema.sql` / `full_schema.sql` as reference only (`04-database.md` notes dump gaps).  

---

## Quick reference — related docs

| Doc | Contents |
|---|---|
| `02-installation.md` | Env vars, install, deploy prerequisites |
| `05-api.md` | Edge Function contracts |
| `04-database.md` | Tables, RLS, migrations |
| `06-architecture.md` | System architecture & flows |
| `repository-map.md` | Full directory map |

---

*End of developer guide draft.*
