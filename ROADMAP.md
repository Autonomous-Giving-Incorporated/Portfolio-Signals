# A.G.I. Fund-Intel — Product and Hacker Dojo Pilot Roadmap

## Objective

Deliver Fund-Intel as the reusable frontend and client-administration component of **Autonomously Giving Incorporated (A.G.I.)**, while preserving Hacker Dojo as the canonical reference tenant and keeping donor, member, attendance, relationship, consent, suppression, and private-document data out of GitHub.

The cross-repository sequence is AGI-001 through AGI-009 in [docs/AGI-SUITE-ARCHITECTURE.md](docs/AGI-SUITE-ARCHITECTURE.md). The HD-OI phases below remain the Hacker Dojo pilot and evidence track.

The operating target is a **$420K minimum campaign** with a separately governed **$2M transformation path** and an Aug. 21, 2026 SupperHappyFundHouse campaign event.

## Evidence and authority model

Every production decision must distinguish:

- **OBSERVED** — directly supported by repository state, approved records, or executed tests;
- **INFERRED** — a reasoned conclusion requiring review;
- **SPECULATIVE** — a hypothesis or unapproved proposal;
- **NOT_COMPUTABLE** — unavailable because required data or authority is missing.

Historical attendance, membership, donor, sponsor, or relationship evidence does not by itself grant outreach authority.

## Current evidence boundary — HD-OI-041

The current `main` baseline is `251549f1e2142c35d1807cc9412d596ce82e360d`. The component evidence below is retained for provenance, but it must not be read as current-main hosted acceptance.

PR #44 (`e124375bfd60758df9857b03dfc171c9210b78b1`) completed all four pull-request workflows, including the disposable local acceptance suite. It remains pre-merge evidence only. Current `main` remains `NO_GO` pending exact-commit local execution after merge, hosted staging parity, browser smoke, and director acceptance.

## Historical component evidence — 2026-08-01

```yaml
public_portal: PASS
public_data_schema: PASS
pages_validation: PASS
pages_deployment: PLAN_GATED  # private free plan cannot host Pages; validate still required
static_database_policy_checks: PASS
local_security_contract: PASS
full_migration_chain: PASS
synthetic_fixture_connection: PASS  # observed on PR #14 Actions run 30689212832
six_role_rls_execution: PASS  # executable positive/negative checks observed green
import_gate_execution: PASS  # observed on PR #15 Actions run 30689742284
private_data_placement: LOCAL_PLUS_SUPABASE  # Notion not CRM SoR
staging_supabase_project: PROVISIONED
  ref: ecxkhihlbrcwpavfoaoq
  host: https://ecxkhihlbrcwpavfoaoq.supabase.co
  github_linked: OBSERVED  # operator-reported
  migrations_on_hosted: OPERATOR_OWNED  # not verified by CI
production_environment: NOT_SEPARATED_YET  # treat hosted project as staging until named
production_data_import: BLOCKED
outreach_authority: NOT_GRANTED
source_workbook_inventory: COMPLETE  # aggregate-only; see docs/DATA-PLACEMENT.md
```

## Completed foundation

### Public campaign surface

- dedicated GitHub Pages routes for sponsor, grant, and aggregate member-segment intelligence;
- reusable accessible dropdown filters, range explorers, and evidence-bound tooltips;
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

- authoritative per-session A.G.I. client context and client switcher;
- tenant-filtered dashboard, decision, pipeline, claim, and audit queries;
- audited director membership administration with last-director protection;
- MFA-gated master administration and client provisioning without implicit private-data access;
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

### Client customization and publication

- immutable tenant configuration snapshots with explicit draft, publish, archive, and rollback transitions;
- director-only brand and campaign-content controls with live preview and rationale gates;
- governed tenant assets with MIME, size, ownership, and quota enforcement;
- privacy-safe public configuration projection selected by client slug;
- static Hacker Dojo fallback when runtime configuration is unavailable;
- complete version history and tenant audit events.

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

## Completed phase — executable policy closure (HD-OI-018)

**Goal:** reproducible green disposable run for migrations, six synthetic roles, RLS assertions, and import gates.

### Observed completion

