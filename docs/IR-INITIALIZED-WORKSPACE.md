# Initialized IR workspace: read-only Cloudflare/Supabase core

**Local implementation and verification only; no migration or Worker deployment to a remote system.**

This increment goes beyond a namespace reservation: it persists a canonical portable policy artifact, organization binding, and an actual empty ledger-state snapshot in the existing Supabase schema migration chain, then reopens and verifies that persisted state through the existing Portfolio Signals Worker. It is **not** an Impact Relay financial executor, and is not called operational or production-ready.

## Why explicit IR storage

`workers/portfolio-signals/src/allocation-api.js:createAllocationRuntime` constructs the allocation service using `services/allocation-middleware/src/app/supabase-store.mjs`. Its `am_*` gifts, pots, allocations and proofs are allocation middleware state, not IR's ledger command log/entity/outbox model. Nothing in those tables is initialized, adopted or relabeled by this change.

IR `storage/portable.py` defines `ir-empty-scaffold-v1` containing `ir-portable-policy-v1`, exact decimal confidence strings, a SHA-256 policy binding, and empty entities/ledger commands/outbox. IR `storage/workspace.py` reopens an organization/policy and command ledger. The FI Worker has no corresponding IR command runtime. Therefore the implemented alternative is a deliberately restricted **read-only empty-workspace storage core**, not a Python host, D1 database, new hosted service or purported command-execution port.

## Storage and atomic binding

Migration `202609080003_ir_initialized_workspace.sql` adds private, RLS-enabled, unexposed tables:

- `ir_private.policy_artifacts`: pinned `fi-empty-v1` portable policy bytes, complete canonical portable scaffold bytes, both SHA-256 hashes checked by PostgreSQL, literal request/client/key binding, template provenance `fi-empty-v1:202609080003`, actor and timestamp. Original `source_path=null` is retained; no fabricated source filename.
- `ir_private.workspaces`: canonical organization, request/key/policy-hash composite foreign key, storage version `fi-ir-readonly-v1`, initializer and timestamp, `state=initialized`, `runtime_ready=false`, `operational=false`.
- `ir_private.ledger_states`: a persisted revision-zero snapshot with exactly empty `entities`, `ledger_commands`, and `outbox_events` arrays. GET reads this row; it does not manufacture empty state when storage is missing. Nonempty state cannot enter this storage version.

`initialize_ir_workspace(client, operation)` requires the existing reservation and exact request operation, locks the client, enforces eligible lifecycle, then commits policy, organization, ledger snapshot and audit together. A failure in the final audit rolls back all three storage inserts. Concurrent first calls and subsequent retries return the same stored record and create one audit. Partial existing storage is rejected, never adopted. UPDATE/DELETE triggers reject mutations; schema/table/function grants exclude anonymous, authenticated and service-role direct access. Database owners remain capable of DDL, as with the existing scaffold.

`open_ir_workspace(client)` is read-only. It joins all three private records and reservation binding; a workspace with a missing ledger row fails rather than looking empty. Recovery reads remain available to authorized platform administrators for suspended clients; initialization/retry does not.

## Worker and browser

- `POST /api/ir/workspaces/org_...`: body exactly `{"operation_id":"<existing UUID>"}`; initializes then performs a separate authorized readback.
- `GET /api/ir/workspaces/org_...`: returns `{"workspace":null}` if uninitialized, otherwise persisted workspace, policy/portable bytes, hashes, provenance and empty-state snapshot.
- Existing `/api/ir/provisioning/...` and request RPC semantics are preserved.
- Both routes require a human bearer token and public Supabase API key. Auth `/user` verifies the token; the database rechecks active/unexpired profile, live platform-admin appointment, persisted MFA enforcement and AAL2 on each RPC. No service-role fallback or tenant-director financial authority is introduced.
- Worker and browser share `workspace/ir-workspace-contract.mjs`: pinned policy bytes, tenant/organization/key, empty state, version, hashes, provenance and false readiness/operational flags must all match. SHA-256 uses Web Crypto. Drift fails closed with no successful initialization display. Responses are no-store and errors sanitized.
- Guided UI keeps request and reservation controls, adds explicit **Initialize empty IR workspace** and **Open initialized IR workspace**, reports **Reserved**, **Initialized**, and **Operational: no** separately. Reload/reopen does not depend on browser memory. New strings use the existing `irProvisioningMessages` localization map, semantic controls and live status.

## Initialized-state interoperability export

