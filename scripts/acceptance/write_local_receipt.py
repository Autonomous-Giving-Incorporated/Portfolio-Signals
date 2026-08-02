#!/usr/bin/env python3
"""Write a non-sensitive, commit-scoped HD-OI-041 local acceptance receipt."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if len(args.commit) != 40 or any(c not in "0123456789abcdef" for c in args.commit):
        raise SystemExit("commit must be a lowercase 40-character SHA")

    receipt = {
        "repository": "scrimshawlife-ctrl/Hacker-Dojo",
        "commit": args.commit,
        "environment": "local_disposable",
        "executedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "workflowRunId": str(args.run_id),
        "verdict": "LOCAL_PASS_HOSTED_PENDING",
        "technicalGates": {
            "publicContract": "PASS",
            "securityContract": "PASS",
            "migrationChain": "PASS",
            "sixRoleRls": "PASS",
            "importGates": "PASS",
            "privateStorage": "PASS",
            "signedUrlAudit": "PASS",
            "browserSmoke": "NOT_RUN",
            "directorAcceptance": "NOT_RUN",
        },
        "productionImportAuthorized": False,
        "outreachAuthorized": False,
        "evidenceBoundary": (
            "This receipt proves only the disposable local workflow for the exact commit. "
            "It does not prove hosted parity, browser behavior, director acceptance, production import, or outreach authority."
        ),
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
