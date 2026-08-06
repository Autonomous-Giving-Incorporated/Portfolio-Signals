#!/usr/bin/env bash
# Generate browser runtime-config for Vercel static publish.
# With PLATFORM_* / STAGING_* env: full Supabase URL + anon key.
# Without env: public-only stub (tenant slug only) so static portal still deploys.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${PLATFORM_SUPABASE_URL:-${STAGING_SUPABASE_URL:-}}" || -z "${PLATFORM_SUPABASE_ANON_KEY:-${STAGING_SUPABASE_ANON_KEY:-}}" ]]; then
  echo "No Supabase env on this build — writing public-only runtime-config stub"
  cat > runtime-config.js <<'EOF'
// Public static deploy without Supabase credentials (workspace login needs PLATFORM_* env).
window.AGI_FUND_INTEL_CONFIG = {
  defaultClientSlug: "hacker-dojo",
  productName: "Fund Intel",
  platformName: "Autonomously Giving Incorporated",
};
window.HACKER_DOJO_CONFIG = window.AGI_FUND_INTEL_CONFIG;
window.__HD_CONFIG__ = window.AGI_FUND_INTEL_CONFIG;
EOF
  chmod 600 runtime-config.js
  exit 0
fi

node scripts/staging/generate-runtime-config.mjs
echo "runtime-config.js generated for Vercel static publish"
