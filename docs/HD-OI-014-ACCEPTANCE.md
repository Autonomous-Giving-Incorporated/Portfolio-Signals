# HD-OI-014 — Pipeline Workflows and Policy Tests

## Scope

This phase adds controlled editing primitives without promoting private campaign data into GitHub.

## Delivered

- optimistic-concurrency stage transitions for opportunities;
- sponsor and grant pipeline UI module;
- director/campaign-lead decision workflow with required rationale;
- append-only decision transition events;
- encrypted-note and private-document metadata schema;
- canonical six-role RLS acceptance matrix.

## Storage boundary

The `document_records` table stores metadata only. Files belong in a private Supabase Storage bucket named `campaign-private` with:

- no public access;
- authenticated signed URLs with short expiry;
- object paths scoped by campaign entity and UUID;
- MIME and size allowlists;
- malware scanning before promotion;
- SHA-256 receipt preservation;
- deletion tombstones and retention enforcement.

The browser must never receive a service-role key. Upload authorization must be derived from the authenticated user and RLS/storage policies.

## Required tests before production

1. Run every positive and negative RLS case for all six roles.
2. Confirm board viewers cannot read constituents or private notes.
3. Confirm development users cannot approve decisions or alter profiles.
4. Confirm only directors and auditors can read audit events.
5. Confirm stale opportunity versions fail rather than overwrite newer edits.
6. Confirm a decision can transition from `open` only once.
7. Confirm every decision transition produces an append-only event.
8. Confirm restricted documents never receive public URLs.
9. Confirm suppressed constituents cannot be promoted to authorized outreach.
10. Confirm browser bundles contain no service-role or encryption secrets.

## Current promotion state

```yaml
pipeline_editing: IMPLEMENTED_FOUNDATION
decision_approvals: IMPLEMENTED_FOUNDATION
private_document_metadata: IMPLEMENTED
private_object_storage: CONFIGURATION_REQUIRED
rls_matrix: DEFINED
role_policy_execution: REQUIRED
outreach_authority: NOT_GRANTED
production_data_import: BLOCKED
```
