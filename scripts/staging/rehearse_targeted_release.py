#!/usr/bin/env python3
"""Disposable-only CLI rehearsal. Never reads a hosted URL or linked project."""

import json
import pathlib
import subprocess
import tempfile
import time
import uuid

from targeted_release import ALLOWED, compile_bundle, sha256

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.155@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b"
ALIASES = {
    "20260821221500": "20260822034142",
    "20260821223000": "20260822034154",
    "20260821224500": "20260822034203",
    "20260822043000": "20260822040121",
    "20260822050000": "20260822045514",
    "20260823180000": "20260823192249",
    "202608240001": "20260824234800",
}
OMIT = {
    "20260815180000_am_donation_link_and_impact_notices.sql",
    "20260822120000_am_p1_connector_source.sql",
}


def run(*args, text=None, success=True):
    result = subprocess.run(args, input=text, text=True, capture_output=True)
    if success and result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result


def role_matrix(name):
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
            text=text,
        )

    # Tests direct RLS paths. Service role bypasses RLS by design.
    count = 0
    cases = [
        (user, aal, user in (101, 102) and aal == "aal2", "")
        for user in range(101, 107)
        for aal in ("aal1", "aal2")
    ]
    admin = "insert into public.platform_administrators(user_id,appointed_by,rationale) values ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000101','Synthetic role matrix');"
    cases += [
        (106, "aal2", True, admin),
        (106, "aal1", False, admin),
        (
            106,
            "aal2",
            False,
            admin + "update public.platform_administrators set active=false;",
        ),
        (
            101,
            "aal2",
            False,
            "update public.profiles set mfa_enforced=false where id='00000000-0000-0000-0000-000000000101';",
        ),
        (
            101,
            "aal2",
            False,
            "update public.profiles set active=false where id='00000000-0000-0000-0000-000000000101';",
        ),
        (
            101,
            "aal2",
            False,
            "update public.client_memberships set active=false where user_id='00000000-0000-0000-0000-000000000101';",
        ),
        (
            101,
            "aal2",
            False,
            "update public.clients set state='suspended' where id='org_hacker_dojo';",
        ),
        (
            101,
            "aal2",
            False,
            "delete from public.client_memberships where user_id='00000000-0000-0000-0000-000000000101';",
        ),
        (999, "aal2", False, ""),
    ]
    for user, aal, allowed, setup in cases:
        for table in ("am_allocations", "am_proofs"):
            allocation = "insert into public.am_allocations(id,client_id,campaign_key,program_key,amount_cents,purpose,approved_at,approved_by) values ('matrix','org_hacker_dojo','test','test',1,'synthetic',now(),'synthetic')"
            proof = "insert into public.am_proofs(id,allocation_id,client_id,uri) values ('proof-matrix','matrix-parent','org_hacker_dojo','https://example.invalid/proof')"
            operation = allocation if table == "am_allocations" else proof
            sql(f"""begin;
                {setup}
                insert into public.am_allocations(id,client_id,campaign_key,program_key,amount_cents,purpose,approved_at,approved_by)
                  values ('matrix-parent','org_hacker_dojo','test','test',1,'synthetic',now(),'synthetic');
                set local role authenticated;
                set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000{user}';
                set local request.jwt.claim.aal = '{aal}';
                select set_config('request.jwt.claim.exp',(extract(epoch from now())::bigint+3600)::text,true);
                do $$ declare permitted boolean := true; begin
                  begin {operation}; exception when insufficient_privilege then permitted := false; end;
                  if permitted <> {str(allowed).lower()} then raise exception 'role matrix mismatch {user} {aal} {table}'; end if;
                end $$; rollback;""")
            count += 1
    print(f"PASS: {count} allocation/proof role × AAL cases")


