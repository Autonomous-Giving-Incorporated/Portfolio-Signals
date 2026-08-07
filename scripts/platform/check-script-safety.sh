#!/usr/bin/env bash
# Verify operator SQL scripts hard-fail on sentinel UUID and avoid secret markers.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SENTINEL='00000000-0000-0000-0000-000000000000'
FAIL_PATTERN='raise exception'
MUTATORS=(
  ensure-profile.sql
  set-mfa-enforced.sql
  grant-master-admin.sql
  revoke-master-admin.sql
  bootstrap-master-admin.sql
)
errors=0

for f in "${MUTATORS[@]}"; do
  path="$ROOT/$f"
  if [[ ! -f "$path" ]]; then
    # During partial implementation, only check files that exist
    continue
  fi
  if ! grep -q "$SENTINEL" "$path"; then
    echo "FAIL: $f missing sentinel UUID placeholder" >&2
    errors=$((errors + 1))
  fi
  if ! grep -qi "$FAIL_PATTERN" "$path"; then
    echo "FAIL: $f missing raise exception hard-fail" >&2
    errors=$((errors + 1))
  fi
  if grep -qiE 'service_role|eyJhbGci|sb_secret_' "$path"; then
    echo "FAIL: $f appears to contain a secret marker" >&2
    errors=$((errors + 1))
  fi
done

# verify-operator-access may be read-only; if present, still ban secrets
if [[ -f "$ROOT/verify-operator-access.sql" ]]; then
  if grep -qiE 'service_role|eyJhbGci|sb_secret_' "$ROOT/verify-operator-access.sql"; then
    echo "FAIL: verify-operator-access.sql appears to contain a secret marker" >&2
    errors=$((errors + 1))
  fi
fi

if [[ "$errors" -gt 0 ]]; then
  echo "check-script-safety: $errors issue(s)" >&2
  exit 1
fi
echo "check-script-safety: OK"
