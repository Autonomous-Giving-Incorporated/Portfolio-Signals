#!/usr/bin/env bash
set -euo pipefail
node scripts/staging/generate-runtime-config.mjs
echo "runtime-config.js generated for Vercel static publish"
