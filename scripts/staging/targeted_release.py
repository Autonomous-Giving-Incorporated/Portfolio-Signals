#!/usr/bin/env python3
"""Offline, fail-closed compiler for a reviewed Supabase migration bundle.

Never connects to a database, runs SQL, or repairs migration history.
"""

import hashlib
import re
import argparse
import json
import pathlib
import tempfile
import os

ALLOWED = {
    "20260815120000_am_allocation_write_roles.sql",
    "202609080001_ir_provisioning_request.sql",
    "202609080002_ir_workspace_scaffold.sql",
    "202609080003_ir_initialized_workspace.sql",
}


PROJECT = "utdioxwiskzatwoejgiu"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verify_history(manifest, snapshot):
    if manifest["project_ref"] != PROJECT or snapshot["project_ref"] != PROJECT:
        raise ValueError("project binding mismatch")
    rows = snapshot["migrations"]
    versions = set()
    lines = []
    for row in sorted(rows, key=lambda row: row["version"]):
        if (
            not re.fullmatch(r"[0-9]+", row["version"])
            or not re.fullmatch(r"[a-z0-9_]+", row["name"])
            or not re.fullmatch(r"[0-9a-f]{64}", row["fetch_sha256"])
            or row["version"] in versions
        ):
            raise ValueError("invalid history row")
        versions.add(row["version"])
        lines.append("|".join(row[key] for key in ("version", "name", "fetch_sha256")))
    if (
        len(rows) != manifest["history_count"]
        or sha256("\n".join(lines).encode()) != manifest["history_sha256"]
    ):
        raise ValueError("history drift: stop; never repair automatically")


def compile_bundle(source, fetched, output, manifest, snapshot):
    verify_history(manifest, snapshot)
    files = {}
    versions = set()
    for row in snapshot["migrations"]:
        filename = row["version"] + "_" + row["name"] + ".sql"
        path = fetched / filename
        if path.is_symlink():
            raise ValueError("symlink not permitted")
        data = path.read_bytes()
        if sha256(data) != row["fetch_sha256"]:
            raise ValueError("fetched history checksum mismatch")
        files[filename] = data
        versions.add(row["version"])
    if {p.name for p in fetched.iterdir()} != set(files):
        raise ValueError("unexpected fetched history files")
    selected = [item["file"] for item in manifest["migrations"]]
    if set(selected) != ALLOWED:
        raise ValueError("release manifest must contain exactly the four approved files")
    if selected != sorted(set(selected)):
        raise ValueError("migration order or duplicate mismatch")
    for item in manifest["migrations"]:
        filename = item["file"]
        if filename not in ALLOWED:
            raise ValueError("migration not in release allowlist")
        if filename.split("_")[0] in versions:
            raise ValueError(
                "release version already exists; fresh reviewed recovery plan required"
            )
        path = source / filename
        if path.is_symlink():
            raise ValueError("symlink not permitted")
        data = path.read_bytes()
        if sha256(data) != item["sha256"]:
            raise ValueError("release checksum mismatch")
        files[filename] = data
    if output.exists() or output.is_symlink():
        raise ValueError("output must not exist")
    # Validate everything before writing; no half-bundle survives failure.
    with tempfile.TemporaryDirectory(prefix=".fi-release-", dir=output.parent) as temp:
        staged = pathlib.Path(temp) / "bundle"
        migrations = staged / "supabase/migrations"
        migrations.mkdir(parents=True, mode=0o700)
        (staged / "supabase/config.toml").write_text(
            'project_id = "fi-targeted-release"\n'
        )
        for filename, data in files.items():
            path = migrations / filename
            path.write_bytes(data)
            path.chmod(0o400)
        receipt = {
            "project_ref": PROJECT,
            "history_sha256": manifest["history_sha256"],
            "files": {name: sha256(data) for name, data in sorted(files.items())},
            "pending": selected,
            "hosted_write_authorized": False,
        }
        (staged / "bundle.json").write_text(json.dumps(receipt, indent=2) + "\n")
        os.rename(staged, output)
    return receipt


def verify_target_url(value):
    """Direct host only. No pooler, redirects, libpq overrides, or relaxed TLS."""
    from urllib.parse import urlsplit

    try:
        if any(character.isspace() or ord(character) < 32 for character in value):
            raise ValueError("literal URL contains whitespace or controls")
        url = urlsplit(value)
        valid = (
            url.scheme == "postgresql"
            and url.hostname == f"db.{PROJECT}.supabase.co"
            and url.port == 5432
            and url.username == "postgres"
            and bool(url.password)
            and url.path == "/postgres"
            and url.query == "sslmode=verify-full"
            and not url.fragment
        )
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("project connection binding rejected (URL withheld)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=pathlib.Path, required=True)
    parser.add_argument("--snapshot", type=pathlib.Path, required=True)
    parser.add_argument("--fetched", type=pathlib.Path, required=True)
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument(
        "--target-url-env",
        required=True,
        help="Name of secret environment variable; never put its value in arguments",
    )
    args = parser.parse_args()
    verify_target_url(os.environ.get(args.target_url_env, ""))
    manifest = json.loads(args.manifest.read_text())
    if {item["file"] for item in manifest["migrations"]} != ALLOWED:
        parser.error("release manifest must contain exactly the four approved files")
    receipt = compile_bundle(
        args.source,
        args.fetched,
        args.output,
        manifest,
        json.loads(args.snapshot.read_text()),
    )
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