def main():
    assert run("supabase", "--version").stdout.strip() == "2.31.8", "pin CLI 2.31.8"
    name = "fi-targeted-" + uuid.uuid4().hex[:12]
    try:
        run(
            "docker",
            "run",
            "-d",
            "--name",
            name,
            "-p",
            "127.0.0.1::5432",
            "-e",
            "POSTGRES_PASSWORD=local-test-only",
            IMAGE,
        )
        for _ in range(90):
            if (
                run(
                    "docker",
                    "exec",
                    name,
                    "pg_isready",
                    "-h",
                    "127.0.0.1",
                    "-U",
                    "supabase_admin",
                    success=False,
                ).returncode
                == 0
            ):
                break
            time.sleep(1)
        else:
            raise RuntimeError("disposable TCP readiness timeout")

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
                text=text,
            ).stdout

        # PostgreSQL 17 raw image omits Auth/Storage service schemas. Import the
        # actual raw-image compatibility schemas, not fabricated hosted records.
        compat = name + "-compat"
        try:
            run(
                "docker",
                "run",
                "-d",
                "--name",
                compat,
                "--network",
                "none",
                "-e",
                "POSTGRES_PASSWORD=local-test-only",
                "public.ecr.aws/supabase/postgres:15.8.1.085",
            )
            for _ in range(90):
                if (
                    run(
                        "docker",
                        "exec",
                        compat,
                        "pg_isready",
                        "-h",
                        "127.0.0.1",
                        "-U",
                        "supabase_admin",
                        success=False,
                    ).returncode
                    == 0
                ):
                    break
                time.sleep(1)
            else:
                raise RuntimeError("compatibility database readiness timeout")
            schemas = run(
                "docker",
                "exec",
                "-e",
                "PGPASSWORD=local-test-only",
                compat,
                "pg_dump",
                "-U",
                "supabase_admin",
                "-d",
                "postgres",
                "--schema-only",
                "--schema=auth",
                "--schema=storage",
                "--no-owner",
                "--clean",
                "--if-exists",
            ).stdout
            sql(schemas)
        finally:
            run("docker", "rm", "-f", compat)
        sql((ROOT / "scripts/staging/align-local-storage-schema.sql").read_text())
        sql("alter role postgres password 'local-test-only';")
        port = run("docker", "port", name, "5432").stdout.strip().split(":")[-1]
        url = f"postgresql://postgres:local-test-only@127.0.0.1:{port}/postgres?sslmode=disable"
        with tempfile.TemporaryDirectory(prefix="fi-targeted-") as directory:
            temp = pathlib.Path(directory)
            baseline = temp / "baseline"
            migrations = baseline / "supabase/migrations"
            migrations.mkdir(parents=True)
            (baseline / "supabase/config.toml").write_text(
                'project_id = "fi-release-rehearsal"\n'
            )
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                if path.name in ALLOWED | OMIT:
                    continue
                version, suffix = path.name.split("_", 1)
                (
                    migrations / (ALIASES.get(version, version) + "_" + suffix)
                ).write_bytes(path.read_bytes())
            # Synthetic extra hosted-only history, not a copy of hosted identity DML.
            (migrations / "20260825002656_local_release_marker.sql").write_text(
                "select 1;\n"
            )

            def cli(workdir, *args, success=True):
                return run(
                    "supabase",
                    "--workdir",
                    str(workdir),
                    *args,
                    "--db-url",
                    url,
                    success=success,
                )

            cli(baseline, "migration", "up", "--include-all")
            snapshot = json.loads(
                sql((ROOT / "scripts/staging/release-history.sql").read_text())
            )
            manifest = json.loads(
                (ROOT / "scripts/staging/ir-release-manifest.json").read_text()
            )
            rows = snapshot["migrations"]
            manifest["history_count"] = len(rows)
            manifest["history_sha256"] = sha256(
                "\n".join(
                    "|".join(row[k] for k in ("version", "name", "fetch_sha256"))
                    for row in rows
                ).encode()
            )
            fetched = temp / "fetched"
            (fetched / "supabase").mkdir(parents=True)
            (fetched / "supabase/config.toml").write_text(
                'project_id = "fi-release-fetch"\n'
            )
            cli(fetched, "migration", "fetch")
            bundle = temp / "bundle"
            receipt = compile_bundle(
                ROOT / "supabase/migrations",
                fetched / "supabase/migrations",
                bundle,
                manifest,
                snapshot,
            )
            sql(
                "set role postgres;\n"
                + (ROOT / "supabase/tests/fixtures/six_roles.sql").read_text()
            )
            try:
                role_matrix(name)
            except RuntimeError as error:
                assert "role matrix mismatch" in str(error), str(error)
                print(
                    "RED confirmed: old member-wide allocation/proof policy violates write-role contract"
                )
            else:
                raise AssertionError("baseline unexpectedly tightened")
            before = sql(
                "select version from supabase_migrations.schema_migrations order by version;"
            ).splitlines()
            for version, table in [
                ("20260815120000", "public.am_org_meta"),
                ("202609080001", "public.ir_provisioning_requests"),
                ("202609080002", "public.ir_workspace_scaffolds"),
                ("202609080003", "ir_private.policy_artifacts"),
            ]:
                sql(f"""create or replace function public.fi_reject_history() returns trigger language plpgsql as $$
                  begin if new.version = '{version}' then raise exception 'synthetic ledger failure'; end if; return new; end $$;
                  create trigger fi_reject_history before insert on supabase_migrations.schema_migrations
                  for each row execute function public.fi_reject_history();""")
                failed = cli(bundle, "migration", "up", "--include-all", success=False)
                assert failed.returncode and "synthetic ledger failure" in failed.stderr
                assert sql(f"select to_regclass('{table}') is null;").strip() == "t", (
                    f"{version}: DDL survived ledger failure"
                )
                assert (
                    sql(
                        f"select count(*) from supabase_migrations.schema_migrations where version='{version}';"
                    ).strip()
                    == "0"
                )
                sql(
                    "drop trigger fi_reject_history on supabase_migrations.schema_migrations; drop function public.fi_reject_history();"
                )
                print(
                    "PASS: real release DDL and history atomic on ledger failure:",
                    version,
                )
            output = cli(bundle, "migration", "up", "--include-all").stdout
            print(output.strip())
            after = sql(
                "select version from supabase_migrations.schema_migrations order by version;"
            ).splitlines()
            expected = sorted(before + [f.split("_")[0] for f in sorted(ALLOWED)])
            assert after == expected, "exact ledger version mismatch"
            post = json.loads(
                sql((ROOT / "scripts/staging/release-history.sql").read_text())
            )
            post_by_version = {row["version"]: row for row in post["migrations"]}
            for row in snapshot["migrations"]:
                assert post_by_version[row["version"]] == row, (
                    "baseline body or name changed"
                )
            for filename in ALLOWED:
                version, suffix = filename.split("_", 1)
                assert post_by_version[version]["name"] == suffix.removesuffix(".sql")
            print(
                "PASS: fresh readback preserves all baseline version/name/body hashes"
            )
            for file, checksum in receipt["files"].items():
                assert (
                    sha256((bundle / "supabase/migrations" / file).read_bytes())
                    == checksum
                )
            role_matrix(name)
            for test in (
                "028_ir_provisioning_request.sql",
                "029_ir_workspace_scaffold.sql",
                "030_ir_initialized_workspace.sql",
            ):
                sql(
                    "set role postgres;\n"
                    + (ROOT / "supabase/tests" / test).read_text()
                )
                print("PASS:", test)
            # Test executor transaction rollback and recovery on the disposable DB only.
            bad = bundle / "supabase/migrations/202609080004_rehearsal_failure.sql"
            bad.write_text(
                "create table public.fi_rollback_probe(id int); select 1/0;\n"
            )
            failed = cli(bundle, "migration", "up", "--include-all", success=False)
            assert failed.returncode and "division by zero" in failed.stderr
            assert (
                sql("select to_regclass('public.fi_rollback_probe') is null;").strip()
                == "t"
            )
            assert (
                sql(
                    "select count(*) from supabase_migrations.schema_migrations where version='202609080004';"
                ).strip()
                == "0"
            )
            bad.unlink()
            cli(bundle, "migration", "up", "--include-all")
            assert (
                sql(
                    "select version from supabase_migrations.schema_migrations order by version;"
                ).splitlines()
                == after
            )
            print(
                "PASS: failed migration DDL + ledger roll back atomically; retry leaves committed prefix unchanged"
            )
            print(
                "PASS: exact four versions; seven historical aliases retained; two unrelated older files excluded; immutable input checksums"
            )
    finally:
        run("docker", "rm", "-f", name)
        print("REMOVED", name)


if __name__ == "__main__":
    main()
