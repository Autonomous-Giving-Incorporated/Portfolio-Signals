# Commercial client lifecycle (slice B) — design

**Date:** 2026-08-06  
**Status:** Approved for implementation planning  
**Suite project:** [AGI GitHub Project #3](https://github.com/users/scrimshawlife-ctrl/projects/3)  
**Primary repo:** Fund-Intel (Portfolio Signals)  
**Slice:** B of commercial onboarding system (C → **B** → D)  
**Depends on:** Slice C — operator & director access ([2026-08-06-operator-access-onboarding-design.md](./2026-08-06-operator-access-onboarding-design.md))

## 1. Context

Slice C delivered a repeatable **people path** (master_admin / director Auth, profiles, MFA flag, grant scripts, runbook). Commercial onboarding still needs a repeatable **client shell path**: provision → publish configuration → activate.

That lifecycle is **already implemented** in RPCs and workspace UI:

| Step | Implementation |
| --- | --- |
| Provision | `provision_client` RPC + Platform admin form in `workspace.js` |
| Config draft/publish | `save_client_config_draft` / `publish_client_config` + Brand & content (`workspace/configuration.js`) |
| Activate | `activate_client` RPC + Activate button in Platform admin |
| Automated gates | `supabase/tests/011_agi_client_onboarding.sql` |

Platform foundation deferred “full commercial onboarding path”; the residual gap is **operator repeatability and evidence**, not greenfield tenancy.

## 2. Goal

An MFA-enforced `master_admin` and an MFA-enforced director can complete commercial onboarding for a **synthetic** client on platform Supabase (`utdioxwiskzatwoejgiu`) using **one runbook** and existing workspace UI + RPCs (no improvised SQL for the happy path).

### Success definition

1. Single runbook linked from operator entry points.  
2. Optional parameterized verify helper for client readiness (state, director, published config, modules).  
3. Happy path completable for a synthetic client **or** CURRENT-STATE honestly records PENDING with the exact remaining step.  
4. Activate failure codes documented with operator remediations.  
5. Authority rules preserved; no secrets in git; no scope into slice D.  
6. Existing onboarding SQL tests remain the automated proof of RPC gates.

## 3. Approach

**Approach 1 — Runbook + verify helpers + dry-run** (selected).

| Alternative | Why not now |
| --- | --- |
| Approach 2 — + Platform admin readiness strip | Better UX; more `workspace.js` surface; not required for “path works” |
| Approach 3 — Product overhaul / self-serve | Slice D and beyond |

No new Edge Functions. No service-role on Vercel. Schema migrations only if a true blocker is found during dry-run.

## 4. Scope

### In scope

- Canonical runbook: `docs/COMMERCIAL-CLIENT-LIFECYCLE.md`
- `scripts/platform/verify-client-lifecycle.sql` (read-only, parameterized `target_client_id`)
- Index + pointers: `scripts/platform/README.md`, `docs/START_HERE.md`, `docs/CLIENT-CONFIGURATION.md`, `docs/OPERATOR-ACCESS-ONBOARDING.md`, `docs/PLATFORM.md`
- Error message → fix table for `activate_client` / provision / publish exceptions
- Operator dry-run on a synthetic `org_*` client (not Hacker Dojo production identity as the subject of activation)
- `docs/CURRENT-STATE.md` slice B status block
- Gap fixes **only** if dry-run or runbook reveals a blocker (must stay minimal and documented)

### Out of scope

- Slice D: second-tenant product depth, IR template-clone self-serve marketplace  
- In-app Auth invite / Edge invite  
- Hard AAL2 beyond `mfa_enforced`  
- Approach 2 readiness UI (unless dry-run proves Activate unusable without it)  
- Production CRM import, real nonprofit go-live, every.org production host  
- Changing activate gate semantics for marketing reasons  

## 5. Authority rules (must hold)

- Only `master_admin` with privileged MFA may `provision_client` and `activate_client`.  
- Only client `director` (MFA) may save/publish brand config for that client.  
- Platform admin does **not** imply tenant-private campaign data access.  
- Activation is one-shot: `provisioning` → `active` only; no silent re-activate.  
- Platform ref only: `utdioxwiskzatwoejgiu`.  
- Synthetic fixtures only for dry-run; no real donor/CRM data.  
- No secrets or real Auth UUIDs in git or public issue bodies.

## 6. Operator flow (happy path)

### Prerequisites (slice C)

1. Platform project, migrations, workspace Auth redirects.  
2. `master_admin` with `mfa_enforced` (Flow A or bootstrap).  
3. Director Auth user with profile + `mfa_enforced` (ensure-profile + set-mfa-enforced).  
4. Operator logged into https://autogive.app/portfolio-signals/workspace .

### Step 1 — Provision (master_admin)

Platform admin → form fields:

| Field | Rule |
| --- | --- |
| Client ID | `org_[a-z0-9_]+` |
| URL slug | `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| Display name | non-empty |
| Initial director UUID | active profile UUID (director user) |
| Rationale | length ≥ 12 |

Result: `clients.state = provisioning`, director membership created, audit `client_provisioned`.

### Step 2 — Publish configuration (director)

1. Select the new client in workspace.  
2. Open **Brand & content**.  
3. Set public-safe copy, theme, and enable **at least one** of sponsors / grants.  
4. Save draft (`save_client_config_draft`) with rationale ≥ 12.  
5. Publish draft (`publish_client_config`).

Result: exactly one `client_config_versions` row with `state = published` for that client.

### Step 3 — Activate (master_admin)

1. Platform admin → client row still `provisioning`.  
2. Enter activation rationale ≥ 12.  
3. Activate → `activate_client`.

Result: `clients.state = active`, audit `client_onboarding_completed`.

### Step 4 — Verify

- SQL/helper: state active; active director; published config; modules gate satisfied.  
- Browser: director sees client as operational; Platform admin shows onboarding complete (not Activate).  
- Optional: public `get_public_client_config` for slug when deployed runtime points at platform.

## 7. Activate gates (document only)

Source: `activate_client` in `supabase/migrations/202608020004_agi_client_onboarding.sql` (and successors if replaced).

| Condition | Exception (operator sees) |
| --- | --- |
| Not master_admin | `master_admin_required` |
| Privileged MFA missing | MFA / `require_privileged_mfa` path |
| Rationale &lt; 12 chars | `activation_rationale_required` |
| Client missing | `client_not_found` |
| State not `provisioning` | `provisioning_client_required` |
| No active director | `active_client_director_required` |
| No published config | `published_client_configuration_required` |
| Config fails `validate_client_config` | validate error text |
| Both modules false | `fundraising_module_required` |

Runbook maps each to a fix (complete slice C MFA, publish config, enable module, use provisioned client only once).

## 8. Artifacts

### Runbook

**New:** `docs/COMMERCIAL-CLIENT-LIFECYCLE.md`

Sections: purpose, prerequisites (link slice C), happy path steps 1–4, failure modes table, synthetic client naming guidance, related docs, out of scope.

### Scripts

**New:** `scripts/platform/verify-client-lifecycle.sql`

- Parameter: `target_client_id` (hard-fail if empty or not matching `org_%` pattern if practical).  
- Read-only notices: client state, active director count, published config present, modules.sponsors/grants, optional last audit action.  
- No mutations.  
- Sentinel: if using UUID elsewhere, follow platform script conventions; client id empty string fails closed.

**Update:** `scripts/platform/README.md` — index entry + “after Flow A/B people path, commercial lifecycle.”

### Pointers

| File | Change |
| --- | --- |
| `docs/START_HERE.md` | Link commercial lifecycle after operator access |
| `docs/CLIENT-CONFIGURATION.md` | Short “lifecycle” pointer to full runbook for activate |
| `docs/OPERATOR-ACCESS-ONBOARDING.md` | “Next: commercial client lifecycle” link |
| `docs/PLATFORM.md` | One-line pointer |
| `docs/CURRENT-STATE.md` | Slice B yaml status |

### Repo map

```text
Fund-Intel/
  docs/COMMERCIAL-CLIENT-LIFECYCLE.md
  docs/START_HERE.md
  docs/CLIENT-CONFIGURATION.md
  docs/OPERATOR-ACCESS-ONBOARDING.md
  docs/PLATFORM.md
  docs/CURRENT-STATE.md
  scripts/platform/verify-client-lifecycle.sql
  scripts/platform/README.md
  docs/superpowers/specs/2026-08-06-commercial-client-lifecycle-design.md
```

Optional AGI one-line pointer only if already pattern-matched; not required for B.

## 9. Dry-run acceptance

### Preferred subject

Synthetic client id such as `org_lifecycle_dry_run` (or timestamped variant). **Do not** use activation dry-run against production Hacker Dojo if already `active` (one-shot already complete).

### Options

| Option | When |
| --- | --- |
| **A** | Full happy path on platform with synthetic client; record OBSERVED |
| **B** | Partial: provision + verify only if director publish blocked; PENDING with step |
| **C** | Docs-only: if no operator session available; PENDING |

Dry-run must not commit Auth UUIDs, service-role keys, or private config payloads.

## 10. Error handling

| Layer | Behavior |
| --- | --- |
| RPCs | Unchanged fail-closed semantics; runbook documents messages |
| Workspace UI | Surface `error.message` as today; no silent success |
| Verify script | Raise on missing client_id; notices for missing gates (or raise if “expect_ready” flag is added — default notice-only for operator inspection) |
| Partial failure | Order is intentional: re-run failed step only; never re-provision same id without cleanup plan |
| Cleanup (optional) | Document that failed synthetic shells may remain `provisioning`; do not invent delete RPCs in this slice |

## 11. Security

- Rationale and audit on provision/activate/publish.  
- Public config remains privacy-safe projection only.  
- Browser uses anon + user JWT only.  
- Synthetic data only for dry-run.  
- Production import remains BLOCKED.

## 12. Testing and acceptance

| Kind | What |
| --- | --- |
| Existing automated | `011_agi_client_onboarding.sql` (and related AGI tests) — no intentional regression |
| Safety | Verify script has no secret markers; optional include in `check-script-safety.sh` if it gains mutators (read-only may only need secret scan) |
| Manual | Option A/B/C dry-run; CURRENT-STATE update |
| CI | Existing validate / local-acceptance; no new required workflow unless plan adds one |

## 13. Success criteria (slice B done)

1. `COMMERCIAL-CLIENT-LIFECYCLE.md` exists and is linked.  
2. `verify-client-lifecycle.sql` shipped (or explicitly deferred in CURRENT-STATE with reason — prefer ship).  
3. Happy path documented end-to-end with slice C prereqs.  
4. Activate exception table complete.  
5. Dry-run OBSERVED or PENDING with clear next step.  
6. No Approach 2/3 or slice D code without a new design.

## 14. Follow-ups (not this design)

1. **Approach 2** — Platform admin readiness strip (pre-check before Activate).  
2. **Slice D** — Second-tenant product / IR clone.  
3. Optional MFA hard-fail on `grant-master-admin` / provision (from slice C review).  
4. Real commercial tenant go-live under separate ops authority.

## 15. Implementation units (for planning)

1. Author `COMMERCIAL-CLIENT-LIFECYCLE.md`.  
2. Add `verify-client-lifecycle.sql` + README index.  
3. Wire discovery pointers.  
4. Operator dry-run; update CURRENT-STATE.  
5. Gap-fix PR only if a blocker is found (separate mini-task, still under this design constraints).  
6. Final verification gate (files exist, links resolve, scope clean).
