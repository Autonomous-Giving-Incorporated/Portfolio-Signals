#!/usr/bin/env bash
# Apply repository migrations to the local disposable Supabase stack.
# For linked remote staging projects, operators should use `supabase db push`
# after `supabase link` with credentials from a secret manager.
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
    echo "Pushing migrations to the currently linked Supabase project..."
    echo "Confirm this is STAGING, not production, before continuing."
    read -r -p "Type staging-confirmed to continue: " confirm
    if [[ "$confirm" != "staging-confirmed" ]]; then
      echo "Aborted."
      exit 1
    fi
    supabase db push
    ;;
  *)
    echo "Usage: $0 [local|remote-linked]" >&2
    exit 1
    ;;
esac
