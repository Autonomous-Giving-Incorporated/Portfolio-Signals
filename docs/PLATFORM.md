# Fund Intel — platform alignment

This repo participates in the **AGI suite**. Hosting and Supabase targets are suite-wide, not Fund-Intel-only inventions.

## Canonical references

| Concern | Value |
| --- | --- |
| Public URL (production intent) | `https://autogive.app/fund-intel/` |
| **Authenticated workspace** | `https://autogive.app/fund-intel/workspace` |
| Vercel project | `fund-intel` (team `scrimshawlife-8819s-projects`) |
| GitHub Pages fallback | `https://scrimshawlife-ctrl.github.io/Fund-Intel/` |
| **Supabase platform** | `utdioxwiskzatwoejgiu` → `https://utdioxwiskzatwoejgiu.supabase.co` |
| Legacy HD staging (freeze) | `ecxkhihlbrcwpavfoaoq` |
| Primary `master_admin` | `scrimshawlife@gmail.com` |
| Second admin (deferred) | Qi Diaz — `platform_administrators` insert, rationale ≥ 12 chars |

Full suite table: [Autonomous-Giving-Incorporated/docs/PLATFORM.md](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md).

## Roles

- **Public static portal** — privacy-safe director shell + `data/public-campaign.json` (no private CRM).
- **Authenticated workspace (Phase 2)** — Supabase platform; tenant-scoped; AGI `master_admin` provisions clients; directors operate inside one client. Magic-link path: production workspace URL above.

## Data plane rules

1. New tenancy, AGI admin, and multi-client work use **platform** `utdioxwiskzatwoejgiu` only.
2. Legacy `ecxkhihlbrcwpavfoaoq` is frozen for new tenancy; migrate then retire.
3. Browser / Vercel runtime config: **anon** key only — never service role.
4. Schema source of truth: this repo’s `supabase/migrations`. **Operator applies migrations** to platform after `supabase link --project-ref utdioxwiskzatwoejgiu`.
5. Operator SQL: [scripts/platform/README.md](../scripts/platform/README.md).

Bootstrap runbook: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md). Workspace behavior: [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md). Placement: [DATA-PLACEMENT.md](DATA-PLACEMENT.md).

## Deploy (public)

```bash
vercel link --yes --scope scrimshawlife-8819s-projects --project fund-intel
vercel deploy --prod --yes --scope scrimshawlife-8819s-projects
```

Config: `vercel.json`, `.vercelignore` (excludes `node_modules`, services, secrets).

For workspace against platform, set production env on the Vercel project (**operator**):

- `PLATFORM_SUPABASE_URL=https://utdioxwiskzatwoejgiu.supabase.co`
- `PLATFORM_SUPABASE_ANON_KEY=<public anon key only>`

Build generates gitignored `runtime-config.js`. Do not set service-role keys on the Vercel project.
