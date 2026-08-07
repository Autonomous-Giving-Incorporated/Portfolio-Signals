# Operator Access Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a repeatable operator runbook and parameterized platform SQL scripts so a second `master_admin` or a client's first director can be onboarded without improvised SQL.

**Architecture:** Docs + SQL only (Approach 1). Auth invite stays in Supabase Dashboard. Scripts run as postgres in Dashboard SQL Editor. Membership attachment prefers existing workspace RPCs (`provision_client`, `set_client_membership`). No schema migrations, no Edge Functions, no service-role on Vercel.

**Tech Stack:** PostgreSQL (Supabase platform `utdioxwiskzatwoejgiu`), Markdown runbooks, bash safety check, Fund-Intel `scripts/platform/` operator pack.

**Spec:** [docs/superpowers/specs/2026-08-06-operator-access-onboarding-design.md](../specs/2026-08-06-operator-access-onboarding-design.md)

## Global Constraints

- Platform Supabase ref only: `utdioxwiskzatwoejgiu` — never use legacy `ecxkhihlbrcwpavfoaoq` for new people.
- Sentinel UUID: `00000000-0000-0000-0000-000000000000` — every mutating script must `raise exception` if still set.
- Rationale for grant/revoke master_admin: `length(trim(rationale)) >= 12`.
- MFA order: enroll in Auth UI first, then set `profiles.mfa_enforced = true` — scripts must not set MFA true as a side effect of ensure-profile or grant-admin.
- `master_admin` lives in `platform_administrators`, not `app_role`.
- Platform admin ≠ tenant membership; do not insert `client_memberships` in grant-master-admin.
- No secrets, real Auth UUIDs, or service-role keys in git or commit messages.
- Prefer audited RPCs for membership; SQL membership is escape hatch only (documented, not a new script in v1).
- Production CRM import remains BLOCKED; these scripts do not load workbooks.
- Slice B (activate client) and D (second-tenant product) are out of scope.

## File structure

| Path | Responsibility |
| --- | --- |
| `scripts/platform/ensure-profile.sql` | Upsert active profile for Auth UUID; never set `mfa_enforced` |
| `scripts/platform/set-mfa-enforced.sql` | Set `mfa_enforced` true/false after human confirmation |
| `scripts/platform/grant-master-admin.sql` | Insert/reactivate `platform_administrators` with rationale |
| `scripts/platform/revoke-master-admin.sql` | Soft-revoke platform admin |
| `scripts/platform/verify-operator-access.sql` | Read-only parameterized verification selects |
| `scripts/platform/check-script-safety.sh` | CI/local grep: sentinel hard-fail present; no secret-like strings |
| `scripts/platform/bootstrap-master-admin.sql` | Header: first-admin only; point to Flow A for additional admins |
| `scripts/platform/README.md` | Script index + order of operations |
| `docs/OPERATOR-ACCESS-ONBOARDING.md` | Canonical Flow A / Flow B runbook |
| `docs/START_HERE.md` | Link to runbook in reading order |
| `docs/PLATFORM.md` | One-line pointer to runbook |
| `docs/CURRENT-STATE.md` | OBSERVED dry-run note after Task 7 |
| AGI `docs/PLATFORM.md` | Optional one-line pointer (Task 6) |
| AGI `docs/GITHUB-PROJECT.md` | Optional Ops track note (Task 6) |

---

### Task 1: Safety harness for platform scripts

**Files:**
- Create: `scripts/platform/check-script-safety.sh`
- Test: run the script itself (fail before scripts exist with full set, then pass after Task 2–3)

**Interfaces:**
- Consumes: SQL files under `scripts/platform/*.sql`
- Produces: exit 0 if every mutating script contains sentinel hard-fail pattern; exit 1 with message otherwise

- [ ] **Step 1: Write the safety check script**

Create `scripts/platform/check-script-safety.sh`:

