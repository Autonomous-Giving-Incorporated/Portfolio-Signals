#!/usr/bin/env python3
"""Run repository SQL and Worker HTTP checks in fresh disposable containers.

No DB_URL, linked project or existing container is used. Unique bridge network;
PostgREST publishes only an ephemeral loopback port. Both containers and network
are always removed. No production or other tenant database is contacted.
Auth/storage compatibility helpers match the existing local restore-drill harness;
this tests SQL authorization, not GoTrue JWT signature validation or Storage HTTP.
"""

import concurrent.futures
import json
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMAGE = "public.ecr.aws/supabase/postgres:15.8.1.085"


def run(*args, sql=None):
    result = subprocess.run(args, input=sql, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


def test_concurrency(name):
    def sql(text):
        return run(
            "docker",
            "exec",
            "-i",
            "-e",
            "PGPASSWORD=local-test-only",
            name,
            "psql",
            "-U",
            "supabase_admin",
            "-d",
            "postgres",
            "-Atq",
            "-v",
            "ON_ERROR_STOP=1",
            sql=text,
        )

    # Dedicated container only; fixture commits allow independent connections.
    sql("""
      insert into public.platform_administrators(user_id, appointed_by, rationale)
      values ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000101', 'Synthetic concurrent request test');
      insert into public.clients(id, slug, display_name, state) values
        ('org_ir_race_a', 'ir-race-a', 'Race A', 'provisioning'),
        ('org_ir_race_b', 'ir-race-b', 'Race B', 'provisioning'),
        ('org_ir_race_c', 'ir-race-c', 'Race C', 'provisioning');
    """)
    auth = """
      begin;
      set local statement_timeout = '10s';
      set local role authenticated;
      set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000106';
      set local request.jwt.claim.aal = 'aal2';
      select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
    """

    def request(args):
        client, key = args  # Only literal synthetic identifiers generated below.
        try:
            output = sql(
                auth
                + "select public.request_ir_provisioning('"
                + client
                + "', '"
                + key
                + "', 'Concurrent IR bridge review'); select pg_sleep(0.2); commit;"
            )
            return json.loads(
                next(line for line in output.splitlines() if line.startswith("{"))
            )
        except RuntimeError as error:
            if "idempotency_conflict" in str(error):
                return "idempotency_conflict"
            if "client_request_conflict" in str(error):
                return "client_request_conflict"
            raise

    key = str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(request, [("org_ir_race_a", key)] * 2))
        records = [result for result in results if isinstance(result, dict)]
        assert len(records) == 2, results
        assert sorted(result["replayed"] for result in records) == [False, True], (
            results
        )
        assert records[0]["operation_id"] == records[1]["operation_id"], results
        results = list(
            pool.map(
                request,
                [
                    ("org_ir_race_b", str(uuid.uuid4())),
                    ("org_ir_race_b", str(uuid.uuid4())),
                ],
            )
        )
        assert sum(isinstance(result, dict) for result in results) == 1, results
        assert "client_request_conflict" in results, results
        # Existing key cannot bind a different canonical tenant.
        assert request(("org_ir_race_c", key)) == "idempotency_conflict"
    # New connection verifies durable count and no lifecycle/readiness mutation.
    observed = sql("""
      select count(*) from public.ir_provisioning_requests;
      select count(*) from public.client_audit_log where action = 'ir_provisioning_requested';
      select count(*) from public.clients where id like 'org_ir_race_%' and state = 'provisioning';
      select count(*) from public.ir_provisioning_requests where runtime_ready or tenant_id <> client_id;
    """).splitlines()
    assert observed == ["2", "2", "3", "0"], observed
    print(
        "PASS: independent-connection concurrent replay/conflict and durable readback"
    )
    def execute_scaffold(_):
        output = sql(auth + """
          select public.execute_ir_provisioning('org_ir_race_a',
            (public.get_ir_provisioning_request('org_ir_race_a')->>'operation_id')::uuid);
          select pg_sleep(0.2); commit;
        """)
        return json.loads(next(line for line in output.splitlines() if line.startswith('{')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        scaffolds = list(pool.map(execute_scaffold, range(2)))
    assert scaffolds[0] == scaffolds[1], scaffolds
    fresh = sql(auth + "select public.get_ir_workspace_scaffold('org_ir_race_a'); commit;")
    record = json.loads(next(line for line in fresh.splitlines() if line.startswith('{')))
    assert record == scaffolds[0]
    policy = json.loads(record['policy_json'])
    assert json.dumps(policy, sort_keys=True, separators=(',', ':'), ensure_ascii=True) == record['policy_json']
    assert policy['policy']['tenant_id'] == 'org_ir_race_a'
    assert policy['policy']['source_path'] is None
    assert policy['policy']['notifications']['default_email_topics'] == []
    assert sql("select count(*) from public.client_audit_log where action='ir_scaffold_persisted';").strip() == '1'
    print('PASS: concurrent immutable scaffold, exact canonical policy and fresh-connection recovery')
    def initialize_workspace(_):
        output = sql(auth + """
          select public.initialize_ir_workspace('org_ir_race_a',
            (public.get_ir_provisioning_request('org_ir_race_a')->>'operation_id')::uuid);
          select pg_sleep(0.2); commit;
        """)
        return json.loads(next(line for line in output.splitlines() if line.startswith('{')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        workspaces = list(pool.map(initialize_workspace, range(2)))
    assert workspaces[0] == workspaces[1], workspaces
    fresh = sql(auth + "select public.open_ir_workspace('org_ir_race_a'); commit;")
    assert json.loads(next(line for line in fresh.splitlines() if line.startswith('{'))) == workspaces[0]
    assert sql("select count(*) from public.client_audit_log where action='ir_workspace_initialized';").strip() == '1'
    print('PASS: concurrent FIRST initialization, one genesis/audit, independent-connection reopened workspace')


def main():
    name = "fi-ir-test-" + uuid.uuid4().hex[:12]
    try:
        run("docker", "network", "create", name + "-network")
        run(
            "docker",
            "run",
            "-d",
            "--name",
            name,
            "--network",
            name + "-network",
            "-e",
            "POSTGRES_PASSWORD=local-test-only",
            "-e",
            "POSTGRES_DB=postgres",
            IMAGE,
        )
        for _ in range(90):
            ready = subprocess.run(
                [
                    "docker",
                    "exec",
                    name,
                    "pg_isready",
                    "-h",
                    "127.0.0.1",
                    "-U",
                    "supabase_admin",
                ],
                capture_output=True,
            )
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Disposable database did not become ready")
        files = [ROOT / "scripts/staging/align-local-storage-schema.sql"]
        files += sorted((ROOT / "supabase/migrations").glob("*.sql"))
        files += [
            ROOT / "supabase/tests/fixtures/six_roles.sql",
            ROOT / "supabase/tests/028_ir_provisioning_request.sql",
            ROOT / "supabase/tests/029_ir_workspace_scaffold.sql",
            ROOT / "supabase/tests/030_ir_initialized_workspace.sql",
            ROOT / "supabase/tests/017_security_definer_privileges.sql",
            ROOT / "supabase/tests/018_authenticated_security_definer_privileges.sql",
            ROOT / "supabase/tests/027_set_mfa_enforced.sql",
        ]
        for path in files:
            print("APPLY", path.relative_to(ROOT), flush=True)
            run(
                "docker",
                "exec",
                "-i",
                "-e",
                "PGPASSWORD=local-test-only",
                name,
                "psql",
                "-U",
                "supabase_admin",
                "-d",
                "postgres",
                "-v",
                "ON_ERROR_STOP=1",
                sql=(
                    "set role postgres;\n"
                    if path.name != "align-local-storage-schema.sql"
                    else ""
                )
                + path.read_text(),
            )
        test_concurrency(name)
        print(run("env", "FI_IR_TEST_CONTAINER=" + name, "node", str(ROOT / "scripts/staging/test-ir-worker-http.mjs")), end="")
        print("PASS: disposable Worker/PostgREST HTTP integration (Auth /user fixture)")
        print("PASS: disposable Supabase SQL provisioning request tests")
    finally:
        subprocess.run(["docker", "rm", "-f", name], check=True, capture_output=True)
        subprocess.run(["docker", "network", "rm", name + "-network"], check=True, capture_output=True)
        print("REMOVED", name, flush=True)


if __name__ == "__main__":
    main()
