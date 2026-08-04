# Hacker Dojo allocation pilot

Use **Hacker Dojo** (`org_hacker_dojo`) until live every.org gift data is integrated.

| Item | Value |
| --- | --- |
| Org id | `org_hacker_dojo` |
| Public campaign | `data/public-campaign.json` ($420K / $2M) |
| every.org page | https://www.every.org/hacker-dojo |
| Suite allocation story | `alloc_community_hardware` / Community Hardware Fund |
| Specs plan | [hacker-dojo-pilot-hosting](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-hacker-dojo-pilot-hosting.md) |

## A — Local

```bash
cd services/allocation-middleware
npm test
npm run start:hacker-dojo:seed    # SEED_ON_BOOT=1 + serve
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
```

| Path | Use |
| --- | --- |
| `/` | Available / allocate / proof / packet |
| `/login.html` | Director login (Supabase) |
| `/setup.html` | every.org webhook wizard (later) |

## B — Hosted

```bash
export ORG_ID=org_hacker_dojo DATA_FILE=/data/state.json
export PUBLIC_BASE_URL=https://YOUR_APP.fly.dev
export WEBHOOK_TOKEN=$(openssl rand -hex 24)
export SEED_ON_BOOT=1
# + SUPABASE_* for director login
npm run pilot:env
cd services/allocation-middleware && npm run deploy:fly
BASE_URL=https://YOUR_APP.fly.dev npm run pilot:smoke
```

Then director: membership on `org_hacker_dojo` → `/login.html` → allocate.

After stable: set `SEED_ON_BOOT=0`.

## C — every.org later

1. `/setup.html` → copy webhook  
2. every.org Hacker Dojo admin → Advanced → paste  
3. $1 test gift → Connected  

## Scripts

| npm | Purpose |
| --- | --- |
| `start:hacker-dojo:seed` | Seed + serve |
| `pilot:smoke` | Health checks |
| `pilot:env` | Env checklist |
| `deploy:fly` | Fly deploy helper |
| `seed:hacker-dojo` | Seed only |

## Seed fixture

$19k synthetic credits; $2.5k sample allocation + proof. Idempotent chargeIds. No donor PII.
