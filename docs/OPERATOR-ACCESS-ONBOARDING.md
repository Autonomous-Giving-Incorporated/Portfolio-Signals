# Operator & director access onboarding

Repeatable path for platform people access on **Portfolio Signals** workspace.
No improvised SQL: use scripts under `scripts/platform/` only.

**Platform:** Supabase `utdioxwiskzatwoejgiu`  
**Workspace:** https://autogive.app/portfolio-signals/workspace  
**Design:** [docs/superpowers/specs/2026-08-06-operator-access-onboarding-design.md](superpowers/specs/2026-08-06-operator-access-onboarding-design.md)

## Authority gates

```yaml
production_import: BLOCKED
service_role_on_vercel: PROHIBITED
secrets_in_git: PROHIBITED
legacy_staging_for_new_people: PROHIBITED  # ecxkhihlbrcwpavfoaoq frozen
```

- `master_admin` = row in `platform_administrators` (not an `app_role`).
- Platform admin does **not** imply tenant-private campaign access.
- Directors need `client_memberships` + (for privileged roles) `mfa_enforced = true`.

## Prerequisites

1. Dashboard access to platform project `utdioxwiskzatwoejgiu`.
2. Migrations applied (current main).
3. Auth URL allowlist includes:
   - `https://autogive.app/portfolio-signals/workspace`
   - `https://autogive.app/portfolio-signals/workspace.html`
4. Optional: custom SMTP for Auth email volume; if rate-limited, use Dashboard invite / generate_link.

## MFA policy

1. User enrolls MFA in Supabase Auth (TOTP).
2. Operator confirms enrollment in Dashboard → Authentication → Users.
3. Only then run `set-mfa-enforced.sql` with `desired_mfa_enforced := true`.
4. Never reverse this order.

## Flow A — additional master_admin

1. Authentication → Users → Invite (or confirm existing user). Copy UUID.
2. Edit and run `scripts/platform/ensure-profile.sql` (UUID + real display name).
3. User enrolls MFA; operator confirms.
4. Edit and run `scripts/platform/set-mfa-enforced.sql` (`true`).
5. Edit and run `scripts/platform/grant-master-admin.sql` (rationale ≥ 12 characters).
6. Edit and run `scripts/platform/verify-operator-access.sql`.
7. Magic-link login to workspace.
8. Confirm: Platform admin visible; `is_master_admin` path works; without client membership, no private campaign records for other tenants.
9. Optionally run `scripts/platform/verify-platform-isolation.sql` after multi-tenant changes.

### Flow A verify checklist

- [ ] `platform_administrators`: active, `revoked_at` null
- [ ] Workspace login succeeds
- [ ] Platform admin section visible
- [ ] Isolation: no private tenant data without membership
- [ ] (Optional) Privileged action fails if `mfa_enforced` false

## Flow B — first director for a client

Client shell must already exist (`provisioning` or `active`). Creating shells is commercial lifecycle (slice B) via Platform admin / `provision_client`.

1. Invite/confirm Auth user; copy UUID.
2. `ensure-profile.sql` → MFA enroll → `set-mfa-enforced.sql` true.
3. Attach membership (preferred — audited RPC while logged in as master_admin with MFA):
   - New client: Platform admin UI or `provision_client` with `p_initial_director`.
   - Existing client: workspace membership UI or `set_client_membership(client_id, user_id, 'director', true, rationale)`.
4. `verify-operator-access.sql` with `target_client_id` set (e.g. `org_hacker_dojo`).
5. Login: client listed; director can open Brand / membership for that client; not master_admin unless Flow A also applied.

### Flow B verify checklist

- [ ] `client_memberships` active, role `director`
- [ ] Workspace lists that client only (plus other legitimate memberships)
- [ ] Director UI for that client works
- [ ] Not platform admin unless Flow A
- [ ] `mfa_enforced` true

## First master_admin (historical)

Use `scripts/platform/bootstrap-master-admin.sql` once for the initial operator. All later admins use Flow A.

## Revoke / offboard

1. `revoke-master-admin.sql` if they had platform admin.
2. Deactivate client memberships via `set_client_membership(..., active := false, ...)` when possible.
3. Optionally deactivate profile (operator SQL outside this pack if needed).
4. If they had secret-manager access, rotate service-role and related secrets.
5. Do not leave elevated `mfa_enforced` or admin rows active after offboarding intent.

## Failure modes

| Symptom | Response |
| --- | --- |
| Placeholder UUID left in script | Script raises; replace and re-run |
| Auth user missing | Invite first |
| Profile missing | `ensure-profile.sql` |
| `mfa_required` / enforced MFA errors | Complete MFA path |
| Cross-tenant private data visible | Stop; isolation regression |
| Rate-limited magic link email | Dashboard generate_link / custom SMTP |

## Next: commercial client shell

After people access works, provision and activate a client:
[COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md).

## Related

- [scripts/platform/README.md](../scripts/platform/README.md)
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md)
- [CURRENT-STATE.md](CURRENT-STATE.md)
- [PLATFORM.md](PLATFORM.md)
- [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md)
- [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md)
