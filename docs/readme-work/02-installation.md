# Agency Dashboard — Installation & Configuration

> Setup guide derived from repository configuration.  
> Secrets are never included—variable **names** and purposes only.  
> Does not modify the root `README.md`.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** | Compatible with Vite 5 / React 18 (current LTS recommended; no `engines` field in `package.json`) |
| **npm** | Used by this repo (`package-lock.json` present; install via `npm install`) |
| **Git** | To clone the repository |
| **Supabase project** | Required for Auth, Postgres, and Edge Functions; the SPA will warn if URL/anon key are missing |
| **Modern browser** | For local UI at the Vite dev server |

Optional (depending on what you run):

| Optional | When needed |
|---|---|
| **Supabase CLI** | Listed as a devDependency (`supabase`); useful for local Supabase / function workflows |
| **Vercel account / CLI** | Production SPA hosting (`vercel.json` present) |
| **Platform developer apps** | Google Ads, GA4, Meta, Reddit, TikTok, Bing, etc., if connecting those integrations |
| **PowerShell** | Only if using `scripts/bing-backfill.ps1` |

---

## Installation

High-level steps:

1. Clone the repository  
2. Install npm packages  
3. Create a `.env` from `.env.example` and set frontend variables  
4. Ensure the target Supabase project (schema, auth, Edge Functions, secrets) is available  
5. Start the development server  

---

## Clone Repository

```bash
git clone <repository-url>
cd new-agency-dashboard
```

Replace `<repository-url>` with your Git remote.

---

## Package Installation

From the repository root:

```bash
npm install
```

This installs dependencies and devDependencies from `package.json` / `package-lock.json`, including React, Vite, `@supabase/supabase-js`, chart/export libraries, and the Supabase CLI package.

---

## Environment Variables

Environment configuration is split into two places:

1. **Frontend (Vite)** — root `.env` (copy from `.env.example`). Variables must be prefixed with `VITE_` to be exposed to the browser.  
2. **Supabase Edge Functions** — project secrets in the Supabase dashboard / CLI (`Deno.env`). Not read from the Vite `.env` file by the SPA.

> **Security:** Never commit real keys or tokens. Prefer keeping `.env` out of version control. Do not paste production secrets into docs or chat.

### Frontend variables (`.env`)

Documented in `.env.example` and/or referenced in `src/`.

