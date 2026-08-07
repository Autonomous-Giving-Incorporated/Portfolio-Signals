# Commercial client lifecycle

Operator path for **provision → publish configuration → activate** on Portfolio Signals (platform Supabase).

**Platform:** `utdioxwiskzatwoejgiu`  
**Workspace:** https://autogive.app/portfolio-signals/workspace  
**People path (prereq):** [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md)  
**Design:** [docs/superpowers/specs/2026-08-06-commercial-client-lifecycle-design.md](superpowers/specs/2026-08-06-commercial-client-lifecycle-design.md)

## Authority gates

```yaml
production_import: BLOCKED
service_role_on_vercel: PROHIBITED
secrets_in_git: PROHIBITED
legacy_staging_for_new_people: PROHIBITED
```

- Only **master_admin** (MFA) provisions and activates.
- Only client **director** (MFA) saves/publishes Brand & content for that client.
- Platform admin does **not** grant tenant-private campaign access.
- Activation is **one-shot**: `provisioning` → `active` only.

## Prerequisites (slice C)

1. Platform migrations applied; workspace magic-link works.
2. `master_admin` with `mfa_enforced = true`.
3. Director Auth user: profile + `mfa_enforced = true` (ensure-profile → MFA enroll → set-mfa-enforced).
4. Copy director **User UUID** from Dashboard (never commit it).

## Happy path

### 1. Provision (master_admin)

1. Sign in to workspace → **Platform admin**.
2. Fill provision form:
   - Client ID: `org_[a-z0-9_]+` (synthetic e.g. `org_lifecycle_dry_run`)
   - URL slug: kebab-case (e.g. `lifecycle-dry-run`)
   - Display name: public-safe label
   - Initial director UUID: director Auth id
   - Rationale: ≥ 12 characters
3. Submit **Provision client**.
4. Expect: client row `state = provisioning`; director membership created.

### 2. Publish configuration (director)

1. Sign in as director (or switch session); select the new client.
2. Open **Brand & content**.
3. Set organization/product/campaign public copy and theme.
4. Enable **at least one** of: Sponsor pipeline, Grant pipeline.
5. Rationale ≥ 12 → **Save draft** → **Publish selected draft**.
6. Expect: one published config version for the client.

### 3. Activate (master_admin)

1. Platform admin as master_admin.
2. Enter activation rationale ≥ 12.
3. Click **Activate** on the provisioning client.
4. Expect: `state = active`; onboarding column no longer shows Activate.

### 4. Verify

```bash
# optional: paste into Dashboard SQL after editing client id
# scripts/platform/verify-client-lifecycle.sql
```

Checklist:

- [ ] `clients.state = active`
- [ ] Active director membership exists
- [ ] Published `client_config_versions` row exists
- [ ] At least one of modules.sponsors / modules.grants true
- [ ] Audit action `client_onboarding_completed` present
- [ ] Platform admin shows onboarding complete for that client

## Failure modes (activate / provision)

| Symptom / exception | Fix |
| --- | --- |
| `master_admin_required` | Complete slice C Flow A; sign in as master_admin |
| MFA / privileged MFA errors | Enroll MFA; `set-mfa-enforced.sql` true |
| `activation_rationale_required` / short rationale | Rationale ≥ 12 characters |
| `client_not_found` | Check client id; provision first |
| `provisioning_client_required` | Client already active or wrong state; do not re-activate |
| `active_client_director_required` | Attach active director (slice C Flow B / provision director UUID) |
| `published_client_configuration_required` | Director publish Brand & content |
| `fundraising_module_required` | Enable sponsors and/or grants in published config |
| validate_client_config errors | Fix theme/copy/assets per CLIENT-CONFIGURATION.md |
| `provision_client` / slug / id pattern errors | Match form patterns; unique id/slug |

## Synthetic clients

Prefer disposable ids such as `org_lifecycle_dry_run`. Do **not** use this runbook to re-activate `org_hacker_dojo` if already active.

## Next: second tenant (suite)

After one client is active, stand up a second nonprofit (FI + Impact Relay template clone):
[SECOND-TENANT-ONBOARDING.md](SECOND-TENANT-ONBOARDING.md).

## Related

- [CLIENT-CONFIGURATION.md](CLIENT-CONFIGURATION.md) — config fields and director workflow
- [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — people path
- [SECOND-TENANT-ONBOARDING.md](SECOND-TENANT-ONBOARDING.md) — second nonprofit + IR clone
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — roles
- [CURRENT-STATE.md](CURRENT-STATE.md) — live evidence
- [scripts/platform/README.md](../scripts/platform/README.md)