```bash
#!/usr/bin/env bash
# Verify operator SQL scripts hard-fail on sentinel UUID and avoid secret markers.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SENTINEL='00000000-0000-0000-0000-000000000000'
FAIL_PATTERN='raise exception'
MUTATORS=(
  ensure-profile.sql
  set-mfa-enforced.sql
  grant-master-admin.sql
  revoke-master-admin.sql
  bootstrap-master-admin.sql
)
errors=0

for f in "${MUTATORS[@]}"; do
  path="$ROOT/$f"
  if [[ ! -f "$path" ]]; then
    # During partial implementation, only check files that exist
    continue
  fi
  if ! grep -q "$SENTINEL" "$path"; then
    echo "FAIL: $f missing sentinel UUID placeholder" >&2
    errors=$((errors + 1))
  fi
  if ! grep -qi "$FAIL_PATTERN" "$path"; then
    echo "FAIL: $f missing raise exception hard-fail" >&2
    errors=$((errors + 1))
  fi
  if grep -qiE 'service_role|eyJhbGci|sb_secret_' "$path"; then
    echo "FAIL: $f appears to contain a secret marker" >&2
    errors=$((errors + 1))
  fi
done

# verify-operator-access may be read-only; if present, still ban secrets
if [[ -f "$ROOT/verify-operator-access.sql" ]]; then
  if grep -qiE 'service_role|eyJhbGci|sb_secret_' "$ROOT/verify-operator-access.sql"; then
    echo "FAIL: verify-operator-access.sql appears to contain a secret marker" >&2
    errors=$((errors + 1))
  fi
fi

if [[ "$errors" -gt 0 ]]; then
  echo "check-script-safety: $errors issue(s)" >&2
  exit 1
fi
echo "check-script-safety: OK"
```

- [ ] **Step 2: Make executable and run (baseline)**

```bash
chmod +x scripts/platform/check-script-safety.sh
./scripts/platform/check-script-safety.sh
```

Expected: `check-script-safety: OK` (only `bootstrap-master-admin.sql` exists and already has sentinel + raise exception).

- [ ] **Step 3: Commit**

```bash
git add scripts/platform/check-script-safety.sh
git commit -m "chore(platform): add operator SQL script safety check"
```

---

### Task 2: ensure-profile and set-mfa-enforced scripts

**Files:**
- Create: `scripts/platform/ensure-profile.sql`
- Create: `scripts/platform/set-mfa-enforced.sql`

**Interfaces:**
- Consumes: `auth.users` row must exist; `public.profiles` schema (id, display_name, role, active, mfa_enforced)
- Produces: profile upsert; mfa_enforced update only via set-mfa-enforced

- [ ] **Step 1: Create ensure-profile.sql**

```sql
-- scripts/platform/ensure-profile.sql
-- Ensure public.profiles exists for an Auth user. Does NOT set mfa_enforced.
--
-- Run as postgres (Dashboard SQL) AFTER the Auth user exists.
-- Replace target_user_id and display_name before running.
-- No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> REPLACE display name (non-empty) <<<
  target_display_name text := 'Operator Display Name';
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before ensure-profile';
  end if;

  if length(trim(target_display_name)) = 0
     or target_display_name = 'Operator Display Name' then
    raise exception 'replace target_display_name with a real display name before ensure-profile';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'auth user % not found; invite the user first', target_user_id;
  end if;

  insert into public.profiles (id, display_name, role, active, mfa_enforced)
  values (
    target_user_id,
    trim(target_display_name),
    'director',
    true,
    false
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      active = true,
      deactivated_at = null,
      deactivation_reason = null,
      updated_at = now();
  -- Intentionally do NOT touch mfa_enforced on conflict.

  raise notice 'ensure-profile complete for % (mfa_enforced unchanged on conflict)', target_user_id;
end
$$;

select id, display_name, role, active, mfa_enforced
from public.profiles
where id = '00000000-0000-0000-0000-000000000000'::uuid;
-- After replace, re-run the select with the real UUID or use verify-operator-access.sql
```

Note: The trailing `select` still uses the sentinel so a careless paste shows zero rows until the operator edits both the DO block and the select. Prefer documenting: change both, or drop the select and use `verify-operator-access.sql`.

**Preferred trailing select** (operator replaces UUID once in DO only; use verify script after). Final file should end with notice only — remove the misleading select. Use this ending instead:

```sql
  raise notice 'ensure-profile complete for % (mfa_enforced unchanged on conflict)', target_user_id;
end
$$;
```

