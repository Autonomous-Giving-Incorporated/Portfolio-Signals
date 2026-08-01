# Hacker Dojo Campaign Intelligence — Production Roadmap

## Objective

Turn the current privacy-safe static director dashboard into a governed campaign operating system without placing donor, member, attendance, or relationship-level personal data in GitHub.

## Current State

```yaml
phase: 1_static_director_shell
minimum_campaign: 420000
stretch_campaign: 2000000
public_dashboard: implemented
public_data_contract: phase_2
campaign_control_workbook: available_off_repo
outreach_authority: not_granted
sensitive_data_in_repository: prohibited
```

## Phase 2 — Production-Ready Public Shell

**Status:** In progress

Deliverables:

- canonical public campaign data file;
- JSON Schema and automated validation;
- GitHub Pages deployment workflow;
- security and data-classification policy;
- documented director review cadence;
- clear boundary between public planning data and restricted CRM data.

Exit gate:

```yaml
pages_deploys_from_main: true
public_data_validates: true
no_pii_committed: true
director_can_review_decisions: true
```

## Phase 3 — Authenticated Director Workspace

Recommended stack:

- **Frontend:** Next.js or the existing static interface migrated incrementally.
- **Authentication:** Clerk, Auth0, or Supabase Auth with enforced MFA for privileged roles.
- **Database:** Supabase Postgres or managed PostgreSQL.
- **Authorization:** Role-based access control plus row-level security.
- **Audit:** append-only change log for approvals, outreach authorization, suppression, and exports.
- **Secrets:** deployment-platform secret store; never client-side or committed.

Required roles:

| Role | Access |
|---|---|
| Director | Full campaign review and approval |
| Campaign lead | Pipeline operations and reporting |
| Relationship owner | Assigned records only |
| Grant lead | Grant pipeline and document room |
| Data steward | Import, deduplication, consent and suppression |
| Viewer | Aggregate dashboard only |

Exit gate:

```yaml
mfa_enabled: true
rbac_tested: true
row_level_security_tested: true
audit_log_immutable: true
backup_restore_tested: true
```

## Phase 4 — Governed CRM Import

Inputs:

- native spreadsheet export of the Master Development List;
- Every.org transaction export;
- authorized donor and alumni records;
- verified sponsor and grant histories;
- suppression and consent records.

Import controls:

1. Land data in a quarantined staging area.
2. Validate required fields and source provenance.
3. Deduplicate without silently merging conflicting identities.
4. Classify consent and contact authority.
5. Assign relationship ownership.
6. Promote only approved records into operating views.
7. Generate an import receipt and exception report.

## Phase 5 — Campaign Operations

Capabilities:

- major-gift and sponsor pipeline;
- grant calendar and qualification;
- board decision log;
- claim-evidence registry;
- Every.org reconciliation;
- event registration and follow-up;
- weekly operating-review dashboard;
- stewardship and fulfillment tracking.

## Immediate Decision Queue

1. Approve the exact $420K use-of-funds schedule.
2. Approve or defer the independent $2M transformation plan.
3. Approve sponsor benefits, costs, exclusions, and fulfillment owners.
4. Approve privacy, consent, suppression, retention, and export rules.
5. Name the director, campaign lead, data steward, grant lead, and relationship owners.
6. Select the authenticated application stack.
7. Supply a native spreadsheet export for lossless ingestion.

## Non-Negotiable Boundary

GitHub and GitHub Pages may contain only public or safely aggregated information. Raw member records, personal email addresses, donation histories, attendance records, private notes, relationship scores, and consent state belong only in the authenticated data service.
