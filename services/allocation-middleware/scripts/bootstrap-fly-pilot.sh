#!/usr/bin/env bash
# OPTIONAL host: bootstrap Hacker Dojo allocation pilot on Fly.io.
# Default pilot path is Docker Compose (npm run compose:up).
# Docs: docs/ALLOCATION-HOSTING-OPTIONS.md §4
#
# Prerequisites: flyctl installed + `fly auth login` (or FLY_API_TOKEN).
# macOS Gatekeeper: xattr -d com.apple.quarantine ~/.fly/bin/flyctl
#
# Optional env before run:
#   FLY_APP=agi-allocation
#   FLY_REGION=sjc
#   WEBHOOK_TOKEN=...   (generated if unset)
#   OPERATOR_TOKEN=...  (generated if unset; pilot-grade)
#   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  (preferred for directors)
#   SKIP_DEPLOY=1       (only provision secrets)
#   SKIP_SMOKE=1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "NOTE: Fly is an optional host. Docker Compose remains the default (npm run compose:up)."

FLY=$(command -v fly || command -v flyctl || true)
if [[ -z "${FLY}" ]]; then
  export PATH="${HOME}/.fly/bin:${PATH}"
  FLY=$(command -v fly || command -v flyctl || true)
fi
if [[ -z "${FLY}" ]]; then
  echo "flyctl not found on PATH."
  echo "  Install: curl -L https://fly.io/install.sh | sh"
  echo "  Or stay on Docker: npm run gen:env && npm run compose:up"
  exit 1
fi

if ! $FLY auth whoami >/dev/null 2>&1; then
  echo "Not logged in to Fly."
  echo "  Run: fly auth login"
  echo "  Or set FLY_API_TOKEN"
  echo "  Or stay on Docker: npm run compose:up"
  exit 1
fi

APP="${FLY_APP:-agi-allocation}"
REGION="${FLY_REGION:-sjc}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://${APP}.fly.dev}"

echo "=== Bootstrap Fly pilot ==="
echo "app=${APP} region=${REGION}"
echo "whoami: $($FLY auth whoami)"

# Create app if missing
if ! $FLY apps list --json 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); raise SystemExit(0 if any(a.get('Name')=='''${APP}''' or a.get('name')=='''${APP}''' for a in apps) else 1)" 2>/dev/null; then
  # fallback without json shape assumptions
  if ! $FLY status -a "$APP" >/dev/null 2>&1; then
    echo "Creating app ${APP}..."
    $FLY apps create "$APP" --org personal 2>/dev/null || $FLY apps create "$APP" || true
  fi
else
  echo "App ${APP} already exists (or list check inconclusive)"
fi

# Ensure fly.toml app name matches
if grep -q '^app\s*=' fly.toml; then
  # keep committed name; warn if mismatch
  TOML_APP=$(grep -E '^app\s*=' fly.toml | head -1 | sed 's/.*=\s*"\?\([^"]*\)"\?/\1/')
  if [[ -n "${TOML_APP}" && "${TOML_APP}" != "${APP}" ]]; then
    echo "Note: fly.toml app=${TOML_APP}; using FLY_APP=${APP} for secrets/status. Align if needed."
  fi
fi

# Volume
if ! $FLY volumes list -a "$APP" 2>/dev/null | grep -q am_data; then
  echo "Creating volume am_data in ${REGION}..."
  $FLY volumes create am_data --size 1 --region "$REGION" -a "$APP" --yes 2>/dev/null \
    || $FLY volumes create am_data --size 1 --region "$REGION" -a "$APP"
else
  echo "Volume am_data present"
fi

# Tokens
if [[ -z "${WEBHOOK_TOKEN:-}" ]]; then
  WEBHOOK_TOKEN=$(openssl rand -hex 24)
  echo "Generated WEBHOOK_TOKEN (store securely; shown once in fly secrets only)"
fi
if [[ -z "${OPERATOR_TOKEN:-}" && -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  OPERATOR_TOKEN=$(openssl rand -hex 24)
  echo "Generated OPERATOR_TOKEN (pilot fallback; prefer Supabase director login)"
fi

SECRET_ARGS=(
  "ORG_ID=org_hacker_dojo"
  "DATA_FILE=/data/state.json"
  "PUBLIC_BASE_URL=${PUBLIC_BASE_URL}"
  "WEBHOOK_TOKEN=${WEBHOOK_TOKEN}"
  "SEED_ON_BOOT=1"
  "PROOF_SLA_HOURS=72"
)

if [[ -n "${OPERATOR_TOKEN:-}" ]]; then
  SECRET_ARGS+=("OPERATOR_TOKEN=${OPERATOR_TOKEN}" "ALLOW_OPERATOR_TOKEN_FALLBACK=1")
fi
if [[ -n "${SUPABASE_URL:-}" ]]; then
  SECRET_ARGS+=("SUPABASE_URL=${SUPABASE_URL}")
fi
if [[ -n "${SUPABASE_ANON_KEY:-}" ]]; then
  SECRET_ARGS+=("SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}")
fi
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SECRET_ARGS+=("SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}")
fi

echo "Setting secrets (values not printed)..."
$FLY secrets set -a "$APP" "${SECRET_ARGS[@]}"

if [[ "${SKIP_DEPLOY:-0}" == "1" ]]; then
  echo "SKIP_DEPLOY=1 — secrets set; not deploying"
  exit 0
fi

echo "Deploying..."
DEPLOY_YES=1 bash scripts/deploy-fly.sh --yes

if [[ "${SKIP_SMOKE:-0}" != "1" ]]; then
  echo "Waiting for health..."
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "${PUBLIC_BASE_URL}/healthz" >/dev/null 2>&1; then
      break
    fi
    sleep 3
  done
  BASE_URL="${PUBLIC_BASE_URL}" bash scripts/pilot-smoke.sh
fi

echo
echo "=== Pilot host ready ==="
echo "UI:     ${PUBLIC_BASE_URL}/"
echo "Login:  ${PUBLIC_BASE_URL}/login.html"
echo "Setup:  ${PUBLIC_BASE_URL}/setup.html"
echo "Webhook:${PUBLIC_BASE_URL}/webhooks/every-org?token=<WEBHOOK_TOKEN>"
echo
echo "Next:"
echo "  1. Director membership on org_hacker_dojo (see docs/ALLOCATION-DIRECTOR-LOGIN.md)"
echo "  2. every.org admin → paste webhook from /setup.html"
echo "  3. After stable seed: fly secrets set SEED_ON_BOOT=0 -a ${APP}"
echo
if [[ -n "${OPERATOR_TOKEN:-}" ]]; then
  echo "OPERATOR_TOKEN was set for pilot allocate fallback (keep offline; do not commit)."
fi
