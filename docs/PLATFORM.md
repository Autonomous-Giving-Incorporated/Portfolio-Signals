# Fund Intel — platform alignment

This repo participates in the **AGI suite**. Hosting and Supabase targets are suite-wide, not Fund-Intel-only inventions.

## Canonical references

| Concern | Value |
| --- | --- |
| Public URL (production intent) | `https://autogive.app/fund-intel/` |
| Vercel project | `fund-intel` (team `scrimshawlife-8819s-projects`) |
| GitHub Pages fallback | `https://scrimshawlife-ctrl.github.io/Fund-Intel/` |
| **Supabase platform** | `utdioxwiskzatwoejgiu` → `https://utdioxwiskzatwoejgiu.supabase.co` |
| Legacy HD staging (freeze) | `ecxkhihlbrcwpavfoaoq` |

Full suite table: [Autonomous-Giving-Incorporated/docs/PLATFORM.md](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md).

## Roles

- **Public static portal** — privacy-safe director shell + `data/public-campaign.json` (no private CRM).
- **Authenticated workspace (Phase 2)** — Supabase platform; tenant-scoped; AGI `master_admin` provisions clients; directors operate inside one client.

## Deploy (public)

```bash
vercel link --yes --scope scrimshawlife-8819s-projects --project fund-intel
vercel deploy --prod --yes --scope scrimshawlife-8819s-projects
```

Config: `vercel.json`, `.vercelignore` (excludes `node_modules`, services, secrets).
