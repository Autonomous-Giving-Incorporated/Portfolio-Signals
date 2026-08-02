# Hacker Dojo Current State Receipt

**Campaign:** HD-OI-041 — Repository State Reconciliation and Staging Acceptance  
**Recorded:** 2026-08-02  
**Canonical repository:** `scrimshawlife-ctrl/Fund-Intel`  
**Current `main` baseline:** `152227a9cc7d6e2f83d9cc132acc6c7f31c5abe4`

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
main_commit: 152227a9cc7d6e2f83d9cc132acc6c7f31c5abe4
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

These results remain useful provenance. They remain historical provenance. Exact-main local acceptance now passed for `152227a9cc7d6e2f83d9cc132acc6c7f31c5abe4`; hosted evidence still cannot be promoted because the dashboard labels the project `Production`.

## Drift detected

```yaml
readme_current_main_evidence: RECONCILED_IN_PENDING_DOCS_PR
roadmap_current_main_evidence: RECONCILED_IN_PENDING_DOCS_PR
start_here_baseline: RECONCILED_IN_PENDING_DOCS_PR
pr_28: SUPERSEDED_AND_CLOSED_WITHOUT_MERGE
exact_main_local_acceptance: PASS  # workflow 30726851425
pages_deployment_exact_main: PASS  # workflow 30726851423
public_portal_smoke: PASS  # read-only public check; no captured console errors
current_main_hosted_parity: BLOCKED_ENVIRONMENT_DESIGNATION
latest_authenticated_browser_smoke: NOT_RUN
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

Exact-main local acceptance completed successfully for `152227a9cc7d6e2f83d9cc132acc6c7f31c5abe4`. Hosted parity, authenticated browser smoke, and director acceptance remain unexecuted because the dashboard presents the connected project as `Production`.

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
