#!/usr/bin/env bash
# Run the complete synthetic policy suite against local or explicitly confirmed staging.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-local}"
EXPECTED_STAGING_REF="ecxkhihlbrcwpavfoaoq"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi

case "$MODE" in
  local)
    if ! command -v supabase >/dev/null 2>&1; then
      echo "supabase CLI is required for local verification" >&2
      exit 1
    fi
    eval "$(supabase status -o env)"
    if [[ -z "${DB_URL:-}" ]]; then
      echo "DB_URL missing. Start local stack first." >&2
      exit 1
    fi
    ;;
  remote-staging)
    if [[ "${STAGING_PROJECT_REF:-}" != "$EXPECTED_STAGING_REF" \
       || "${STAGING_CONFIRM_PROJECT_REF:-}" != "$EXPECTED_STAGING_REF" ]]; then
      echo "Remote verification requires both staging project confirmations to equal $EXPECTED_STAGING_REF" >&2
      exit 1
    fi
    if [[ -z "${STAGING_DB_URL:-}" ]]; then
      echo "STAGING_DB_URL must come from the operator secret manager" >&2
      exit 1
    fi
    DB_URL="$STAGING_DB_URL"
    echo "Confirmed synthetic-only verification for staging project $EXPECTED_STAGING_REF."
    ;;
  *)
    echo "Usage: $0 [local|remote-staging]" >&2
    exit 1
    ;;
esac

cleanup_test_helpers() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 \
    -c 'drop function if exists public.test_set_user(uuid)' >/dev/null
}
trap cleanup_test_helpers EXIT

tests=(
  supabase/tests/003_import_gate_cases.sql
  supabase/tests/004_import_review_actions.sql
  supabase/tests/005_atomic_import_creation.sql
  supabase/tests/rls_e2e.sql
  supabase/tests/rls_policy_matrix.sql
  supabase/tests/storage_matrix.sql
  supabase/tests/006_document_access_audit.sql
)

echo "Loading synthetic six-role fixtures. No production workbook is permitted."
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql

for test_file in "${tests[@]}"; do
  echo "Running $test_file"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$test_file"
done

cleanup_test_helpers
trap - EXIT

if [[ -n "${EVIDENCE_FILE:-}" ]]; then
  python3 - "$EVIDENCE_FILE" "$MODE" "$(git rev-parse HEAD)" <<'PY'
import datetime
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({
    "verified_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "mode": sys.argv[2],
    "repository_commit": sys.argv[3],
    "synthetic_fixtures_only": True,
    "suite_count": 7,
    "result": "pass",
    "production_import_authorized": False,
}, indent=2) + "\n", encoding="utf-8")
PY
  echo "Non-secret evidence written to $EVIDENCE_FILE"
fi

echo "Complete synthetic policy suite passed in $MODE mode."
