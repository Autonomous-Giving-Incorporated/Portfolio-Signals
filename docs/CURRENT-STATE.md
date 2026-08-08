# Portfolio Signals — current state

**Recorded:** 2026-08-07  
**Canonical repository:** `scrimshawlife-ctrl/Fund-Intel`  
**Suite:** Autonomously Giving Incorporated (AGI)

This document separates **live production evidence** from older Hacker Dojo campaign receipts. It does not authorize production CRM import, outreach, or money movement.

**Onboarding hub:** [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md) — map of C→B→D→pilot, what is done without external login vs what still needs every.org/admin.

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
second_master_admin: qi@enkeyai.com  # Qi Diaz — Auth invited + platform_administrators active 2026-08-08; mfa_enforced still false until TOTP enroll
hacker_dojo_tenant_director: ed@hackerdojo.org  # 2026-08-08 — profile + active director on org_hacker_dojo; mfa_enforced false until TOTP; email OTP rate-limited (action_link in operator-local gitignored file)
reference_tenant: org_hacker_dojo  # Hacker Dojo — fixture / pilot template, not product brand
isolation_fixture_tenant: org_platform_isolation
workspace_magic_link_login: PASS  # operator-verified 2026-08-07
tenant_canonical_data_auth: REQUIRED  # 2026-08-08 — Hacker Dojo campaign data gated behind membership on org_hacker_dojo (or master_admin); public shell is product-only
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
| Allocation middleware public HTTPS | OBSERVED ephemeral (cloudflared); durable named host recipe READY (Compose/Render/Railway/Fly) — public dashboard deploy PENDING operator |
| every.org live webhook | PENDING (operator) |
| Custom SMTP for Auth email volume | PENDING (operator) — runbook [PLATFORM-AUTH-SMTP.md](PLATFORM-AUTH-SMTP.md) |
| IR console default-deny + host bridge | OBSERVED — Bearer JWT/fixture only; `--trusted-proxy` gateway-only (#48) |
| Operator secret hygiene checklist | READY — [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) |
| Client Onboarding Pack (document phase) | **Code MERGED** main #104 — platform migrate + Edge deploy + MFA dry-run still **PENDING** ([CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md)) |
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
public_https_host: OBSERVED  # 2026-08-07 Phase 3b — Cloudflare quick tunnel → local Node; pilot:smoke PASS + verify:director PASS over https://*.trycloudflare.com (ephemeral). Durable Render/Railway/Fly still optional operator dashboard step.
every_org_live_webhook: PENDING  # Phase 3c / #73
```

Runbook: [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) · [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md)  
Design 3a: [superpowers/specs/2026-08-07-allocation-pilot-director-auth-design.md](superpowers/specs/2026-08-07-allocation-pilot-director-auth-design.md)  
Design 3b: [superpowers/specs/2026-08-07-allocation-pilot-public-host-design.md](superpowers/specs/2026-08-07-allocation-pilot-public-host-design.md)

## Phase 3a — Director auth close (#72)

```yaml
status: OBSERVED
path: local_node_no_docker
org_id: org_hacker_dojo
verify_director: PASS  # config only; optional --login needs director password in operator hands
membership: director on platform (prior OBSERVED)
next: every.org webhook #73; human acceptance #74; durable named host optional
```

## Phase 3b — Public HTTPS host (#71)

```yaml
status: OBSERVED_EPHEMERAL
path: cloudflared_quick_tunnel_to_local_node
smoke: PASS  # pilot:smoke + verify:director over HTTPS
durable_render_recipe: READY  # services/allocation-middleware/render.yaml (ALLOW_OPERATOR_TOKEN_FALLBACK=0)
durable_host_runbook: docs/ALLOCATION-DURABLE-HOST.md
durable_preflight: npm run preflight:durable  # services/allocation-middleware
durable_named_host: PENDING_OPERATOR  # Render/Railway/Fly (or VPS+TLS) dashboard when every.org needs stable URL
durable_preflight_local: OBSERVED  # 2026-08-08 npm run preflight:durable PASS (.env.pilot + recipe files)
compose_build_this_host: BLOCKED  # docker credential helper exec format error (desktop.exe under WSL); recipe still READY
```

## Phase 3 / #74 — Seed-loop acceptance (no live gift)

```yaml
status: OBSERVED
command: cd services/allocation-middleware && npm run accept:seed-loop
result: SEED_LOOP_ACCEPTANCE_PASS  # 2026-08-07 — allocate $100 Community Hardware Fund → proof URI → packet proofCount≥1
scope: seed pots only; does not require every.org webhook or director browser session
remaining_for_full_74: live gift via #73 + director JWT allocate in browser + sign-off comment
```

## Setup wizard — seed vs live (#73 prep)

```yaml
status: OBSERVED  # 2026-08-08
rule: chargeId matching /^fixture[-_]/i does not set steps.receivedTestGift / Connected
api: counts.fixtureGifts, counts.liveGifts, lastLiveGift; steps.receivedFixtureGifts
ui: Seed only — waiting for live gift | Connected (live only)
```

## Historical evidence (do not treat as current-main GO)

Older HD-OI-041 / staging receipts against `ecxkhihlbrcwpavfoaoq` or pre-rename `Hacker-Dojo` commits remain provenance only. See prior sections of git history and HD-OI-* docs.

## Operator hygiene (optional tracks)

```yaml
secret_hygiene_runbook: docs/OPERATOR-SECRET-HYGIENE.md
custom_smtp_runbook: docs/PLATFORM-AUTH-SMTP.md
custom_smtp: PENDING  # dashboard only; fallback invite / generate_link
vercel_team_invite: N/A_OR_INVITEE  # owner CLI on scrimshawlife-8819s-projects; invitee accepts their own invite
ir_console_trusted_proxy: DOCUMENTED  # #48 — default off; bridge does not send X-Impact headers
suite_track_fi: docs/SUITE-ONBOARDING.md + AGI docs/GITHUB-PROJECT.md
```

1. Rotate any secrets shared outside a secret manager — follow [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md).
2. Configure custom SMTP on platform Supabase when invite volume needs it — [PLATFORM-AUTH-SMTP.md](PLATFORM-AUTH-SMTP.md).
3. Keep `scripts/staging/bootstrap.env` and `services/allocation-middleware/.env.pilot` gitignored.
4. Durable public host when every.org needs a stable URL — [ALLOCATION-DURABLE-HOST.md](ALLOCATION-DURABLE-HOST.md).

## Operator access onboarding (slice C)

```yaml
runbook: docs/OPERATOR-ACCESS-ONBOARDING.md
scripts_platform: ensure-profile set-mfa-enforced grant/revoke-master-admin verify-operator-access
safety_check: PASS  # ./scripts/platform/check-script-safety.sh
dry_run: OBSERVED  # 2026-08-06 Option B — read-only verify primary admin (scrimshawlife@gmail.com): profile active, platform_admin active, mfa_enforced true; via platform Admin/REST API (equivalent to verify-operator-access.sql); UUID not committed
second_master_admin: OBSERVED_PARTIAL  # 2026-08-08 — qi@enkeyai.com Auth invited + profile active + platform_administrators active; mfa_enforced=false until user enrolls TOTP then set-mfa-enforced; Supabase invite + magic-link OTP sent (built-in mail rate limits may delay first admin resend)
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

## Client onboarding pack (document phase)

```yaml
client_onboarding_pack:
  status: PENDING_PLATFORM  # 2026-08-08 — code on main (#104 MERGED); not OBSERVED until platform migrate + Edge deploy + MFA dry-run
  code_merged: true  # Portofolio-Signals / Fund-Intel PR #104 → main c373eeb (+ follow-up CI receipt fix)
  template: onboarding_pack_v1
  production_import: BLOCKED
  path: docs/CLIENT-ONBOARDING-PACK.md
  design: docs/superpowers/specs/2026-08-08-client-onboarding-pack-design.md
  plan: docs/superpowers/plans/2026-08-08-client-onboarding-pack.md
  migrations:
    - 202608080001_client_onboarding_pack.sql
    - 202608080002_onboarding_pack_mime_types.sql
  edge_functions:
    - upload-onboarding-document
    - onboarding-document-url
  workspace_ui: onboarding_pack section (director | master_admin + MFA)
  verified_locally:  # not production evidence
    classifier_unit_tests: PASS  # node --test services/onboarding-pack — 8/8
    sql_test_015_local: PASS  # supabase/tests/015_client_onboarding_pack.sql (ROLLBACK)
    local_acceptance_ci: PASS  # HD-OI-041 on #104 after GITHUB_REPOSITORY receipt fix
    code_complete: true
  platform_probe_utdioxwiskzatwoejgiu:  # last probe before merge; re-check after operator apply
    client_onboarding_packs: ABSENT  # PostgREST PGRST205 until migrate
    client_onboarding_documents: ABSENT
    upload-onboarding-document: NOT_DEPLOYED
    onboarding-document-url: NOT_DEPLOYED
  activate_script: scripts/platform/activate-onboarding-pack.sh  # requires supabase login
  operator_remaining:
    - supabase login / SUPABASE_ACCESS_TOKEN then link utdioxwiskzatwoejgiu
    - PLATFORM_CONFIRM_PROJECT_REF=utdioxwiskzatwoejgiu ./scripts/staging/apply-migrations.sh remote-linked
    - supabase functions deploy upload-onboarding-document --project-ref utdioxwiskzatwoejgiu
    - supabase functions deploy onboarding-document-url --project-ref utdioxwiskzatwoejgiu
    - MFA director/master_admin: Workspace → Onboarding pack → 5 required + park xlsx → then status OBSERVED
```

Pack `ready` ≠ import authorized ≠ outreach ≠ client activated. See [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md).

## Related

- Suite phase map: [AGI docs/PLATFORM.md](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md)
- Workspace behavior: [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md)
- Bootstrap: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md)
