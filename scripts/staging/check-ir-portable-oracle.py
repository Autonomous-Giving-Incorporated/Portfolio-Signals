"""Optional read-only IR oracle. All storage is disposable, never a runtime importer.

Set PYTHONPATH to an explicitly selected Impact Relay src directory. With --generate,
writes the public synthetic golden vector to stdout; otherwise reads an actual FI
record and its portable conversion from stdin and verifies a real SQLite reopen.
"""
import json
from pathlib import Path
import sys
import tempfile

from impact_relay.storage import portable
from impact_relay.storage.sql import SqlEngine
from impact_relay.storage.workspace import (
    SqlWorkspaceRepository, canonical_policy_json, policy_from_canonical_json,
)

ROOT = Path(__file__).resolve().parents[2]
if sys.argv[1:] == ["--generate"]:
    # The SQL literal is the immutable FI template, not a synthesized API response.
    migration = (ROOT / "supabase/migrations/202609080002_ir_workspace_scaffold.sql").read_text()
    legacy = migration.split("select replace('", 1)[1].split("', 'TENANT'", 1)[0].replace("TENANT", "org_ir_http")
    record = {
        "client_id": "org_ir_http", "tenant_id": "org_ir_http",
        "idempotency_key": "00000000-0000-4000-8000-000000000777",
        "state": "scaffold_persisted", "runtime_ready": False, "policy_json": legacy,
    }
    policy = policy_from_canonical_json(legacy)
    artifact = portable.canonical_json(portable.build_scaffold(policy, record["idempotency_key"]))
    payload = {"provenance": "public_synthetic", "record": record, "portable_json": artifact}
else:
    payload = json.load(sys.stdin)
    record, artifact = payload["record"], payload["portable_json"]

policy = policy_from_canonical_json(record["policy_json"])
assert portable.canonical_json(portable.build_scaffold(policy, record["idempotency_key"])) == artifact
assert portable.decode_scaffold(artifact) == policy
assert record["runtime_ready"] is False
assert record["client_id"] == record["tenant_id"] == policy.tenant_id
with tempfile.TemporaryDirectory(prefix="ir-oracle-", dir=ROOT) as temp:
    database = "sqlite:///" + str(Path(temp) / "reopen.db")
    engine = SqlEngine(database)
    engine.migrate()
    repo = SqlWorkspaceRepository(engine)
    repo.create(policy=portable.decode_scaffold(artifact), idempotency_key=record["idempotency_key"])
    reopened = SqlWorkspaceRepository(SqlEngine(database)).reopen(policy.tenant_id)
    actual = portable.canonical_json(portable.build_scaffold(reopened.policy, reopened.scaffold.idempotency_key))
    assert actual == artifact
    if "initialized_json" in payload:
        # These bytes come from ACTUAL post-initialization FI HTTP readback.
        # SQLite is an independent IR repository oracle, not evidence about FI/CF.
        state = portable.decode_initialized_workspace(payload["initialized_json"])
        workspace = payload["workspace"]
        assert workspace["state"] == "initialized"
        assert workspace["operation_id"] == payload["operation_id"]
        assert workspace["idempotency_key"] == record["idempotency_key"]
        assert workspace["client_id"] == workspace["tenant_id"] == policy.tenant_id
        assert workspace["portable_json"] == artifact
        assert state["scaffold"] == json.loads(artifact)
        assert workspace["organization"] == state["ledger_binding"]["entities"]["organization"]
        assert workspace["empty_state"] == json.loads(artifact)["empty_state"]
        actual_state, receipt = portable.verify_initialized_workspace(database, artifact)
        assert portable.canonical_json(actual_state) == payload["initialized_json"]
        assert receipt["storage_scope"] == "sql-scaffold-empty-tables-v1"
        # Strict decoder must reject representation drift and cross-tenant binding.
        import copy
        for field, value in (("entities", []), ("tenant_id", "org_other")):
            bad = copy.deepcopy(state)
            bad["ledger_binding"][field] = value
            try:
                portable.decode_initialized_workspace(portable.canonical_json(bad))
            except portable.PolicyError:
                pass
            else:
                raise AssertionError("IR decoder accepted invalid " + field)
        # Never emit this local SQL receipt as FI/Cloudflare verification.
        print("PASS: actual initialized FI HTTP readback -> IR strict initialized decoder -> exact real repository reopened state")
    assert canonical_policy_json(reopened.policy) == record["policy_json"]
    assert reopened.scaffold.runtime_ready is False
    assert reopened.policy.source_path is None
    assert reopened.policy.attribution.allowed_methods == ()
    assert reopened.policy.notifications.default_email_topics == ()
    assert not reopened.workspace.ledger.donors and not reopened.workspace.ledger.expenses
    with engine.conn() as conn:
        for table in ("tenants", "ledger_command_log", "ledger_entity", "ledger_meta", "outbox_events"):
            assert engine.fetchone(conn, f"SELECT COUNT(*) AS n FROM {table}")["n"] == 0
if sys.argv[1:] == ["--generate"]:
    print(json.dumps(payload, indent=2, ensure_ascii=False))
else:
    print("PASS: actual IR strict codec -> portable decoder -> SQLite create/fresh-engine reopen; exact legacy bytes, empty state and runtime_ready=false")
