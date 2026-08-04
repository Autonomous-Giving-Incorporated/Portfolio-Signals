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

## B — Hosted (Fly.io)

### Prerequisites

1. [flyctl](https://fly.io/docs/hands-on/install-flyctl/) on PATH (`curl -L https://fly.io/install.sh | sh`)
2. `fly auth login` (or `FLY_API_TOKEN`)
3. Optional: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for director login

### One-command bootstrap

```bash
cd services/allocation-middleware
# optional director auth:
# export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
npm run bootstrap:fly
```

This creates app `agi-allocation` (override with `FLY_APP=`), volume `am_data`, sets secrets (`ORG_ID=org_hacker_dojo`, `SEED_ON_BOOT=1`, webhook/operator tokens), deploys, and runs `pilot:smoke`.

### Manual

```bash
cd services/allocation-middleware
export ORG_ID=org_hacker_dojo DATA_FILE=/data/state.json
export PUBLIC_BASE_URL=https://agi-allocation.fly.dev
export WEBHOOK_TOKEN=$(openssl rand -hex 24)
export SEED_ON_BOOT=1
# + SUPABASE_* or OPERATOR_TOKEN
npm run pilot:env
fly apps create agi-allocation   # once
fly volumes create am_data --size 1 --region sjc --yes
fly secrets set ORG_ID=org_hacker_dojo DATA_FILE=/data/state.json \
  PUBLIC_BASE_URL="$PUBLIC_BASE_URL" WEBHOOK_TOKEN="$WEBHOOK_TOKEN" \
  SEED_ON_BOOT=1 OPERATOR_TOKEN="$(openssl rand -hex 24)" ALLOW_OPERATOR_TOKEN_FALLBACK=1
DEPLOY_YES=1 npm run deploy:fly -- --yes
BASE_URL=https://agi-allocation.fly.dev npm run pilot:smoke
```

Then director: membership on `org_hacker_dojo` → `/login.html` → allocate (or operator token fallback).

After stable seed: `fly secrets set SEED_ON_BOOT=0 -a agi-allocation`.

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
| `bootstrap:fly` | Create app/volume/secrets + deploy + smoke |
| `deploy:fly` | Fly deploy (`--yes` / `DEPLOY_YES=1` non-interactive) |
| `seed:hacker-dojo` | Seed only |

## Seed fixture

$19k synthetic credits; $2.5k sample allocation + proof. Idempotent chargeIds. No donor PII.
