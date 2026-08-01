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
| `import-api/server.mjs` | Trusted a caller-supplied actor UUID | Verify Supabase bearer session, active profile, MFA, and import role before service-role writes |
| `signed-document-url` | Read `private_documents` | Use `document_records` |

### Operator documentation

- `docs/PRODUCTION-HARDENING.md` staging/production checklist

## Evidence boundary

- No real identities, workbooks, or credentials are committed to GitHub.
- Hosted provider reconciliation and live backup drills remain operator actions outside GitHub.
- Hosted project creation is operator-owned (not performed by repository CI).

## Follow-on repository slice

Also delivered under HD-OI-019:

- import-review approve / reject / promote RPCs and UI actions;
- storage policy matrix tests with synthetic object metadata;
- staging bootstrap scripts and operator docs (no secrets);
- workspace decision queue and sponsor/grant pipeline modules wired to schema RPCs;
- data-placement docs: local + Supabase; staging ref recorded.

## Hosted staging progress

| Item | State |
|---|---|
| Staging project `ecxkhihlbrcwpavfoaoq` | PROVISIONED (operator) |
| GitHub association | OBSERVED (operator-reported) |
| `supabase db push` / migrations on host | VERIFIED — 10 migrations at `e3db304` |
| Auth MFA on host | VERIFIED — TOTP enabled; public signup disabled |
| `signed-document-url` Edge Function | DEPLOYED — version 2 from merged commit `abf1c1d` |
| Edge Function unauthenticated HTTP denial | PASS — `401 UNAUTHORIZED_NO_AUTH_HEADER` |
| Edge Function authenticated HTTP issuance | PASS — synthetic director received `200`, downloaded the signed object, and produced audit event `18` without storage-path leakage |
| Seven-file synthetic hosted policy suite | PASS |
| SSL enforcement | ENABLED — staging restart completed |
| Staging platform hardening | FAIL — backups deferred, DB network unrestricted, staging URL unspecified |
| Production project separation | PENDING |
| Real workbook import | BLOCKED (HD-OI-020) |

## Remaining HD-OI-019 work

- run backup/restore drill and record operator evidence;
- restrict database network access after trusted CIDRs are supplied;
- reconcile the hosted API/storage configuration after an explicit staging application URL is named;
- provision a separate production project or record an explicit single-project promotion decision.

Hosted schema, RLS, storage, session, import, and document-audit controls were verified with
synthetic fixtures on 2026-08-01. See
[`out/audit/hd-oi-019-staging-readiness.latest.json`](../out/audit/hd-oi-019-staging-readiness.latest.json).
PR #29 repaired the authenticated profile lookup and was merged as
`abf1c1daca761b961c9b41978532ce9e904c33ac`. The function was deployed from a clean detached
worktree at that commit. The bounded post-deployment probe deleted its temporary document and
storage object, disabled its profile, and banned its synthetic Auth identity. The overall verdict
remains `FAIL` until the platform-hardening items above are closed.

Repository-side session closure now fails closed for missing or expired JWT expiry claims, reflects profile role changes immediately, and pins the tested Node, Deno, Supabase CLI, and PostgreSQL toolchain. Signed document URLs are bounded to 30-300 seconds, read metadata through caller RLS, and fail closed unless privacy-safe access audit evidence is written. Hosted provider configuration and staging evidence remain operator-owned.

## Non-goals

- production data import;
- outreach activation;
- leadership policy approval;
- Notion as CRM system of record.

Provenance: Notion Sprint 001 Hub + Loop 805 Slice HD-OI-019 + Hash: e3db304e9f992adbf11398a47a2a00e356d22abf
