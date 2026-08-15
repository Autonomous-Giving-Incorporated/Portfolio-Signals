# Director login (Supabase)

Allocation writes (allocate, proof, merge, labels, CSV) accept:

1. **Preferred:** Supabase user JWT (`Authorization: Bearer <access_token>`) for a user who is an active member of `ORG_ID` (default `org_hacker_dojo`) with role **`director`** or **`campaign_lead`**.
2. **Fallback (dev/pilot):** shared `OPERATOR_TOKEN` via `x-operator-token` when `ALLOW_OPERATOR_TOKEN_FALLBACK` is enabled.

Tracking: historical Fund-Intel#72; remaining live acceptance is [Portfolio-Signals#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20).

## Prerequisites

1. Platform Supabase `utdioxwiskzatwoejgiu` with migrations applied (including `clients` + `client_memberships`).
2. Client row: `org_hacker_dojo`.
3. Auth user exists; `profiles` row active.
4. Membership `director` or `campaign_lead` on that client.

## Env (host)

```bash
ORG_ID=org_hacker_dojo
SUPABASE_URL=https://….supabase.co
SUPABASE_ANON_KEY=…          # browser login page
SUPABASE_SERVICE_ROLE_KEY=…  # server verifies JWT + membership (service-role read)
DATA_FILE=/data/state.json
WEBHOOK_TOKEN=…
PUBLIC_BASE_URL=http://127.0.0.1:8787
# Prefer director-only writes on pilot once login works:
# ALLOW_OPERATOR_TOKEN_FALLBACK=0
# OPERATOR_TOKEN=   # optional emergency only
```

## Host paths (Docker not required)

| Path | Use |
| --- | --- |
| **Local Node (no Docker)** | Default for Phase 3a director-auth evidence |
| **Docker Compose** | Local durable volume / VPS-shaped pilot |
| **Cloudflare Workers** | Designed production public site + webhook host — [CLOUDFLARE.md](CLOUDFLARE.md) |

### A — Local Node (no Docker)

```bash
cd services/allocation-middleware

# 1) Secrets in .env.pilot only (never commit)
#    SUPABASE_URL=https://utdioxwiskzatwoejgiu.supabase.co
#    SUPABASE_ANON_KEY=…
#    SUPABASE_SERVICE_ROLE_KEY=…
#    ALLOW_OPERATOR_TOKEN_FALLBACK=0
#    DATA_FILE=./data/hacker-dojo-pilot.json
#    PUBLIC_BASE_URL=http://127.0.0.1:8787
#    ORG_ID=org_hacker_dojo
#    PORT=8787

# 2) Membership (if not already director on org_hacker_dojo)
set -a && source .env.pilot && set +a
DIRECTOR_EMAIL=you@example.com npm run grant:director

# 3) Start host with env loaded (pick one)
set -a && source .env.pilot && set +a
npm run start:hacker-dojo:seed    # SEED_ON_BOOT=1 first time
# or: npm run start:hacker-dojo   # after stable seed

# 4) Verify
BASE_URL=http://127.0.0.1:8787 npm run verify:director
# Optional JWT allocate probe (needs password or magic-link session export):
# DIRECTOR_EMAIL=… DIRECTOR_PASSWORD=… BASE_URL=http://127.0.0.1:8787 \
#   npm run verify:director -- --login
```

Open **http://127.0.0.1:8787/login.html** → sign in → allocate.

### B — Docker Compose (optional)

```bash
cd services/allocation-middleware

# 1) Put Supabase secrets into .env.pilot (do not commit)
#    SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
#    ALLOW_OPERATOR_TOKEN_FALLBACK=0

# 2) Grant membership if needed
set -a && source .env.pilot && set +a
DIRECTOR_EMAIL=you@example.com npm run grant:director

# 3) Recreate host
npm run compose:up

# 4) Config + optional live login probe
BASE_URL=http://127.0.0.1:8787 npm run verify:director
DIRECTOR_EMAIL=you@example.com DIRECTOR_PASSWORD='…' \
  BASE_URL=http://127.0.0.1:8787 npm run verify:director -- --login
```

Open **http://127.0.0.1:8787/login.html** → sign in → allocate.

## Grant script

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  DIRECTOR_EMAIL=you@example.com \
  ORG_ID=org_hacker_dojo \
  npm run grant:director
```

What it does (service role):

1. Find or create Auth user (email confirmed)  
2. Ensure `clients` row `org_hacker_dojo`  
3. Ensure `profiles` row (active)  
4. Upsert `client_memberships` role `director` (or `--role campaign_lead`)

SQL alternative (dashboard SQL as service role / master admin path):

```sql
-- if RPC available and you are an authorized director/master admin with MFA:
select public.set_client_membership(
  'org_hacker_dojo',
  '<user-uuid>'::uuid,
  'director',
  true,
  'allocation middleware pilot grant'
);
```

Service-role REST upsert is preferred for headless pilot bootstrap (bypasses MFA-gated RPC).

## UI

1. Open `/login.html`  
2. Email + password (Supabase Auth)  
3. Redirect to `/` — writes use session JWT  
4. **Sign out** clears session + operator token  

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /auth/config` | Public anon config; `directorLoginEnabled` when Supabase is wired |
| `GET /auth/me` | Current actor (Bearer required when auth enabled) |

## Roles

| Role | Allocate / proof |
| --- | --- |
| director | yes |
| campaign_lead | yes |
| board_viewer, auditor, … | no (403) |

## Acceptance (#72)

- [ ] `SUPABASE_*` set on host (`.env.pilot` / compose)  
- [ ] Membership director|campaign_lead on `org_hacker_dojo` (`npm run grant:director`)  
- [ ] `GET /auth/config` → `directorLoginEnabled: true`  
- [ ] `npm run verify:director -- --login` PASS (allocate path authorized)  
- [ ] Operator token fallback off or emergency-only (`ALLOW_OPERATOR_TOKEN_FALLBACK=0`)  

## Server note

Membership is resolved with the **service role** after the user JWT is validated (`auth/v1/user`). That avoids RLS edge cases where a brand-new member cannot read their own row under certain policy timings.
