# Operator & director access onboarding — design

**Date:** 2026-08-06  
**Status:** Approved for implementation planning  
**Suite project:** [AGI GitHub Project #3](https://github.com/users/scrimshawlife-ctrl/projects/3)  
**Primary repo:** Fund-Intel (Portfolio Signals)  
**Slice:** C of commercial onboarding system (C → B → D)

## 1. Context

The AGI suite delivers multi-tenant Portfolio Signals + Impact Relay under Autonomously Giving Incorporated. Platform Supabase and workspace magic-link login are operator-verified. The primary `master_admin` identity is held in the restricted operator registry and bootstrapped via controlled SQL.

Commercial onboarding decomposes as:

| Slice | Focus | This design |
| --- | --- | --- |
| **C** | Operator & director access (Auth, MFA policy, roles, runbook) | **Yes** |
| **B** | Client lifecycle: provision → publish config → activate | Follow-up |
| **D** | Second-tenant product depth (IR clone, modules) | Follow-up |

Platform foundation deferred “full commercial onboarding path”; that path is unsafe without a repeatable **people** path first.

## 2. Goal

An operator with Dashboard access to **platform** Supabase can, using **one runbook and prepared scripts** (no improvised SQL), complete either:

1. Promote an additional **`master_admin`**, or  
2. Attach a **first director** to a client shell (Auth user invited/confirmed first).

Both paths end with an explicit **verify** step (login, workspace context, isolation expectations).

### Success definition

1. Single runbook linked from operator entry points.  
2. Parameterized scripts: ensure-profile, set-mfa-enforced, grant/revoke master_admin, verify-operator-access; first-admin bootstrap remains clear.  
3. Flow A or Flow B completable from runbook + scripts + Dashboard Auth invite only.  
4. Verify checklist passes for that flow.  
5. Authority rules explicit: platform admin ≠ tenant data; MFA enroll-before-flag; no secrets in git.  
6. Out-of-scope items listed as follow-ups, not partially implemented.

## 3. Approach

**Approach 1 — Runbook + parameterized platform scripts** (selected).

| Alternative | Why not now |
| --- | --- |
| Operator CLI (service-role local) | Higher secret-handling cost; low invite volume |
| In-app Platform Admin invite (Edge Function) | Larger product surface; delays slice B |

No service-role in browser or Vercel. Auth invite stays in Supabase Dashboard (or documented `generate_link` fallback).

## 4. Scope

### In scope

- Canonical runbook: `docs/OPERATOR-ACCESS-ONBOARDING.md`
- Scripts under `scripts/platform/` (SQL; optional thin shell for placeholder substitution only)
- MFA **process**: enroll in Auth UI, then set `profiles.mfa_enforced = true` only after confirmation
- Fail-closed script guards (placeholder UUID, rationale length on grant/revoke)
- Thin pointers from `START_HERE.md`, `scripts/platform/README.md`, suite `PLATFORM.md` / optional `GITHUB-PROJECT.md`
- Manual acceptance + `CURRENT-STATE.md` OBSERVED note when dry-run completes

### Out of scope

- Commercial activation polish (B): end-to-end provision → publish → activate product work  
- Second-tenant product / IR template clone (D)  
- In-app invite or Edge Function with service-role  
- Hard AAL2/TOTP enforcement beyond existing `mfa_enforced` flag model  
- Custom SMTP implementation (prerequisite note only)  
- Production CRM import or real donor data  

## 5. Authority rules (must hold)

- `master_admin` is a `platform_administrators` row, **not** an `app_role` value.  
- Platform authority does **not** imply `client_memberships` or tenant-private campaign access by itself.  
- Directors act via `client_memberships` on **active** clients subject to existing RLS and MFA helpers.  
- Privileged roles require `mfa_enforced` (board_viewer exempt per existing RLS).  
- No secrets, real Auth UUIDs, or service-role keys in git or public issue bodies.  
- New people only on platform ref `utdioxwiskzatwoejgiu` — never legacy `ecxkhihlbrcwpavfoaoq` for new tenancy.

## 6. Operator flows

### Shared prerequisites

1. Platform project `utdioxwiskzatwoejgiu` only.  
2. Migrations applied through current main (tenant foundation + MFA helpers).  
3. Auth redirect allowlist includes workspace URLs (`/portfolio-signals/workspace` and `.html` variant).  
4. Operator has Dashboard SQL Editor (or privileged `psql`) and Auth → Users.  
5. Custom SMTP recommended for repeated magic links; if rate-limited, use Dashboard invite / `generate_link`.

### Flow A — Promote master_admin

1. Invite or confirm Auth user in Dashboard; copy UUID (never commit).  
2. Run `ensure-profile.sql` (active profile, display_name; does **not** set MFA flag).  
3. User enrolls MFA in Supabase Auth (TOTP).  
4. Operator confirms enrollment.  
5. Run `set-mfa-enforced.sql` with `true`.  
6. Run `grant-master-admin.sql` with rationale ≥ 12 characters (idempotent reactivate).  
7. Verify (section 8).

`bootstrap-master-admin.sql` remains the **first** operator bootstrap path. Flow A generalizes **additional** admins.

### Flow B — First director for a client

Assumes a client shell already exists (`provisioning` or `active`). Creating the shell is slice B / existing `provision_client`.

1. Invite or confirm Auth user; copy UUID.  
2. Run `ensure-profile.sql`.  
3. Director enrolls MFA; then `set-mfa-enforced.sql` true.  
4. Attach authority via one of:  
   - **Preferred:** `provision_client` RPC (master_admin + MFA) with `p_initial_director` when creating a new client.  
   - **Preferred:** `set_client_membership` RPC (director or master_admin + MFA) for existing client.  
   - **Escape hatch:** operator SQL only if RPC cannot run; documented secondary; prefer audited RPC.  
5. Verify (section 8).

Last-director protection remains as implemented: cannot deactivate the final active director via normal membership RPC.

### Deliberately not automated

- Product-sent invite email.  
- Setting `mfa_enforced` before human confirms Auth MFA enrollment.  
- Single opaque step that grants both platform admin and tenant director.

## 7. Artifacts

### Runbook

**New:** `docs/OPERATOR-ACCESS-ONBOARDING.md`

Contents: purpose, prerequisites, Flow A, Flow B, MFA order, verify checklist, failure modes, revoke/offboard, related links.

**Pointers (no duplication of full procedure):**

| Location | Change |
| --- | --- |
| `docs/START_HERE.md` | Link near Auth/bootstrap reading order |
| `scripts/platform/README.md` | List scripts; invite-in-Dashboard first |
| `docs/PLATFORM.md` (FI) | One-line pointer |
| AGI `docs/PLATFORM.md` | Optional one-line pointer |
| AGI `docs/GITHUB-PROJECT.md` | Optional Ops track note for Project #3 |

### Scripts (`scripts/platform/`)

| File | Role |
| --- | --- |
| `ensure-profile.sql` | Upsert profile for Auth UUID; active; display_name; **no** mfa_enforced |
| `set-mfa-enforced.sql` | Set mfa_enforced true/false; comment requires enrollment confirmation before true |
| `grant-master-admin.sql` | Insert/reactivate platform_administrators; rationale ≥ 12 chars; idempotent |
| `revoke-master-admin.sql` | Soft-revoke (active=false, revoked_at, rationale) |
| `verify-operator-access.sql` | Read-only parameterized checks (profile, optional admin, optional membership) |
| `bootstrap-master-admin.sql` | Clarify first-admin only header; keep behavior |
| `verify-platform-isolation.sql` | Unchanged; runbook references after promotions |
| `README.md` | Order of operations, placeholder rules |

**Conventions:** Explicit replace placeholders; hard-fail on sentinel UUID `00000000-0000-0000-0000-000000000000`; no real emails/UUIDs in git; optional shell wrappers only substitute env and never hold service-role or send invites.

### Repo map

```text
Fund-Intel/
  docs/OPERATOR-ACCESS-ONBOARDING.md
  docs/START_HERE.md
  docs/PLATFORM.md
  docs/CURRENT-STATE.md          # OBSERVED after dry-run
  scripts/platform/*
Autonomous-Giving-Incorporated/docs/  # optional thin pointers only
```

## 8. Verify checklist

### After Flow A

1. SQL: active `platform_administrators` row; `revoked_at` null.  
2. Browser: magic link → https://autogive.app/portfolio-signals/workspace  
3. `get_workspace_context` → `is_master_admin` true; Platform admin visible.  
4. Isolation: without client membership, no tenant-private campaign data (spot-check + isolation script).  
5. Optional negative: privileged action with `mfa_enforced = false` fails.

### After Flow B

1. Active `client_memberships` row, role `director`, for target client.  
2. Login lists that client (plus other legitimate memberships only).  
3. Director can open client config/membership for that client.  
4. Not `master_admin` unless Flow A also applied.  
5. `mfa_enforced` true on profile.

Private ops log may record date + flow + client id; avoid unnecessary personal data in public Project #3 issues.

## 9. Error handling

| Layer | Behavior |
| --- | --- |
| Scripts | Fail on placeholder UUID; fail on empty/short rationale for grant/revoke; never print secrets |
| RPCs | Unchanged source of truth (`master_admin_required`, `mfa_required`, last-director, etc.); runbook maps messages → fixes |
| MFA order | SQL cannot see Auth TOTP state; runbook requires explicit confirmation before `set-mfa-enforced true` |
| Wrong project | Platform only; do not use scripts for new people on legacy staging |
| Partial failure | Order Auth → profile → MFA flag → grant; re-run failed step; no cross-system transaction |
| Revoke | Soft-revoke admin; deactivate memberships via RPC when possible; offboard checklist includes secret rotation if they had operator secret access |

## 10. Security

- Granting master_admin does not insert memberships or open private data beyond existing master_admin policies.  
- No service-role on Vercel or in browser.  
- Scripts run only in Dashboard SQL Editor or local privileged `psql`.  
- Prefer audited RPCs for membership mutations.  
- Least privilege: Flow B grants only the stated client and role.  
- Scripts do not load CRM/workbooks; production import remains BLOCKED.

## 11. Testing and acceptance

| Kind | What |
| --- | --- |
| Script safety | DO blocks raise if sentinel UUID remains |
| Docs | Links from START_HERE and platform README resolve |
| Automated suite | No intentional RLS changes; existing supabase tests must still pass if migrations untouched |
| Manual | One dry-run of Flow A or B; record OBSERVED in CURRENT-STATE.md |

Schema/RLS changes are not required for this approach unless a bug is discovered; fix bugs under the same authority rules without expanding scope.

## 12. Failure modes (operator-facing)

| Symptom | Response |
| --- | --- |
| Placeholder UUID in script | Hard fail; replace and re-run |
| Auth user missing | Invite first; re-copy UUID |
| Privileged action, mfa_enforced false | Fail closed; complete MFA path |
| Master admin without MFA | Platform privileged RPCs fail |
| Membership for inactive profile | ensure-profile / reactivate first |
| Cross-tenant private data for director-only user | Stop; isolation regression before more promotions |

## 13. Follow-ups (not this design)

1. **Slice B** — Commercial client lifecycle: provision → publish config → activate_client acceptance and residual gaps.  
2. **Slice D** — Second-tenant product depth (IR `clone_tenant_from_hacker_dojo`, FI modules).  
3. Optional: operator CLI (Approach 2), in-app invite (Approach 3), hard MFA AAL2.  
4. Pure ops: promote named second admin (e.g. Qi Diaz) using Flow A after scripts ship.

## 14. Implementation units (for planning)

1. Author `OPERATOR-ACCESS-ONBOARDING.md` (full runbook).  
2. Add parameterized SQL scripts + expand `scripts/platform/README.md`.  
3. Clarify `bootstrap-master-admin.sql` first-admin header.  
4. Wire pointers (START_HERE, PLATFORM, optional AGI docs).  
5. Manual dry-run on platform; update CURRENT-STATE.md.  
6. Open/update Project #3 issue if used for tracking (no secrets in body).