- PR #14: migrations, fixtures, and RLS acceptance green (Actions run `30689212832`).
- PR #15: import-gate execution, promotion fail-closed checks, and Pages plan gating green (Actions run `30689742284`).

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

## Active phase — production environment hardening (HD-OI-019)

**Goal:** identity/MFA readiness, schema-aligned clients, operator hardening checklist, expanded six-role matrix, import-review actions, storage matrix tests, staging bootstrap, and wired decision/pipeline modules — without enabling production import.

Repository progress in this phase:

- MFA / active-profile controls and expanded RLS suite;
- fail-closed JWT expiration and immediate role-revocation checks;
- pinned Node, Supabase CLI, and PostgreSQL versions;
- bounded signed-document URLs with privacy-safe issuance audit evidence;
- privacy-safe structured logging plus secret rotation, recovery, retention, and legal-hold runbooks;
- fail-closed non-interactive hosted-staging migration and seven-suite verification runner;
- import-review approve / reject / promote RPCs + UI;
- storage matrix tests for private bucket and document metadata;
- staging bootstrap scripts and docs;
- decision queue and sponsor/grant pipeline modules mounted in the workspace shell.

### Infrastructure

- ~~create staging Supabase project~~ — **done** (`ecxkhihlbrcwpavfoaoq`, GitHub-linked);
- apply repository migrations to the hosted staging project (`supabase db push`);
- create a separate **production** project when leadership requires environment split;
- pin supported CLI, database, and runtime versions;
- configure backup, restore, and disaster-recovery procedures;
- configure secret management and rotation (no service-role in git);
- configure deployment environments and protected branches;
- enable structured observability without logging personal data;
- keep private CRM on **local + Supabase** only ([docs/DATA-PLACEMENT.md](docs/DATA-PLACEMENT.md)).

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
staging_project_created: true  # ecxkhihlbrcwpavfoaoq
staging_migrations_applied: NOT_RUN_FOR_CURRENT_MAIN
staging_environment: NOT_RUN_FOR_CURRENT_MAIN
production_environment: NOT_SEPARATED
mfa_enforced: NOT_RUN_FOR_CURRENT_MAIN
secrets_committed: false
backup_restore_tested: NOT_VERIFIED_CURRENT
private_storage_tested: NOT_RUN_FOR_CURRENT_MAIN
signed_url_audit_tested: NOT_RUN_FOR_CURRENT_MAIN
```

### Operator handoff (continue outside GitHub agent)

1. Link CLI: `supabase link --project-ref ecxkhihlbrcwpavfoaoq`
2. Push schema: `supabase db push` or `./scripts/staging/apply-migrations.sh remote-linked`
3. Wire gitignored `runtime-config.js` (URL + anon key only)
4. MFA + six synthetic roles on staging; run policy suite
5. Do **not** load Master Development List until HD-OI-020 leadership gates

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
  state: COMPLETE
  completion: green_fixture_RLS_and_import_gate_run
  evidence: Actions runs 30689212832 and 30689742284

HD_OI_019:
  name: production_environment_hardening
  state: ACTIVE
  completion: identity_mfa_controls_client_schema_alignment_operator_checklist
  progress:
    staging_project: PROVISIONED
    data_placement_docs: COMPLETE
    hosted_migrations: PENDING_OPERATOR
    mfa_provider: PENDING_OPERATOR

HD_OI_020:
  name: governed_pilot_import
  state: BLOCKED_BY_POLICY_AND_LEADERSHIP_APPROVAL
  candidate_source: Master Development List 1.2 (local; SHA-256 in docs/DATA-PLACEMENT.md)

HD_OI_021:
  name: controlled_campaign_operations
  state: BLOCKED_BY_PILOT_ACCEPTANCE
```

## Non-negotiable boundary

GitHub and GitHub Pages may contain only public or safely aggregated information. Raw member records, personal contact information, donation histories, attendance records, private notes, relationship assessments, consent state, suppression state, and private documents belong only in **local custody and/or Supabase** (authenticated data service + private storage). Notion is not a substitute SoR for those records.

Production import and outreach remain blocked until both technical and leadership gates are satisfied.
