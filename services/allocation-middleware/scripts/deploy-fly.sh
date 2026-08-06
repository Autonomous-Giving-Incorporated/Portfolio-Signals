#!/usr/bin/env bash
# OPTIONAL: deploy allocation-middleware to Fly.io.
# Default host is Docker Compose (npm run compose:up).
# Non-interactive when DEPLOY_YES=1 or first arg is --yes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FLY=$(command -v fly || command -v flyctl || true)
if [[ -z "${FLY}" ]]; then
  export PATH="${HOME}/.fly/bin:${PATH}"
  FLY=$(command -v fly || command -v flyctl || true)
fi
if [[ -z "${FLY}" ]]; then
  echo "Install flyctl: curl -L https://fly.io/install.sh | sh"
  echo "Then: export PATH=\"\$HOME/.fly/bin:\$PATH\""
  echo "Or use Docker: npm run compose:up"
  exit 1
fi

echo "=== Pre-deploy checklist ==="
echo "App: $(grep -E '^app\s*=' fly.toml | head -1 || echo agi-allocation)"
echo "Secrets expected:"
echo "  ORG_ID=org_hacker_dojo  DATA_FILE=/data/state.json"
echo "  WEBHOOK_TOKEN  PUBLIC_BASE_URL=https://<app>.fly.dev"
echo "  SEED_ON_BOOT=1 (first deploy)  + SUPABASE_* or OPERATOR_TOKEN"
echo "One-time bootstrap: ./scripts/bootstrap-fly-pilot.sh"
echo

YES="${DEPLOY_YES:-}"
if [[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]]; then
  YES=1
fi
if [[ "${YES}" != "1" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "Continue with fly deploy? [y/N] " ans
    [[ "${ans:-}" == "y" || "${ans:-}" == "Y" ]] || { echo Aborted; exit 0; }
  else
    echo "Non-interactive shell: re-run with --yes or DEPLOY_YES=1"
    exit 1
  fi
fi

$FLY deploy
APP=$($FLY status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('Name',''))" 2>/dev/null || true)
APP=${APP:-agi-allocation}
echo
echo "Deploy requested. Smoke:"
echo "  BASE_URL=https://${APP}.fly.dev npm run pilot:smoke"
echo "Setup wizard: https://${APP}.fly.dev/setup.html"
echo "Login:        https://${APP}.fly.dev/login.html"
