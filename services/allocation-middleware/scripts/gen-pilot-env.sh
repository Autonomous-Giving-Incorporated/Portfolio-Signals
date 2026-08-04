#!/usr/bin/env bash
# Generate a pilot env file (tokens not committed). Usage:
#   ./scripts/gen-pilot-env.sh [.env.pilot]
set -euo pipefail
OUT="${1:-.env.pilot}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$OUT" ]]; then
  echo "Refusing to overwrite existing $OUT"
  exit 1
fi

WEBHOOK_TOKEN=$(openssl rand -hex 24)
OPERATOR_TOKEN=$(openssl rand -hex 24)

cat >"$OUT" <<EOF
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) — do not commit
NODE_ENV=production
ORG_ID=org_hacker_dojo
HOST_PORT=8787
DATA_FILE=/data/state.json
PUBLIC_BASE_URL=http://127.0.0.1:8787
WEBHOOK_TOKEN=${WEBHOOK_TOKEN}
OPERATOR_TOKEN=${OPERATOR_TOKEN}
ALLOW_OPERATOR_TOKEN_FALLBACK=1
SEED_ON_BOOT=1
SEED_ALLOCATE=1
PROOF_SLA_HOURS=72
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
EOF

echo "Wrote $OUT"
echo "Next:"
echo "  docker compose --env-file $OUT up -d --build"
echo "  BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke"
echo "For a public host, set PUBLIC_BASE_URL to your https URL before compose up."
