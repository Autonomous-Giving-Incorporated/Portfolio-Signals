#!/usr/bin/env bash
set -euo pipefail
check() {
  local name="$1" req="${2:-0}"
  if [[ -n "${!name:-}" ]]; then
    local len; len=$(printf %s "${!name}" | wc -c | tr -d ' ')
    echo "OK   $name (set, ${len} chars)"
  else
    if [[ "$req" == "1" ]]; then echo "MISS $name (required for production/pilot host)"
    else echo "—    $name (optional)"; fi
  fi
}
echo "=== Allocation middleware env checklist ==="
echo "NODE_ENV=${NODE_ENV:-development}"
check ORG_ID 1
check DATA_FILE 1
check PUBLIC_BASE_URL 1
check WEBHOOK_TOKEN 1
check OPERATOR_TOKEN 0
check SUPABASE_URL 0
check SUPABASE_ANON_KEY 0
check SUPABASE_SERVICE_ROLE_KEY 0
check SEED_ON_BOOT 0
check SEED_ALLOCATE 0
check PROOF_SLA_HOURS 0
check PORT 0
echo "=== End ==="
