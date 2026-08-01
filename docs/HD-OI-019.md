# HD-OI-019 — Production Environment Hardening

## Objective

Harden identity, client/schema contracts, and operator runbooks after HD-OI-018 closed the disposable policy suite.

## Implemented in this phase slice

### Database

- `007_identity_hardening.sql`
  - `profiles.mfa_enforced`
  - deactivation metadata
  - `require_active_profile()`
  - `require_privileged_mfa()`
  - director-only `deactivate_profile()`

### Executable tests

- expanded `supabase/tests/rls_e2e.sql` covering all six roles
- inactive profile fail-closed
- MFA denial for privileged role without flag
- unauthorized vs director deactivation

### Client and service reconciliation

Observed drift repaired:

| Surface | Defect | Repair |
|---|---|---|
| `import-review.js` | Selected non-existent columns | Map to quarantine schema |
| `workspace.js` | Queried non-existent constituent flags | Use `consent_status` aggregates |
| `import-api/server.mjs` | Posted non-schema batch payload | Write canonical `import_batches` + staging rows |
| `signed-document-url` | Read `private_documents` | Use `document_records` |

### Operator documentation

- `docs/PRODUCTION-HARDENING.md` staging/production checklist

## Evidence boundary

- No production Supabase project is created by this repository change.
- No real identities, workbooks, or credentials are committed.
- MFA provider enablement and live backup drills remain operator actions outside GitHub.

## Follow-on repository slice

Also delivered under HD-OI-019:

- import-review approve / reject / promote RPCs and UI actions;
- storage policy matrix tests with synthetic object metadata;
- staging bootstrap scripts and operator docs (no secrets);
- workspace decision queue and sponsor/grant pipeline modules wired to schema RPCs.

## Remaining HD-OI-019 work

- provision staging and production projects;
- enable Auth MFA in each managed project;
- run backup/restore drill and record operator evidence;
- verify signed-URL edge function against staging with synthetic objects only.

## Non-goals

- production data import;
- outreach activation;
- leadership policy approval.
