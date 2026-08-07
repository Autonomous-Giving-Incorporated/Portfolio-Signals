# Portfolio Signals — current state

**Recorded:** 2026-08-07  
**Canonical repository:** `scrimshawlife-ctrl/Fund-Intel`  
**Suite:** Autonomously Giving Incorporated (AGI)

This document separates **live production evidence** from older Hacker Dojo campaign receipts. It does not authorize production CRM import, outreach, or money movement.

## Evidence labels

- **OBSERVED** — supported by current production or a recorded executed check on current stack
- **HISTORICAL** — valid for an earlier commit or host; not automatic proof of current main
- **PENDING** — needs a new execution
- **BLOCKED** — deliberately not enabled

## Live production (OBSERVED)

```yaml
public_portal: https://autogive.app/portfolio-signals/
authenticated_workspace: https://autogive.app/portfolio-signals/workspace
vercel_project: fund-intel
platform_supabase_ref: utdioxwiskzatwoejgiu
platform_supabase_url: https://utdioxwiskzatwoejgiu.supabase.co
vercel_platform_anon_env: SET  # PLATFORM_SUPABASE_URL + PLATFORM_SUPABASE_ANON_KEY
runtime_config_js: GENERATED_WITH_PLATFORM_ANON
schema_migrations: APPLIED_ON_PLATFORM
master_admin: scrimshawlife@gmail.com
reference_tenant: org_hacker_dojo  # Hacker Dojo — fixture / pilot template, not product brand
isolation_fixture_tenant: org_platform_isolation
workspace_magic_link_login: PASS  # operator-verified 2026-08-07
edge_functions_deployed:
  - signed-document-url
  - upload-client-asset
tenant_assets_layout: assets/tenants/<slug>/  # HD under assets/tenants/hacker-dojo/
legacy_hd_staging_ref: ecxkhihlbrcwpavfoaoq  # FROZEN for new tenancy
```

## Capability matrix (repository + production)

| Capability | State |
|---|---|
| Public director portal (static) | OBSERVED live |
| Authenticated workspace login | OBSERVED operator login pass |
| Platform multi-tenant schema + RLS | OBSERVED applied on platform |
| Vercel path suite under autogive.app | OBSERVED |
| Allocation middleware MVP package | OBSERVED in repo; local pilot smoke PASS |
| Allocation middleware production host | PENDING |
| every.org live webhook | PENDING (operator) |
| Custom SMTP for Auth email volume | PENDING (operator) |
| Production CRM / workbook import | BLOCKED |
| Outreach authority | NOT_GRANTED |
| Secret service_role on Vercel | PROHIBITED (anon only) |

## Allocation middleware pilot (local)

```yaml
package: services/allocation-middleware/
unit_tests: 34_PASS
local_host: http://127.0.0.1:8787
local_host_process: node src/http/server.mjs   # Node path; Docker not required
local_smoke: PASS
director_auth_config: OBSERVED  # 2026-08-07 Phase 3a — GET /auth/config directorLoginEnabled=true; platform Supabase utdioxwiskzatwoejgiu; verify:director PASS; ALLOW_OPERATOR_TOKEN_FALLBACK=0
operator_token_fallback: disabled_on_pilot_env
production_public_host: NOT_DEPLOYED  # Phase 3b / #71
every_org_live_webhook: PENDING  # Phase 3c / #73
```

Runbook: [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) · [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md)  
Design: [superpowers/specs/2026-08-07-allocation-pilot-director-auth-design.md](superpowers/specs/2026-08-07-allocation-pilot-director-auth-design.md)

## Phase 3a — Director auth close (#72)

```yaml
status: OBSERVED
path: local_node_no_docker
org_id: org_hacker_dojo
verify_director: PASS  # config only; optional --login needs director password in operator hands
membership: director on platform (prior OBSERVED)
next: public host #71 optional; every.org webhook #73; human acceptance #74
```

## Historical evidence (do not treat as current-main GO)

Older HD-OI-041 / staging receipts against `ecxkhihlbrcwpavfoaoq` or pre-rename `Hacker-Dojo` commits remain provenance only. See prior sections of git history and HD-OI-* docs.

## Operator hygiene still recommended

1. Rotate any secrets shared outside a secret manager (service_role JWT, `sb_secret_…`, personal access tokens).
2. Configure custom SMTP on platform Supabase for sustainable magic-link email (built-in mail is rate-limited).
3. Keep `scripts/staging/bootstrap.env` and `services/allocation-middleware/.env.pilot` gitignored.

## Operator access onboarding (slice C)

```yaml
runbook: docs/OPERATOR-ACCESS-ONBOARDING.md
scripts_platform: ensure-profile set-mfa-enforced grant/revoke-master-admin verify-operator-access
safety_check: PASS  # ./scripts/platform/check-script-safety.sh
dry_run: OBSERVED  # 2026-08-06 Option B — read-only verify primary admin (scrimshawlife@gmail.com): profile active, platform_admin active, mfa_enforced true; via platform Admin/REST API (equivalent to verify-operator-access.sql); UUID not committed
```

## Commercial client lifecycle (slice B)

```yaml
runbook: docs/COMMERCIAL-CLIENT-LIFECYCLE.md
verify_script: scripts/platform/verify-client-lifecycle.sql
dry_run: OBSERVED  # 2026-08-07 Option B — platform read-only verify of org_hacker_dojo (active client): 1 active director, 1 published config, modules.sponsors+grants true (lifecycle_ready); API equivalent of verify-client-lifecycle.sql against utdioxwiskzatwoejgiu; UUID/keys not committed. Full synthetic provision→activate still optional operator exercise (do not re-activate HD).
```

## Second-tenant product path (slice D)

```yaml
runbook: docs/SECOND-TENANT-ONBOARDING.md
verify_script: scripts/platform/verify-second-tenant-isolation.sql
ir_clone: impact_relay.storage.template.clone_tenant_from_hacker_dojo
id_contract: client_id == tenant_id
dry_run: OBSERVED  # 2026-08-07 Option B — (1) FI platform: org_hacker_dojo reference_tenant=true + org_platform_isolation active non-reference second client; public get_public_client_config('hacker-dojo') returns org_hacker_dojo / Hacker Dojo; (2) IR local: clone_tenant_from_hacker_dojo(tenant_id=org_second_makerspace) + upsert_from_policy template_source=org_hacker_dojo in disposable data-dir (IR_CLONE_OK). Full paired synthetic org_* FI activate + same-id IR clone still optional operator exercise.
```

## Related

- Suite phase map: [AGI docs/PLATFORM.md](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md)
- Workspace behavior: [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md)
- Bootstrap: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md)
