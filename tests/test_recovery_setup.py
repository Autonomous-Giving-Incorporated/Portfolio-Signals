"""Offline publication checks; never contacts a provider or database."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "docs/templates/recovery-setup"


def load(name):
    return json.loads((TEMPLATES / name).read_text(encoding="utf-8"))


class RecoverySetupTests(unittest.TestCase):
    def test_allowlisted_data_files_only(self):
        self.assertEqual(
            {p.name for p in TEMPLATES.iterdir()},
            {"approval.template.json", "bucket-create.json", "bucket-lock.json",
             "managed-domain-private.json"},
        )
        self.assertTrue(all(p.is_file() and not p.is_symlink()
                            for p in TEMPLATES.iterdir()))

    def test_no_approval_or_identity_defaults(self):
        approval = load("approval.template.json")
        for field in ("organization", "account_id", "account_control_evidence",
                      "bucket", "primary_custodian", "primary_acceptance_evidence",
                      "public_key_file", "exact_uppercase_fingerprint",
                      "independent_key_recovery_evidence", "secondary_candidate",
                      "approved_by", "approval_evidence", "billing_alert_usd"):
            self.assertIsNone(approval[field], field)
        bool_fields = {
            "location_hint_is_residency_guarantee", "automatic_deletion",
            "r2_pay_as_you_go_approved", "r2_enrollment_verified",
            "billing_alert_is_hard_cap", "secondary_accepted",
            "production_export_authorized_by_this_file",
            "production_migrations_authorized_by_this_file",
            "hosted_tenant_acceptance_authorized",
        }
        self.assertEqual({k for k, v in approval.items() if isinstance(v, bool)},
                         bool_fields)
        for field in bool_fields:
            self.assertIs(approval[field], False, field)
        self.assertEqual(approval["retention_days"], 30)
        self.assertEqual(approval["jurisdiction"], "default")
        self.assertEqual(approval["storage_class"], "Standard")

    def test_target_specific_provisioning_defaults_grant_nothing(self):
        self.assertEqual(load("approval.template.json")["provisioning_approval"], {
            "authorized": False, "provider": None, "account_id": None,
            "bucket_name": None, "jurisdiction": None, "allowed_actions": [],
            "request_body_sha256_by_action": {}, "approved_by": None,
            "approval_evidence": None, "approved_at": None, "expires_at": None,
        })
        doc = (ROOT / "docs/RECOVERY-SETUP.md").read_text(encoding="utf-8")
        for requirement in ("not provisioning authorization", "Stop before provider writes",
                            "any target mismatch", "unlisted action",
                            "missing/mismatched hash", "unverified approver/evidence",
                            "create_bucket", "disable_managed_domain", "set_bucket_lock",
                            "not an approval\nvalidator or an executor"):
            self.assertIn(requirement, doc)

    def test_exact_private_retention_payloads(self):
        self.assertEqual(load("bucket-create.json"), {
            "name": "<APPROVED_BUCKET_NAME>", "locationHint": "enam",
            "storageClass": "Standard",
        })
        self.assertEqual(load("managed-domain-private.json"), {"enabled": False})
        self.assertEqual(load("bucket-lock.json"), {"rules": [{
            "id": "recovery-all-30-days", "enabled": True, "prefix": "",
            "condition": {"type": "Age", "maxAgeSeconds": 30 * 24 * 60 * 60},
        }]})

    def test_publication_known_leak_patterns_and_no_fenced_blocks(self):
        doc = ROOT / "docs/RECOVERY-SETUP.md"
        paths = [doc, *TEMPLATES.iterdir()]
        for path in paths:
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(text, r"/home/|/mnt/[a-z]/|\.hermes/|[\w.+-]+@[\w.-]+\.[a-z]{2,}")
            self.assertNotRegex(text, r"\b[a-f0-9]{32}\b|-----BEGIN [^-]*(?:PRIVATE|SECRET)")
            self.assertNotIn("```", text)
        text = doc.read_text(encoding="utf-8")
        for phrase in ("NOT DONE", "not billing", "not administrator-proof WORM",
                       "2.31.8", "2.39.2", "STOP before final hosted"):
            self.assertIn(phrase, text)
        for target in re.findall(r"\]\(([^)]+)\)", text):
            if not target.startswith("https://"):
                self.assertTrue((doc.parent / target).is_file(), target)

    def test_ci_runs_offline_checks(self):
        workflow = (ROOT / ".github/workflows/current-main-acceptance.yml").read_text()
        self.assertIn("run: python3 tests/test_recovery_setup.py", workflow)


if __name__ == "__main__":
    unittest.main()
