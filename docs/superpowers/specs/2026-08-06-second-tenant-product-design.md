# Second-tenant product path (slice D) — design

**Date:** 2026-08-06  
**Status:** Approved for implementation planning  
**Suite project:** [AGI GitHub Project #3](https://github.com/users/scrimshawlife-ctrl/projects/3)  
**Primary repos:** Fund-Intel (Portfolio Signals) + Impact-Relay  
**Slice:** D of commercial onboarding (C → B → **D**)  
**Depends on:** Slice C (people), Slice B (commercial client lifecycle)

## 1. Context

Slices C and B make a single client **people-ready** and **lifecycle-ready** on Portfolio Signals. Slice D makes a **second nonprofit** real as a product shape: same suite, isolated data, Hacker Dojo remains the **reference template** (not product brand).

Already present:

| Layer | Capability |
| --- | --- |
| FI | Multi-tenant clients, RLS, `org_platform_isolation` fixture, two-tenant config tests (`014_agi_two_tenant_acceptance.sql`) |
| FI | Lifecycle: provision → publish → activate (slice B) |
| IR | `clone_tenant_from_hacker_dojo` / template registry; isolation rules documented |
| Contract | `client_id == tenant_id` (e.g. `org_*`) |

Gap: **no single cross-repo operator path** that takes a second synthetic nonprofit from zero → FI active client + IR template-cloned tenant, with isolation evidence.

## 2. Goal

An operator can follow **one suite runbook** to stand up a **synthetic second tenant** that:

1. Exists as an **active** Portfolio Signals client (via slice B path).  
2. Exists as an Impact Relay tenant **cloned from Hacker Dojo policy template** with `tenant_id == client_id`.  
3. Is **isolated** from `org_hacker_dojo` (no cross-tenant private data; independent public config projection).  
4. Leaves HD fixtures as the CI / regression oracle.

### Success definition

1. Canonical runbook linked from FI + IR operator entry points.  
2. Cross-repo identifier contract explicit (`org_*` shared).  
3. Verify helpers or checklists for FI isolation + IR registration.  
4. Dry-run OBSERVED or PENDING with honest status.  
5. No self-serve multi-nonprofit marketplace UI.  
6. No special-casing Hacker Dojo money rules in product code (template only).

## 3. Approach

**Approach 1 — Cross-repo operator runbook + verify + dry-run evidence** (selected).

| Alternative | Why not now |
| --- | --- |
| Self-serve nonprofit signup UI | IR TODO: after HD v1.0; product surface |
| Automated FI+IR provision in one RPC | Cross-system orchestration; secrets; overbuild |
| Production second commercial tenant go-live | Separate ops authority; real CRM |

Mirror C/B delivery: docs-first, existing APIs, fail-closed isolation already in tests.

## 4. Scope

### In scope

- Suite runbook (home in Fund-Intel, pointer from Impact-Relay): `docs/SECOND-TENANT-ONBOARDING.md` (FI) + short IR doc or section pointing to it / dual-path  
- Explicit steps: people (C) → FI lifecycle (B) → IR `clone_tenant_from_hacker_dojo` → isolation verify  
- Identifier rules, isolation checklist, failure modes  
- Optional SQL verify for second FI client vs HD (or reuse `verify-client-lifecycle` + isolation notes)  
- IR operator notes: storage path, template_source, isolation rules  
- CURRENT-STATE (FI) + IR CURRENT-STATE or README pointer if present  
- Discovery links (START_HERE, COMMERCIAL-CLIENT-LIFECYCLE “next”, IR HACKER-DOJO-INTEGRATION)

### Out of scope

- Self-service multi-nonprofit onboarding UI  
- Live every.org webhook / production money movement for second tenant  
- Production CRM import  
- Approach 2 Platform admin readiness UI (unless blocking)  
- Merging IR durable Postgres multi-tenant host into FI Vercel  
- Changing `clone_tenant_from_hacker_dojo` semantics unless a bug is found  

## 5. Authority and isolation rules

- Master admin provisions/activates FI client; director owns FI brand config.  
- IR tenant registration uses operator tooling / library APIs; not browser service-role.  
- `client_id` (FI) **must equal** `tenant_id` (IR).  
- HD is template + reference_tenant; second tenant must not set `reference_tenant = true`.  
- No cross-tenant ledger, membership, or private config leakage.  
- Public projections (`get_public_client_config`) remain independent per slug.  
- Platform Supabase only for FI; IR local/S3 store per operator env (document).  
- Synthetic second tenant only for dry-run (e.g. `org_second_makerspace` / `org_lifecycle_dry_run` if activated).

## 6. Operator flow

```text
0. Slice C: master_admin + director MFA for the new nonprofit
1. Slice B: provision → publish config → activate FI client (id = org_*)
2. IR: clone_tenant_from_hacker_dojo(tenant_id=org_*, display_name=...)
3. IR: upsert registry / open storage scoped to that tenant only
4. Verify FI: verify-client-lifecycle.sql + isolation spot-check vs org_hacker_dojo
5. Verify IR: tenant registered; no HD fixture pollution; isolation rules hold
```

### IR clone (library pattern — document, do not reimplement)

```python
from pathlib import Path
from impact_relay.storage.template import clone_tenant_from_hacker_dojo
from impact_relay.storage import open_storage

store = open_storage(Path("./data/org_second_makerspace"))  # tenant-scoped data dir
policy = clone_tenant_from_hacker_dojo(
    tenant_id="org_second_makerspace",
    display_name="Second Makerspace",
)
store.tenants.upsert_from_policy(policy, template_source="org_hacker_dojo")
```

## 7. Artifacts

| Path | Repo | Role |
| --- | --- | --- |
| `docs/SECOND-TENANT-ONBOARDING.md` | Fund-Intel | Canonical suite second-tenant path |
| `docs/HACKER-DOJO-INTEGRATION.md` (section or link) | Impact-Relay | Point to suite runbook; keep clone snippet |
| `docs/START_HERE.md`, lifecycle, OPERATOR-ACCESS | Fund-Intel | Next-step links |
| `docs/CURRENT-STATE.md` | Fund-Intel | Slice D status |
| Optional IR `docs/` or CURRENT-STATE | Impact-Relay | Thin pointer + dry-run note |
| Optional `scripts/platform/verify-second-tenant-isolation.sql` | Fund-Intel | Compare two clients: both exist, different published branding if present, neither leaks |

Prefer **not** inventing a second IR package unless needed; document Python path.

## 8. Verify checklist

**FI**

- Second client `state = active`, `reference_tenant = false`  
- Active director membership  
- Published config distinct from HD public projection when both published  
- Director of second cannot see HD private tables (RLS spot-check or cite existing test suite)  

**IR**

- Tenant id equals FI client id  
- Policy cloned from HD template; HD fixtures still green in CI  
- Storage prefix / data-dir is tenant-scoped  

## 9. Dry-run

| Option | When |
| --- | --- |
| **A** | Full FI B path + IR clone for synthetic org_* ; OBSERVED |
| **B** | FI only if IR env unavailable; PENDING IR step |
| **C** | Docs only; PENDING |

## 10. Success criteria

1. Suite runbook exists and is linked from FI START_HERE + IR integration doc.  
2. ID contract and isolation rules are explicit.  
3. IR clone steps are copy-pasteable without inventing product UI.  
4. CURRENT-STATE records slice D.  
5. No self-serve marketplace; no production CRM.  

## 11. Follow-ups

- Self-serve nonprofit onboarding UI  
- Shared durable IR host multi-tenant production  
- Live cohort for second tenant  
- Approach 2 readiness UI  

## 12. Implementation units

1. Author FI `SECOND-TENANT-ONBOARDING.md`.  
2. Wire FI pointers; update COMMERCIAL-CLIENT-LIFECYCLE “next”.  
3. IR doc pointer + confirm clone section consistency.  
4. Optional FI isolation verify SQL.  
5. CURRENT-STATE (both repos as needed).  
6. Final gate + PRs (FI primary; IR secondary if docs change).
