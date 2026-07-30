# Agency Dashboard — Operations & Production Readiness

> Operations guide for deploying and running Agency Dashboard in production.  
> Distinguishes **what this repository configures** from **platform defaults / gaps** (no in-repo CI, APM, or backup automation).  
> Does not modify the root `README.md`.

---

## Production readiness snapshot

| Area | Status in repo | Notes |
|---|---|---|
| Frontend hosting | Ready pattern | Vite build + `vercel.json` SPA rewrites |
| Backend (Supabase) | Ready pattern | Auth, Postgres, Edge Functions, cron defs |
| Env templates | Partial | `.env.example` for Vite only; Edge secrets documented in code/docs |
| CI/CD | **Missing** | No GitHub Actions / Docker |
| Error tracking (Sentry, etc.) | **Missing** | Browser `console` + Supabase logs only |
| App monitoring / APM | **Missing** | Rely on Vercel + Supabase dashboards |
| Automated DB backups | **Platform-dependent** | Use Supabase plan backups; not scripted here |
| Secrets in git | **Risk** | `.env` not listed in `.gitignore` |
| Auth bypass | **Risk if enabled** | `VITE_AUTH_DISABLED` must be off in prod |
| Webhooks | N/A | Pull/sync model only |

Treat production as a **two-system** deployment: **Vercel (SPA)** + **Supabase (data/compute)**.

---

## Deployment

### High-level flow

```text
Developer → Git remote
              ├─→ Vercel: npm install && npm run build → serve dist/
              └─→ Supabase: migrations + Edge Functions + secrets + cron
```

### Frontend release checklist

1. Confirm `npm run build` succeeds locally.  
2. Set Vercel env vars (`VITE_*`) for the target environment.  
3. Deploy (Git integration or Vercel CLI).  
4. Smoke-test: login, dashboard load, one platform page, Settings.  
5. Confirm OAuth redirect URIs include the production origin + `/oauth/callback`.

### Backend release checklist

1. Apply pending SQL migrations (non-empty files under `supabase/migrations/`).  
2. Deploy changed Edge Functions.  
3. Verify Edge secrets for enabled platforms.  
4. Confirm Vault secrets used by cron (`project_url`, `anon_key`) if using `net.http_post` jobs.  
5. Verify `pg_cron` jobs match `supabase/Cron-jobs.json` (or intentional prod variants).  
6. Ensure Storage bucket `agency-logos` exists with suitable public/read policy for logo URLs.  
7. Smoke-test: OAuth connect (or token refresh), one manual sync, cron last-run if available.

### What is not automated in-repo

- No `.github/workflows`  
- No Docker images  
- No blue/green or canary scripts  
- No terraform / IaC  

---

## Vercel

### Role

Hosts the **static SPA** produced by Vite (`dist/`).

| Setting | Value / expectation |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Install | `npm install` / `npm ci` |
| Framework preset | Vite (or Other) |

### `vercel.json` behavior

| Feature | Behavior |
|---|---|
| Rewrites | All paths → `/index.html` (client-side routing) |
| HTML cache | `/` and `/index.html` → `no-cache, no-store, must-revalidate` |
| Asset cache | `/assets/*` → `public, max-age=31536000, immutable` |

### Production URL hint

OAuth code includes a fallback redirect:

`https://new-agency-dashboard.vercel.app/oauth/callback`

Keep platform OAuth consoles and Edge redirect logic aligned with the **real** production hostname(s) (custom domain or Vercel URL).

### Vercel env

Set at least:

- `VITE_SUPABASE_URL`  
- `VITE_SUPABASE_ANON_KEY`  