- [ ] **Step 2: Create set-mfa-enforced.sql**

```sql
-- scripts/platform/set-mfa-enforced.sql
-- Set profiles.mfa_enforced after the human has enrolled MFA in Supabase Auth.
-- NEVER set true unless enrollment is confirmed in Dashboard → Authentication → Users.
--
-- Run as postgres. Replace target_user_id and desired_mfa_enforced.
-- No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> true only after Auth MFA enrollment confirmed; false to clear <<<
  desired_mfa_enforced boolean := false;
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before set-mfa-enforced';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'profile % not found; run ensure-profile.sql first', target_user_id;
  end if;

  if desired_mfa_enforced is true then
    raise notice 'CONFIRM: set mfa_enforced=true only after Auth MFA enrollment is verified';
  end if;

  update public.profiles
  set mfa_enforced = desired_mfa_enforced,
      updated_at = now()
  where id = target_user_id
    and active = true;

  if not found then
    raise exception 'no active profile updated for %', target_user_id;
  end if;

  raise notice 'set-mfa-enforced % for %', desired_mfa_enforced, target_user_id;
end
$$;
```

- [ ] **Step 3: Run safety check**

```bash
./scripts/platform/check-script-safety.sh
```

Expected: `check-script-safety: OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/platform/ensure-profile.sql scripts/platform/set-mfa-enforced.sql
git commit -m "feat(platform): ensure-profile and set-mfa-enforced operator scripts"
```

---

### Task 3: grant / revoke master_admin and verify-operator-access

**Files:**
- Create: `scripts/platform/grant-master-admin.sql`
- Create: `scripts/platform/revoke-master-admin.sql`
- Create: `scripts/platform/verify-operator-access.sql`

**Interfaces:**
- Consumes: active `profiles` row; `platform_administrators` (user_id PK, active, rationale ≥ 12, revoked_at)
- Produces: soft grant/revoke; read-only verification notices

- [ ] **Step 1: Create grant-master-admin.sql**

```sql
-- scripts/platform/grant-master-admin.sql
-- Grant or reactivate platform master_admin. Does NOT create client membership.
-- Profile must exist (ensure-profile). Prefer mfa_enforced=true before privileged work.
--
-- Run as postgres. Replace target_user_id and rationale.
-- No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> REPLACE with rationale length >= 12 <<<
  grant_rationale text := 'REPLACE_WITH_RATIONALE';
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before grant-master-admin';
  end if;

  if length(trim(grant_rationale)) < 12 or grant_rationale = 'REPLACE_WITH_RATIONALE' then
    raise exception 'grant_rationale must be a real string of at least 12 characters';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = target_user_id and active = true
  ) then
    raise exception 'active profile % required; run ensure-profile.sql first', target_user_id;
  end if;

  insert into public.platform_administrators (user_id, active, rationale)
  values (target_user_id, true, trim(grant_rationale))
  on conflict (user_id) do update
  set active = true,
      revoked_at = null,
      rationale = excluded.rationale;

  raise notice 'grant-master-admin complete for %', target_user_id;
  raise notice 'platform admin does not grant tenant-private membership by itself';
end
$$;
```

- [ ] **Step 2: Create revoke-master-admin.sql**

```sql
-- scripts/platform/revoke-master-admin.sql
-- Soft-revoke platform master_admin (active=false, revoked_at=now()).
-- Does not delete Auth user or profile.
--
-- Run as postgres. Replace target_user_id and rationale.
-- No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> REPLACE with rationale length >= 12 <<<
  revoke_rationale text := 'REPLACE_WITH_RATIONALE';
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before revoke-master-admin';
  end if;

  if length(trim(revoke_rationale)) < 12 or revoke_rationale = 'REPLACE_WITH_RATIONALE' then
    raise exception 'revoke_rationale must be a real string of at least 12 characters';
  end if;

  update public.platform_administrators
  set active = false,
      revoked_at = now(),
      rationale = trim(revoke_rationale)
  where user_id = target_user_id;

  if not found then
    raise exception 'no platform_administrators row for %', target_user_id;
  end if;

  raise notice 'revoke-master-admin complete for %', target_user_id;
end
$$;
```

