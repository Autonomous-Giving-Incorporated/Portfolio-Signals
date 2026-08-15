#!/usr/bin/env bash
# Isolated / local synthetic backup-restore drill helper (#19).
#
# local-synthetic   — disposable local Supabase only. No production restore.
# isolated-project  — operator-owned empty project. Refuses platform production.
#
# Writes a privacy-safe engineering receipt. Does not invent leadership
# RTO/RPO acceptance, READY, live gifts, or production restore.
# Evidence template: docs/templates/RESTORE-DRILL-EVIDENCE.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-local-synthetic}"
PRODUCTION_REF="utdioxwiskzatwoejgiu"
LEGACY_STAGING_REF="ecxkhihlbrcwpavfoaoq"
RECEIPT_PATH="${RESTORE_DRILL_RECEIPT:-docs/templates/RESTORE-DRILL-EVIDENCE.md}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing required file: $1"
}

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
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

# Suites named by the #19 validation: RLS, import, storage, session, signed-access.
# Also run the later AGI / allocation suites that already exist in-repo.
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
  supabase/tests/019_am_tenant_isolation.sql
  supabase/tests/020_am_impact_notice.sql
)

SUITE_PASS=0
SUITE_FAIL=0
SUITE_RESULTS=()
STORAGE_SUITE="not_run"
SIGNED_ACCESS_SUITE="not_run"
SESSION_SUITE="not_run"
IMPORT_SUITE="not_run"
RLS_SUITE="not_run"

classify_suite() {
  local test_file="$1"
  local result="$2"
  case "$test_file" in
    *003_import_gate_cases.sql|*004_import_review_actions.sql|*005_atomic_import_creation.sql)
      if [[ "$IMPORT_SUITE" != "fail" ]]; then IMPORT_SUITE="$result"; fi
      ;;
    *rls_e2e.sql|*rls_policy_matrix.sql|*007_agi_tenant_foundation.sql|*008_agi_operational_isolation.sql|*014_agi_two_tenant_acceptance.sql|*019_am_tenant_isolation.sql)
      if [[ "$RLS_SUITE" != "fail" ]]; then RLS_SUITE="$result"; fi
      if [[ "$test_file" == *rls_e2e.sql ]]; then
        SESSION_SUITE="$result"
      fi
      ;;
    *storage_matrix.sql)
      STORAGE_SUITE="$result"
      ;;
    *006_document_access_audit.sql)
      SIGNED_ACCESS_SUITE="$result"
      ;;
  esac
}

run_policy_suite() {
  local db_url="$1"
  psql "$db_url" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql
  local test_file result
  SUITE_PASS=0
  SUITE_FAIL=0
  SUITE_RESULTS=()
  for test_file in "${policy_suite_files[@]}"; do
    echo "Running $test_file"
    if psql "$db_url" -v ON_ERROR_STOP=1 -f "$test_file"; then
      result="pass"
      SUITE_PASS=$((SUITE_PASS + 1))
    else
      result="fail"
      SUITE_FAIL=$((SUITE_FAIL + 1))
    fi
    SUITE_RESULTS+=("$test_file:$result")
    classify_suite "$test_file" "$result"
    echo "result $test_file $result"
  done
}

fixture_counts() {
  local db_url="$1"
  psql "$db_url" -Atc "
    select 'auth_users=' || count(*)::text from auth.users
      where email like '%@example.invalid';
    select 'profiles=' || count(*)::text from public.profiles
      where id::text like '00000000-0000-0000-0000-00000000010%';
    select 'memberships=' || count(*)::text from public.client_memberships
      where client_id = 'org_hacker_dojo';
  "
}

