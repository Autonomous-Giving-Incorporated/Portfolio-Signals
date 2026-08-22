# Portfolio Signals — current state

**Recorded:** 2026-08-15
**Canonical repository:** `Autonomous-Giving-Incorporated/Portfolio-Signals`
**Suite:** Autonomously Giving Incorporated (AGI)

This document separates **live production evidence** from older Hacker Dojo campaign receipts. It does not authorize production CRM import, outreach, or money movement.

**Onboarding hub:** [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md) — map of C→B→D→pilot, what is done without external login vs what still needs every.org/admin.

Cloudflare Bindings on the connected Zero State / Noema account can **list and get** Workers, D1, KV, and R2. There is still **no secret-set tool**. Listing `portfolio-signals` failed; the allocation Worker is **absent**. See [CLOUDFLARE.md](CLOUDFLARE.md).

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
master_admin: RESTRICTED_OPERATOR_REGISTRY
second_master_admin: RESTRICTED_OPERATOR_REGISTRY
hacker_dojo_tenant_director: RESTRICTED_OPERATOR_REGISTRY
reference_tenant: org_hacker_dojo  # Hacker Dojo — fixture / pilot template, not product brand
isolation_fixture_tenant: org_platform_isolation
workspace_magic_link_login: PASS  # operator-verified 2026-08-07
tenant_canonical_data_auth: REQUIRED  # 2026-08-08 — Hacker Dojo campaign data gated behind membership on org_hacker_dojo (or master_admin); public shell is product-only
edge_functions_deployed:
  - signed-document-url
  - upload-client-asset
  - upload-onboarding-document  # 2026-08-08 platform deploy OBSERVED
  - onboarding-document-url     # 2026-08-08 platform deploy OBSERVED
  - auth-email                  # 2026-08-22 v3 SHA 3a9bd980… ACTIVE verify_jwt=false
  - auth-email-webhook          # 2026-08-22 v1 SHA 6f3883ff… ACTIVE verify_jwt=false; secret PENDING
tenant_assets_layout: assets/tenants/<slug>/  # HD under assets/tenants/hacker-dojo/
legacy_hd_staging_ref: ecxkhihlbrcwpavfoaoq  # FROZEN for new tenancy
```

Supabase MCP `list_projects` still enumerates only Noema `dezykkherxlaysxyvgbs`. Targeted `get_project` / `apply_migration` / `deploy_edge_function` on `utdioxwiskzatwoejgiu` now succeed. Do not deploy AGI auth-email to Noema. MCP still cannot list or set Edge secrets.

## Cloudflare account (OBSERVED 2026-08-15 PT)

Recorded via Cloudflare Bindings + Observability on the connected Zero State / Noema account. **Listing Workers now works.** There is still **no secret-set tool**. Do not treat this as a live allocation Worker, a live gift, MFA, or READY.

```yaml
cloudflare_account: Zero State / Noema
bindings_list_workers: OBSERVED  # workers_list / workers_get_worker
bindings_list_d1_kv_r2: OBSERVED
bindings_secret_set: ABSENT  # no secret-set tool; secrets were not set
workers_on_account:
  - agi-public  # id 2d4fca83de814951afc30791e5b4f27b; created 2026-08-14; modified 2026-08-15
  - noema-gateway
worker_portfolio_signals: ABSENT  # workers_get_worker portfolio-signals failed
workers_builds_agi_public: 0
agi_public_role: suite_gateway  # workers/suite-gateway.ts + workers/suite-routes.ts; NOT allocation / webhook / CSV
agi_public_proxy:
  GET_HEAD /portfolio-signals: https://fund-intel-ten.vercel.app
  GET_HEAD /impact-relay: https://impact-relay.vercel.app
  /fund-intel: 301 /portfolio-signals
  non_GET_HEAD_proxied: 405
observability_hosts:
  - autogive.app
  - agi-public.zer0state-noema.workers.dev