- [ ] **Step 3: Create verify-operator-access.sql**

```sql
-- scripts/platform/verify-operator-access.sql
-- Read-only checks for a user after Flow A or Flow B.
-- Replace target_user_id and optional target_client_id (empty string = skip membership check).
-- Run as postgres. No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> optional client id e.g. org_hacker_dojo; leave empty to skip <<<
  target_client_id text := '';
  v_profile public.profiles%rowtype;
  v_admin public.platform_administrators%rowtype;
  v_membership public.client_memberships%rowtype;
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before verify-operator-access';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'auth user % missing', target_user_id;
  end if;

  select * into v_profile from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile % missing', target_user_id;
  end if;

  raise notice 'profile: display_name=%, active=%, mfa_enforced=%, role=%',
    v_profile.display_name, v_profile.active, v_profile.mfa_enforced, v_profile.role;

  select * into v_admin
  from public.platform_administrators
  where user_id = target_user_id;

  if found then
    raise notice 'platform_admin: active=%, revoked_at=%, rationale=%',
      v_admin.active, v_admin.revoked_at, v_admin.rationale;
  else
    raise notice 'platform_admin: none';
  end if;

  if length(trim(target_client_id)) > 0 then
    select * into v_membership
    from public.client_memberships
    where client_id = target_client_id and user_id = target_user_id;

    if found then
      raise notice 'membership %: role=%, active=%',
        target_client_id, v_membership.role, v_membership.active;
    else
      raise exception 'no membership for user % on client %', target_user_id, target_client_id;
    end if;
  end if;

  raise notice 'verify-operator-access complete';
end
$$;
```

- [ ] **Step 4: Run safety check**

```bash
./scripts/platform/check-script-safety.sh
```

Expected: `check-script-safety: OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/platform/grant-master-admin.sql \
  scripts/platform/revoke-master-admin.sql \
  scripts/platform/verify-operator-access.sql
git commit -m "feat(platform): grant/revoke master_admin and verify-operator-access"
```

---

### Task 4: bootstrap header + scripts/platform README

**Files:**
- Modify: `scripts/platform/bootstrap-master-admin.sql` (header comments only)
- Modify: `scripts/platform/README.md` (full rewrite of sections for new scripts)

- [ ] **Step 1: Update bootstrap-master-admin.sql header**

Replace the top comment block with:

```sql
-- scripts/platform/bootstrap-master-admin.sql
-- FIRST platform master_admin bootstrap only (initial suite operator).
--
-- For ADDITIONAL master_admins, do not re-copy this file ad-hoc. Use the
-- parameterized path instead:
--   docs/OPERATOR-ACCESS-ONBOARDING.md  (Flow A)
--   ensure-profile.sql → set-mfa-enforced.sql → grant-master-admin.sql
--   verify-operator-access.sql
--
-- Run in Supabase SQL editor as postgres AFTER the Auth user exists
-- (invite the operator email first).
--
-- Replace the UUID string in the DO block with the id from
-- Authentication → Users (or: select id from auth.users where email = '...').
--
-- Profiles schema (001 + 007): id, display_name NOT NULL, role, active,
-- mfa_enforced, ... Platform admin lives in platform_administrators (012),
-- not app_role. No secrets belong in this file.
```

Leave the DO block body unchanged.

- [ ] **Step 2: Rewrite scripts/platform/README.md**

```markdown
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

- `docs/OPERATOR-ACCESS-ONBOARDING.md` — full runbook
- `docs/STAGING-BOOTSTRAP.md` — migrations / bootstrap
- `docs/AUTHENTICATED-WORKSPACE.md` — roles and workspace
- `docs/PLATFORM.md` — suite platform alignment
- `docs/CURRENT-STATE.md` — live evidence labels
```

- [ ] **Step 3: Run safety check**

```bash
./scripts/platform/check-script-safety.sh
```

Expected: OK

- [ ] **Step 4: Commit**

```bash
git add scripts/platform/bootstrap-master-admin.sql scripts/platform/README.md
git commit -m "docs(platform): index access scripts and first-admin bootstrap boundary"
```

---

### Task 5: Canonical runbook OPERATOR-ACCESS-ONBOARDING.md

