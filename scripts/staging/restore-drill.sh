#!/usr/bin/env bash
# Isolated / local synthetic backup-restore drill helper (#19).
#
# local-synthetic   — disposable local Supabase only. No production restore.
# isolated-project  — operator-owned empty project. Refuses platform production.
#
# Does not invent RTO/RPO acceptance. Does not write a leadership receipt.
# Evidence template: docs/templates/RESTORE-DRILL-EVIDENCE.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-local-synthetic}"
PRODUCTION_REF="utdioxwiskzatwoejgiu"
LEGACY_STAGING_REF="ecxkhihlbrcwpavfoaoq"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing required file: $1"
}

preflight_docs() {
  require_file docs/OPERATIONAL-CONTROLS.md
  require_file docs/templates/RESTORE-DRILL-EVIDENCE.md
  require_file docs/PRODUCTION-HARDENING.md
  require_file scripts/staging/verify-policy-suite.sh
  grep -q "Restore Drill Evidence" docs/templates/RESTORE-DRILL-EVIDENCE.md \
    || fail "restore evidence template is incomplete"
  grep -q "Leadership RTO/RPO acceptance" docs/templates/RESTORE-DRILL-EVIDENCE.md \
    || fail "restore evidence template lost leadership acceptance field"
  grep -qi "production import remains blocked" docs/templates/RESTORE-DRILL-EVIDENCE.md \
    || fail "restore evidence template lost import block"
}

policy_suite_files=(
  supabase/tests/003_import_gate_cases.sql
  supabase/tests/004_import_review_actions.sql
  supabase/tests/005_atomic_import_creation.sql
  supabase/tests/rls_e2e.sql
  supabase/tests/rls_policy_matrix.sql
  supabase/tests/storage_matrix.sql
  supabase/tests/006_document_access_audit.sql
  supabase/tests/007_agi_tenant_foundation.sql
  supabase/tests/008_agi_operational_isolation.sql
  supabase/tests/009_agi_workspace_context.sql
  supabase/tests/010_agi_client_configuration.sql
  supabase/tests/011_agi_client_onboarding.sql
  supabase/tests/012_agi_two_person_approvals.sql
  supabase/tests/013_agi_impact_relay_jwt.sql
  supabase/tests/014_agi_two_tenant_acceptance.sql
  supabase/tests/015_client_onboarding_pack.sql
  supabase/tests/016_delegate_auth.sql
  supabase/tests/017_security_definer_privileges.sql
  supabase/tests/018_authenticated_security_definer_privileges.sql
)

run_policy_suite() {
  local db_url="$1"
  psql "$db_url" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql
  local test_file
  for test_file in "${policy_suite_files[@]}"; do
    echo "Running $test_file"
    psql "$db_url" -v ON_ERROR_STOP=1 -f "$test_file"
  done
}

