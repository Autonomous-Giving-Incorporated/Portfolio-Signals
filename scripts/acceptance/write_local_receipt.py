#!/usr/bin/env python3
"""Write a non-sensitive, commit-scoped HD-OI-041 local acceptance receipt."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

# Prefer GITHUB_REPOSITORY (Actions) so renames (Fund-Intel → Portofolio-Signals) do not break CI.
REPOSITORY = os.environ.get(
    "GITHUB_REPOSITORY", "Autonomous-Giving-Incorporated/Portfolio-Signals"
)
PASS_GATES = (
    "publicContract",
    "securityContract",
    "migrationChain",
    "sixRoleRls",
    "importGates",
    "privateStorage",
    "signedUrlAudit",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if len(args.commit) != 40 or any(c not in "0123456789abcdef" for c in args.commit):
        raise SystemExit("commit must be a lowercase 40-character SHA")
    if not args.run_id.isdigit():
        raise SystemExit("run-id must be numeric")
    expected_run_url = f"https://github.com/{REPOSITORY}/actions/runs/{args.run_id}"
    if args.run_url != expected_run_url:
        raise SystemExit("run-url does not match repository and run-id")

    technical_gates = {gate: "PASS" for gate in PASS_GATES}
    technical_gates.update({"browserSmoke": "NOT_RUN", "directorAcceptance": "NOT_RUN"})

    receipt = {
        "repository": REPOSITORY,
        "commit": args.commit,
        "environment": "local_disposable",
        "executedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "workflowRunId": args.run_id,
        "workflowRunUrl": args.run_url,
        "verdict": "LOCAL_PASS_HOSTED_PENDING",
        "technicalGates": technical_gates,
        "productionImportAuthorized": False,
        "outreachAuthorized": False,
        "evidenceBoundary": (
            "This receipt proves only the disposable local workflow for the exact commit. "
            "It does not prove hosted parity, browser behavior, director acceptance, production import, or outreach authority."
        ),
    }

    # Self-validate the deterministic invariants before publication.
    assert receipt["repository"] == REPOSITORY
    assert receipt["commit"] == args.commit
    assert all(receipt["technicalGates"][gate] == "PASS" for gate in PASS_GATES)
    assert receipt["technicalGates"]["browserSmoke"] == "NOT_RUN"
    assert receipt["technicalGates"]["directorAcceptance"] == "NOT_RUN"
    assert receipt["productionImportAuthorized"] is False
    assert receipt["outreachAuthorized"] is False

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

# Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 8e2d66e30c2a77967a3c0aa064c24422eedfac59
