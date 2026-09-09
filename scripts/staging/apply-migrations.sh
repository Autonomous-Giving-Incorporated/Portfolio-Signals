#!/usr/bin/env bash
# Apply repository migrations to the local disposable Supabase stack.
# Remote application is disabled; see docs/IR-TARGETED-RELEASE.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required" >&2
  exit 1
fi

MODE="${1:-local}"

case "$MODE" in
  local)
    echo "Starting local stack and resetting database from migrations..."
    supabase start
    supabase db reset
    echo "Local migrations applied."
    ;;
  remote-linked)
    # STAGING_CONFIRM_PROJECT_REF alone cannot approve history reconciliation.
    echo "Remote push disabled: use the reviewed targeted release procedure in docs/IR-TARGETED-RELEASE.md" >&2
    exit 1
    ;;
  *)
    echo "Usage: $0 [local|remote-linked]" >&2
    exit 1
    ;;
esac