local_synthetic() {
  echo "=== #19 local-synthetic restore drill ==="
  echo "label: LOCAL_SYNTHETIC_ONLY"
  echo "does_not_claim: isolated project restore OBSERVED"
  echo "does_not_claim: leadership RTO/RPO"
  echo
  preflight_docs

  if ! command -v supabase >/dev/null 2>&1; then
    echo "BLOCKED: supabase CLI is not installed on this host."
    echo "Operator next: install CLI $PRODUCTION_REF-compatible pin (CI uses 2.31.8) and rerun."
    exit 2
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "BLOCKED: psql is required for the local synthetic drill."
    exit 2
  fi
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "BLOCKED: pg_dump is required for the local synthetic drill."
    exit 2
  fi

  supabase start
  supabase db reset
  eval "$(supabase status -o env)"
  [[ -n "${DB_URL:-}" ]] || fail "DB_URL missing after supabase status"

  echo "Loading synthetic fixtures into the known-good local backup source."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql

  local workdir
  workdir="$(mktemp -d "${TMPDIR:-/tmp}/ps-restore-drill.XXXXXX")"
  trap 'rm -rf "$workdir"' EXIT
  local backup="$workdir/synthetic.dump"
  echo "Creating privacy-safe local dump (synthetic fixtures only)."
  pg_dump --no-owner --no-acl --format=custom "$DB_URL" --file="$backup"
  [[ -s "$backup" ]] || fail "synthetic dump was empty"

  local head_before
  head_before="$(psql "$DB_URL" -Atc "select version from supabase_migrations.schema_migrations order by version desc limit 1")"
  echo "migration_head_before_restore=$head_before"

  echo "Resetting local database to simulate an empty isolated target."
  supabase db reset
  eval "$(supabase status -o env)"

  echo "Restoring the synthetic dump into the empty local target."
  pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DB_URL" "$backup"

  local head_after
  head_after="$(psql "$DB_URL" -Atc "select version from supabase_migrations.schema_migrations order by version desc limit 1")"
  echo "migration_head_after_restore=$head_after"
  [[ "$head_before" == "$head_after" ]] || fail "migration head changed across local restore ($head_before -> $head_after)"

  echo "Re-running the synthetic policy suite against the restored local database."
  run_policy_suite "$DB_URL"

  echo
  echo "LOCAL_SYNTHETIC_RESTORE_PASS"
  echo "observed_rto: NOT_RECORDED (local disposable; not a leadership RTO)"
  echo "observed_rpo: NOT_RECORDED (local disposable; not a leadership RPO)"
  echo "Remaining operator-owned #19 work:"
  echo "  1. Provision an empty isolated Supabase project (not $PRODUCTION_REF, not $LEGACY_STAGING_REF)"
  echo "  2. Restore a known synthetic backup into that project"
  echo "  3. Apply pending migrations and rerun this script as isolated-project"
  echo "  4. Fill docs/templates/RESTORE-DRILL-EVIDENCE.md outside git if identifiers are private"
  echo "  5. Leadership still owns RTO/RPO acceptance"
}

isolated_project() {
  echo "=== #19 isolated-project restore drill (operator) ==="
  echo "label: OPERATOR_DRILL_PREFLIGHT"
  echo "does_not_claim: RTO/RPO accepted"
  echo
  preflight_docs

  local target="${ISOLATED_PROJECT_REF:-}"
  local confirm="${ISOLATED_CONFIRM_PROJECT_REF:-}"
  [[ -n "$target" ]] || fail "set ISOLATED_PROJECT_REF to the empty isolated project"
  [[ "$confirm" == "$target" ]] || fail "set ISOLATED_CONFIRM_PROJECT_REF to the same isolated ref"
  [[ "$target" != "$PRODUCTION_REF" ]] || fail "refusing to restore into platform production $PRODUCTION_REF"
  [[ "$target" != "$LEGACY_STAGING_REF" ]] || fail "refusing to restore into frozen legacy staging $LEGACY_STAGING_REF"
  [[ -n "${ISOLATED_DB_URL:-}" ]] || fail "set ISOLATED_DB_URL from the operator secret manager (isolated project only)"

  if [[ "${ISOLATED_RESTORE_COMPLETED:-}" != "1" ]]; then
    echo "BLOCKED: this script does not perform the provider restore."
    echo "Restore the known synthetic backup into $target, then rerun with ISOLATED_RESTORE_COMPLETED=1."
    exit 2
  fi

  command -v psql >/dev/null 2>&1 || fail "psql is required"
  run_policy_suite "$ISOLATED_DB_URL"

  echo
  echo "ISOLATED_POLICY_SUITE_PASS"
  echo "Fill docs/templates/RESTORE-DRILL-EVIDENCE.md with elapsed times you measured."
  echo "Do not commit private project identifiers, credentials, or raw rows."
  echo "Leadership RTO/RPO acceptance remains pending."
}

docs_preflight() {
  echo "=== #19 restore-drill documentation preflight ==="
  echo "label: DOCS_PREFLIGHT_ONLY"
  preflight_docs
  echo "DOCS_PREFLIGHT_PASS"
  echo "local-synthetic restore still requires supabase + psql + pg_dump."
  echo "isolated-project restore still requires an operator-owned empty project."
}

case "$MODE" in
  docs-preflight) docs_preflight ;;
  local-synthetic) local_synthetic ;;
  isolated-project) isolated_project ;;
  *)
    echo "Usage: $0 [docs-preflight|local-synthetic|isolated-project]" >&2
    exit 1
    ;;
esac
