#!/usr/bin/env bash
# Seed-loop acceptance: allocate → proof → packet without live every.org gifts.
# Uses a disposable DATA_FILE and operator-token fallback on an ephemeral port
# so the day-to-day pilot (token fallback off) is not mutated.
#
# Usage:
#   ./scripts/seed-loop-acceptance.sh
#   BASE_PORT=8799 ./scripts/seed-loop-acceptance.sh
#
# Requires Node 22+. Loads .env.pilot for ORG_ID / optional Supabase (not required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Optional: load Supabase/webhook names from pilot env, then override host isolation vars.
if [[ -f .env.pilot ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.pilot
  set +a
fi

# Force isolation AFTER sourcing .env.pilot (which may set PORT=8787 / DATA_FILE / fallback=0).
PORT="${BASE_PORT:-8799}"
DATA_FILE="${ACCEPTANCE_DATA_FILE:-./data/hacker-dojo-acceptance-loop.json}"
PUBLIC_BASE_URL="http://127.0.0.1:${PORT}"
ORG_ID="${ORG_ID:-org_hacker_dojo}"
OPERATOR_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"

rm -f "$DATA_FILE"
export PORT DATA_FILE PUBLIC_BASE_URL ORG_ID OPERATOR_TOKEN
export NODE_ENV=production
export SEED_ON_BOOT=1
export SEED_ALLOCATE=0
export ALLOW_OPERATOR_TOKEN_FALLBACK=1
export PROOF_SLA_HOURS="${PROOF_SLA_HOURS:-72}"
# WEBHOOK_TOKEN may be required in production boot guards
export WEBHOOK_TOKEN="${WEBHOOK_TOKEN:-seed-acceptance-webhook-token-min16}"

echo "=== Seed-loop acceptance on :$PORT (data=$DATA_FILE) ==="
node src/http/server.mjs > /tmp/am-seed-loop.log 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/healthz" 2>/dev/null | grep -q 200; then
    break
  fi
  sleep 0.3
done
code=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/healthz")
test "$code" = "200" || { echo "healthz failed"; cat /tmp/am-seed-loop.log; exit 1; }
echo "OK healthz"

code=$(curl -sS -o /tmp/am-seed-alloc.json -w "%{http_code}" -X POST "http://127.0.0.1:${PORT}/allocations" \
  -H "content-type: application/json" \
  -H "x-operator-token: ${OPERATOR_TOKEN}" \
  -d '{"campaignKey":"hacker-dojo-420k","programKey":"community-hardware-fund","amount":"100.00","purpose":"Seed loop acceptance — workshop tools","approvedBy":"seed-acceptance@local"}')
test "$code" = "201" || { echo "allocate failed: $code"; cat /tmp/am-seed-alloc.json; exit 1; }
ALLOC_ID=$(python3 -c 'import json; print(json.load(open("/tmp/am-seed-alloc.json"))["id"])')
echo "OK allocate $ALLOC_ID"

code=$(curl -sS -o /tmp/am-seed-proof.json -w "%{http_code}" -X POST "http://127.0.0.1:${PORT}/proofs" \
  -H "content-type: application/json" \
  -H "x-operator-token: ${OPERATOR_TOKEN}" \
  -d "{\"allocationId\":\"${ALLOC_ID}\",\"uri\":\"https://example.com/evidence/seed-acceptance-receipt.pdf\",\"note\":\"Seed-loop acceptance proof (no live gift)\",\"attachedBy\":\"seed-acceptance@local\"}")
test "$code" = "201" || { echo "proof failed: $code"; cat /tmp/am-seed-proof.json; exit 1; }
echo "OK proof"

curl -sS "http://127.0.0.1:${PORT}/packet" -o /tmp/am-seed-packet.json
python3 - <<'PY'
import json
p = json.load(open("/tmp/am-seed-packet.json"))
assert p.get("orgId") == "org_hacker_dojo" or p.get("orgId"), p
allocs = p.get("allocations") or []
assert len(allocs) >= 1, allocs
hit = next((a for a in allocs if float(a.get("amount") or 0) >= 100), None)
assert hit is not None, allocs
assert int(hit.get("proofCount") or 0) >= 1, hit
totals = p.get("totals") or {}
assert float(totals.get("allocated") or 0) >= 100, totals
print("OK packet", "allocated=", totals.get("allocated"), "available=", totals.get("available"))
print("SEED_LOOP_ACCEPTANCE_PASS")
PY
