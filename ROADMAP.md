# Hacker Dojo Campaign Intelligence — Production Roadmap

## Objective

Deliver a governed campaign operating system for Hacker Dojo without placing donor, member, attendance, relationship, consent, suppression, or private-document data in GitHub.

The operating target is a **$420K minimum campaign** with a separately governed **$2M transformation path** and an Aug. 21, 2026 SupperHappyFundHouse campaign event.

## Evidence and authority model

Every production decision must distinguish:

- **OBSERVED** — directly supported by repository state, approved records, or executed tests;
- **INFERRED** — a reasoned conclusion requiring review;
- **SPECULATIVE** — a hypothesis or unapproved proposal;
- **NOT_COMPUTABLE** — unavailable because required data or authority is missing.

Historical attendance, membership, donor, sponsor, or relationship evidence does not by itself grant outreach authority.

## Verified state — 2026-08-01

```yaml
public_portal: PASS
public_data_schema: PASS
pages_validation_and_deployment: PASS
static_database_policy_checks: PASS
local_security_contract: PASS
full_migration_chain: PASS
synthetic_fixture_connection: PR_14_PENDING
six_role_rls_execution: PENDING
production_environment: NOT_CONFIGURED
production_data_import: BLOCKED
outreach_authority: NOT_GRANTED
```

## Completed foundation

### Public campaign surface

- director-facing campaign overview;
- $420K minimum and $2M stretch framing;
- proposed funding ladder;
- sponsor, grant, and aggregate member-segment views;
- decision queue and governance controls;
- canonical aggregate JSON data;
- strict JSON Schema validation with standard date formats;
- GitHub Pages validation and deployment workflow;
- restricted-file checks.

### Authenticated workspace foundation

- six application roles: director, campaign lead, development, board viewer, data steward, and auditor;
- active-profile and MFA-ready authentication boundary;
- role-aware application navigation;
- constituents, opportunities, decisions, evidence, and audit structures;
- sponsor and grant pipeline workflows;
- optimistic concurrency controls;
- controlled decision transitions with rationale;
- append-only audit-event model;
- private opportunity notes and document metadata;
- row-level-security policies.

### Governed import foundation

- batch and staging-row lifecycle;
- quarantine-only native `.xlsx` parser;
- SHA-256 source provenance;
- duplicate and exception registry;
- consent and suppression gates;
- suppression propagation;
- role-gated row promotion;
- private storage bucket policies;
- signed-document URL server function;
- synthetic six-role fixtures and import-gate test corpus;
- director import-review interface.

## Active phase — executable policy closure

**Goal:** obtain a reproducible green run proving that the disposable local database can apply every migration, load six synthetic roles, and execute positive and negative RLS assertions.

### Current observed position

The complete migration chain now applies successfully. The latest failure occurred before fixture loading because the workflow failed to propagate the local `DB_URL` to `psql`.

PR #14:

- resolves the trusted environment assignments emitted by the pinned Supabase CLI;
- fails closed when `DB_URL` is absent;
- exports the validated connection through `GITHUB_ENV`;
- reuses the connection for role fixtures and RLS tests.

### Exit gate

```yaml
all_migrations_apply: true
six_synthetic_roles_load: true
rls_positive_cases_pass: true
rls_negative_cases_pass: true
import_gate_cases_pass: true
suppression_bypass: false
unauthorized_promotion: false
production_data_used_in_tests: false
```

No six-role enforcement claim is valid until this gate executes successfully in CI.

## Next phase — production environment hardening

Begin only after executable policy closure.

### Infrastructure

- create separate staging and production Supabase projects;
- pin supported CLI, database, and runtime versions;
- configure backup, restore, and disaster-recovery procedures;
- configure secret management and rotation;
- configure deployment environments and protected branches;
- enable structured observability without logging personal data.

### Identity and authorization

- enforce MFA for privileged roles;
- verify inactive-user and revoked-role handling;
- test every role against every protected table and storage action;
- restrict service-role credentials to server runtimes;
- verify session expiration and emergency access revocation.

### Private storage

- create the private production bucket;
- validate allowed MIME types and file-size limits;
- verify upload ownership constraints;
- verify signed URLs expire as configured;
- record every document-access event;
- define retention, deletion, and legal-hold procedures.

### Exit gate

```yaml
staging_environment: VERIFIED
production_environment: VERIFIED
mfa_enforced: true
secrets_committed: false
backup_restore_tested: true
private_storage_tested: true
signed_url_audit_tested: true
```

## Governed data-import phase

No raw source file may enter the operating database outside this sequence:

1. Receive the authorized native source file through a private channel.
2. Compute and record SHA-256 provenance.
3. Store the source in private object storage.
4. Parse into quarantine-only normalized rows.
5. Validate schema and required fields.
6. Detect duplicates without silently merging identities.
7. Apply consent and suppression classification.
8. Record unresolved exceptions.
9. Require data-steward or director approval.
10. Promote only eligible approved rows.
11. Produce a batch receipt, reconciliation summary, and exception report.
12. Purge temporary artifacts according to approved retention policy.

### Mandatory test corpus

- eligible confirmed-consent row;
- unknown or restricted-consent row;
- possible duplicate;
- suppressed record;
- unresolved critical exception;
- unauthorized role attempting promotion;
- repeated source hash;
- source-row fingerprint collision.

### Exit gate

```yaml
native_xlsx_source: AUTHORIZED
source_receipt: COMPLETE
duplicate_resolution: REVIEWED
consent_classification: REVIEWED
suppression_registry: ACTIVE
human_approval: RECORDED
production_import_receipt: COMPLETE
```

## Campaign operations phase

After leadership approvals and a controlled import:

- sponsor pipeline and fulfillment tracking;
- grant qualification and submission calendar;
- major-gift relationship ownership;
- board decision ledger;
- claim-evidence registry;
- Every.org reconciliation;
- event registration and stewardship;
- weekly operating review;
- aggregate progress reporting;
- consent-respecting follow-up controls.

## Leadership decision queue

These decisions remain outside engineering authority:

1. Approve the exact $420K use-of-funds schedule.
2. Approve, revise, or defer the $2M transformation case.
3. Approve sponsor tiers, benefits, exclusions, cost limits, and fulfillment owners.
4. Reject governance access or board influence as a donor benefit unless separately authorized through lawful governance procedure.
5. Approve privacy, consent, suppression, retention, deletion, and export rules.
6. Define what evidence constitutes lawful outreach authorization.
7. Name the director, campaign lead, development owner, data steward, and auditor.
8. Approve the production application and identity providers.
9. Authorize a native source workbook for quarantine import.
10. Approve the transition from internal testing to real campaign operations.

## Release sequence

```yaml
HD_OI_018:
  name: CI_and_policy_closure
  state: ACTIVE
  completion: green_fixture_and_RLS_run

HD_OI_019:
  name: production_environment_hardening
  state: BLOCKED_BY_HD_OI_018

HD_OI_020:
  name: governed_pilot_import
  state: BLOCKED_BY_POLICY_AND_LEADERSHIP_APPROVAL

HD_OI_021:
  name: controlled_campaign_operations
  state: BLOCKED_BY_PILOT_ACCEPTANCE
```

## Non-negotiable boundary

GitHub and GitHub Pages may contain only public or safely aggregated information. Raw member records, personal contact information, donation histories, attendance records, private notes, relationship assessments, consent state, suppression state, and private documents belong only in the authenticated data service.

Production import and outreach remain blocked until both technical and leadership gates are satisfied.
