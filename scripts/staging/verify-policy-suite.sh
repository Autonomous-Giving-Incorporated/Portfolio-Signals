#!/usr/bin/env bash
# Run the repository policy suite against the local disposable stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  echo "supabase CLI and psql are required" >&2
  exit 1
fi

eval "$(supabase status -o env)"
if [[ -z "${DB_URL:-}" ]]; then
  echo "DB_URL missing. Start local stack first (./scripts/staging/apply-migrations.sh local)." >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/003_import_gate_cases.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/004_import_review_actions.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_e2e.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/storage_matrix.sql

echo "Policy suite completed successfully against the local disposable database."