Optional: `VITE_APP_NAME`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID`.  

**Never** set `VITE_AUTH_DISABLED=true` on production.

**Never** put `SUPABASE_SERVICE_ROLE_KEY` or platform client secrets in Vercel `VITE_*` vars (they would be exposed to the browser).

### Post-deploy SPA issue

If users see blank screens after a deploy, stale HTML can point at removed hashed chunks. The app listens for `vite:preloadError` and reloads once (`src/main.jsx`). Operators can advise a hard refresh.

---

## Supabase

### Role

| Product | Production use |
|---|---|
| Auth | Email/password sessions for the SPA |
| Postgres | Tenancy, metrics, reports, RLS |
| Edge Functions | OAuth, sync, marketing/GA4 helpers, Drive upload |
| Storage | `agency-logos` (app usage; bucket not defined in SQL dumps) |
| Vault | Secrets for cron HTTP (`project_url`, `anon_key`) |
| pg_cron / pg_net | Scheduled sync orchestration |

Local CLI project id in `config.toml`: `New_Agency_Dashboard` (Postgres major **17**). Production project ref may differ—confirm in the Supabase dashboard.

### Edge Functions to keep deployed

All under `supabase/functions/` (19 functions), including OAuth connectors, `*-full-sync` / `ga4-sync` / `ghl-sync`, `gads-status-geo`, `gads-geo-resolve`, `marketing-report-realtime`, `ga4-realtime-users`, `hoot-inventory-sync`, `google-drive-upload`.

Deploy example:

```bash
npx supabase functions deploy <function-name> --project-ref <ref>
```

### Scheduled jobs (intended)

From `supabase/Cron-jobs.json` (UTC):

| Job | Schedule | Action |
|---|---|---|
| `bing_metrics_sync_all` | 05:40 | `bing_metrics_sync_all()` |
| `gads-daily-status` | 06:00 | `gads_status_sync_all()` |
| `gads-daily-geo` | 06:15 | `gads_geo_sync_all()` |
| `gads-daily-metrics` | 06:30 | `gads_metrics_sync_all()` |
| `gads-daily-geo-resolve` | 07:00 | HTTP POST → `gads-geo-resolve` |

Verify these exist and are **active** in production; the JSON file is documentation/source of intent, not an auto-applier.

### Migrations

Only a subset of migration files are non-empty (Bing reporting, Bing sync-all, GSC/GMB/GBP read policies, Bing role permissions). Many older timestamp files are **0 bytes**. Prefer:

1. Live schema + non-empty migrations for incremental changes  
2. Dumps (`schema.sql` / `full_schema.sql`) as reference only  

---

## Environment Management

### Environments (recommended model)

| Env | Frontend | Supabase | Notes |
|---|---|---|---|
| Local | `.env` + `npm run dev` | Dev/project or local CLI | Use non-prod data |
| Staging | Vercel Preview / staging project | Staging Supabase project | Test OAuth redirects |
| Production | Vercel Production | Production Supabase | Strict secrets + auth |

The repo does not encode multi-env config beyond Vite env files and platform dashboards.

### Frontend variables (`VITE_*`)

| Variable | Prod required? | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `VITE_APP_NAME` | No | Login branding |
| `VITE_AUTH_DISABLED` | **No — must be unset/false** | Bypass auth |
| `VITE_GOOGLE_CLIENT_ID` | If Drive export used | Public OAuth client ID |
| `VITE_GA4_CLIENT_ID` | Optional fallback | Used if Google client ID unset |
| `VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID` | Optional | Shared Drive folder |

### Edge / server secrets (Supabase)

Set in Supabase Edge Function secrets (names only—never commit values):

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GADS_*`, `GA4_*`, `FB_*`, `REDDIT_*`, `TIKTOK_*` / `TIKTOK_CLIENT_*`, `BING_*`, `GOOGLE_DRIVE_REPORTS_FOLDER_ID`, plus Vault `project_url` / `anon_key` for cron.

Platform secrets are required only for integrations you enable.

### Practices

1. Separate staging vs production Supabase projects when possible.  
2. Rotate keys if `.env` was ever committed.  
3. Add `.env` to `.gitignore` as a hardening step (currently **not** ignored).  
4. Restrict who can view Vercel/Supabase secret UIs.  
5. Document redirect URIs per environment in Google/Meta/Microsoft/Reddit/TikTok consoles.

---

## Monitoring

**No first-party APM or uptime config in the repository.**

### Practical monitoring (platform-native)

| Signal | Where to look |
|---|---|
| Frontend availability / build failures | Vercel Dashboard → Deployments / Analytics (if enabled on plan) |
| Auth / API errors | Supabase Dashboard → Auth logs, API logs |
| Edge failures / timeouts | Supabase → Edge Functions → Logs |
| Cron success | Supabase → Database → Cron / job run history (plan-dependent) |
| Sync health | Table `sync_log`; CPA `last_sync_*` fields; Settings UI history |
| Data freshness | Max(`date` / `report_date`) on key `*_daily` tables per customer |

### Suggested operational checks (manual or external)

- Daily: cron jobs ran; spot-check Google Ads + Bing row freshness.  
- Weekly: Edge error rate; OAuth token failures in Settings.  
- After deploy: login + one sync + one report export.

Add an external uptime check on the Vercel URL if SLA matters—nothing in-repo configures this.

---

## Logging

| Layer | What exists |
|---|---|
| Browser | `console.warn` / `console.error` (Auth, Supabase REST, hooks) |
| UI toasts | Ephemeral `showNotification` — not durable logs |
| Edge Functions | `console.log` + returned text/JSON logs to the caller |
| Sync | `sync_log` rows (platform, customer, window, status, errors) |
| SQL sync-all | `RAISE WARNING` when Vault secrets missing |

**There is no centralized log shipping** (Datadog, ELK, etc.) in this codebase.

