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
    expected_ref="ecxkhihlbrcwpavfoaoq"
    linked_ref="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
    if [[ "${STAGING_CONFIRM_PROJECT_REF:-}" != "$expected_ref" || "$linked_ref" != "$expected_ref" ]]; then
      echo "Remote migration requires a linked staging project and STAGING_CONFIRM_PROJECT_REF=$expected_ref" >&2
      exit 1
    fi
    echo "Pushing migrations to confirmed staging project $expected_ref..."
    supabase db push
    ;;
  *)
    echo "Usage: $0 [local|remote-linked]" >&2
    exit 1
    ;;
esac
