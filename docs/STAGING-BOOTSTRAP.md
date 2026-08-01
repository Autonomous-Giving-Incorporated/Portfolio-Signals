# Staging Bootstrap

Operator guide for standing up a **staging** environment without committing secrets or personal data.

## Goals

- separate staging project from production;
- apply repository migrations;
- load **synthetic** fixtures only;
- verify import gates, review actions, RLS, and storage matrix;
- wire public runtime config for the authenticated workspace.

## Non-goals

- production import;
- real member/donor workbook load;
- committing service-role keys or encryption material.

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
./scripts/staging/verify-policy-suite.sh
```

Public config template:

```bash
cp scripts/staging/bootstrap.env.example scripts/staging/bootstrap.env
cp scripts/staging/runtime-config.staging.example.js runtime-config.js
# edit public URL + anon key only
```

`bootstrap.env` and `runtime-config.js` are operator-local and must not be committed.

## Remote staging project

1. Create a new Supabase project named for staging.
2. Enable Auth email OTP / SSO as approved by leadership.
3. Enable MFA for privileged operators.
4. Store service-role key in a secret manager.
5. `supabase link --project-ref <staging-ref>` using operator credentials.
6. `./scripts/staging/apply-migrations.sh remote-linked`
7. Deploy edge function `signed-document-url` with server-only env vars.
8. Configure private bucket policies by applying migrations (includes `campaign-private`).

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
migrations_applied: true
synthetic_fixtures_only: true
import_gates: true
import_review_actions: true
six_role_rls: true
storage_matrix: true
service_role_in_git: false
production_data: false
```
