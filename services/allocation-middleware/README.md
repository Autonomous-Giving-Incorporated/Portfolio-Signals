# Allocation middleware

MVP package for AGI allocation middleware: **every.org gift summaries → pots → allocate → proof → packet**.

Hosted as a modular capability inside Fund-Intel (`services/allocation-middleware/`). Default pilot tenant: **`org_hacker_dojo`** (Hacker Dojo reference tenant — not AGI product brand).

**Status (2026-08-07):** unit tests green; local pilot smoke PASS against **platform** Supabase `utdioxwiskzatwoejgiu` (director JWT path). Public HTTPS OBSERVED via Cloudflare quick tunnel (ephemeral); durable Render/Railway/Fly optional.

| Doc | Purpose |
| --- | --- |
| [HACKER-DOJO-ALLOCATION-PILOT.md](../../docs/HACKER-DOJO-ALLOCATION-PILOT.md) | Local + hosted pilot runbook |
| [ALLOCATION-MIDDLEWARE.md](../../docs/ALLOCATION-MIDDLEWARE.md) | Portfolio Signals role + status |
| [ALLOCATION-DIRECTOR-LOGIN.md](../../docs/ALLOCATION-DIRECTOR-LOGIN.md) | Supabase director JWT |
| [ALLOCATION-MIDDLEWARE-PRODUCTION.md](../../docs/ALLOCATION-MIDDLEWARE-PRODUCTION.md) | Deploy gates |
| [Design (Specs)](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/specs/2026-08-03-allocation-middleware-design.md) | Product design |
| [MVP plan (Specs)](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-allocation-middleware.md) | Implementation plan |
| [Pilot hosting plan (Specs)](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-hacker-dojo-pilot-hosting.md) | Host + seed plan |

## Commands

```bash
npm test
npm run start:hacker-dojo:seed   # local Node, SEED_ON_BOOT=1
# open http://127.0.0.1:8787

# Local Node (no Docker) — Phase 3a default
# set -a && source .env.pilot && set +a && npm run start:hacker-dojo:seed
# BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
# BASE_URL=http://127.0.0.1:8787 npm run verify:director

# Public HTTPS without SaaS (Phase 3b ephemeral)
# cloudflared tunnel --url http://127.0.0.1:8787
# BASE_URL=https://….trycloudflare.com npm run pilot:smoke

# Seed-loop accept (no every.org) — allocate → proof → packet
npm run accept:seed-loop

# Optional durable — Docker Compose / Render / Railway / Fly
npm run gen:env                  # .env.pilot with tokens
# npm run compose:up
# Director: DIRECTOR_EMAIL=… npm run grant:director

npm run start:hacker-dojo        # durable file, no re-seed
npm run seed:hacker-dojo         # seed only
npm run pilot:smoke              # health checks (BASE_URL=...)
npm run pilot:env                # env checklist
```

**Other hosts:** Render (`render.yaml`), Railway (`railway.toml`), or optional Fly (`fly.toml` + `bootstrap:fly`).  
See [ALLOCATION-HOSTING-OPTIONS.md](../../docs/ALLOCATION-HOSTING-OPTIONS.md).

Generic demo (non-Hacker Dojo):

```bash
ORG_ID=org_demo DATA_FILE=./data/org_demo.json npm start
```

## UI routes

| Path | Use |
| --- | --- |
| `/` | Available · Allocate · Inbox · Packet |
| `/login.html` | Director login (Supabase) |
| `/setup.html` | every.org webhook wizard (no OAuth) |

## every.org connect

1. Open `/setup.html` on the deployed host and copy the webhook URL (includes `?token=`).
2. every.org → nonprofit admin → Settings → Advanced → paste webhook.
3. Send a $1 test gift; wizard polls until **Connected**.
4. Map fundraisers/designations via first gifts or Merge/Labels in the UI.

Webhook endpoint: `POST /webhooks/every-org` with `x-webhook-token` or `?token=`.

## Persistence and auth

```bash
# File-backed state (survives restarts)
DATA_FILE=./data/hacker-dojo.json ORG_ID=org_hacker_dojo npm start

# Seed on first boot (pilot / empty volume)
SEED_ON_BOOT=1 npm run start:hacker-dojo:seed

# Director writes (preferred)
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...

# Optional emergency operator token
# OPERATOR_TOKEN=... ALLOW_OPERATOR_TOKEN_FALLBACK=1

# Webhook
WEBHOOK_TOKEN=whsec
```

Supabase DDL (optional multi-tenant tables): `../../supabase/migrations/202608030001_allocation_middleware.sql`.

## Proof

`POST /proofs` with `{ allocationId, uri, note?, attachedBy? }`  
`MISSING_PROOF` exceptions open after `PROOF_SLA_HOURS` (default 72).
