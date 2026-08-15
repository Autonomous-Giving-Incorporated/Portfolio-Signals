# Platform operator SQL

Bootstrap and isolation checks for A.G.I. platform administration.

**Never put service-role keys, DB passwords, or other secrets in this directory or in chat logs.**

**Canonical people path:** [docs/OPERATOR-ACCESS-ONBOARDING.md](../../docs/OPERATOR-ACCESS-ONBOARDING.md)

## Prerequisites

- Platform project only: `utdioxwiskzatwoejgiu` (not legacy `ecxkhihlbrcwpavfoaoq` for new people).
- Migrations applied through tenant foundation + MFA helpers (`012`+ and current main).
- Supabase Dashboard SQL Editor (postgres) or privileged `psql`.
- Auth user invited/created **before** any script that needs their UUID.

## Script index

| Script | Purpose |
| --- | --- |
| `bootstrap-master-admin.sql` | **First** master_admin only |
| `ensure-profile.sql` | Upsert active profile (does not set MFA) |
| `set-mfa-enforced.sql` | Set `mfa_enforced` after Auth MFA enrollment confirmed |
| `grant-master-admin.sql` | Grant/reactivate platform admin (rationale ≥ 12) |
| `revoke-master-admin.sql` | Soft-revoke platform admin |
| `verify-operator-access.sql` | Read-only profile / admin / optional membership check |
| `verify-client-lifecycle.sql` | Read-only commercial lifecycle readiness (state, director, published config, modules) |
| `verify-second-tenant-isolation.sql` | Read-only second client vs HD reference (not reference_tenant; public projection notice) |
| `activate-onboarding-pack.sh` | Apply onboarding pack migrations + deploy Edge functions to platform (needs `supabase login`) |
| `verify-pack-and-people.sh` | Read-only: pack REST/Edge + people MFA readiness (needs service role env) |
| `dry-run-onboarding-pack.sh` | #18 local-synthetic classifier/contract check, or fail-closed MFA probe. Does not write an OBSERVED receipt |
| `verify-platform-isolation.sql` | Reference + isolation fixture clients |
| `check-script-safety.sh` | Local check: sentinel hard-fail present; no secret markers |

## Order of operations

### Flow A — additional master_admin

1. Dashboard → Authentication → Users → Invite (or confirm user).
2. Copy User UUID.
3. `ensure-profile.sql` (set UUID + display name).
4. User enrolls MFA in Auth; operator confirms.
5. `set-mfa-enforced.sql` with `desired_mfa_enforced := true`.
6. `grant-master-admin.sql` with real rationale ≥ 12 chars.
7. `verify-operator-access.sql`.
8. Browser: magic link → https://autogive.app/portfolio-signals/workspace
9. Confirm Platform admin visible; no private tenant data without membership.

### Flow B — first director (client shell already exists)

1. Invite/confirm Auth user; copy UUID.
2. `ensure-profile.sql` → MFA enroll → `set-mfa-enforced.sql` true.
3. Prefer workspace RPC while logged in as master_admin with MFA:
   - `provision_client(..., p_initial_director := <uuid>, ...)` for new shells, or
   - `set_client_membership(client_id, user_id, 'director', true, rationale)`.
4. `verify-operator-access.sql` with `target_client_id` set.
5. Browser login: client listed; director can open client config for that client only.

### First operator (historical)

Use `bootstrap-master-admin.sql` once for the initial platform operator. Additional admins use Flow A.

### Commercial client lifecycle (after people path)

See [docs/COMMERCIAL-CLIENT-LIFECYCLE.md](../../docs/COMMERCIAL-CLIENT-LIFECYCLE.md).

1. master_admin provisions client (workspace Platform admin).
2. Director publishes Brand & content (≥1 fundraising module).
3. master_admin activates client.
4. `verify-client-lifecycle.sql` with `target_client_id` set.

### Second tenant (after one active client)

See [docs/SECOND-TENANT-ONBOARDING.md](../../docs/SECOND-TENANT-ONBOARDING.md).

1. Complete commercial lifecycle for a new `org_*` (not HD).
2. IR: `clone_tenant_from_hacker_dojo` with the **same** id.
3. `verify-second-tenant-isolation.sql` with second client id.

## Safety

```bash
./scripts/platform/check-script-safety.sh
```

Every mutating script must hard-fail if the sentinel UUID `00000000-0000-0000-0000-000000000000` remains.

## What not to do

- Do not paste the **service role** key into README, SQL, git, or tickets.
- Do not commit real Auth UUIDs into this repo (keep placeholders).
- Do not load production CRM data via these scripts.
- Do not treat `platform_administrators` as tenant membership.
- Do not set `mfa_enforced = true` before Auth MFA enrollment is confirmed.
- Do not use legacy staging `ecxkhihlbrcwpavfoaoq` for new people.

## Related docs

- `docs/OPERATOR-ACCESS-ONBOARDING.md` — people path runbook
- `docs/COMMERCIAL-CLIENT-LIFECYCLE.md` — provision → publish → activate
- `docs/SECOND-TENANT-ONBOARDING.md` — second nonprofit + IR template clone
- `docs/STAGING-BOOTSTRAP.md` — migrations / bootstrap
- `docs/AUTHENTICATED-WORKSPACE.md` — roles and workspace
- `docs/PLATFORM.md` — suite platform alignment
- `docs/CURRENT-STATE.md` — live evidence labels
- `scripts/staging/restore-drill.sh` — #19 local-synthetic or isolated-project restore helper; writes a privacy-safe engineering receipt; no invented leadership RTO/RPO
