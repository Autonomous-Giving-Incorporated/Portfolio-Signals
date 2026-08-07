# Portfolio Signals — platform alignment

This repo participates in the **AGI suite**. Hosting and Supabase targets are suite-wide, not Fund-Intel-only inventions.

## Canonical references

| Concern | Value |
| --- | --- |
| Public URL (production intent) | `https://autogive.app/portfolio-signals/` |
| **Authenticated workspace** | `https://autogive.app/portfolio-signals/workspace` |
| Vercel project | `fund-intel` (team `scrimshawlife-8819s-projects`) |
| GitHub Pages fallback | `https://scrimshawlife-ctrl.github.io/Fund-Intel/` |
| **Supabase platform** | `utdioxwiskzatwoejgiu` → `https://utdioxwiskzatwoejgiu.supabase.co` |
| Legacy HD staging (freeze) | `ecxkhihlbrcwpavfoaoq` |
| Primary `master_admin` | `scrimshawlife@gmail.com` |
| Second admin (deferred ops) | Use [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) Flow A (e.g. Qi Diaz); rationale ≥ 12 chars |

Full suite table: [Autonomous-Giving-Incorporated/docs/PLATFORM.md](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md).

## Roles

- **Public static portal** — privacy-safe director shell + `data/public-campaign.json` (no private CRM).
- **Authenticated workspace (Phase 2)** — **Operator-complete** on platform Supabase: migrations applied, `PLATFORM_*` anon on Vercel, master_admin + HD director membership, production magic-link login verified (2026-08-07). Magic-link path: production workspace URL above.

## Data plane rules

1. New tenancy, AGI admin, and multi-client work use **platform** `utdioxwiskzatwoejgiu` only.
2. Legacy `ecxkhihlbrcwpavfoaoq` is frozen for new tenancy; migrate then retire.
3. Browser / Vercel runtime config: **anon** key only — never service role.
4. Schema source of truth: this repo’s `supabase/migrations`. Platform has been migrated; further changes: `supabase link --project-ref utdioxwiskzatwoejgiu` then `supabase db push`.
5. Operator SQL: [scripts/platform/README.md](../scripts/platform/README.md).
6. Tenant brand assets: `assets/tenants/<slug>/` (Hacker Dojo is not product chrome).
7. Operator people path (master_admin / director): [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md).
8. Commercial client lifecycle (provision → publish → activate): [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md).

Bootstrap runbook: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md). Workspace: [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md). Live receipt: [CURRENT-STATE.md](CURRENT-STATE.md). Placement: [DATA-PLACEMENT.md](DATA-PLACEMENT.md).

## Deploy (public)

```bash
vercel link --yes --scope scrimshawlife-8819s-projects --project fund-intel
vercel deploy --prod --yes --scope scrimshawlife-8819s-projects
```

Config: `vercel.json`, `.vercelignore` (excludes `node_modules`, services, secrets).

**Vercel env (set on `fund-intel` project):**

- `PLATFORM_SUPABASE_URL=https://utdioxwiskzatwoejgiu.supabase.co` — **set**
- `PLATFORM_SUPABASE_ANON_KEY=<public anon key only>` — **set**

Build generates gitignored `runtime-config.js`. Do **not** set service-role keys on the Vercel project.

## Phase 3 (next)

Allocation middleware local pilot is green against platform Auth. Production middleware host + every.org webhook remain operator deploy steps. See [ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md).