**Files:**
- Create: `docs/OPERATOR-ACCESS-ONBOARDING.md`

- [ ] **Step 1: Write the full runbook**

Create `docs/OPERATOR-ACCESS-ONBOARDING.md` with this content:

```markdown
# Operator & director access onboarding

Repeatable path for platform people access on **Portfolio Signals** workspace.
No improvised SQL: use scripts under `scripts/platform/` only.

**Platform:** Supabase `utdioxwiskzatwoejgiu`  
**Workspace:** https://autogive.app/portfolio-signals/workspace  
**Design:** [docs/superpowers/specs/2026-08-06-operator-access-onboarding-design.md](superpowers/specs/2026-08-06-operator-access-onboarding-design.md)

## Authority gates

```yaml
production_import: BLOCKED
service_role_on_vercel: PROHIBITED
secrets_in_git: PROHIBITED
legacy_staging_for_new_people: PROHIBITED  # ecxkhihlbrcwpavfoaoq frozen
```

- `master_admin` = row in `platform_administrators` (not an `app_role`).
- Platform admin does **not** imply tenant-private campaign access.
- Directors need `client_memberships` + (for privileged roles) `mfa_enforced = true`.

## Prerequisites

1. Dashboard access to platform project `utdioxwiskzatwoejgiu`.
2. Migrations applied (current main).
3. Auth URL allowlist includes:
   - `https://autogive.app/portfolio-signals/workspace`
   - `https://autogive.app/portfolio-signals/workspace.html`
4. Optional: custom SMTP for Auth email volume; if rate-limited, use Dashboard invite / generate_link.

## MFA policy

1. User enrolls MFA in Supabase Auth (TOTP).
2. Operator confirms enrollment in Dashboard → Authentication → Users.
3. Only then run `set-mfa-enforced.sql` with `desired_mfa_enforced := true`.
4. Never reverse this order.

## Flow A — additional master_admin

1. Authentication → Users → Invite (or confirm existing user). Copy UUID.
2. Edit and run `scripts/platform/ensure-profile.sql` (UUID + real display name).
3. User enrolls MFA; operator confirms.
4. Edit and run `scripts/platform/set-mfa-enforced.sql` (`true`).
5. Edit and run `scripts/platform/grant-master-admin.sql` (rationale ≥ 12 characters).
6. Edit and run `scripts/platform/verify-operator-access.sql`.
7. Magic-link login to workspace.
8. Confirm: Platform admin visible; `is_master_admin` path works; without client membership, no private campaign records for other tenants.
9. Optionally run `scripts/platform/verify-platform-isolation.sql` after multi-tenant changes.

### Flow A verify checklist

- [ ] `platform_administrators`: active, `revoked_at` null
- [ ] Workspace login succeeds
- [ ] Platform admin section visible
- [ ] Isolation: no private tenant data without membership
- [ ] (Optional) Privileged action fails if `mfa_enforced` false

## Flow B — first director for a client

Client shell must already exist (`provisioning` or `active`). Creating shells is commercial lifecycle (slice B) via Platform admin / `provision_client`.

1. Invite/confirm Auth user; copy UUID.
2. `ensure-profile.sql` → MFA enroll → `set-mfa-enforced.sql` true.
3. Attach membership (preferred — audited RPC while logged in as master_admin with MFA):
   - New client: Platform admin UI or `provision_client` with `p_initial_director`.
   - Existing client: workspace membership UI or `set_client_membership(client_id, user_id, 'director', true, rationale)`.
4. `verify-operator-access.sql` with `target_client_id` set (e.g. `org_hacker_dojo`).
5. Login: client listed; director can open Brand / membership for that client; not master_admin unless Flow A also applied.

### Flow B verify checklist

- [ ] `client_memberships` active, role `director`
- [ ] Workspace lists that client only (plus other legitimate memberships)
- [ ] Director UI for that client works
- [ ] Not platform admin unless Flow A
- [ ] `mfa_enforced` true

## First master_admin (historical)

Use `scripts/platform/bootstrap-master-admin.sql` once for the initial operator. All later admins use Flow A.

## Revoke / offboard

