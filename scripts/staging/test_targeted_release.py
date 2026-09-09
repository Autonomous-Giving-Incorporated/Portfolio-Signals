"""Offline regression tests; no credentials or network needed."""

import pathlib
import subprocess
import unittest
import importlib.util
import tempfile
import hashlib
import json
import os
import copy


def load_release():
    path = ROOT / "scripts/staging/targeted_release.py"
    if not path.exists():
        raise AssertionError("targeted release compiler is missing")
    spec = importlib.util.spec_from_file_location("targeted_release", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ROOT = pathlib.Path(__file__).resolve().parents[2]


class TargetedReleaseTests(unittest.TestCase):
    def test_snapshot_is_project_bound_and_detects_body_drift(self):
        release = load_release()
        rows = [{"version": "001", "name": "baseline", "fetch_sha256": "a" * 64}]
        manifest = {
            "project_ref": release.PROJECT,
            "history_count": 1,
            "history_sha256": hashlib.sha256(
                ("001|baseline|" + "a" * 64).encode()
            ).hexdigest(),
        }
        snapshot = {"project_ref": release.PROJECT, "migrations": rows}
        release.verify_history(manifest, snapshot)
        snapshot["project_ref"] = "wrong"
        with self.assertRaisesRegex(ValueError, "project"):
            release.verify_history(manifest, snapshot)
        snapshot["project_ref"] = release.PROJECT
        rows[0]["fetch_sha256"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "history drift"):
            release.verify_history(manifest, snapshot)

    def test_bundle_pins_exact_files_and_rejects_tampering(self):
        release = load_release()
        self.assertTrue(hasattr(release, "compile_bundle"), "bundle compiler missing")
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source"
            source.mkdir()
            fetched = root / "fetched"
            fetched.mkdir()
            body = b"select 1;\n"
            (fetched / "001_baseline.sql").write_bytes(body)
            selected = sorted(release.ALLOWED)
            for filename in selected:
                (source / filename).write_bytes(body)
            rows = [
                {
                    "version": "001",
                    "name": "baseline",
                    "fetch_sha256": release.sha256(body),
                }
            ]
            manifest = {
                "project_ref": release.PROJECT,
                "history_count": 1,
                "history_sha256": release.sha256(
                    ("001|baseline|" + release.sha256(body)).encode()
                ),
                "migrations": [
                    {"file": filename, "sha256": release.sha256(body)}
                    for filename in selected
                ],
            }
            snapshot = {"project_ref": release.PROJECT, "migrations": rows}
            release.compile_bundle(source, fetched, root / "bundle", manifest, snapshot)
            self.assertEqual(
                sorted(p.name for p in (root / "bundle/supabase/migrations").iterdir()),
                ["001_baseline.sql", *selected],
            )
            (source / selected[0]).write_bytes(body + b"-- altered")
            with self.assertRaisesRegex(ValueError, "checksum"):
                release.compile_bundle(
                    source, fetched, root / "bad", manifest, snapshot
                )
            self.assertFalse((root / "bad").exists())

    def test_compile_bundle_rejects_every_proper_allowlist_subset(self):
        release = load_release()
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source"
            source.mkdir()
            fetched = root / "fetched"
            fetched.mkdir()
            selected = sorted(release.ALLOWED)
            body = b"select 1;\n"
            for filename in selected:
                (source / filename).write_bytes(body)
            manifest = {
                "project_ref": release.PROJECT,
                "history_count": 0,
                "history_sha256": release.sha256(b""),
            }
            snapshot = {"project_ref": release.PROJECT, "migrations": []}
            for mask in range((1 << len(selected)) - 1):
                manifest["migrations"] = [
                    {"file": filename, "sha256": release.sha256(body)}
                    for index, filename in enumerate(selected)
                    if mask & (1 << index)
                ]
                output = root / f"subset-{mask}"
                with self.subTest(mask=mask):
                    with self.assertRaisesRegex(ValueError, "exactly the four approved files"):
                        release.compile_bundle(source, fetched, output, manifest, snapshot)
                    self.assertFalse(output.exists())

    def test_target_rejects_wrong_host_user_database_or_tls(self):
        release = load_release()
        self.assertTrue(hasattr(release, "verify_target_url"), "target binding missing")
        good = f"postgresql://postgres:private@db.{release.PROJECT}.supabase.co:5432/postgres?sslmode=verify-full"
        release.verify_target_url(good)
        for bad in (
            good.replace(release.PROJECT, "other"),
            good.replace("verify-full", "disable"),
            good.replace("/postgres?", "/other?"),
            good.replace("postgres:private", "other:private"),
            good + "&host=attacker.invalid",
            good + "#ignored",
            good.replace(":5432", ":5433"),
            good + "\n",
            " " + good,
        ):
            with self.subTest(url=bad), self.assertRaises(ValueError):
                release.verify_target_url(bad)

    def test_release_manifest_pins_four_raw_files_without_top_level_commit(self):
        release = load_release()
        manifest = json.loads(
            (ROOT / "scripts/staging/ir-release-manifest.json").read_text()
        )
        self.assertEqual(
            {item["file"] for item in manifest["migrations"]}, release.ALLOWED
        )
        self.assertFalse(manifest["hosted_write_authorized"])
        for item in manifest["migrations"]:
            body = (ROOT / "supabase/migrations" / item["file"]).read_bytes()
            self.assertEqual(release.sha256(body), item["sha256"])
            self.assertNotRegex(
                body.decode(), r"(?im)^\s*(?:begin|commit|rollback)\s*;"
            )

    def test_malformed_duplicate_missing_or_renamed_history_fails_closed(self):
        release = load_release()
        rows = [{"version": "001", "name": "baseline", "fetch_sha256": "a" * 64}]
        manifest = {
            "project_ref": release.PROJECT,
            "history_count": 1,
            "history_sha256": release.sha256(("001|baseline|" + "a" * 64).encode()),
        }
        variants = [[], rows + rows]
        for key, value in [
            ("version", "002"),
            ("version", "../001"),
            ("name", "renamed"),
            ("name", "../baseline"),
            ("fetch_sha256", "malformed"),
        ]:
            altered = copy.deepcopy(rows)
            altered[0][key] = value
            variants.append(altered)
        for variant in variants:
            with self.subTest(rows=variant), self.assertRaises(ValueError):
                release.verify_history(
                    manifest, {"project_ref": release.PROJECT, "migrations": variant}
                )

    def test_legacy_remote_path_is_disabled_even_with_confirmation(self):
        result = subprocess.run(
            [
                "bash",
                str(ROOT / "scripts/staging/apply-migrations.sh"),
                "remote-linked",
            ],
            capture_output=True,
            text=True,
            env={
                **os.environ,
                "PLATFORM_CONFIRM_PROJECT_REF": "utdioxwiskzatwoejgiu",
                "STAGING_CONFIRM_PROJECT_REF": "utdioxwiskzatwoejgiu",
            },
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("targeted release", result.stderr)


if __name__ == "__main__":
    unittest.main()
