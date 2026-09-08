# Operational Controls

## Authority boundary

This runbook defines engineering response procedures. It does not authorize production import, outreach, deletion of held records, or acceptance of recovery objectives. Real credentials and incident evidence must remain in the approved secret manager or incident system, never GitHub.

## Privacy-safe observability

Runtime logs use allow-listed structured events only. Permitted fields are:

- `event`: stable machine-readable event name;
- `code`: stable public failure category;
- aggregate duration, status, and row-count metrics that cannot identify a person;
- deployment, migration, backup, and synthetic-suite state.

Never log bearer tokens, signed URLs, object paths, request or import payloads, upstream error bodies, email addresses, phone numbers, street addresses, free-text notes, or service-role values. Detailed errors may be correlated through provider-generated request IDs only when those IDs contain no user data.

## Secret rotation

Rotate a credential after suspected disclosure, staff offboarding, environment cloning, or the approved periodic interval.

1. Open a restricted incident or maintenance record and name the operator and approver.
2. Inventory the affected environment and credential consumers without copying secret values.
3. Generate the replacement in the provider or secret manager.
4. Update server runtimes first. Never place service-role values in browser configuration.
5. Verify health checks and synthetic authorization tests with the replacement.
6. Revoke the prior credential and confirm old-token failure.
7. Review logs and Git history for exposure indicators.
8. Record timestamps, affected systems, validation evidence, and follow-up actions without recording the secret.

If a service-role key or signing credential may have entered Git history, treat it as compromised immediately. Rotate it before repository cleanup. History rewriting alone is not remediation.

## Incident response

1. Contain access by deactivating affected profiles and revoking exposed credentials.
2. Preserve append-only audit records and provider logs under the applicable legal hold.
3. Classify affected environments and data categories without copying personal data into tickets.
4. Determine whether imports, promotions, document access, or outreach authority changed.
5. Restore from a known-good point when integrity is uncertain.
6. Run migrations and the complete synthetic policy suite after containment or restoration.
7. Require leadership and privacy review before re-enabling production operations.

## Backup and restore drill

Run the drill in an isolated project containing synthetic data only:

1. Record the source backup identifier and schema migration head.
2. Restore into an empty isolated project.
3. Verify expected row counts using synthetic fixtures and aggregate checks only.
4. Reapply pending migrations.
5. Run every RLS, import, storage, session, and signed-access SQL suite.
6. Verify the private bucket remains non-public and synthetic objects are accessible only to allowed roles.
7. Record elapsed recovery time and observed recovery point.
8. Destroy or quarantine the isolated drill environment according to policy.

Use [templates/RESTORE-DRILL-EVIDENCE.md](templates/RESTORE-DRILL-EVIDENCE.md) and `scripts/staging/restore-drill.sh`. A local-synthetic engineering receipt was recorded on 2026-08-15. Leadership still owns final RTO and RPO acceptance. Do not treat the local observation as accepted recovery objectives.
