#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v fly >/dev/null 2>&1 && ! command -v flyctl >/dev/null 2>&1; then
  echo "Install flyctl: https://fly.io/docs/hands-on/install-flyctl/"
  exit 1
fi
FLY=$(command -v fly || command -v flyctl)
echo "=== Pre-deploy checklist ==="
echo "Secrets: ORG_ID=org_hacker_dojo DATA_FILE=/data/state.json WEBHOOK_TOKEN PUBLIC_BASE_URL"
echo "  SEED_ON_BOOT=1 (first deploy) SUPABASE_* or OPERATOR_TOKEN"
echo "One-time: fly apps create; fly volumes create am_data --size 1 --region sjc; fly secrets set ..."
read -r -p "Continue with fly deploy? [y/N] " ans
[[ "${ans:-}" == "y" || "${ans:-}" == "Y" ]] || { echo Aborted; exit 0; }
$FLY deploy
echo "Then: BASE_URL=https://<app>.fly.dev npm run pilot:smoke"
