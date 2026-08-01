# Governed Campaign Data Import Runbook

**Run:** HD-OI-015  
**Authority:** No production import or outreach is authorized by this document.

## Purpose

This runbook converts a native workbook export into controlled campaign records without placing source files, contact details, attendance history, private notes, or credentials in Git.

**Placement:** local source file → Supabase Storage `campaign-private` → quarantine tables. Notion is not an import target. See [DATA-PLACEMENT.md](DATA-PLACEMENT.md).

**Staging host:** project ref `ecxkhihlbrcwpavfoaoq` (treat as staging until production is named).

## Required flow

```text
local native .xlsx (operator custody)
→ restricted upload to campaign-private
→ malware and file-type validation
→ SHA-256 receipt
→ schema detection
→ staging rows (import_batches / import_staging_rows)
→ normalization
→ duplicate and suppression matching
→ exception review
→ consent classification
→ relationship ownership
→ explicit row approval
→ controlled promotion
→ reconciliation receipt
→ source retention or purge
```

## Candidate source (not authorized)

Offline inventory only — **do not import** until leadership authorizes this digest (or a successor export):

| Field | Value |
|---|---|
| Filename pattern | `Master Development List 1.2 Hacker Dojo 2025.xlsx` |
| SHA-256 | `53239b7ed197f59bc4219b7053aef3fd0471a9dbcab4f40b67e6fff04b48f97f` |
| Sheets | 11 (aggregate inventory in DATA-PLACEMENT.md) |
| Authority | **BLOCKED** |

## Accepted source formats

Preferred:

- `.xlsx` exported directly from the canonical workbook;
- `.csv` per named worksheet with a manifest;
- UTF-8 text attachments where a schema is explicit.

A PDF export is evidence and review material, not a lossless import source.

## Source receipt

Every batch must record:

- original filename;
- SHA-256 digest;
- received timestamp;
- source owner;
- worksheet names;
- source row counts;
- parser and schema versions;
- encrypted object path;
- retention classification;
- operator identity.

## Quarantine rules

1. Source objects use a private bucket with public access disabled.
2. Uploaders cannot promote their own batch without a second reviewer when production data is involved.
3. Staging JSON may contain sensitive fields only inside the authenticated database.
4. No row becomes a constituent until its state is `approved`.
5. Rows with unresolved `error` or `critical` exceptions cannot be promoted.
6. `restricted` or `suppressed` consent candidates cannot be promoted by the standard function.
7. Duplicate resolution preserves both source receipts and records the chosen canonical identity.
8. Private-relay or ambiguous addresses are not interpreted as fundraising consent.

## Minimum exception codes

| Code | Severity | Meaning |
|---|---|---|
| `MISSING_EXTERNAL_ID` | warning | No stable source identifier |
| `MALFORMED_EMAIL` | error | Contact field does not pass syntax checks |
| `PRIVATE_RELAY_ADDRESS` | warning | Address is a relay and requires confirmation |
| `POSSIBLE_DUPLICATE` | error | Candidate matches an existing identity |
| `SUPPRESSION_MATCH` | critical | Candidate matches the active suppression registry |
| `CONSENT_UNKNOWN` | warning | Outreach basis has not been established |
| `SOURCE_ROW_AMBIGUOUS` | error | Columns merged, shifted, or lack interpretable structure |
| `RELATIONSHIP_OWNER_MISSING` | warning | No accountable owner is assigned |
| `STALE_SOURCE` | warning | Source recency exceeds the approved threshold |

## Promotion gates

```yaml
source_receipt_complete: true
schema_validated: true
blocking_exceptions_resolved: true
duplicate_resolution_complete: true
suppression_check_passed: true
consent_state_reviewed: true
relationship_class_reviewed: true
row_approval_recorded: true
operator_role_allowed: true
audit_event_written: true
```

Passing the promotion gate creates a governed constituent record. It does **not** authorize outreach. Opportunity authorization, relationship ownership, approved messaging, and campaign-level human approval remain separate gates.

## Reconciliation

For each batch, report:

- received rows;
- valid rows;
- duplicate rows;
- suppressed rows;
- unresolved exceptions;
- approved rows;
- promoted rows;
- rejected rows;
- source and promoted checksums where applicable;
- reviewer and timestamps.

The sum of terminal and nonterminal row states must equal the received row count.

## Purge

A batch may enter `purged` only after:

- reconciliation is complete;
- required evidence receipts are preserved;
- retention policy permits deletion;
- legal or operational holds are checked;
- object deletion is confirmed and audited.
