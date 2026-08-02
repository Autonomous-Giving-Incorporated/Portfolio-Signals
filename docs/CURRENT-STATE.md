# Hacker Dojo Current State Receipt

**Campaign:** HD-OI-041 — Repository State Reconciliation and Staging Acceptance  
**Recorded:** 2026-08-02  
**Canonical repository:** `scrimshawlife-ctrl/Hacker-Dojo`  
**Current `main` baseline:** `251549f1e2142c35d1807cc9412d596ce82e360d`

## Purpose

This document separates current repository state from older hosted verification evidence. It does not authorize production import, campaign outreach, money movement, or promotion of staging to production.

## Evidence labels

- **OBSERVED** — directly supported by current repository state or a recorded executed check.
- **HISTORICAL** — valid evidence for an earlier commit or deployment, not automatically proof of current `main`.
- **PENDING** — requires a new execution against current `main` or the hosted staging environment.
- **NOT_COMPUTABLE** — cannot be determined from repository evidence alone.

## Current repository state

```yaml
repository_visibility: PUBLIC
main_commit: 251549f1e2142c35d1807cc9412d596ce82e360d
public_portal: OBSERVED_IMPLEMENTED
authenticated_workspace: OBSERVED_IMPLEMENTED
hacker_dojo_brand_system: OBSERVED_IMPLEMENTED
workspace_keyboard_navigation: OBSERVED_IMPLEMENTED
six_role_model: OBSERVED_IMPLEMENTED
row_level_security: OBSERVED_IMPLEMENTED
import_quarantine: OBSERVED_IMPLEMENTED
private_storage_controls: OBSERVED_IMPLEMENTED
signed_document_function: OBSERVED_IMPLEMENTED
impact_relay_host_surfaces: OBSERVED_IMPLEMENTED
production_import: BLOCKED
outreach_authority: NOT_GRANTED
```

## Historical hosted evidence retained from draft PR #28

The following evidence was recorded against an earlier deployed baseline, not current `main`:

```yaml
historical_verified_deployed_main: b573fe078296bcc02e9d4e21140cf777d9d050d2
historical_pages_runtime_repair: 32087fa65cae90d5ee69f253bbb14befc058708d
historical_pages_https_host: PASS
historical_authenticated_workspace_runtime: PASS
historical_signed_document_issuance_and_audit: PASS
historical_hosted_synthetic_policy_suite: 7_of_7_PASS
historical_staging_project_ref: ecxkhihlbrcwpavfoaoq
```

These results remain useful provenance. They must not be represented as a current-main staging acceptance result until the full suite is rerun against `251549f1e2142c35d1807cc9412d596ce82e360d` or a later approved commit.

## Drift detected

```yaml
readme_current_main_evidence: RECONCILED_IN_PENDING_DOCS_PR
roadmap_current_main_evidence: RECONCILED_IN_PENDING_DOCS_PR
start_here_baseline: RECONCILED_IN_PENDING_DOCS_PR
pr_28: SUPERSEDED_AND_CLOSED_WITHOUT_MERGE
pr_44_local_acceptance: PASS_PREMERGE_ONLY
current_main_hosted_parity: NOT_RUN
latest_brand_and_navigation_browser_smoke: NOT_RUN
```

## Required current-main verification

Run the following against the current baseline:

1. Public JSON Schema validation.
2. Static security and secret-scanning contracts.
3. Workbook parser tests.
4. Import API tests.
5. Full local Supabase reset and migration chain.
6. Six-role positive and negative RLS suites.
7. Import-gate and suppression suites.
8. Private-storage policy matrix.
9. Signed-document function contract and audit event.
10. Runtime-config generation and load order.
11. Browser smoke tests for:
   - `index.html`
   - `workspace.html`
   - `import-review.html`
   - `finance-impact.html`
   - `donor-impact.html`
12. Hosted staging migration and function parity.
13. Supabase Auth redirect and MFA behavior.
14. Director synthetic acceptance journey.

## Current verdict

PR #44 completed a green local acceptance workflow against its unmerged head. That is pre-merge evidence only; the exact current-main and hosted lanes remain unexecuted.

```yaml
verdict: NO_GO
public_demo: READY
local_control_model: STRONG_FOUNDATION
hosted_staging_current_main: NOT_YET_REVERIFIED
production_environment: NOT_SEPARATED
backup_restore: NOT_VERIFIED_CURRENT
network_restriction: NOT_VERIFIED_CURRENT
production_import: BLOCKED
outreach: BLOCKED
next_gate: CURRENT_MAIN_STAGING_ACCEPTANCE
```

## Non-negotiable boundary

No raw member, donor, attendee, relationship, consent, suppression, donation-history, or private-document data may be committed to GitHub or published through GitHub Pages. Historical relationship evidence does not establish outreach authorization.