write_receipt() {
  local drill_date="$1"
  local backup_id="$2"
  local head_before="$3"
  local head_after="$4"
  local started="$5"
  local completed="$6"
  local observed_rto="$7"
  local observed_rpo="$8"
  local fixture_result="$9"
  local engineering="${10}"
  local cleanup="${11}"
  local exceptions="${12}"
  local source_class="${13}"
  local operator_note="${14}"

  local full_suite="fail"
  if [[ "$SUITE_FAIL" -eq 0 && "$SUITE_PASS" -gt 0 ]]; then
    full_suite="pass"
  elif [[ "$SUITE_PASS" -eq 0 ]]; then
    full_suite="fail"
  fi

  mkdir -p "$(dirname "$RECEIPT_PATH")"
  cat > "$RECEIPT_PATH" <<EOF
# Restore Drill Evidence

Do not include credentials, URLs containing tokens, personal data, raw rows, object paths, or private project identifiers in repository copies of this record.

**Classification:** ${source_class}. Engineering receipt only. Not production. Not accepted RTO/RPO. Production import remains blocked.

| Field | Evidence |
|---|---|
| Drill date | ${drill_date} |
| Operator and approver roles | ${operator_note} |
| Source environment classification | ${source_class} |
| Backup identifier (non-secret reference) | ${backup_id} |
| Migration head before restore | ${head_before} |
| Migration head after restore | ${head_after} |
| Restore started / completed | ${started} / ${completed} |
| Observed RTO | ${observed_rto} |
| Observed RPO | ${observed_rpo} |
| Synthetic fixture counts matched | ${fixture_result} |
| Full SQL policy suite | ${full_suite} (${SUITE_PASS} pass / ${SUITE_FAIL} fail of ${#policy_suite_files[@]}) |
| Private bucket verification | ${STORAGE_SUITE} |
| Signed-access audit verification | ${SIGNED_ACCESS_SUITE} |
| Old credentials rejected | not applicable |
| Exceptions and remediation owner | ${exceptions} |
| Environment cleanup confirmed | ${cleanup} |

## Suite rollup (do not invent passing suites)

- Import suites: ${IMPORT_SUITE}
- RLS / session suites: ${RLS_SUITE} / ${SESSION_SUITE}
- Private bucket / storage: ${STORAGE_SUITE}
- Signed-access audit: ${SIGNED_ACCESS_SUITE}

$(printf '%s\n' "${SUITE_RESULTS[@]/#/- }")

## Approval

- Engineering result: ${engineering}
- Privacy or data owner review: pending
- Leadership RTO/RPO acceptance: pending
- Production import remains blocked: yes
EOF
}

HOST_PG_NAME="${RESTORE_DRILL_PG_NAME:-ps-restore-pg}"
HOST_PG_IMAGE="${RESTORE_DRILL_PG_IMAGE:-public.ecr.aws/supabase/postgres:15.8.1.085}"
HOST_DB_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"

apply_repo_migrations() {
  local db_url="$1"
  psql "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL
  local f ver already
  for f in $(ls -1 supabase/migrations/*.sql | sort); do
    ver="$(basename "$f" .sql)"
    already="$(psql "$db_url" -Atc "select 1 from supabase_migrations.schema_migrations where version='${ver}'")"
    if [[ "$already" == "1" ]]; then
      echo "migration_skip=$ver"
      continue
    fi
    echo "migration_apply=$ver"
    psql "$db_url" -v ON_ERROR_STOP=1 -f "$f"
    psql "$db_url" -v ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations(version,name) values ('${ver}','${ver}')"
  done
  if [[ -f supabase/seed.sql ]]; then
    echo "Applying seed.sql"
    psql "$db_url" -v ON_ERROR_STOP=1 -f supabase/seed.sql
  fi
}

wait_for_pg() {
  local db_url="$1"
  local i
  for i in $(seq 1 40); do
    if psql "$db_url" -Atc "select 1" >/dev/null 2>&1; then
      echo "postgres_ready after ${i}s"
      return 0
    fi
    sleep 1
  done
  fail "postgres did not become ready"
}

start_host_postgres() {
  command -v docker >/dev/null 2>&1 || fail "docker is required for the host-network postgres fallback"
  docker rm -f "$HOST_PG_NAME" >/dev/null 2>&1 || true
  echo "Starting disposable $HOST_PG_IMAGE on host network (not $PRODUCTION_REF, not $LEGACY_STAGING_REF)."
  docker run -d --name "$HOST_PG_NAME" --network host \
    -e POSTGRES_HOST=/var/run/postgresql \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=postgres \
    -e JWT_SECRET=local-synthetic-restore-drill-not-a-production-secret \
    "$HOST_PG_IMAGE" >/dev/null
  wait_for_pg "$HOST_DB_URL"
  psql "$HOST_DB_URL" -v ON_ERROR_STOP=1 -f scripts/staging/align-local-storage-schema.sql
}

stop_host_postgres() {
  docker rm -f "$HOST_PG_NAME" >/dev/null 2>&1 || true
}

local_synthetic() {
  echo "=== #19 local-synthetic restore drill ==="
  echo "label: LOCAL_SYNTHETIC_ONLY"
  echo "does_not_claim: isolated hosted project restore OBSERVED"
  echo "does_not_claim: leadership RTO/RPO"
  echo
  preflight_docs
  require_file scripts/staging/align-local-storage-schema.sql

  if ! command -v psql >/dev/null 2>&1; then
    echo "BLOCKED: psql is required for the local synthetic drill."
    exit 2
  fi
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "BLOCKED: pg_dump is required for the local synthetic drill."
    exit 2
  fi
  if ! command -v pg_restore >/dev/null 2>&1; then
    echo "BLOCKED: pg_restore is required for the local synthetic drill."
    exit 2
  fi

  local cleanup_state="fail"
  local engine="none"
  local db_url=""
  local workdir
  workdir="$(mktemp -d "${TMPDIR:-/tmp}/ps-restore-drill.XXXXXX")"
  cleanup_local() {
    rm -rf "$workdir"
    if [[ "$engine" == "supabase-cli" ]]; then
      supabase stop --no-backup >/dev/null 2>&1 || true
    elif [[ "$engine" == "host-postgres" ]]; then
      stop_host_postgres
    fi
  }
  trap cleanup_local EXIT

  if command -v supabase >/dev/null 2>&1 && [[ "${RESTORE_DRILL_ENGINE:-auto}" != "host-postgres" ]]; then
    echo "Trying supabase start (full local stack)."
    if supabase start; then
      engine="supabase-cli"
      supabase db reset
      eval "$(supabase status -o env)"
      db_url="${DB_URL:-}"
      [[ -n "$db_url" ]] || fail "DB_URL missing after supabase status"
    else
      echo "WARN: supabase start failed; falling back to host-network supabase/postgres image."
      echo "This host cannot run the full local stack when Docker bridge routing drops container-to-container traffic."
    fi
  fi

  if [[ "$engine" != "supabase-cli" ]]; then
    engine="host-postgres"
    start_host_postgres
    db_url="$HOST_DB_URL"
    apply_repo_migrations "$db_url"
  fi

  echo "engine=$engine"
  echo "Loading synthetic fixtures into the known-good local backup source."
  psql "$db_url" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql
  local counts_before
  counts_before="$(fixture_counts "$db_url" | tr '\n' ' ')"
  echo "fixture_counts_before=$counts_before"

  local backup="$workdir/synthetic.dump"
  echo "Creating privacy-safe local dump (synthetic fixtures only)."
  pg_dump --no-owner --no-acl --format=custom "$db_url" --file="$backup"
  [[ -s "$backup" ]] || fail "synthetic dump was empty"
  local backup_sha
  backup_sha="$(sha256sum "$backup" | awk '{print $1}')"
  local backup_id="local-synthetic.dump sha256:${backup_sha:0:12}"

  local head_before
  head_before="$(psql "$db_url" -Atc "select version from supabase_migrations.schema_migrations order by version desc limit 1")"
  echo "migration_head_before_restore=$head_before"

  echo "Recreating an empty isolated local target."
  if [[ "$engine" == "supabase-cli" ]]; then
    supabase db reset
    eval "$(supabase status -o env)"
    db_url="${DB_URL:-}"
  else
    stop_host_postgres
    start_host_postgres
    db_url="$HOST_DB_URL"
  fi

  local restore_started restore_started_epoch
  restore_started="$(iso_now)"
  restore_started_epoch="$(date -u +%s)"
  echo "Restoring the synthetic dump into the empty local target."
  echo "restore_started=$restore_started"
  pg_restore --clean --if-exists --no-owner --no-acl --dbname="$db_url" "$backup" \
    || echo "WARN: pg_restore exited $?; continuing to migration + fixture verification."

  echo "Applying any pending repository migrations onto the restored local target."
  if [[ "$engine" == "supabase-cli" ]]; then
    supabase db push --local || supabase migration up --local || true
  else
    apply_repo_migrations "$db_url"
  fi

  local restore_completed restore_completed_epoch elapsed
  restore_completed="$(iso_now)"
  restore_completed_epoch="$(date -u +%s)"
  elapsed="$((restore_completed_epoch - restore_started_epoch))"
  echo "restore_completed=$restore_completed"
  echo "observed_restore_seconds=$elapsed"

  local head_after
  head_after="$(psql "$db_url" -Atc "select version from supabase_migrations.schema_migrations order by version desc limit 1")"
  echo "migration_head_after_restore=$head_after"

  local counts_after fixture_result
  counts_after="$(fixture_counts "$db_url" | tr '\n' ' ')"
  echo "fixture_counts_after=$counts_after"
  if [[ "$counts_before" == "$counts_after" && -n "$counts_before" ]]; then
    fixture_result="pass"
  else
    fixture_result="fail"
  fi

  echo "Re-running the synthetic policy suite against the restored local database."
  set +e
  run_policy_suite "$db_url"
  local suite_rc=$?
  set -e

  echo "Destroying the disposable local target (no backup retained)."
  if [[ "$engine" == "supabase-cli" ]]; then
    supabase stop --no-backup
  else
    stop_host_postgres
  fi
  cleanup_state="yes"
  trap 'rm -rf "$workdir"' EXIT

  local engineering="fail"
  local exceptions="none"
  if [[ "$SUITE_FAIL" -eq 0 && "$fixture_result" == "pass" && "$head_before" == "$head_after" ]]; then
    engineering="pass"
  else
    exceptions="local-synthetic mismatches remain operator-owned; do not treat as accepted RTO/RPO"
  fi

  local source_class="isolated synthetic (local disposable; engine=${engine})"
  local observed_rto="${elapsed}s local-synthetic restore+migrate wall time; not an accepted RTO"
  local observed_rpo="recovered synthetic dump ${backup_id} at migration head ${head_after}; not an accepted RPO"

  write_receipt \
    "$(date -u +%Y-%m-%d)" \
    "$backup_id" \
    "$head_before" \
    "$head_after" \
    "$restore_started" \
    "$restore_completed" \
    "$observed_rto" \
    "$observed_rpo" \
    "$fixture_result" \
    "$engineering" \
    "$cleanup_state" \
    "$exceptions" \
    "$source_class" \
    "engineering operator (cloud agent); leadership approver not claimed"

  echo
  if [[ "$engineering" == "pass" ]]; then
    echo "LOCAL_SYNTHETIC_RESTORE_PASS"
  else
    echo "LOCAL_SYNTHETIC_RESTORE_FAIL"
  fi
  echo "engine=$engine"
  echo "receipt=$RECEIPT_PATH"
  echo "observed_rto=$observed_rto"
  echo "observed_rpo=$observed_rpo"
  echo "does_not_claim: leadership RTO/RPO acceptance"
  echo "does_not_claim: isolated hosted project"
  echo "Remaining operator-owned #19 work:"
  echo "  1. Provision an empty isolated Supabase project (not $PRODUCTION_REF, not $LEGACY_STAGING_REF)"
  echo "  2. Restore a known synthetic backup into that project"
  echo "  3. Apply pending migrations and rerun this script as isolated-project"
  echo "  4. Leadership still owns RTO/RPO acceptance"
  [[ "$engineering" == "pass" ]] || exit 1
  [[ "$suite_rc" -eq 0 ]] || true
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
    echo "Restore the known synthetic backup into the confirmed isolated ref, then rerun with ISOLATED_RESTORE_COMPLETED=1."
    exit 2
  fi

  command -v psql >/dev/null 2>&1 || fail "psql is required"
  set +e
  run_policy_suite "$ISOLATED_DB_URL"
  set -e

  echo
  echo "ISOLATED_POLICY_SUITE_DONE pass=$SUITE_PASS fail=$SUITE_FAIL"
  echo "Fill $RECEIPT_PATH with elapsed times you measured."
  echo "Do not commit private project identifiers, credentials, or raw rows."
  echo "Leadership RTO/RPO acceptance remains pending."
  [[ "$SUITE_FAIL" -eq 0 ]] || exit 1
}

docs_preflight() {
  echo "=== #19 restore-drill documentation preflight ==="
  echo "label: DOCS_PREFLIGHT_ONLY"
  preflight_docs
  echo "DOCS_PREFLIGHT_PASS"
  echo "local-synthetic restore requires psql + pg_dump + pg_restore."
  echo "Preferred engine: supabase start. Fallback: host-network supabase/postgres image when Docker bridge routing cannot start the full stack."
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
