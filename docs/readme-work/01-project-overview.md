# Agency Dashboard — Project Overview

> Documentation draft for the future README.  
> Based on `00-project-analysis.md`. Does not document APIs or database schema.

---

## Project Title

**Agency Dashboard**

*(Repository package name: `wow-dashboard`. UI branding in the current build also references Chipper Digital; white-label agencies can apply their own brand.)*

---

## Short Description

Agency Dashboard is a multi-tenant marketing analytics and reporting platform that unifies paid media, analytics, CRM leads, and client-ready exports in one white-label web application.

---

## Long Description

Agency Dashboard is a React single-page application backed by Supabase and deployed on Vercel. It gives digital marketing agencies a single place to connect advertising and analytics platforms, sync performance data on demand or on a schedule, and present that data through role-scoped dashboards and client reports.

Operators connect Google Ads, Meta Ads, Microsoft Advertising (Bing), TikTok Ads, Reddit Ads, Google Analytics 4, GoHighLevel, and related SEO surfaces (Search Console / Business Profile). Synced metrics power a combined executive dashboard, platform-specific reporting tabs, agency and monthly report workflows, and PowerPoint / PDF exports—optionally uploaded to Google Drive.

Access is multi-tenant: users belong to agencies, receive roles and permissions, and may be limited to assigned client accounts. Super admins can manage multiple agencies and switch active agency context. White-label settings apply agency colors, logos, and naming so the same product can serve branded agency experiences.

---

## Business Purpose

Enable marketing agencies to **operate client reporting at scale** without stitching together native platform UIs, spreadsheets, and one-off slide decks.

The product centralizes:

- Cross-platform performance visibility for account managers and leadership  
- Controlled client data access for teams of mixed seniority  
- Repeatable monthly and PPT-style deliverables for client communication  
- Agency-owned branding so reports and the app feel native to each agency  

---

## Problem Statement

Agencies typically manage many clients across many ad and analytics platforms. Native consoles do not provide a unified, permissioned view; exporting and formatting client decks is slow and inconsistent; and access control across junior staff, managers, and multi-agency operators is hard to enforce in shared tools.

Without a shared system, teams face:

- Fragmented metrics across Google, Meta, Bing, TikTok, Reddit, GA4, and CRM  
- Manual report assembly that does not scale with client count  
- Weak or informal boundaries between who can see which accounts  
- Inconsistent branding when the same agency serves multiple white-label identities  

Agency Dashboard addresses these gaps with connected sync pipelines, RBAC, white-label branding, and built-in report export workflows.

---

## Target Users

| Audience | How they use the product |
|---|---|
| **Agency administrators** | Connect platforms, manage users/roles/clients, configure permissions and branding |
| **Account managers / media buyers** | Review platform dashboards, filter by account and date, sync data, build reports |
| **Agency leadership** | Combined dashboard and agency-level reports for spend and efficiency across clients |
| **Super administrators** | Operate multiple agencies, switch agency context, manage global agency records |
| **Client-facing report producers** | Generate monthly and PPT/PDF deliverables (and optionally save to Drive) |
| **Developers / operators** | Deploy the Vite SPA, configure Supabase, maintain Edge Function sync jobs |

---

## Main Capabilities

1. **Unified multi-platform reporting** — Google Ads, Meta, Bing, TikTok, Reddit, GA4, and GHL leads in one authenticated app.  
2. **Combined executive dashboard** — Cross-platform spend and performance for allowed accounts.  
3. **Platform OAuth connect & sync** — Connect credentials in Settings; run chunked or full syncs into Supabase.  
4. **Role-based access control** — Sidebar, tabs, actions, and account visibility driven by permissions.  
5. **Multi-tenant white-label agencies** — Agency branding, scoped data, and super-admin agency switching.  
6. **Agency & monthly report workflows** — Structured reports with accounts, sections, uploads, and editors.  
7. **PPT / PDF export** — Slide previews and downloadable decks for client delivery.  
8. **SEO-assisted monthly slides** — Search Console / Business Profile / GA4 inputs for marketing report sections.  
9. **GHL lead intelligence** — Calls, forms, attribution; HIPAA-oriented CSV path where API sync is restricted.  
10. **Admin console** — Agencies, users, roles, clients, and permission catalog sync from app config.

---

## High Level Features

### Live product areas

- Combined / executive dashboard  
- Google Ads, Meta Ads, Bing / Microsoft Ads, TikTok Ads, Reddit Ads reporting  
- GA4 / web analytics (including advanced page / VDP views for specific agencies)  
- GHL Leads (with HIPAA CSV upload mode)  
- Agency Reports and Monthly Reports (list, editor, sections, uploads)  
- PPT Report builder with slide preview and export  
- White-Label Settings (branding + platform connections + sync controls)  
- Admin panel (users, roles, clients, permissions; agencies for super admins)  
- Login / signup and protected application shell  

### Planned or placeholder navigation (not fully implemented)

- DSP / Programmatic, Dating Apps, CTV, Email Marketing, OTT / Vimeo  
- Standalone SEO, Creative Analysis, and Events pages (SEO content exists inside monthly report flows)

---

## Technology Stack

