#!/usr/bin/env bash
# Durable named-host preflight — no secrets printed beyond "set/missing" and length.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Allocation durable host preflight ==="
echo "cwd: $ROOT"
echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

missing=0
check() {
  local name="$1" req="${2:-0}"
  if [[ -n "${!name:-}" ]]; then
    local len
    len=$(printf %s "${!name}" | wc -c | tr -d ' ')
    echo "OK   $name (set, ${len} chars)"
  else
    if [[ "$req" == "1" ]]; then
      echo "MISS $name (required for durable public host)"
      missing=$((missing + 1))
    else
      echo "—    $name (optional / set after first URL known)"
    fi
  fi
}

# Load .env.pilot if present (gitignored)
if [[ -f .env.pilot ]]; then
  echo "env_file: .env.pilot present"
  set -a
  # shellcheck disable=SC1091
  source .env.pilot
  set +a
else
  echo "env_file: .env.pilot missing (run npm run gen:env or copy .env.example)"
fi

echo "--- required production-shaped ---"
check ORG_ID 1
check DATA_FILE 1
check WEBHOOK_TOKEN 1
check PUBLIC_BASE_URL 0
check NODE_ENV 0

echo "--- director JWT (preferred) ---"
check SUPABASE_URL 0
check SUPABASE_ANON_KEY 0
check SUPABASE_SERVICE_ROLE_KEY 0

echo "--- emergency fallback ---"
check OPERATOR_TOKEN 0
echo "ALLOW_OPERATOR_TOKEN_FALLBACK=${ALLOW_OPERATOR_TOKEN_FALLBACK:-unset}"

echo "--- seed ---"
echo "SEED_ON_BOOT=${SEED_ON_BOOT:-unset}  SEED_ALLOCATE=${SEED_ALLOCATE:-unset}"

echo "--- recipe files ---"
for f in Dockerfile render.yaml railway.toml fly.toml docker-compose.yml; do
  if [[ -f "$f" ]]; then echo "OK   $f"; else echo "MISS $f"; missing=$((missing + 1)); fi
done

echo "--- docker (optional local durable) ---"
if command -v docker >/dev/null 2>&1; then
  echo "OK   docker $(docker --version 2>/dev/null | head -1)"
  if docker compose version >/dev/null 2>&1; then
    echo "OK   docker compose available"
  else
    echo "—    docker compose not available"
  fi
else
  echo "—    docker not installed (Compose path unavailable; use Render/Railway/Fly)"
fi

echo "=== End preflight (missing_required=$missing) ==="
if [[ "$missing" -gt 0 ]]; then
  echo "HINT: set missing required vars in .env.pilot or host dashboard; see docs/ALLOCATION-DURABLE-HOST.md"
  exit 1
fi
exit 0
