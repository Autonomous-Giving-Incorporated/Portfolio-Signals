#!/usr/bin/env bash
# Load synthetic six-role fixtures into the local database.
# Hosted staging uses verify-policy-suite.sh remote-staging with explicit confirmation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi

eval "$(supabase status -o env)"
if [[ -z "${DB_URL:-}" ]]; then
  echo "DB_URL missing from supabase status. Is the local stack running?" >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql
echo "Synthetic role fixtures loaded."