| Layer | Technology | Role |
|---|---|---|
| UI framework | React 18 | Application interface |
| Build tool | Vite 5 | Dev server and production bundling |
| Routing | react-router-dom 7 | Auth routes and app shell (`/`, `/login`, `/admin`, …) |
| Backend platform | Supabase | Auth, Postgres, Edge Functions, scheduled jobs |
| Client SDK | `@supabase/supabase-js` | Auth session and data access from the browser |
| Edge runtime | Deno (Supabase Functions) | OAuth connect, platform sync, report helpers |
| Charts | Chart.js, Recharts | Dashboard and report visualizations |
| PDF export | jsPDF, html2canvas | PDF generation from UI / slides |
| PPTX export | PptxGenJS | PowerPoint report generation |
| CSV parsing | Papa Parse | HIPAA / CSV ingest paths |
| Hosting | Vercel | Static SPA hosting with client-side routing rewrites |
| Languages | JavaScript / JSX, TypeScript (utils & Edge Functions), SQL | Application and backend code |

---

## Architecture Overview

```text
┌──────────────────────────────────────────────┐
│  Vite + React SPA (Vercel)                   │
│  Auth → App shell → pages / hooks / exports  │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│  Supabase                                    │
│  Auth · Postgres (multi-tenant) · Edge Fns   │
│  Scheduled sync jobs                         │
└─────────────────────┬────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   Ad platforms   Analytics/CRM   Drive / SEO
   (Google Ads,   (GA4, GHL,      (GSC, GBP,
    Meta, Bing,    …)              exports)
    TikTok, Reddit)
```

**Typical flow**

1. An admin connects a platform under Settings (OAuth via Edge Functions).  
2. Sync jobs (manual or scheduled) pull metrics into Supabase.  
3. Dashboard and report pages read scoped data for the signed-in user’s agency and permissions.  
4. Report builders assemble slides and export PPTX/PDF (and optionally Google Drive).

The frontend is a SPA—not Next.js. There is no separate Node API server in this repository; server-side work lives in Supabase Edge Functions and database routines.

---

## Project Highlights

- **Multi-tenant by design** — Agencies, roles, permissions, and per-user client account assignment.  
- **Broad paid-media coverage** — Google, Meta, Microsoft, TikTok, and Reddit in one product surface.  
- **Reporting as a first-class workflow** — Agency reports, monthly reports, and PPT/PDF export—not dashboards only.  
- **White-label ready** — Agency colors, fonts, and logos applied at runtime.  
- **Super-admin operations** — Cross-agency management and active-agency switching.  
- **Sync-oriented backend** — Edge Functions for OAuth and ingestion; cron-backed refresh for key platforms.  
- **Permission-aware UI** — Sidebar, tabs, and admin actions gated by configurable permission keys.  
- **Client deliverable automation** — Slide capture, SEO sections, and Drive upload options for recurring reporting.

---

## Folder Structure (Summary)

```text
new-agency-dashboard/
├── src/                  # React application (pages, components, hooks, utils)
├── supabase/             # Config, SQL migrations, Edge Functions, cron definitions
├── public/               # Static logos served with the SPA
├── brand/                # Source brand assets / guidelines
├── scripts/              # Operational helpers (backfill, PPTX inspect, SQL checks)
├── docs/readme-work/     # Documentation drafts (this overview lives here)
├── index.html            # Vite entry HTML
├── package.json          # Dependencies and scripts
├── vite.config.js        # Vite configuration
├── vercel.json           # SPA rewrites and cache headers
├── schema.sql            # Schema dump (reference)
└── .env.example          # Frontend environment template
```

| Path | Summary |
|---|---|
| `src/pages/` | Screens: dashboards, platforms, reports, settings, admin, auth |
| `src/components/` | Shared UI (sidebar, header, gates, previews, uploaders) |
| `src/hooks/` | Data loading per platform and report type |
| `src/context/` | Auth, app chrome, report branding |
| `src/config/` | Navigation and permission catalog |
| `src/utils/` | Sync helpers, exporters, SEO / Drive / HIPAA utilities |
| `src/lib/` | Supabase clients and shared helpers |
| `supabase/functions/` | Platform OAuth, sync, and report Edge Functions |
| `supabase/migrations/` | Database evolution |

---

## Table of Contents for the Future README

Suggested structure for the eventual root `README.md` (sections to be authored in later drafts):

1. **Title & badges** (optional)  
2. **Overview** — short + long description  
3. **Features** — high-level product capabilities  
4. **Screenshots / demos** (optional)  
5. **Architecture** — SPA + Supabase + Vercel overview  
6. **Tech stack**  
7. **Repository structure**  
8. **Prerequisites**  
9. **Getting started** — clone, install, env, local run  
10. **Environment variables** — frontend `VITE_*` and Supabase secrets (summary)  
11. **Authentication & roles** — high-level access model  
12. **Platform integrations** — which networks are supported  
13. **Data sync & scheduling** — conceptual (details deferred)  
14. **Reporting & exports** — monthly / PPT / PDF / Drive  
15. **Admin & white-label**  
16. **Deployment** — Vercel + Supabase  
17. **Database** *(separate doc / later section)*  
18. **API / Edge Functions** *(separate doc / later section)*  
19. **Scripts & operations**  
20. **Troubleshooting**  
21. **Contributing / development notes**  
22. **License / ownership** *(confirm with stakeholders)*  

---

*End of project overview draft.*
