# Portfolio Signals — platform alignment

This repo participates in the **AGI suite**. Hosting and Supabase targets are suite-wide, not Fund-Intel-only inventions.

## Canonical references

| Concern | Value |
| --- | --- |
| Public URL (production intent) | `https://autogive.app/portfolio-signals/` |
| **Authenticated workspace** | `https://autogive.app/portfolio-signals/workspace` |
| **Designed public host** | Cloudflare Workers static assets (`portfolio-signals`) — [CLOUDFLARE.md](CLOUDFLARE.md) |
| Vercel project (fallback until DNS cutover) | `fund-intel` (team `scrimshawlife-8819s-projects`) |
| GitHub Pages fallback | repository Actions fallback; production remains `autogive.app/portfolio-signals/` |
| **Supabase platform** | `utdioxwiskzatwoejgiu` → `https://utdioxwiskzatwoejgiu.supabase.co` |
| Legacy HD staging (freeze) | `ecxkhihlbrcwpavfoaoq` |
| Primary `master_admin` | Restricted operator registry |
| Second `master_admin` | Restricted operator registry; AAL2 required before privileged operations |

Full suite table: [Autonomous-Giving-Incorporated/docs/PLATFORM.md](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md).

## Roles

- **Public static portal** — privacy-safe director shell + `data/public-campaign.json` (no private CRM).
- **Authenticated workspace (Phase 2)** — **Operator-complete** on platform Supabase: migrations applied, `PLATFORM_*` anon on Vercel, master_admin + HD director membership, production magic-link login verified (2026-08-07). Magic-link path: production workspace URL above.

## Data plane rules

1. New tenancy, AGI admin, and multi-client work use **platform** `utdioxwiskzatwoejgiu` only.
2. Legacy `ecxkhihlbrcwpavfoaoq` is frozen for new tenancy; migrate then retire.
3. Browser / Workers / Vercel runtime config: **anon** key only — never service role.
4. Schema source of truth: this repo’s `supabase/migrations`. Platform has been migrated; further changes: `supabase link --project-ref utdioxwiskzatwoejgiu` then `supabase db push`.
5. Operator SQL: [scripts/platform/README.md](../scripts/platform/README.md).
6. Tenant brand assets: `assets/tenants/<slug>/` (Hacker Dojo is not product chrome).
7. Operator people path (master_admin / director): [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md).
8. Commercial client lifecycle (provision → publish → activate): [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md).
9. Second-tenant suite path (FI + IR clone): [SECOND-TENANT-ONBOARDING.md](SECOND-TENANT-ONBOARDING.md).
10. Client Onboarding Pack (private org docs; not CRM import): [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md) — schema + Edge OBSERVED; MFA dry-run [#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18).
11. Suite onboarding hub: [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md).

Bootstrap runbook: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md). Workspace: [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md). Live receipt: [CURRENT-STATE.md](CURRENT-STATE.md). Placement: [DATA-PLACEMENT.md](DATA-PLACEMENT.md).

## Deploy (public)

**Intended production:** Cloudflare Workers — [CLOUDFLARE.md](CLOUDFLARE.md) (`wrangler.toml`, `.github/workflows/cloudflare-workers.yml`). Requires GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

**Fallback until DNS cutover** (keep `vercel.json`):

```bash
vercel link --yes --scope scrimshawlife-8819s-projects --project fund-intel
vercel deploy --prod --yes --scope scrimshawlife-8819s-projects
```

Config: `vercel.json`, `.vercelignore` (excludes `node_modules`, services, secrets).

**Vercel env (set on `fund-intel` project; same anon pair for Workers CI):**

- `PLATFORM_SUPABASE_URL=https://utdioxwiskzatwoejgiu.supabase.co` — **set**
- `PLATFORM_SUPABASE_ANON_KEY=<public anon key only>` — **set**

Build generates gitignored `runtime-config.js`. Do **not** set service-role keys on the Vercel project or the Worker.

## Phase 3 (allocation pilot)

| Item | Status |
| --- | --- |
| Local Node pilot + unit tests | OBSERVED |
| Director JWT path (#72) | OBSERVED — [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md) |
| Public HTTPS ephemeral (#71) | OBSERVED — Cloudflare quick tunnel |
| Seed allocate→proof→packet (#74 partial) | OBSERVED — `npm run accept:seed-loop` |
| Durable named host | **Cloudflare Workers** (designed); local Node for pilot only |
| Live every.org webhook + full director acceptance ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)) | PENDING Worker port; needs live gift + browser sign-off |

See [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md) (hub) · [ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md) · [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) · [CURRENT-STATE.md](CURRENT-STATE.md).

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 22 + Hash: 645560ecfc722b6d040d9c21562681bbf579ba23