`toPortableInitializedWorkspace(workspace, { client, operation, idempotencyKey })`
in `workspace/ir-workspace-contract.mjs` exports canonical
`ir-initialized-empty-workspace-v1` bytes from validated **initialized readback**.
The expected tenant and request identifiers are mandatory; policy/artifact hashes,
exact pinned policy, provenance, revision-zero emptiness and organization must
match. Callers must obtain readback through the authorized Worker/RPC boundary;
this pure adapter does not authenticate a JSON document or establish storage provenance.

FI storage and `scaffold.empty_state` retain their valid array representation.
Only the explicit `ledger_binding.entities` projection uses IR's named empty maps
(`{}`), with the exact persisted organization id/name/policy_version. This is not
a relabeling of scaffold bytes, a populated-ledger importer, or a receipt producer.
Readiness remains false; no `sql-scaffold-empty-tables-v1` receipt is represented
as Cloudflare evidence.

`fixtures/ir-portable/fi-initialized-v1.json` is a public synthetic golden generated
by actual IR repository creation and read-only initialized verification. Existing CI
Worker test discovery and disposable HTTP checks compare exact projected bytes
without any sibling checkout. With `FI_IR_ORACLE_SOURCE`, **post-initialization
fresh Worker readback** additionally enters IR's strict initialized decoder and
must equal state from a real independent repository reopen, including named map
types and organization. The independent SQLite receipt remains local to that
oracle. Malformed-map and cross-tenant decoder rejection are also checked.

## Reproducible verification

From Fund-Intel:

```sh
node --test workers/portfolio-signals/test/*.test.js services/allocation-middleware/test/*.test.mjs
FI_IR_BROWSER=1 python3 scripts/staging/test-ir-provisioning.py
# Optional sibling read-only oracle; not required by CI:
FI_IR_BROWSER=1 FI_IR_ORACLE_SOURCE=/home/scrimshawlife/Impact-Relay/src python3 scripts/staging/test-ir-provisioning.py
npx playwright test tests/browser/ir-scaffold.spec.js tests/browser/workspace-tenant-chrome.spec.js --project=desktop-chromium --retries=0
```

Executed locally:

- **218 Worker/allocation tests passed**, including new hash/provenance/nonempty-ledger/readback corruption and forbidden-input tests.
- Full migration replay plus SQL `028`, `029`, **`030`**, privilege allowlist and MFA regressions passed in disposable Supabase PostgreSQL. Independent SQL connections proved concurrent **first** initialization, one audit, exact reopen and audit-failure rollback.
- Real signed-JWT **PostgREST HTTP → database**, invoked by the real Worker handler, passed initialize/readback/fresh-handler reopen/concurrent replay and forged/expired/AAL1/director/service-role denials. No initialized workspace was created remotely.
- **Two Chromium tests (desktop/mobile) passed against the real disposable PostgREST-backed Worker handler**: reservation → keyboard initialization → page reload → reopened empty state, zero scoped WCAG A/AA axe violations. The browser's `get_ir_provisioning_request` SDK response is a fixture carrying the real operation; workspace/scaffold RPCs and JWT verification are real. Auth `/user` is a fixture, not live GoTrue. The separate existing request/scaffold/chrome browser regression run passed **11 tests**.
- Actual sibling IR strict codec/portable decoder and temporary SQLite fresh-engine reopen passed; the persisted FI portable artifact equals the actual IR golden bytes. IR source was not modified.
- Wrangler 4.130.0 `deploy --dry-run` bundled successfully. This is a bundle check, not a workerd or deployed Cloudflare integration test.

CI now discovers the new SQL, shared contract/UI paths, Worker tests and opt-in real-database browser test, installing Playwright dependencies before running the disposable harness. The harness refuses arbitrary container names, allocates its own database/network, binds PostgREST to ephemeral loopback, and removes its containers/network. No remote migration/deployment/commit/push was performed.

## Still absent

No financial command validation/execution or ledger replay beyond genesis, workflow scheduler, approvals-to-ledger bridge, entity mutations, receipt publication, outbox/delivery, object storage, arbitrary policy import/change, legacy tenant migration, tenant-operator workspace authorization, or organization/document readiness/activation. Adding any requires reviewed schema/runtime contracts and evidence; removing revision-zero/empty-state constraints is not an implementation of those capabilities. Hosted GoTrue/MFA and deployed Worker/Supabase verification remain operator-owned and unperformed.
