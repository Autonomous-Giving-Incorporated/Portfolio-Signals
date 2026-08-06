# Director login (Supabase)

Allocation writes (allocate, proof, merge, labels, CSV) accept:

1. **Preferred:** Supabase user JWT (`Authorization: Bearer <access_token>`) for a user who is an active member of `ORG_ID` (default `org_hacker_dojo`) with role **`director`** or **`campaign_lead`**.
2. **Fallback (dev/pilot):** shared `OPERATOR_TOKEN` via `x-operator-token` when `ALLOW_OPERATOR_TOKEN_FALLBACK` is enabled.

Tracking: [Fund-Intel#72](https://github.com/scrimshawlife-ctrl/Fund-Intel/issues/72).

## Prerequisites

1. Fund-Intel Supabase project with migrations applied (including `clients` + `client_memberships`).
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

## One-shot pilot (Docker)

```bash
cd services/allocation-middleware

# 1) Put Supabase secrets into .env.pilot (do not commit)
#    SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY

# 2) Grant membership (creates user if missing; prints temp password once)
export $(grep -E '^SUPABASE_|^ORG_ID=' .env.pilot | xargs)   # local only
DIRECTOR_EMAIL=you@example.com npm run grant:director

# 3) Recreate host with Supabase env
#    Optional: ALLOW_OPERATOR_TOKEN_FALLBACK=0 in .env.pilot
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