Operators should retain Edge Function logs in Supabase and query `sync_log` for customer-facing sync incidents.

---

## Error Tracking

**No Sentry / Bugsnag / similar integration found.**

User-visible handling today:

- `ErrorBoundary` → full-page error + Reload  
- `ProtectedRoute` account/profile errors  
- Per-page/hook error states  
- Sync failure toasts + `sync_log`

**Production gap:** uncaught client exceptions are not aggregated. Consider adding a client error tracker if production volume warrants it (out of scope of current code).

---

## Performance Optimization

### Already implemented

| Technique | Location / effect |
|---|---|
| Hashed immutable assets | Vercel `/assets/*` long cache |
| No-cache HTML | Faster pickup of new deploys |
| PostgREST pagination | `supabaseRest.js` (1000-row pages, retries, caps) |
| Chunked sync | `syncHelper` / Settings — reduces Edge timeouts |
| Parallel REST page batches | Up to 8 concurrent pages when count known |
| GA4 row caps | Elevated limit for summary fetches; avoid exact count when costly |
| Inline global CSS | Avoids missing CSS chunk issues |
| Auth profile debounce | Reduces refetch storms on tab focus |

### Operational levers

1. Keep date ranges reasonable on heavy tables (GA4 raw/classified).  
2. Prefer scheduled sync overnight; avoid huge interactive backfills during peak hours.  
3. Watch Supabase plan limits (DB size, egress, Edge invocations, max rows).  
4. `config.toml` local `max_rows = 1000` mirrors PostgREST default—pagination is mandatory for large reads.  
5. Index usage is oriented around `customer_id` + date—ensure sync doesn’t create unbounded duplicates (unique keys / upserts).

### Known product limits

- Some sync functions return large text logs.  
- Client-side aggregation can be heavy for “ALL accounts” views.  
- No CDN caching of API JSON (by design—user-scoped live data).

---

## Security Practices

### In place

| Control | Notes |
|---|---|
| Supabase Auth | Password sessions; JWT to PostgREST/Edge |
| RBAC | Roles/permissions; UI gates |
| RLS | Enabled on most tables; `can_access_customer` helper |
| Service role | Confined to Edge/SQL—not shipped as `VITE_*` |
| OAuth admin gates | Google Ads / GA4 / Meta connect require admin in function code |
| HIPAA GHL path | API sync skipped; CSV + UI masking helpers |
| CORS | Edge allows `*` origin—acceptable for public SPA pattern; still requires valid JWT for privileged actions |

### Required production hygiene

1. **Disable** `VITE_AUTH_DISABLED` and clear any `auth_skip` session hacks.  
2. Do not expose service role key to the frontend or Vercel public env.  
3. Review RLS on tables with broad “authenticated read” policies (e.g. some GA4/GSC/GMB/GBP policies)—tighten if multi-tenant isolation must be DB-enforced for those tables.  
4. Restrict Signup if the product is invite-only (Auth settings); Admin create-user flow exists.  
5. Keep platform OAuth apps on least-privilege scopes.  
6. Ensure `agency-logos` Storage policies don’t allow arbitrary public writes.  
7. Add `.env` to gitignore; audit git history for leaked keys.  
8. Limit super-admin accounts; audit `is_super_admin` periodically.

### Explicit non-goals in repo

- No WAF config  
- No rate-limiting layer beyond Supabase/platform defaults  
- No security headers config in `vercel.json` beyond cache  

---

## Backup Strategy

**No backup scripts or runbooks are checked into this repository.**

### Recommended (Supabase-native)

| Asset | Approach |
|---|---|
| Postgres | Enable/verify **Supabase automatic backups** for the production plan; know PITR availability on your tier |
| Point-in-time | Use plan features if offered; test restore on staging |
| Schema | Keep migrations + occasional `pg_dump` / dashboard dumps offline |
| Storage (`agency-logos`) | Rely on Supabase Storage durability; optionally mirror critical logos |
| Edge source | Git is source of truth for `supabase/functions/` |
| Credentials | Not backed up in git—recover via platform reconnection if lost |

### Application data priorities

1. `agencies`, `user_profiles`, roles/permissions  
2. `clients`, `client_platform_accounts`, `agency_platform_credentials`  
3. Metrics tables (large; may accept re-sync from platforms if credentials survive)  
4. `monthly_reports` and children (not always re-creatable from APIs)

**Practice:** periodically confirm backup retention and perform a **restore drill** on a non-prod project.

---

## Disaster Recovery

