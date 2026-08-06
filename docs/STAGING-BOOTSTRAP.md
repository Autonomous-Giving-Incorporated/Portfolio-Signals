# Platform Bootstrap (legacy staging frozen)

Operator guide for standing up the **AGI platform** Supabase environment without committing secrets or personal data.

**Default target:** platform ref `utdioxwiskzatwoejgiu`  
**Legacy HD staging:** `ecxkhihlbrcwpavfoaoq` — **frozen** for new tenancy; do not apply new multi-tenant work there.

## Goals

- use the suite **platform** Supabase project (not legacy HD staging);
- apply repository migrations (**operator applies migrations** — not assumed applied from this doc);
- load **synthetic** fixtures only;
- verify import gates, review actions, RLS, and storage matrix;
- wire public runtime config for the authenticated workspace;
- keep public fundraising progress on **Impact Relay** (aggregate-only Pages surface).

## Related public surface

Live donation progress, use-of-funds receipts, and event digests:

https://autogive.app/impact-relay/

Repo: https://github.com/scrimshawlife-ctrl/Impact-Relay

Platform and any remaining HD-staging environments must not publish personal CRM data. Aggregate campaign totals belong on Impact Relay after authorized reduction (for example Every.org aggregate summary → `impact-relay --every-org-aggregate`).

## Non-goals

- production import;
- real member/donor workbook load;
- committing service-role keys or encryption material;
- using Notion as CRM storage for person-level rows;
- new tenancy on legacy ref `ecxkhihlbrcwpavfoaoq`.

## Hosted platform project (canonical)

| Field | Value | Status |
|---|---|---|
| Project ref | `utdioxwiskzatwoejgiu` | OBSERVED |
| Dashboard | https://supabase.com/dashboard/project/utdioxwiskzatwoejgiu | OBSERVED |
| API host | `https://utdioxwiskzatwoejgiu.supabase.co` | OBSERVED |
| Linked to GitHub repo | Yes (operator-reported) | OBSERVED |
| Migrations applied | **Operator applies migrations** (`remote-linked` or `supabase db push`) | PENDING until operator confirms |
| Real CRM data | Not loaded | REQUIRED |
| Legacy HD staging | `ecxkhihlbrcwpavfoaoq` | **Freeze** — not for new tenancy |

Private data placement: **local workbook + platform Supabase**. See [DATA-PLACEMENT.md](DATA-PLACEMENT.md).

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

Public config template (platform host already filled in examples):

```bash
cp scripts/staging/bootstrap.env.example scripts/staging/bootstrap.env
cp scripts/staging/runtime-config.staging.example.js runtime-config.js
# set PLATFORM_SUPABASE_URL / PLATFORM_SUPABASE_ANON_KEY (platform host in examples)
```

`bootstrap.env` and `runtime-config.js` are operator-local and must not be committed.

Platform SQL (master_admin + isolation fixtures): [scripts/platform/README.md](../scripts/platform/README.md).

## Remote platform project

1. ~~Create platform Supabase project.~~ **Done** — ref `utdioxwiskzatwoejgiu` (legacy `ecxkhihlbrcwpavfoaoq` frozen).
2. Enable Auth email magic link / OTP / SSO as approved by leadership.
3. Enable MFA for privileged operators.
4. Store service-role key in a secret manager (never git, never chat logs).
5. Link and push schema (**operator applies migrations**):

```bash
supabase login
supabase link --project-ref utdioxwiskzatwoejgiu
PLATFORM_CONFIRM_PROJECT_REF=utdioxwiskzatwoejgiu \
  ./scripts/staging/apply-migrations.sh remote-linked
# or: supabase db push after link (same platform ref only)
```

6. Deploy edge function `signed-document-url` with server-only env vars.
7. Confirm Storage bucket `campaign-private` exists and is non-public (migrations).
8. Load **synthetic** fixtures only; run import-gate / RLS / storage matrix before any real workbook.
9. Bootstrap first `master_admin` for `scrimshawlife@gmail.com` via [scripts/platform/bootstrap-master-admin.sql](../scripts/platform/bootstrap-master-admin.sql) after the Auth user exists (see scripts/platform/README.md).

Run the complete hosted suite with the database URL supplied directly from the operator secret manager. The script never prints the URL and fails unless both project-ref confirmations match **platform**:

```bash
export STAGING_PROJECT_REF=utdioxwiskzatwoejgiu
export STAGING_CONFIRM_PROJECT_REF=utdioxwiskzatwoejgiu
export STAGING_DB_URL='secret-manager-value'
export EVIDENCE_FILE="$HOME/.local/state/hacker-dojo/staging-verification.json"
./scripts/staging/verify-policy-suite.sh remote-staging
unset STAGING_DB_URL
```

(Env names still say `STAGING_*` for script compatibility; expected ref value is platform `utdioxwiskzatwoejgiu`.)

Keep the evidence file outside the repository. It contains only timestamp, mode, repository commit, suite count, pass/fail state, and the explicit statement that production import remains unauthorized. The runner removes its temporary `test_set_user` security-definer helper on success or failure; synthetic role fixtures remain for operator verification.

## Browser wiring

Authenticated pages:

- Production workspace: https://autogive.app/fund-intel/workspace
- `workspace.html` / `workspace` (path as deployed)
- `import-review.html?batch=<id>`

Load public runtime config before modules:

```html
<script src="runtime-config.js"></script>
<script type="module" src="workspace.js"></script>
```

Vercel build can generate platform `runtime-config.js` from `PLATFORM_SUPABASE_URL` + `PLATFORM_SUPABASE_ANON_KEY` (anon only). **Operator** sets those env vars on the `fund-intel` project and redeploys; this doc does not assert they are already present.

## Verification gate

```yaml
project_ref: utdioxwiskzatwoejgiu
legacy_staging_ref: ecxkhihlbrcwpavfoaoq   # freeze; not for new tenancy
migrations_applied: operator_confirms      # after db push — do not assume
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
workspace_url: https://autogive.app/fund-intel/workspace
master_admin_primary: scrimshawlife@gmail.com
```

## Second platform administrator (deferred)

Primary operator `master_admin`: **scrimshawlife@gmail.com**.

Add **Qi Diaz** later via `platform_administrators` insert with rationale **≥ 12 characters** (same pattern as `scripts/platform/bootstrap-master-admin.sql`). Not part of the initial bootstrap ship.

## JCode / operator continue checklist

When continuing in an interactive IDE (for example JCode):

1. Authenticate Supabase CLI against **platform** `utdioxwiskzatwoejgiu` (not legacy).
2. **Operator applies migrations**; confirm tables `import_batches`, `import_staging_rows`, `profiles`, `clients`, `platform_administrators`.
3. Create gitignored `runtime-config.js` with platform URL + **anon** key (or rely on Vercel generator after env is set).
4. Invite Auth user; run platform master_admin SQL; enforce MFA flags in schema as required.
5. Keep Master Development List on local disk; inventory SHA-256 is in [DATA-PLACEMENT.md](DATA-PLACEMENT.md).
6. Do not promote production import until HD-OI-020 leadership gates pass.
7. Do not link or push new tenancy schema to legacy `ecxkhihlbrcwpavfoaoq`.

## Current automation access state

The repository automation is ready for non-interactive hosted verification against **platform**. A Supabase access token or an already authenticated dashboard session remains operator-owned. Absence of that credential is a hard stop, not permission to place it in Git, chat, shell history, or an evidence file.
