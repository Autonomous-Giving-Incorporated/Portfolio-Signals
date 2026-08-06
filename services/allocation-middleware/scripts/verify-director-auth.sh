#!/usr/bin/env bash
# Verify allocation middleware is configured for Supabase director login.
# Usage:
#   BASE_URL=http://127.0.0.1:8787 ./scripts/verify-director-auth.sh
# Optional live login check:
#   DIRECTOR_EMAIL=... DIRECTOR_PASSWORD=... BASE_URL=... ./scripts/verify-director-auth.sh --login
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
BASE_URL="${BASE_URL%/}"
DO_LOGIN=0
[[ "${1:-}" == "--login" ]] && DO_LOGIN=1

echo "=== Director auth verify against $BASE_URL ==="

code=$(curl -sS -o /tmp/am-auth-config.json -w "%{http_code}" "$BASE_URL/auth/config")
test "$code" = "200" || { echo "auth/config failed: $code"; cat /tmp/am-auth-config.json; exit 1; }

python3 - <<'PY'
import json, sys
cfg = json.load(open("/tmp/am-auth-config.json"))
print("orgId:", cfg.get("orgId"))
print("directorLoginEnabled:", cfg.get("directorLoginEnabled"))
print("operatorTokenFallback:", cfg.get("operatorTokenFallback"))
print("supabaseUrl set:", bool(cfg.get("supabaseUrl")))
print("supabaseAnonKey set:", bool(cfg.get("supabaseAnonKey")))
if not cfg.get("directorLoginEnabled"):
    print("FAIL: directorLoginEnabled is false — set SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY on the host")
    sys.exit(2)
if not cfg.get("supabaseUrl") or not cfg.get("supabaseAnonKey"):
    print("FAIL: missing public supabase config")
    sys.exit(2)
print("OK auth/config")
PY

if [[ "$DO_LOGIN" != "1" ]]; then
  echo "Skip live login (pass --login with DIRECTOR_EMAIL/DIRECTOR_PASSWORD to exercise JWT allocate)."
  exit 0
fi

EMAIL="${DIRECTOR_EMAIL:-}"
PASS="${DIRECTOR_PASSWORD:-}"
if [[ -z "$EMAIL" || -z "$PASS" ]]; then
  echo "DIRECTOR_EMAIL and DIRECTOR_PASSWORD required for --login"
  exit 1
fi

# Public config already has URL + anon
SUPABASE_URL=$(python3 -c 'import json; print(json.load(open("/tmp/am-auth-config.json"))["supabaseUrl"].rstrip("/"))')
ANON=$(python3 -c 'import json; print(json.load(open("/tmp/am-auth-config.json"))["supabaseAnonKey"])')

TOKEN=$(curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "content-type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token") or "")')

if [[ -z "$TOKEN" ]]; then
  echo "FAIL: password grant did not return access_token"
  exit 1
fi
echo "OK password grant"

code=$(curl -sS -o /tmp/am-auth-me.json -w "%{http_code}" "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN")
test "$code" = "200" || { echo "auth/me failed: $code"; cat /tmp/am-auth-me.json; exit 1; }
python3 - <<'PY'
import json, sys
me = json.load(open("/tmp/am-auth-me.json"))
print("mode:", me.get("mode"))
print("role:", me.get("role"))
print("canWrite:", me.get("canWrite"))
print("email:", me.get("email"))
if not me.get("canWrite"):
    print("FAIL: canWrite is false — grant director|campaign_lead on org")
    sys.exit(2)
print("OK auth/me")
PY

# Minimal allocate attempt (may fail on over-allocation; 201 or 409 with auth is success for auth path)
code=$(curl -sS -o /tmp/am-alloc.json -w "%{http_code}" -X POST "$BASE_URL/allocations" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"campaignKey":"hacker-dojo-420k","programKey":"community-hardware-fund","amount":"1.00","purpose":"Director auth probe","approvedBy":"'"$EMAIL"'"}')
echo "allocate HTTP $code"
if [[ "$code" == "201" || "$code" == "409" || "$code" == "400" ]]; then
  # 401/403 would be auth failure; 400/409 are domain errors after auth passed
  if [[ "$code" == "401" || "$code" == "403" ]]; then
    cat /tmp/am-alloc.json
    exit 1
  fi
  echo "OK allocate auth path (status $code)"
else
  if [[ "$code" == "401" || "$code" == "403" ]]; then
    echo "FAIL: allocate unauthorized"
    cat /tmp/am-alloc.json
    exit 1
  fi
  echo "WARN: unexpected allocate status $code"
  cat /tmp/am-alloc.json
fi

echo "DIRECTOR AUTH VERIFY PASS"
