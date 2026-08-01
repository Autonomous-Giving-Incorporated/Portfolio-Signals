# Staging Bootstrap

Operator guide for standing up a **staging** environment without committing secrets or personal data.

## Goals

- separate staging project from production;
- apply repository migrations;
- load **synthetic** fixtures only;
- verify import gates, review actions, RLS, and storage matrix;
- wire public runtime config for the authenticated workspace;
- keep public fundraising progress on **Impact Relay** (aggregate-only Pages surface).

## Related public surface

Live donation progress, use-of-funds receipts, and event digests:

https://scrimshawlife-ctrl.github.io/Impact-Relay/

Repo: https://github.com/scrimshawlife-ctrl/Impact-Relay

Staging of Hacker-Dojo must not publish personal CRM data. Aggregate campaign totals belong on Impact Relay after authorized reduction (for example Every.org aggregate summary → `impact-relay --every-org-aggregate`).

## Non-goals

- production import;
- real member/donor workbook load;
- committing service-role keys or encryption material;
- using Notion as CRM storage for person-level rows.

## Hosted staging project (current)

| Field | Value | Status |
|---|---|---|
| Project ref | `ecxkhihlbrcwpavfoaoq` | OBSERVED |
| Dashboard | https://supabase.com/dashboard/project/ecxkhihlbrcwpavfoaoq | OBSERVED |
| API host | `https://ecxkhihlbrcwpavfoaoq.supabase.co` | OBSERVED |
| Linked to GitHub repo | Yes (operator-reported) | OBSERVED |
| Migrations applied | 10 migrations at `e3db304e9f992adbf11398a47a2a00e356d22abf` | VERIFIED |
| Auth hardening | Public signup disabled; email confirmation and TOTP MFA enabled | VERIFIED |
| Edge Function | `signed-document-url` deployed | VERIFIED |
| Synthetic hosted policy suite | Seven repository SQL files | PASS |
| Overall staging readiness | Backups unavailable; SSL enforcement off; DB network unrestricted | FAIL |
| Real CRM data | Not loaded | REQUIRED |

Private data placement: **local workbook + this Supabase project**. See [DATA-PLACEMENT.md](DATA-PLACEMENT.md).

## Prerequisites

| Tool | Notes |
|---|---|
| Supabase CLI | pin `2.31.8` to match CI |
| `psql` | for fixture and policy scripts |
| Node 22.18.x | workbook parser validation |
| Secret manager | service-role and encryption keys only |

## Script entrypoints

```bash
./scripts/staging/bootstrap.sh
./scripts/staging/apply-migrations.sh local
./scripts/staging/load-synthetic-fixtures.sh
./scripts/staging/verify-policy-suite.sh local
```

Public config template:

```bash
cp scripts/staging/bootstrap.env.example scripts/staging/bootstrap.env
cp scripts/staging/runtime-config.staging.example.js runtime-config.js
# set SUPABASE_URL / anon key (staging host already filled in examples)
```

`bootstrap.env` and `runtime-config.js` are operator-local and must not be committed.

## Remote staging project

1. ~~Create a new Supabase project named for staging.~~ **Done** — ref `ecxkhihlbrcwpavfoaoq`.
2. Enable Auth email OTP / SSO as approved by leadership.
3. Enable MFA for privileged operators.
4. Store service-role key in a secret manager (never git, never chat logs).
5. Link and push schema:

```bash
supabase login
supabase link --project-ref ecxkhihlbrcwpavfoaoq
STAGING_CONFIRM_PROJECT_REF=ecxkhihlbrcwpavfoaoq \
  ./scripts/staging/apply-migrations.sh remote-linked
# or: supabase db push
```

6. Deploy edge function `signed-document-url` with server-only env vars.
7. Confirm Storage bucket `campaign-private` exists and is non-public (migrations).
8. Load **synthetic** fixtures only; run import-gate / RLS / storage matrix before any real workbook.

Run the complete hosted suite with the database URL supplied directly from the operator secret manager. The script never prints the URL and fails unless both project-ref confirmations match staging:

```bash
export STAGING_PROJECT_REF=ecxkhihlbrcwpavfoaoq
export STAGING_CONFIRM_PROJECT_REF=ecxkhihlbrcwpavfoaoq
export STAGING_DB_URL='secret-manager-value'
export EVIDENCE_FILE="$HOME/.local/state/hacker-dojo/staging-verification.json"
./scripts/staging/verify-policy-suite.sh remote-staging
unset STAGING_DB_URL
```

Keep the runner's raw evidence file outside the repository. A reviewed, secret-free projection receipt may be mirrored under `out/audit/`; it contains only bounded status and provenance. The runner removes its temporary `test_set_user` security-definer helper on success or failure; synthetic role fixtures remain for operator verification.

## Browser wiring

Authenticated pages:

- `workspace.html`
- `import-review.html?batch=<id>`

Load public runtime config before modules:

```html
<script src="runtime-config.js"></script>
<script type="module" src="workspace.js"></script>
```

## Verification gate

```yaml
project_ref: ecxkhihlbrcwpavfoaoq
migrations_applied: true          # after db push
synthetic_fixtures_only: true
import_gates: true
import_review_actions: true
six_role_rls: true
storage_matrix: true
atomic_import_creation: true
session_expiration_and_revocation: true
signed_document_access_audit: true
service_role_in_git: false
production_data: false
master_development_list_loaded: false
hosted_backups_available: false
ssl_enforcement: false
database_network_restricted: false
staging_readiness: FAIL
```

The application-control checks above were observed on 2026-08-01 against repository commit
`e3db304e9f992adbf11398a47a2a00e356d22abf`. The complete projection-only receipt is
[`out/audit/hd-oi-019-staging-readiness.latest.json`](../out/audit/hd-oi-019-staging-readiness.latest.json).
This evidence does not authorize production activation or real-data import.

## JCode / operator continue checklist

When continuing in an interactive IDE (for example JCode):

1. Verify the staging project identity and current `out/audit/` receipt.
2. Use a migration dry-run before any later schema change; the current 10 migrations are applied.
3. Create gitignored `runtime-config.js` with URL + **anon** key.
4. Provision operator profiles with roles; enforce MFA flags in schema.
5. Keep Master Development List on local disk; inventory SHA-256 is in [DATA-PLACEMENT.md](DATA-PLACEMENT.md).
6. Do not promote production import until HD-OI-020 leadership gates pass.

## Current automation access state

The repository automation is ready for non-interactive hosted verification. A Supabase access token or an already authenticated dashboard session remains operator-owned. Absence of that credential is a hard stop, not permission to place it in Git, chat, shell history, or an evidence file.

Provenance: Notion Sprint 001 Hub + Loop 805 Slice HD-OI-019 + Hash: e3db304e9f992adbf11398a47a2a00e356d22abf
