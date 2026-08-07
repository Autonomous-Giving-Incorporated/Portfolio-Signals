# Platform operator SQL

Bootstrap and isolation checks for A.G.I. platform administration.

**Never put service-role keys, DB passwords, or other secrets in this directory or in chat logs.**

## Prerequisites

- Migrations applied through at least `012_agi_tenant_foundation.sql` (creates `clients`, `platform_administrators`, seeds `org_hacker_dojo`).
- Supabase Dashboard access with SQL Editor (postgres) or `psql` as a privileged role.

## 1. Invite the operator

1. Open Supabase Dashboard → **Authentication** → **Users**.
2. Invite **`scrimshawlife@gmail.com`** (or create the user via approved Auth flow).
3. Confirm the user exists and copy their **User UUID**.

## 2. Bootstrap master_admin

1. Open `bootstrap-master-admin.sql`.
2. Replace `00000000-0000-0000-0000-000000000000` with the operator Auth UUID (inside the `DO` block).
3. Run the script in the SQL Editor as postgres.
4. Confirm:
   - `org_hacker_dojo` row is returned.
   - `platform_administrators` shows an active row for that user (`revoked_at` null).

What the script does:

| Step | Table | Notes |
|------|--------|--------|
| Ensure profile | `public.profiles` | Requires `display_name` (schema 001); sets `active`, optional `mfa_enforced` |
| Grant platform admin | `public.platform_administrators` | This is master_admin; **not** an `app_role` value |

Re-running is safe: conflict updates re-activate and clear `revoked_at`.

## 3. Auth redirect URLs

In Supabase Dashboard → **Authentication** → **URL configuration**, set allowed redirect URLs for the Fund-Intel workspace:

- `https://autogive.app/portfolio-signals/workspace`
- `https://autogive.app/portfolio-signals/workspace.html`

Also set Site URL per environment policy. Do not commit project-specific secrets.

## 4. Verify platform isolation

1. Run `verify-platform-isolation.sql` as postgres.
2. Expect:
   - `org_hacker_dojo` present (`reference_tenant = true` from migration 012).
   - `org_platform_isolation` inserted if missing (`reference_tenant = false`).
   - Notice: `platform isolation fixtures present`.
3. **Manual RLS check** (recommended before multi-tenant production use):
   - As a director-only member of one tenant, `select * from public.clients` must not return the other tenant.
   - Use patterns in `supabase/tests/007_agi_tenant_foundation.sql` (`set local role authenticated` + JWT `sub`).
   - Master admins intentionally see all clients via `is_master_admin()`; isolation is for non-platform members.

## 5. What not to do

- Do not paste the **service role** key into README, SQL, git, or tickets.
- Do not commit real Auth UUIDs into this repo (keep placeholders).
- Do not load production CRM data via these scripts.
- Do not treat `platform_administrators` as tenant membership; platform authority does not imply client-private record access by itself (see migration 012 comments).

## Related docs

- `docs/STAGING-BOOTSTRAP.md` — staging project bootstrap
- `docs/PLATFORM.md` / `docs/PLATFORM-CONFORMANCE.md` — platform expectations
- `supabase/migrations/012_agi_tenant_foundation.sql` — schema source of truth
- `supabase/tests/007_agi_tenant_foundation.sql` — automated isolation patterns
