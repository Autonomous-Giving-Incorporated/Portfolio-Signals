# Retention, Deletion, and Legal Hold

## Boundary

Engineering implements approved rules but does not decide retention periods, legal holds, or deletion authority. Until leadership and privacy owners approve a schedule, production purge remains blocked.

## Required classifications

Every source object, import batch, document record, and promoted record must have an approved retention class with:

- accountable owner;
- retention start event;
- minimum and maximum retention period;
- deletion or review action;
- evidence that must survive deletion;
- legal-hold eligibility.

## Legal hold precedence

A legal or operational hold always blocks automated and manual purge. Holds require a recorded authority, scope, start time, reason code, and release decision. Do not store privileged legal advice in application free text.

## Deletion procedure

1. Confirm the retention class permits deletion.
2. Confirm reconciliation and required provenance receipts are complete.
3. Query active holds for the object, batch, and related canonical records.
4. Require an authorized operator and independent reviewer for production deletion.
5. Delete the private object and verify it is unavailable.
6. Mark metadata with the deletion timestamp and non-sensitive reason code.
7. Write append-only audit evidence containing identifiers and outcome, not deleted content.
8. Verify backups age out according to the approved schedule rather than editing historical backups.

## Import temporary artifacts

Parser outputs and local working files remain in operator-controlled temporary storage, never Git. Purge them only after the batch receipt, reconciliation summary, exception report, and required source provenance have been preserved and no hold applies.

## Exit gate

Production purge automation may be enabled only after the retention schedule, hold authorities, reviewer separation, backup implications, and deletion verification procedure are approved and tested with synthetic records.
