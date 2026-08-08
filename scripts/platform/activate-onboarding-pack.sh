#!/usr/bin/env bash
# Apply Client Onboarding Pack schema + Edge functions to platform Supabase.
# Requires: supabase login (or SUPABASE_ACCESS_TOKEN) and project link rights.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REF="${PLATFORM_CONFIRM_PROJECT_REF:-utdioxwiskzatwoejgiu}"

echo "=== Activate onboarding pack on platform ${REF} ==="

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  if ! supabase projects list >/dev/null 2>&1; then
    echo "ERROR: run 'supabase login' or export SUPABASE_ACCESS_TOKEN" >&2
    exit 1
  fi
fi

echo "Linking project…"
supabase link --project-ref "$REF"

echo "Pushing migrations…"
if [[ -x ./scripts/staging/apply-migrations.sh ]]; then
  PLATFORM_CONFIRM_PROJECT_REF="$REF" ./scripts/staging/apply-migrations.sh remote-linked
else
  supabase db push --linked
fi

echo "Deploying Edge functions…"
supabase functions deploy upload-onboarding-document --project-ref "$REF"
supabase functions deploy onboarding-document-url --project-ref "$REF"

echo "Verify REST (service role env if available)…"
if [[ -n "${SUPABASE_URL:-${PLATFORM_SUPABASE_URL:-}}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-${PLATFORM_SUPABASE_SECRET_KEY:-}}" ]]; then
  U="${SUPABASE_URL:-$PLATFORM_SUPABASE_URL}"
  K="${SUPABASE_SERVICE_ROLE_KEY:-$PLATFORM_SUPABASE_SECRET_KEY}"
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $K" -H "Authorization: Bearer $K" \
    "$U/rest/v1/client_onboarding_packs?select=client_id&limit=1")
  echo "client_onboarding_packs HTTP $code (expect 200)"
  for f in upload-onboarding-document onboarding-document-url; do
    fcode=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
      -H "apikey: $K" "$U/functions/v1/$f")
    echo "function $f OPTIONS HTTP $fcode"
  done
else
  echo "Skip REST verify (no service role in env)"
fi

echo "=== Done. Update docs/CURRENT-STATE.md after MFA dry-run. ==="
