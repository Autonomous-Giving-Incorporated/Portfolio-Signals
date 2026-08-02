# Start Here — Hacker Dojo Campaign Control Center

This is the canonical operator entry point for the repository.

## Current authority state

```yaml
production_import: BLOCKED
outreach_authority: NOT_GRANTED
production_money_movement: BLOCKED
impact_relay_live_notifications: NOT_ACTIVATED
private_data_in_github: PROHIBITED
```

## Read in this order

1. [CURRENT-STATE.md](CURRENT-STATE.md) — current baseline, historical evidence, drift, and required verification.
2. [../ROADMAP.md](../ROADMAP.md) — engineering phases and leadership gates.
3. [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md) — staging setup and verification procedures.
4. [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — identity, roles, RLS, and application boundaries.
5. [DATA-PLACEMENT.md](DATA-PLACEMENT.md) — where public, restricted, and source data may exist.
6. [IMPORT-RUNBOOK.md](IMPORT-RUNBOOK.md) — governed workbook quarantine and promotion flow.
7. [PRODUCTION-HARDENING.md](PRODUCTION-HARDENING.md) — production checklist and operational controls.
8. [IMPACT-RELAY.md](IMPACT-RELAY.md) — Impact Relay host integration.
9. [IMPACT-RELAY-SHADOW.md](IMPACT-RELAY-SHADOW.md) — finance rehearsal without live notification.
10. [IMPACT-RELAY-LIVE-COHORT.md](IMPACT-RELAY-LIVE-COHORT.md) — limited cohort procedure; operator approval required.

## Current baseline

```yaml
repository: scrimshawlife-ctrl/Hacker-Dojo
main_commit: 522b66076f6b93be587eec8da95ff6d137746a6a
phase: HD-OI-041_RECONCILIATION
previous_phase: HD-OI-019_PRODUCTION_ENVIRONMENT_HARDENING
staging_project_ref: ecxkhihlbrcwpavfoaoq
current_main_hosted_acceptance: PENDING
```

## Operator rule

Do not treat an earlier successful deployment or synthetic suite as proof that current `main` is deployed and accepted. Record the exact commit, environment, migration head, function version, test result, and timestamp for every staging or production claim.

## Immediate execution sequence

```text
verify current main locally
→ deploy current main to staging
→ verify hosted migration/function parity
→ execute synthetic role and import suites
→ execute browser smoke tests
→ execute director acceptance journey
→ issue GO / CONDITIONAL / NO_GO receipt
```

## Stop conditions

Stop and preserve evidence if any of the following occur:

- a secret or service-role value appears in GitHub, Pages, browser code, logs, or artifacts;
- a real constituent or donor record enters a synthetic test;
- suppression or consent gates can be bypassed;
- an unauthorized role can promote an import row or approve a controlled action;
- the hosted migration head cannot be reconciled with the repository;
- the current deployed commit cannot be identified;
- backup, network, Auth, or storage configuration is represented as verified without direct evidence.

## Leadership-owned decisions

Engineering cannot approve:

- the final $420K use-of-funds schedule;
- the $2M transformation case;
- sponsor benefits or governance access;
- privacy, retention, deletion, and export policy;
- lawful outreach authorization criteria;
- production environment designation;
- a real workbook import;
- transition to live campaign operations.
