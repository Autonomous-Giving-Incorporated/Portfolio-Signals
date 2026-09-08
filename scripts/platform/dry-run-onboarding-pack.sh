#!/usr/bin/env bash
# Client Onboarding Pack dry-run helper (#18).
#
# local-synthetic  — no production credentials. Classifier + contract checks only.
# operator-mfa     — fail-closed MFA/profile probe. Does NOT complete the browser
#                    five-document dry-run and does NOT write an OBSERVED receipt.
#
# Never invent a commit-scoped acceptance receipt. Never load real documents.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-local-synthetic}"
PRODUCTION_REF="utdioxwiskzatwoejgiu"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing required file: $1"
}

local_synthetic() {
  echo "=== #18 local-synthetic onboarding pack preflight ==="
  echo "label: LOCAL_SYNTHETIC_ONLY"
  echo "does_not_claim: MFA workspace dry-run OBSERVED"
  echo

  require_file docs/CLIENT-ONBOARDING-PACK.md
  require_file docs/templates/RESTORE-DRILL-EVIDENCE.md
  require_file supabase/tests/015_client_onboarding_pack.sql
  require_file supabase/functions/upload-onboarding-document/index.ts
  require_file supabase/functions/onboarding-document-url/index.ts
  require_file scripts/platform/set-mfa-enforced.sql
  require_file services/onboarding-pack/src/classifier.mjs

  grep -q "org_legal_name_proof" docs/CLIENT-ONBOARDING-PACK.md \
    || fail "pack runbook missing required slot org_legal_name_proof"
  grep -q "parked_crm" docs/CLIENT-ONBOARDING-PACK.md \
    || fail "pack runbook missing parked_crm behavior"
  grep -q "production_import: BLOCKED" docs/CLIENT-ONBOARDING-PACK.md \
    || fail "pack runbook lost production import block"
  grep -q "mfa_enforced" supabase/tests/015_client_onboarding_pack.sql \
    || fail "015 pack SQL is missing MFA enforcement coverage"
  grep -q "parked" supabase/tests/015_client_onboarding_pack.sql \
    || fail "015 pack SQL is missing parked-workbook coverage"

  (cd services/onboarding-pack && npm test)

  echo
  echo "LOCAL_SYNTHETIC_PASS"
  echo "Remaining operator-owned #18 work (not performed by this script):"
  echo "  1. MFA-enforced director or master_admin session on platform $PRODUCTION_REF"
  echo "  2. Workspace → Onboarding pack (org_hacker_dojo or disposable client)"
  echo "  3. Upload five synthetic required documents and confirm slots"
  echo "  4. Park one synthetic workbook; confirm it cannot bind to org-proof slots"
  echo "  5. Record cleanup + evidence outside git if it includes private identifiers"
  echo "  6. Only then update CURRENT-STATE.md client_onboarding_pack.status to OBSERVED"
}

operator_mfa() {
  echo "=== #18 operator-mfa readiness probe ==="
  echo "label: OPERATOR_PROBE_ONLY"
  echo "does_not_claim: browser pack dry-run OBSERVED"
  echo

  if [[ -f scripts/staging/bootstrap.env ]]; then
    # shellcheck disable=SC1091
    set -a && source scripts/staging/bootstrap.env && set +a
  fi

  local url="${PLATFORM_SUPABASE_URL:-${SUPABASE_URL:-}}"
  local key="${PLATFORM_SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SECRET_KEY:-}}}"
  [[ -n "$url" ]] || fail "set PLATFORM_SUPABASE_URL from the operator secret manager"
  [[ -n "$key" ]] || fail "set PLATFORM_SUPABASE_SECRET_KEY from the operator secret manager"
  url="${url%/}"

  if [[ "$url" != *"${PRODUCTION_REF}"* && "${ALLOW_NON_PLATFORM_PACK_PROBE:-}" != "1" ]]; then
    fail "refusing probe against unexpected host $url (expected $PRODUCTION_REF)"
  fi

  for required in PRIMARY_MASTER_ADMIN_EMAIL; do
    [[ -n "${!required:-}" ]] || fail "set $required from the restricted operator registry"
  done

  local pack_code
  pack_code="$(curl -sS -o /tmp/pack-dry-run.json -w "%{http_code}" \
    -H "apikey: $key" -H "Authorization: Bearer $key" \
    "$url/rest/v1/client_onboarding_packs?select=id&limit=1")"
  [[ "$pack_code" == "200" ]] || fail "client_onboarding_packs REST returned HTTP $pack_code"

  python3 - "$url" "$key" <<'PY'
import json, os, sys, urllib.request

url, key = sys.argv[1], sys.argv[2]
email = os.environ["PRIMARY_MASTER_ADMIN_EMAIL"].lower()
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

def get(path):
    req = urllib.request.Request(url + path, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode())

users = get("/auth/v1/admin/users?page=1&per_page=50").get("users") or []
user = next((item for item in users if (item.get("email") or "").lower() == email), None)
if not user:
    raise SystemExit(f"FAIL: {email} missing from Auth")
uid = user["id"]
factors = [item for item in (user.get("factors") or []) if item.get("status") == "verified"]
profiles = get(f"/rest/v1/profiles?id=eq.{uid}&select=active,mfa_enforced")
profile = profiles[0] if profiles else {}
if profile.get("active") is not True:
    raise SystemExit("FAIL: primary operator profile is not active")
if not factors:
    raise SystemExit("FAIL: no verified Auth MFA factor; enroll TOTP before the workspace dry-run")
if profile.get("mfa_enforced") is not True:
    raise SystemExit("FAIL: mfa_enforced is not true; run set-mfa-enforced.sql after enrollment")
print(f"operator_mfa_ready: true email_confirmed={bool(user.get('email_confirmed_at'))}")
print("browser_pack_dry_run: PENDING")
print("acceptance_receipt: NOT_WRITTEN")
PY

  echo
  echo "OPERATOR_MFA_READY"
  echo "This is not a commit-scoped #18 acceptance receipt."
  echo "Complete the five synthetic documents + parked workbook in the workspace, then record OBSERVED."
}

case "$MODE" in
  local-synthetic) local_synthetic ;;
  operator-mfa) operator_mfa ;;
  *)
    echo "Usage: $0 [local-synthetic|operator-mfa]" >&2
    exit 1
    ;;
esac