1. `revoke-master-admin.sql` if they had platform admin.
2. Deactivate client memberships via `set_client_membership(..., active := false, ...)` when possible.
3. Optionally deactivate profile (operator SQL outside this pack if needed).
4. If they had secret-manager access, rotate service-role and related secrets.
5. Do not leave elevated `mfa_enforced` or admin rows active after offboarding intent.

## Failure modes

| Symptom | Response |
| --- | --- |
| Placeholder UUID left in script | Script raises; replace and re-run |
| Auth user missing | Invite first |
| Profile missing | `ensure-profile.sql` |
| `mfa_required` / enforced MFA errors | Complete MFA path |
| Cross-tenant private data visible | Stop; isolation regression |
| Rate-limited magic link email | Dashboard generate_link / custom SMTP |

## Related

- [scripts/platform/README.md](../scripts/platform/README.md)
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md)
- [CURRENT-STATE.md](CURRENT-STATE.md)
- [PLATFORM.md](PLATFORM.md)
- [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md)
```

- [ ] **Step 2: Commit**

```bash
git add docs/OPERATOR-ACCESS-ONBOARDING.md
git commit -m "docs: add operator and director access onboarding runbook"
```

---

### Task 6: Wire discovery pointers (Fund-Intel + optional AGI)

**Files:**
- Modify: `docs/START_HERE.md`
- Modify: `docs/PLATFORM.md`
- Modify (optional, if AGI checkout available):  
  `/home/scrimshawlife/Autonomous-Giving-Incorporated/docs/PLATFORM.md`  
  `/home/scrimshawlife/Autonomous-Giving-Incorporated/docs/GITHUB-PROJECT.md`

- [ ] **Step 1: Update START_HERE.md reading order**

In the “Read in this order” list, insert after item 3 (AUTHENTICATED-WORKSPACE) a new item and renumber following items:

```markdown
3. [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — identity, roles, workspace login  
4. [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — master_admin and director people path  
5. [BRAND-SYSTEM.md](BRAND-SYSTEM.md) — AGI product chrome vs `assets/tenants/<slug>/`  
6. [ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md) + [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) — Phase 3 pilot  
7. [DATA-PLACEMENT.md](DATA-PLACEMENT.md) — where private data may live  
8. [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md) — migrations / operator SQL  
9. [IMPACT-RELAY.md](IMPACT-RELAY.md) / live-cohort docs — IR integration  
```

- [ ] **Step 2: Update Fund-Intel docs/PLATFORM.md**

After the line about Operator SQL (`scripts/platform/README.md`), add:

```markdown
7. Operator access onboarding (people path): [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md).
```

Renumber the following “Tenant brand assets” item to 8 if it was 6 — match existing list style. Current file uses numbered “Data plane rules” 1–6; append as item 7:

```markdown
7. Operator people path (master_admin / director): [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md).
```

Also update the deferred second admin line to point at Flow A:

```markdown
| Second admin (deferred ops) | Use [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) Flow A (e.g. Qi Diaz); rationale ≥ 12 chars |
```

- [ ] **Step 3: Optional AGI pointers**

If working with Autonomous-Giving-Incorporated:

In `docs/PLATFORM.md` (AGI), under Platform administration or related, add:

```markdown
Operator people path (Fund-Intel): see Fund-Intel `docs/OPERATOR-ACCESS-ONBOARDING.md` (suite Project #3 Ops track).
```

In `docs/GITHUB-PROJECT.md`, under Ops or Bootstrap, add:

```markdown
### Ops — operator access

- People path (master_admin / director): Fund-Intel `docs/OPERATOR-ACCESS-ONBOARDING.md`
```

Commit AGI changes in the AGI repo separately if modified:

```bash
cd /home/scrimshawlife/Autonomous-Giving-Incorporated
git add docs/PLATFORM.md docs/GITHUB-PROJECT.md
git commit -m "docs: point suite ops to Fund-Intel operator access runbook"
```

- [ ] **Step 4: Commit Fund-Intel pointers**

```bash
cd /home/scrimshawlife/Fund-Intel
git add docs/START_HERE.md docs/PLATFORM.md
git commit -m "docs: link operator access onboarding from START_HERE and PLATFORM"
```

---

### Task 7: Manual dry-run acceptance + CURRENT-STATE

**Files:**
- Modify: `docs/CURRENT-STATE.md`

**Note:** This task requires human operator access to platform Dashboard. If dry-run cannot run in-session, leave CURRENT-STATE with `PENDING` and document exact steps completed.

- [ ] **Step 1: Safety check green**

```bash
cd /home/scrimshawlife/Fund-Intel
./scripts/platform/check-script-safety.sh
```

Expected: `check-script-safety: OK`

- [ ] **Step 2: Operator dry-run (choose one)**

**Option A — Flow A (additional admin):** only if leadership approved a second real Auth user. Do not invent users. Prefer Option B synthetic verification of scripts on a non-production-affecting path, or re-verify primary admin with `verify-operator-access.sql` only (read-only).

**Option B — Read-only verification of existing primary admin (recommended default):**

1. Dashboard → Authentication → Users → copy UUID for `scrimshawlife@gmail.com` (do not commit).
2. Paste into `verify-operator-access.sql` only; run.
3. Expect notices: profile active; platform_admin active; mfa_enforced state observed.
4. Browser login still works on workspace URL.

**Option C — Flow B:** only if attaching a real director was requested; use RPCs in workspace, not ad-hoc membership SQL.

- [ ] **Step 3: Update CURRENT-STATE.md**

Add under Live production or Operator hygiene:

```markdown
## Operator access onboarding (slice C)

```yaml
runbook: docs/OPERATOR-ACCESS-ONBOARDING.md
scripts_platform: ensure-profile set-mfa-enforced grant/revoke-master-admin verify-operator-access
safety_check: PASS  # ./scripts/platform/check-script-safety.sh
dry_run: OBSERVED|PENDING  # date and which option A/B/C
```
```

Set `dry_run: OBSERVED` with ISO date when Step 2 completed; otherwise `PENDING`.

- [ ] **Step 4: Commit**

```bash
git add docs/CURRENT-STATE.md
git commit -m "docs: record operator access onboarding slice C status"
```

---

### Task 8: Final verification gate

- [ ] **Step 1: Confirm all artifacts exist**

```bash
cd /home/scrimshawlife/Fund-Intel
test -f docs/OPERATOR-ACCESS-ONBOARDING.md
test -f scripts/platform/ensure-profile.sql
test -f scripts/platform/set-mfa-enforced.sql
test -f scripts/platform/grant-master-admin.sql
test -f scripts/platform/revoke-master-admin.sql
test -f scripts/platform/verify-operator-access.sql
test -x scripts/platform/check-script-safety.sh
./scripts/platform/check-script-safety.sh
grep -n 'OPERATOR-ACCESS-ONBOARDING' docs/START_HERE.md docs/PLATFORM.md
```

Expected: all `test` succeed; safety OK; grep shows links.

- [ ] **Step 2: Confirm out-of-scope not implemented**

```bash
# No new Edge invite function; no activate_client product changes required
git log --oneline -10
git diff origin/main --stat
```

Expected: changes limited to docs + `scripts/platform/` (and optional AGI doc pointers). No migration files unless a bugfix was separately approved.

- [ ] **Step 3: Final commit only if anything left uncommitted**

```bash
git status
# if clean, done; else commit remaining docs
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Runbook OPERATOR-ACCESS-ONBOARDING.md | Task 5 |
| ensure-profile, set-mfa-enforced | Task 2 |
| grant/revoke master_admin | Task 3 |
| verify-operator-access | Task 3 |
| bootstrap first-admin only header | Task 4 |
| scripts/platform README | Task 4 |
| START_HERE + PLATFORM pointers | Task 6 |
| Optional AGI pointers | Task 6 |
| Safety / sentinel hard-fail | Tasks 1–3 |
| MFA enroll-before-flag | Tasks 2, 5 |
| Platform ≠ tenant | Tasks 3, 5 |
| No secrets in git | Tasks 1, 5 |
| Manual verify + CURRENT-STATE | Task 7 |
| B/D out of scope | Task 8 gate |
| Flow A / Flow B | Task 5 |

No TBD placeholders in task steps. Script variable names consistent: `target_user_id`, `desired_mfa_enforced`, `grant_rationale`, `revoke_rationale`, `target_client_id`.
