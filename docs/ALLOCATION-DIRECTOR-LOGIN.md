# Director login (Supabase)

Allocation writes (allocate, proof, merge, labels, CSV) accept:

1. **Preferred:** Supabase user JWT (`Authorization: Bearer <access_token>`) for a user who is an active member of `ORG_ID` (default `org_hacker_dojo`) with role **`director`** or **`campaign_lead`**.
2. **Fallback (dev/pilot):** shared `OPERATOR_TOKEN` via `x-operator-token` when `ALLOW_OPERATOR_TOKEN_FALLBACK` is enabled (default off only when you set production guards without wanting it).

## Prerequisites

1. Fund-Intel Supabase project with migrations applied (including `clients` + `client_memberships`).
2. Client row: `org_hacker_dojo` (seeded in AGI tenant foundation).
3. Auth user exists; profile active.
4. Membership:

```sql
-- example: grant director on Hacker Dojo
select public.set_client_membership(
  'org_hacker_dojo',
  '<user-uuid>',
  'director',
  true,
  'allocation middleware pilot'
);
-- or insert into client_memberships if RPC not used
```

If `client_memberships` is empty, the server falls back to legacy `profiles.role` for the same user (single-tenant projects).

## Env

```bash
ORG_ID=org_hacker_dojo
SUPABASE_URL=https://….supabase.co
SUPABASE_ANON_KEY=…          # browser login page
SUPABASE_SERVICE_ROLE_KEY=…  # server verifies JWT + membership
DATA_FILE=./data/hacker-dojo.json
WEBHOOK_TOKEN=…
PUBLIC_BASE_URL=https://…
# optional emergency:
# OPERATOR_TOKEN=…
# ALLOW_OPERATOR_TOKEN_FALLBACK=1
```

## UI

1. Open `/login.html`
2. Email + password (Supabase Auth)
3. Redirect to `/` — writes use session JWT
4. **Sign out** clears session + operator token

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /auth/config` | Public anon config for login page |
| `GET /auth/me` | Current actor (Bearer required when auth enabled) |

## Roles

| Role | Allocate / proof |
| --- | --- |
| director | yes |
| campaign_lead | yes |
| board_viewer, auditor, … | no (403) |
