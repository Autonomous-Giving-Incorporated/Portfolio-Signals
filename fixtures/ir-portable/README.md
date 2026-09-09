# FI → IR portable conformance (local, public synthetic)

`fi-empty-v1.json` was generated from the exact FI SQL policy literal by the
**actual IR** `policy_from_canonical_json` and `portable.build_scaffold`, then
passed through `portable.decode_scaffold`, real disposable SQLite `create`, and
fresh-engine `reopen`. It is not a simulated HTTP response or production tenant.
The integration harness separately obtains its input from real Supabase PostgreSQL
and PostgREST through the Worker handler and compares the resulting bytes here.

## Explicit boundary

FI retains immutable `policy_json` as `ir-policy-v1` with numeric confidence and
Python-compatible ASCII canonical bytes. IR portable input instead requires
`ir-empty-scaffold-v1`, a nested `ir-portable-policy-v1`, decimal **strings**, a
SHA-256 of the portable policy envelope, empty-state declaration, and immutable
false/false readiness. The hashes of legacy and portable policy bytes differ.
Blind format renaming is incorrect; neither storage codec was changed.

`scripts/staging/ir-portable-contract.mjs` is a **test/conformance adapter**, not
an enabled runtime importer. It accepts only the exact pinned FI `fi-empty-v1`
policy bytes after literal tenant substitution. It rejects policy drift rather
than rounding confidence, repairing identifiers or silently discarding fields.
It preserves all arrays (including empty attribution/topics), null provenance,
and all nine L3 gates. FI operational IDs/audit fields remain host metadata; the
portable key is the immutable request idempotency key, not operation ID.
The fixture pins policy expectations; regenerate only with independent policy
review, never automatically as part of an acceptance run.

## Reproduce

No sibling checkout is needed for normal tests or CI:

```sh
node --test workers/portfolio-signals/test/*.test.js
python3 scripts/staging/test-ir-provisioning.py
```

The existing Supabase CI workflow runs both. The latter starts disposable
Supabase PostgreSQL/PostgREST, executes all migrations and request/scaffold SQL,
checks concurrency/rollback/authorization/readback, and compares actual persisted
Worker HTTP readback with this IR-produced vector.

For stronger local cross-repo acceptance, explicitly select the IR source tree:

```sh
FI_IR_ORACLE_SOURCE=/path/to/Impact-Relay/src python3 scripts/staging/test-ir-provisioning.py
```

This additionally sends the **actual HTTP readback** and JS conversion to
`check-ir-portable-oracle.py`, which invokes IR's strict legacy/portable codecs,
creates a disposable SQLite scaffold, reopens via a new engine, compares exact
legacy and portable bytes, and checks all five IR initial-state tables are empty.
Python bytecode writes are disabled; temporary databases are created under FI and
removed. No sibling code is modified, vendored, or needed at runtime.

The oracle's `--generate` prints a reviewed candidate fixture to stdout using
`PYTHONPATH=/path/to/Impact-Relay/src PYTHONDONTWRITEBYTECODE=1`; it never updates
this golden automatically. Generation also executes the SQLite reopen assertions.

## Historical reservation-stage evidence and limitations

The bullets below record the earlier conformance-only slice. The subsequent
[initialized storage implementation](../../docs/IR-INITIALIZED-WORKSPACE.md) adds
portable artifact/hash persistence and the `fi-initialized-v1.json` golden. Its
explicit initialized adapter preserves scaffold arrays while projecting named
empty ledger maps; neither adapter produces hosted evidence or enables operations.

- RED: three new contract tests failed with `adapter_not_implemented`.
- GREEN: Worker suite **71 passed, 0 failed/skipped**, including three new contract
  tests; negative vectors reject identity, readiness, canonical-byte and policy drift.
- Full disposable SQL/PostgREST harness with `FI_IR_ORACLE_SOURCE` passed, including
  the actual IR decode/create/reopen bridge. Containers and network were removed.
- No SQL/schema, runtime Worker codec, browser contract or activation change was
  needed for this **conformance-only** reconciliation.
- Auth `/user` remains a fixture; GoTrue/MFA enrollment and hosted Cloudflare
  routing/deployment are not verified by this run.
- FI still persists a **dedicated namespace reservation**, not a portable scaffold
  text/hash/verification receipt or an initialized IR runtime. No host legacy-state
  exclusion/adoption protocol, authorized runtime importer, operational policy
  approval or activation is implemented. Portable empty-state declarations are
  not evidence that any pre-existing hosted IR ledger is empty.
- `runtime_ready=false` everywhere; portable input readiness stays false/false.
  Local reopen interoperability does not close those deployment/runtime gates.

## Oracle provenance (SHA-256 at verification)

- IR `storage/portable.py`: `543c3f94ad049dc92e63b9a59f8044d6713e84a0b6012b223d87f3ed29de6658`
- IR `storage/workspace.py`: `fce42bd9cef54bbbc9772064988e448486672c5c554c8bd21068a6e6fa9f1754`
- IR `docs/PORTABLE-PROVISIONING-V1.md`: `d7edcb3f019b2739c7d0637a2f7861e2aecd76f69006b53928ffbe9aff06cac7`
- Golden `fi-empty-v1.json`: `9552b8057f37cffc28e73be0c029db4af35c02f64752bc15f531a20298e2a8cc`