| Scenario | Recovery outline |
|---|---|
| Bad frontend deploy | Vercel → Rollback previous deployment; hard refresh clients |
| Broken Edge Function | Redeploy last known-good function from git; check secrets |
| Failed migration | Fix forward with new migration; avoid destructive resets on prod |
| DB corruption / data loss | Restore from Supabase backup to new/restored instance; repoint `VITE_SUPABASE_URL` if project URL changes |
| OAuth token revocation | Re-connect platforms in Settings; sync resumes |
| Vercel outage | SPA unavailable; data still in Supabase—wait/failover domain if configured |
| Supabase outage | App cannot auth/query; communicate status; no offline mode in app |
| Secrets leak | Rotate Supabase keys, platform OAuth secrets, Vault entries; force session invalidation as needed |

**RTO/RPO:** not defined in-repo—set organizational targets based on Supabase backup window and Vercel rollback time.

---

## Scaling Considerations

| Dimension | How this app scales | Constraint |
|---|---|---|
| Concurrent users | Mostly static SPA + PostgREST | Supabase connection/API limits |
| Agencies / clients | Multi-tenant rows | RLS + indexing; admin complexity |
| Metrics volume | Daily fact tables | Storage, query time, pagination caps (25k–120k client fetch caps) |
| Sync throughput | Sequential chunked Edge calls | Edge timeouts; platform API rate limits |
| Cron fan-out | SQL loops over CPAs → HTTP | Job duration; need monitoring |
| Report exports | CPU in **browser** | Large decks stress client devices, not Vercel |
| Vertical scale | Upgrade Supabase compute/storage plan | No app-server tier to scale |

**Bottlenecks to watch:** GA4 large reads, “sync all” Google Ads accounts, Bing SOAP report generation, GHL full contact pulls.

**Horizontal note:** Frontend scales via CDN automatically; backend scaling is **Supabase plan + job design**, not additional Node replicas.

---

## Troubleshooting

| Symptom | Likely cause | Actions |
|---|---|---|
| Login fails / timeout | Wrong URL/key; Auth down; 20s client timeout | Verify Vercel `VITE_*`; Auth logs; network |
| Account Issue / pending setup | Missing `user_profiles` | Admin create/link profile + agency + role |
| Empty dashboards | No CPA / permissions / sync data / agency switcher | Check allowlists, `*_daily` freshness, super-admin agency |
| Sync fails | Secrets, tokens, HIPAA skip, Edge error | Function logs; Settings credential; `sync_log` |
| OAuth callback error | Redirect URI mismatch; non-admin calling admin-only connect | Align console URIs; use admin user |
| Cron not updating data | Job inactive; Vault missing; function undeployed | Cron list; Vault; deploy functions |
| Logos 404 | Missing `agency-logos` bucket/policy | Create bucket; re-upload |
| Blank page after deploy | Stale chunk references | Hard refresh; confirm rewrite + new deployment |
| Drive upload fails | Missing Google client ID / refresh token | Env + reconnect GA4/Google in Settings |
| Slow GA4 page | Huge date range / row caps | Narrow dates; check network waterfall |

More developer-oriented debugging tips: `07-developer-guide.md`. Edge contracts: `05-api.md`.

---

## FAQ

**Q: Is production only Vercel?**  
A: No. Vercel serves the UI; Supabase provides Auth, database, Edge Functions, storage, and cron.

**Q: Where do I put the service role key?**  
A: Supabase Edge secrets / server-side only—never in `VITE_*` or client bundles.

**Q: Why do some migrations empty?**  
A: Historical placeholder files; real incremental SQL is in the later named migrations. Confirm live schema in Studio.

**Q: How do I know sync worked?**  
A: Settings progress UI, `sync_log`, and row counts / max dates in platform tables.

**Q: Can I run without Auth in production?**  
A: Technically via `VITE_AUTH_DISABLED`, but that exposes a public admin-like session—**do not**.

**Q: Are there webhooks from Google/Meta?**  
A: No. Data is pulled by sync jobs and manual sync.

**Q: How do I roll back the UI?**  
A: Vercel deployment rollback. Database/Edge rollbacks are separate.

**Q: Is there CI?**  
A: Not in this repository. Add GitHub Actions if you need enforced build/test gates.

**Q: What about HIPAA?**  
A: The app has a GHL CSV/HIPAA flag path and UI masking—not a full compliance program. Legal/BAA requirements are outside this repo.

**Q: Which docs should ops read first?**  
A: This file + `02-installation.md` (env) + `05-api.md` (functions) + `04-database.md` (schema/RLS).

---

## Related documentation

| Doc | Topic |
|---|---|
| `02-installation.md` | Install & environment variables |
| `05-api.md` | Edge Function API contracts |
| `04-database.md` | Schema, RLS, migrations |
| `06-architecture.md` | Deployment architecture diagram |
| `07-developer-guide.md` | Local workflow & debugging |

---

*End of operations draft.*
