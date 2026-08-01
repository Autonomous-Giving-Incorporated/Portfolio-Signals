#!/usr/bin/env bash
# Staging bootstrap helper for Hacker Dojo campaign control.
# Never writes or prints service-role secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PINNED_CLI="${PINNED_SUPABASE_CLI:-2.31.8}"
EXAMPLE_ENV="scripts/staging/bootstrap.env.example"
LOCAL_ENV="scripts/staging/bootstrap.env"

echo "== Hacker Dojo staging bootstrap =="
echo "repo: $ROOT"
echo "pinned supabase cli: $PINNED_CLI"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install the pinned version $PINNED_CLI before continuing." >&2
  exit 1
fi

installed="$(supabase --version 2>/dev/null || true)"
echo "installed supabase: ${installed:-unknown}"

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "No $LOCAL_ENV found. Copy the example and fill public values only:"
  echo "  cp $EXAMPLE_ENV $LOCAL_ENV"
fi

echo
echo "Manual operator steps (not automated by this script):"
echo "  1. Create a dedicated staging Supabase project (never share prod keys)."
echo "  2. Enable Auth MFA for privileged operators."
echo "  3. Store service-role key in a secret manager, not Git."
echo "  4. Apply migrations with: ./scripts/staging/apply-migrations.sh"
echo "  5. Load synthetic fixtures only: ./scripts/staging/load-synthetic-fixtures.sh"
echo "  6. Verify policy suite: ./scripts/staging/verify-policy-suite.sh"
echo "  7. Copy runtime-config.staging.example.js to a non-committed runtime-config.js"
echo
echo "This script does not create cloud projects and does not accept production data."