| Variable | Required | Source in repo | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | **Yes** (for normal use) | `.env.example`, `supabaseClient.js`, `supabaseRest.js`, Settings/OAuth/sync helpers | Supabase project URL (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | **Yes** (for normal use) | `.env.example`, `supabaseClient.js`, `supabaseRest.js` | Supabase **anon** (public) key for the browser client |
| `VITE_APP_NAME` | No | `.env.example`, `Login.jsx` | App name on the login page (default: `Agency Dashboard`) |
| `VITE_AUTH_DISABLED` | No | `.env.example`, `AuthContext.jsx` | If `true` / `1` / `yes`, skips Supabase Auth and uses a public demo-style session |
| `VITE_GOOGLE_CLIENT_ID` | No* | `.env.example`, `googleDriveExport.js` | Google OAuth 2.0 **Web** client ID for Drive/Sheets export from the browser |
| `VITE_GA4_CLIENT_ID` | No* | `googleDriveExport.js` | Fallback client ID if `VITE_GOOGLE_CLIENT_ID` is unset (same Google Cloud Web client pattern) |
| `VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID` | No | `.env.example`, `googleDriveExport.js` | Optional Drive folder ID for report uploads |

\* Required only when using Google Drive / Slides export features from the UI.

**Setup:**

```bash
cp .env.example .env
```

Then edit `.env` and set at least `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project settings (**Project Settings → API**). Leave placeholder values only in examples—never publish real keys.

### Edge Function secrets (Supabase project)

These names appear in `supabase/functions/*/index.ts`. Set them as **Supabase Edge Function secrets**, not as Vite frontend env (unless you intentionally duplicate a public client ID).

| Variable | Used by (examples) | Purpose |
|---|---|---|
| `SUPABASE_URL` | Most functions | Supabase API base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Most functions | Service-role key for privileged DB/Auth operations inside functions |
| `SUPABASE_ANON_KEY` | `reddit-oauth-connect` | Anon key where the function needs it |
| `GADS_CLIENT_ID` | `oauth-connect`, `gads-full-sync`, `gads-status-geo`, `gads-geo-resolve` | Google Ads OAuth client ID |
| `GADS_CLIENT_SECRET` | Same | Google Ads OAuth client secret |
| `GADS_DEVELOPER_TOKEN` | `gads-full-sync`, `gads-status-geo`, `gads-geo-resolve` | Google Ads API developer token |
| `GA4_CLIENT_ID` | `ga4-oauth-connect`, `ga4-sync`, `ga4-realtime-users`, `marketing-report-realtime`, `google-drive-upload` | Google OAuth client for GA4 / related Google APIs |
| `GA4_CLIENT_SECRET` | Same | Google OAuth client secret |
| `FB_APP_ID` | `fb-oauth-connect`, `fb-full-sync` | Meta / Facebook app ID |
| `FB_APP_SECRET` | Same | Meta / Facebook app secret |
| `REDDIT_CLIENT_ID` | `reddit-oauth-connect`, `reddit-full-sync` | Reddit Ads API client ID |
| `REDDIT_CLIENT_SECRET` | Same | Reddit Ads API client secret |
| `REDDIT_REDIRECT_URI` | `reddit-oauth-connect` | Optional fixed OAuth redirect URI |
| `TIKTOK_APP_ID` | `tiktok-oauth-connect`, `tiktok-full-sync` | TikTok app ID (preferred name) |
| `TIKTOK_APP_SECRET` | Same | TikTok app secret (preferred name) |
| `TIKTOK_CLIENT_ID` | Same | Alternate name accepted if `TIKTOK_APP_ID` unset |
| `TIKTOK_CLIENT_SECRET` | Same | Alternate name accepted if `TIKTOK_APP_SECRET` unset |
| `BING_CLIENT_ID` | `bing-oauth-connect`, `bing-full-sync` | Microsoft Advertising / Entra app ID |
| `BING_CLIENT_SECRET` | Same | Microsoft app secret |
| `BING_DEVELOPER_TOKEN` | Same | Bing Ads developer token |
| `BING_TENANT` | Same | Entra tenant (defaults to `common` if unset) |
| `GOOGLE_DRIVE_REPORTS_FOLDER_ID` | `google-drive-upload` | Default Drive folder for server-side uploads |

Platform-specific secrets are only required for the integrations you enable. Core SPA login against an existing Supabase project needs the frontend `VITE_*` pair above; sync/OAuth features need the matching Edge secrets.

---

## Running Development Server

```bash
npm run dev
```

- Script: `"dev": "vite"` (`package.json`)  
- Default Vite URL: [http://localhost:5173](http://localhost:5173) (as noted in `README_OLD.md`)  
- Ensure `.env` is loaded before starting (restart Vite after changing env vars)

---

## Production Build

```bash
npm run build
```

- Script: `"build": "vite build"`  
- Output: `dist/` (Vite default; `dist` is gitignored)  
- Preview the production bundle locally:

```bash
npm run preview
```

---

## Build Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start Vite development server |
| `npm run build` | Create production assets in `dist/` |
| `npm run preview` | Serve the production build locally |

---

## Package Scripts

From `package.json`:

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Hot-reload development server |
| `build` | `vite build` | Production bundle |
| `preview` | `vite preview` | Preview production build |

No other npm scripts are defined in this repository.

---

## Local Development

Recommended loop:

1. `npm install`  
2. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`  
3. `npm run dev`  
4. Sign in with a Supabase Auth user that has a `user_profiles` row (or temporarily use `VITE_AUTH_DISABLED` only for demos)  
5. For platform connect/sync, deploy or use a Supabase project whose Edge Functions and secrets are already configured  

**Notes**

- Routing is a SPA (`vercel.json` rewrites all paths to `index.html` in production). Locally, Vite handles SPA fallback.  
- `vite.config.js` is minimal (`@vitejs/plugin-react` only)—no custom proxy is configured.  
- Optional ops scripts under `scripts/` (e.g. Bing backfill) expect env such as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; they are not part of `npm run dev`.

---

## Deployment Prerequisites

### Frontend (Vercel)

| Prerequisite | Detail |
|---|---|
| Vercel project linked to this repo | Hosting uses `vercel.json` SPA rewrites and cache headers |
| Build command | `npm run build` (Vite) |
| Output directory | `dist` |
| Environment variables on Vercel | Set the same `VITE_*` variables needed at build/runtime (at minimum `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) |
| OAuth redirect URLs | Platform OAuth callbacks must allow your production origin (e.g. `/oauth/callback`) |

### Backend (Supabase)

| Prerequisite | Detail |
|---|---|
| Supabase project | Auth + Postgres available to the SPA |
| Schema / migrations | Apply `supabase/migrations` (and any live schema not fully captured in dumps) |
| Edge Functions deployed | Functions under `supabase/functions/` for OAuth, sync, and reports |
| Edge Function secrets | Set names listed in the Edge secrets table above for each enabled platform |
| Scheduled jobs (optional) | Cron definitions referenced in `supabase/Cron-jobs.json` for automated sync |
| Auth users & profiles | Users need Auth accounts plus application profile/role setup for normal login |

### What this repo does not automate

- No GitHub Actions workflows for CI/CD  
- No Dockerfiles  
- Edge Function and secret deployment are via Supabase tooling / dashboard, not npm scripts  

---

*End of installation draft.*
