#!/usr/bin/env bash
# Read-only probe: onboarding pack tables/Edge + people MFA readiness.
# Requires PLATFORM_SUPABASE_URL + PLATFORM_SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
# from a secret manager / gitignored bootstrap.env — never commit keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f scripts/staging/bootstrap.env ]]; then
  # shellcheck disable=SC1091
  set -a && source scripts/staging/bootstrap.env && set +a
fi

U="${PLATFORM_SUPABASE_URL:-${SUPABASE_URL:-}}"
K="${PLATFORM_SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SECRET_KEY:-}}}"
if [[ -z "$U" || -z "$K" ]]; then
  echo "ERROR: set PLATFORM_SUPABASE_URL and PLATFORM_SUPABASE_SECRET_KEY" >&2
  exit 1
fi
for required in PRIMARY_MASTER_ADMIN_EMAIL SECOND_MASTER_ADMIN_EMAIL TENANT_DIRECTOR_EMAIL; do
  if [[ -z "${!required:-}" ]]; then
    echo "ERROR: set $required from the restricted operator registry" >&2
    exit 1
  fi
done
U="${U%/}"

hdr=(-H "apikey: $K" -H "Authorization: Bearer $K")

echo "=== Onboarding pack (platform) ==="
for t in client_onboarding_packs client_onboarding_documents; do
  code=$(curl -sS -o /tmp/pack-rest.json -w "%{http_code}" "${hdr[@]}" \
    "$U/rest/v1/$t?select=*&limit=1")
  echo "REST $t HTTP $code"
done
for f in upload-onboarding-document onboarding-document-url; do
  opt=$(curl -sS -o /dev/null -w "%{http_code}" -X OPTIONS "${hdr[@]}" "$U/functions/v1/$f")
  post=$(curl -sS -o /tmp/fn.json -w "%{http_code}" -X POST \
    -H "apikey: $K" -H "Content-Type: application/json" -d '{}' \
    "$U/functions/v1/$f")
  echo "function $f OPTIONS $opt POST(no-user-jwt) $post"
done

echo
echo "=== People (auth + profile flags) ==="
python3 - <<'PY'
import json, os, urllib.request
url = os.environ.get("PLATFORM_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
url = url.rstrip("/")
key = (
    os.environ.get("PLATFORM_SUPABASE_SECRET_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SECRET_KEY")
)
headers = {"apikey": key, "Authorization": f"Bearer {key}"}
req = urllib.request.Request(url + "/auth/v1/admin/users?page=1&per_page=50", headers=headers)
with urllib.request.urlopen(req, timeout=60) as r:
    users = json.loads(r.read().decode()).get("users") or []
want = {
    os.environ["PRIMARY_MASTER_ADMIN_EMAIL"].lower(): "primary master_admin",
    os.environ["SECOND_MASTER_ADMIN_EMAIL"].lower(): "second master_admin",
    os.environ["TENANT_DIRECTOR_EMAIL"].lower(): "reference-tenant director only",
}
for email, role in want.items():
    u = next((x for x in users if (x.get("email") or "").lower() == email), None)
    if not u:
        print(f"{email}: AUTH_MISSING ({role})")
        continue
    uid = u["id"]
    factors = u.get("factors") or []
    verified = [f for f in factors if f.get("status") == "verified"]
    def rest(path):
        rq = urllib.request.Request(url + path, headers=headers)
        with urllib.request.urlopen(rq, timeout=30) as rr:
            return json.loads(rr.read().decode())
    prof = rest(f"/rest/v1/profiles?id=eq.{uid}&select=active,mfa_enforced,display_name")
    adm = rest(f"/rest/v1/platform_administrators?user_id=eq.{uid}&select=active")
    mem = rest(f"/rest/v1/client_memberships?user_id=eq.{uid}&select=client_id,role,active")
    p = prof[0] if prof else {}
    print(
        f"{email}: {role} | confirmed={bool(u.get('email_confirmed_at'))} "
        f"last_sign_in={u.get('last_sign_in_at') or 'never'} "
        f"totp_verified={len(verified)} mfa_enforced={p.get('mfa_enforced')} "
        f"profile_active={p.get('active')} master_admin={bool(adm and adm[0].get('active'))} "
        f"memberships={mem}"
    )
    if len(verified) == 0 and p.get("mfa_enforced"):
        print("  note: mfa_enforced true but no verified Auth factors listed (legacy/app flag only)")
    elif len(verified) > 0 and not p.get("mfa_enforced"):
        print("  NEXT: run set-mfa-enforced.sql with desired_mfa_enforced=true for this user")
    elif len(verified) == 0 and not p.get("mfa_enforced"):
        print("  NEXT: open operator-local magic link → workspace → enroll TOTP")
    elif len(verified) > 0 and p.get("mfa_enforced"):
        print("  ready for MFA workspace session / pack dry-run")
PY

echo
echo "=== Next human steps ==="
echo "1. Qi/Ed: open scripts/platform/.onboarding-invite-links.md action_link (gitignored)"
echo "2. Enroll TOTP in Auth / workspace MFA UI"
echo "3. Operator: set-mfa-enforced.sql true for each UUID"
echo "4. MFA session: Workspace → Onboarding pack → 5 required + park xlsx"
echo "5. Record CURRENT-STATE client_onboarding_pack.status: OBSERVED"
echo "Done."