observability_script_name: agi-public  # only scriptName seen
allocation_worker: ABSENT
allocation_apis: CODE_SHIPPED  # /allocations /proofs /packet /seed /import/csv; not live on a named Worker
every_org_webhook: CODE_SHIPPED  # not live
impact_notice: CODE_SHIPPED  # not live
```

`agi-public.zer0state-noema.workers.dev` is the **suite gateway** origin, not an allocation / webhook / CSV host. Do not invent a `portfolio-signals.*.workers.dev` allocation URL.

## AutoGive synthetic v1 fixtures (in-repo, not production)

In-repo disposable universe only. Not a live campaign, not Every.org, not READY, not `OBSERVED`.

```yaml
synthetic_dataset: autogive-synthetic-dataset
version: 1.0.0
path: fixtures/autogive-v1/
tenant_id: org_synthetic_civic_forge
campaign_id: cmp_synthetic_builder_fund_2026
classification: SYNTHETIC_ONLY
live_public_campaign: data/public-campaign.json  # unchanged fail-closed shell
reference_tenant_unchanged: org_hacker_dojo
```

See [SYNTHETIC-DATASET.md](SYNTHETIC-DATASET.md).

## Phase C C4 public-safe fixtures (OBSERVED in-repo 2026-08-17)

In-repo copies only. Not a live campaign, not a live gift, not READY, not a Worker host.

```yaml
c4_public_safe_fixtures: OBSERVED_IN_REPO
path: fixtures/agi_phase_c/
canonical: Community AI Lab / 25 laptops / 2500 USD
canonical_join_key: alloc_community_ai_lab
noncanonical: Hacker Dojo / Community Hardware  # labeled; 18-attendee IR copy
spec011_uuid_allocationId: NOT_COMPUTABLE_ON_PUBLIC_CAMPAIGN  # UUID fails ^alloc_[a-z0-9_]+$
live_public_campaign: data/public-campaign.json  # unchanged fail-closed shell
published_on_worker_or_cdn: false  # fixtures/ is assets-ignored
c3_public_data_policy: PROPOSED
```

## Capability matrix (repository + production)

| Capability | State |
|---|---|
| Public director portal (static) | OBSERVED live |
| Authenticated workspace login | OBSERVED operator login pass |
| Platform multi-tenant schema + RLS | OBSERVED applied on platform |
| Vercel path suite under autogive.app | OBSERVED (fallback until DNS cutover) |
| Cloudflare Workers static host | In-repo Worker name `portfolio-signals` (`wrangler.toml` + `main`); **ABSENT** on the connected account. Live suite path is `agi-public` GET/HEAD-proxy to Vercel. Allocation Worker ABSENT. Bindings listing OBSERVED; secret-set ABSENT — [CLOUDFLARE.md](CLOUDFLARE.md) |
| Allocation middleware MVP package | OBSERVED in repo; local pilot smoke PASS |
| Allocation middleware public HTTPS | OBSERVED ephemeral (cloudflared); designed durable host is **Workers** — not Render/Fly/Railway; live named-host OBSERVED is **not** recorded |
| Fund Intel Signal / Opportunity / Recommendation | CODE_SHIPPED in-process (`services/allocation-middleware/src/intel/`); not live; not READY — [FUND-INTEL-SIGNALS.md](FUND-INTEL-SIGNALS.md) |
| Mission Graph projection (SPEC-029 Proposed) | CODE_SHIPPED read-only (`src/intel/mission-graph.mjs`); not live; not READY; SPEC-029 not Accepted — [MISSION-GRAPH.md](MISSION-GRAPH.md) |
| Mission Intelligence metrics (SPEC-030 Proposed) | CODE_SHIPPED fail-closed policies (`src/intel/metrics.mjs`); not live; not READY; SPEC-030 not Accepted; no formula — [MISSION-INTELLIGENCE-METRICS.md](MISSION-INTELLIGENCE-METRICS.md) |
| AGI console projection (read-only view) | CODE_SHIPPED in-process (`src/intel/console-projection.mjs`); not live; not READY; not a product console; SPEC-029/030 stay Proposed — [AGI-CONSOLE.md](AGI-CONSOLE.md) |
| every.org webhook Worker port | CODE_SHIPPED (`POST /webhooks/every-org` + tests); live URL / every.org pointing / live gift PENDING ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)) |
| Allocation security audit | REPO_REVIEW — [ALLOCATION-SECURITY-AUDIT.md](ALLOCATION-SECURITY-AUDIT.md); no live director session claimed |
| Suite stack audit (2026-08-17) | INFORMATIVE — [SUITE_STACK_AUDIT_2026-08-17.md](SUITE_STACK_AUDIT_2026-08-17.md); not READY, not a freeze SHA |
| Production readiness + continuation (2026-08-22) | INFORMATIVE — [PRODUCTION-READINESS-AND-CONTINUATION-2026-08-22.md](PRODUCTION-READINESS-AND-CONTINUATION-2026-08-22.md); verdict still **NO_GO**; not READY |
| C3 public-data policy | PROPOSED; **written deferral** 2026-08-22 — [C3-PUBLIC-DATA-POLICY-DEFERRAL-2026-08-22.md](C3-PUBLIC-DATA-POLICY-DEFERRAL-2026-08-22.md); not sign-off; Phase D gated |
| Custom SMTP for Auth email volume | PENDING (operator) — runbook [PLATFORM-AUTH-SMTP.md](PLATFORM-AUTH-SMTP.md) |
| Role-aware Resend magic links (`auth-email`) | **Function deploy + P8 tenant-member send + isolation-director send/click OBSERVED** 2026-08-22 on `utdioxwiskzatwoejgiu` / Mailosaur `qpbqeifu`. Click reached `autogive.app/portfolio-signals/workspace`. `RESEND_WEBHOOK_SECRET` **OBSERVED unset** (`503 function_not_configured`). MFA and platform-admin template still PENDING. [AUTH-ROLES-AND-EMAILS.md](AUTH-ROLES-AND-EMAILS.md) |
| IR console default-deny + host bridge | OBSERVED — Bearer JWT/fixture only; `--trusted-proxy` gateway-only (#48) |
| Operator secret hygiene checklist | READY — [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) |
| Client Onboarding Pack (document phase) | **Platform schema + Edge OBSERVED** 2026-08-08 — tables REST 200; Edge 401 without JWT; MFA workspace dry-run still **PENDING** ([#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18)) |
| Production CRM / workbook import | BLOCKED |
| Outreach authority | NOT_GRANTED |
| Secret service_role in browser / Vercel / runtime-config | PROHIBITED (anon only) |
| Worker secret `SUPABASE_SERVICE_ROLE_KEY` | PENDING operator — allocation `am_*` + membership lookup only; never in HTML |
| Allocation API on Workers | CODE_SHIPPED (`/allocations` `/proofs` `/packet` `/seed` `/import/csv`; operator-token fallback off); live host PENDING |
| Isolated synthetic restore drill | LOCAL_SYNTHETIC_OBSERVED 2026-08-15 at `2587aa5` ([#19](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/19)); issue **reopened** — hosted isolated restore still PENDING; not accepted RTO/RPO |

## Allocation middleware pilot (local)

```yaml
package: services/allocation-middleware/
unit_tests: REPO  # allocation-middleware + Worker allocation API
local_host: http://127.0.0.1:8787
local_host_process: node src/http/server.mjs   # Node path; Docker not required
local_smoke: PASS
director_auth_config: OBSERVED  # 2026-08-07 Phase 3a — GET /auth/config directorLoginEnabled=true; platform Supabase utdioxwiskzatwoejgiu; verify:director PASS; ALLOW_OPERATOR_TOKEN_FALLBACK=0
operator_token_fallback: disabled_on_worker_and_pilot_env
public_https_host: OBSERVED  # 2026-08-07 Phase 3b — Cloudflare quick tunnel → local Node; designed durable host: Workers (not Render/Fly/Railway).
workers_allocation_api: CODE_SHIPPED  # seed → allocate → proof → packet + POST /import/csv tests; no live director session
every_org_webhook_worker: CODE_SHIPPED  # POST /webhooks/every-org in-repo; not live on a named Worker; not a live gift
csv_import_worker: CODE_SHIPPED  # POST /import/csv director-write; same chargeId credit as webhook; not a checkout; not live
every_org_live_webhook: PENDING  # operator: CF secrets, wrangler secret, every.org Advanced URL, controlled gift (#20)
durable_named_host: NOT_OBSERVED
cloudflare_deploy_secrets: PENDING  # CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID absent in this environment; Bindings has no secret-set tool
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
next: live Worker URL + every.org pointing + director acceptance issue #20
```

## Phase 3b — Public HTTPS host (#71)

```yaml
status: OBSERVED_EPHEMERAL
path: cloudflared_quick_tunnel_to_local_node
smoke: PASS  # pilot:smoke + verify:director over HTTPS
durable_render_recipe: HISTORICAL  # render.yaml remains in-tree; not the designed host
durable_host_runbook: docs/ALLOCATION-DURABLE-HOST.md
durable_preflight: npm run preflight:durable  # local only
durable_named_host: CLOUDFLARE_WORKERS  # designed host; live named-host OBSERVED not recorded
durable_preflight_local: OBSERVED  # 2026-08-08 npm run preflight:durable PASS (.env.pilot + recipe files)
compose_build_this_host: BLOCKED  # docker credential helper exec format error (desktop.exe under WSL); recipe still READY
```

## Phase 3 / #74 — Seed-loop acceptance (no live gift)

```yaml
status: OBSERVED
command: cd services/allocation-middleware && npm run accept:seed-loop
result: SEED_LOOP_ACCEPTANCE_PASS  # 2026-08-07 — allocate $100 Community Hardware Fund → proof URI → packet proofCount≥1
scope: seed pots only; does not require every.org webhook or director browser session
remaining_for_live_acceptance: live gift + director JWT allocate in browser + sign-off comment (#20)
```

## Setup wizard — seed vs live (issue #20 prep)

```yaml
status: OBSERVED  # 2026-08-08
rule: chargeId matching /^fixture[-_]/i does not set steps.receivedTestGift / Connected
api: counts.fixtureGifts, counts.liveGifts, lastLiveGift; steps.receivedFixtureGifts
ui: Seed only — waiting for live gift | Connected (live only)
```

## Historical evidence (do not treat as current-main GO)

Older HD-OI-041 / staging receipts against `ecxkhihlbrcwpavfoaoq` or pre-rename `Hacker-Dojo` commits remain provenance only. See prior sections of git history and HD-OI-* docs.

## Repository enforcement (Slice 22 attempt 2026-08-15)

```yaml
canonical_repository: Autonomous-Giving-Incorporated/Portfolio-Signals
main_branch_protection: BLOCKED_API
rulesets: BLOCKED_API
secret_scanning: BLOCKED_API
secret_scanning_push_protection: BLOCKED_API
secret_scanning_validity_checks: BLOCKED_API
dependabot_security_updates: BLOCKED_API
vulnerability_alerts: BLOCKED_API
api_error: "403 Resource not accessible by integration"
attempted:
  - PATCH /repos/Autonomous-Giving-Incorporated/Portfolio-Signals security_and_analysis
  - PUT /repos/.../vulnerability-alerts
  - PUT /repos/.../automated-security-fixes
  - POST /repos/.../rulesets
operator_owned: enable secret scanning, push protection, Dependabot security updates, and a main ruleset (PR required, 0 reviewers, no path-filtered required checks)
```

GET `/repos/.../rulesets` returned `[]`. GET `security_and_analysis` was `null` on the public repo payload available to this integration. Do not treat this block as OBSERVED enforcement.

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
dry_run: OBSERVED  # 2026-08-06 read-only primary-admin verification; identity and authentication posture live only in the restricted operator registry
second_master_admin: OBSERVED_PARTIAL  # identity, enrollment, and sign-in posture live only in the restricted operator registry
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
  status: PLATFORM_SCHEMA_AND_EDGE_OBSERVED  # 2026-08-08 — migrations + Edge on utdioxwiskzatwoejgiu; MFA dry-run still PENDING before full pack OBSERVED
  code_merged: true  # historical pre-migration PR #104 (+ #112 activate script)
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
    local_acceptance_ci: PASS  # historical HD-OI-041 acceptance after GITHUB_REPOSITORY receipt fix
    code_complete: true
  platform_probe_utdioxwiskzatwoejgiu:  # 2026-08-08 operator activate
    client_onboarding_packs: OBSERVED  # REST 200 empty array (service role)
    client_onboarding_documents: OBSERVED  # REST 200 empty array
    onboarding_rpcs: OBSERVED  # 14 public *onboarding* functions present
    upload-onboarding-document: OBSERVED  # OPTIONS 200; POST without JWT → 401 bearer_token_required
    onboarding-document-url: OBSERVED  # OPTIONS 200; POST without JWT → 401 unauthorized
    schema_migrations: RECORDED  # 202608080001, 202608080002 in supabase_migrations.schema_migrations
  activate_script: scripts/platform/activate-onboarding-pack.sh  # Edge via CLI; SQL also applied via Management API when db password absent
  handoff: docs/PEOPLE-AND-PACK-HANDOFF.md
  operator_remaining:
    - scripts/platform/dry-run-onboarding-pack.sh local-synthetic (no production credentials)
    - scripts/platform/dry-run-onboarding-pack.sh operator-mfa after TOTP + mfa_enforced
    - Workspace → Onboarding pack (org_hacker_dojo) → 5 required + park xlsx → mark full OBSERVED
    - Qi/Ed: action_links operator-local; enroll TOTP → set-mfa-enforced (parallel)
    - Isolated hosted restore drill still operator-owned (not utdioxwiskzatwoejgiu / ecxkhihlbrcwpavfoaoq); local-synthetic #19 is OBSERVED below
    - REVOKE any personal access token pasted into chat after activate
```

Pack `ready` ≠ import authorized ≠ outreach ≠ client activated. See [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md).

## Isolated restore drill (#19)

```yaml
restore_drill:
  status: LOCAL_SYNTHETIC_OBSERVED  # 2026-08-15 at 2587aa5 — not hosted isolated project; not accepted RTO/RPO
  issue_19: REOPENED  # local-synthetic landed; hosted isolated restore still PENDING
  code_shipped: true
  receipt: docs/templates/RESTORE-DRILL-EVIDENCE.md
  script: scripts/staging/restore-drill.sh
  engine: host-postgres  # supabase/postgres:15.8.1.085 on host network
  supabase_start_full_stack: BLOCKED_ON_THIS_HOST  # Docker bridge dropped container-to-container traffic
  production_ref_touched: false
  legacy_staging_ref_touched: false
  production_service_role: not_used
  migration_head: 20260815180000_am_donation_link_and_impact_notices
  fixture_counts: auth_users=6 profiles=6 memberships=6 decisions=5
  sql_suites: 21 pass / 0 fail
  observed_rto: 21s empty-target rebuild through suite complete  # not accepted
  observed_rpo: synthetic dump sha256:951deddfd377 at migration head above  # not accepted
  leadership_rto_rpo_acceptance: pending
  privacy_review: pending
  production_import: BLOCKED
  hosted_isolated_project: PENDING_OPERATOR
```

## Related

- Suite phase map: [AGI docs/PLATFORM.md](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md)
- Workspace behavior: [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md)
- Bootstrap: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md)

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 22 + Hash: 645560ecfc722b6d040d9c21562681bbf579ba23
