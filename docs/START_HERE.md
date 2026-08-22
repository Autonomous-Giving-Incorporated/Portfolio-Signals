# Start here — AGI Portfolio Signals

Operator entry point for **Portfolio Signals** (AGI decision workspace). Hacker Dojo is the **reference tenant**, not the product name.

## Authority gates (unchanged)

```yaml
production_import: BLOCKED
outreach_authority: NOT_GRANTED
production_money_movement: BLOCKED
impact_relay_live_notifications: NOT_ACTIVATED
private_data_in_github: PROHIBITED
service_role_on_vercel: PROHIBITED
```

**Public legal:** [autogive.app/legal](https://autogive.app/legal) · [Privacy](https://autogive.app/legal/privacy) · [Terms](https://autogive.app/legal/terms) · operator map [LEGAL-NOTICES.md](LEGAL-NOTICES.md).

## Live URLs

| Surface | URL |
| --- | --- |
| Public portal | https://autogive.app/portfolio-signals/ |
| Authenticated workspace | https://autogive.app/portfolio-signals/workspace |
| Designed public host | Cloudflare Workers (in-repo name `portfolio-signals`) — [CLOUDFLARE.md](CLOUDFLARE.md); Vercel fallback until DNS cutover |
| Live suite path (OBSERVED 2026-08-15) | `agi-public` GET/HEAD-proxies `/portfolio-signals` to Vercel. No Worker named `portfolio-signals`. Allocation Worker ABSENT. Bindings can list Workers; no secret-set tool. |
| Platform Supabase | https://supabase.com/dashboard/project/utdioxwiskzatwoejgiu |

## Read in this order

1. [CURRENT-STATE.md](CURRENT-STATE.md) — live production vs historical evidence  
1a. [SUITE_STACK_AUDIT_2026-08-17.md](SUITE_STACK_AUDIT_2026-08-17.md) — informative suite-wide audit (not READY)  
1b. [PRODUCTION-READINESS-AND-CONTINUATION-2026-08-22.md](PRODUCTION-READINESS-AND-CONTINUATION-2026-08-22.md) — 2026-08-22 readiness successor + continuation waves (not READY)  
1c. [C3-PUBLIC-DATA-POLICY-DEFERRAL-2026-08-22.md](C3-PUBLIC-DATA-POLICY-DEFERRAL-2026-08-22.md) — C3 still PROPOSED; Phase D gated (not sign-off)  
2. [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md) — **onboarding hub** (done without login vs needs login)  
3. [PLATFORM.md](PLATFORM.md) — hosts, Supabase ref, env rules  
3a. [CLOUDFLARE.md](CLOUDFLARE.md) — Workers public host + webhook route (live pointing remaining)  
4. [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — identity, roles, workspace login  
   - [AUTH-ROLES-AND-EMAILS.md](AUTH-ROLES-AND-EMAILS.md) — role-aware magic links and tenant-scoped infrastructure delegates
5. [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — master_admin and director people path  
6. [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md) — provision → publish → activate  
7. [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md) — document pack (workspace **Onboarding pack**; ≠ CRM import)  
8. [SECOND-TENANT-ONBOARDING.md](SECOND-TENANT-ONBOARDING.md) — second nonprofit + IR template clone  
9. [BRAND-SYSTEM.md](BRAND-SYSTEM.md) — AGI product chrome vs `assets/tenants/<slug>/`  
10. [ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md) + [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) — Phase 3 pilot  
10a. [FUND-INTEL-SIGNALS.md](FUND-INTEL-SIGNALS.md) — SPEC-003 v2.1.0 in-process records (CODE_SHIPPED; not live; not READY)  
10b. [MISSION-GRAPH.md](MISSION-GRAPH.md) — SPEC-029 Proposed read-only projection (CODE_SHIPPED; not live; not READY; not Accepted)  
10c. [MISSION-INTELLIGENCE-METRICS.md](MISSION-INTELLIGENCE-METRICS.md) — SPEC-030 Proposed fail-closed policies (CODE_SHIPPED; not live; not READY; not Accepted; no formula)  
10d. [AGI-CONSOLE.md](AGI-CONSOLE.md) — read-only operator/console projection over existing records + graph + metrics (CODE_SHIPPED; not live; not READY; not a product console)  
10e. [SYNTHETIC-DATASET.md](SYNTHETIC-DATASET.md) — AutoGive v1 Civic Forge disposable universe (not HD, not OBSERVED)  
11. [DATA-PLACEMENT.md](DATA-PLACEMENT.md) — where private data may live  
12. [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md) — migrations / operator SQL  
13. [IMPACT-RELAY.md](IMPACT-RELAY.md) / live-cohort docs — IR integration  

## Phase status (2026-08-08)

| Phase | Status |
| --- | --- |
| Public suite on autogive.app | Live |
| Phase 2 platform Auth + workspace | **Operator-complete** (login verified) |
| Role-aware Auth email | **Function deploy OBSERVED** 2026-08-22 (`auth-email` v3 + webhook v1 on `utdioxwiskzatwoejgiu`). Resend send secrets / webhook secret / P8 drill still operator-owned. Slices 19-21 schema remains; leaked-password protection blocked by Supabase Pro-plan entitlement |
| Commercial onboarding C→B→D | Runbooks + OBSERVED dry-runs (see CURRENT-STATE) |
| **Client Onboarding Pack** (docs) | **Platform schema + Edge OBSERVED**; MFA dry-run **PENDING** ([#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18)) |
| Phase 3a/3b allocation pilot | Director JWT + ephemeral public HTTPS OBSERVED |
| Fund Intel Signal / Opportunity / Recommendation | **CODE_SHIPPED** in-process; not live; not READY — [FUND-INTEL-SIGNALS.md](FUND-INTEL-SIGNALS.md) |
| Mission Graph projection (SPEC-029 Proposed) | **CODE_SHIPPED** read-only; not live; not READY; SPEC-029 not Accepted — [MISSION-GRAPH.md](MISSION-GRAPH.md) |
| Mission Intelligence metrics (SPEC-030 Proposed) | **CODE_SHIPPED** fail-closed policies; not live; not READY; SPEC-030 not Accepted; no formula — [MISSION-INTELLIGENCE-METRICS.md](MISSION-INTELLIGENCE-METRICS.md) |
| AGI console projection (read-only view) | **CODE_SHIPPED** in-process; not live; not READY; not a product console; SPEC-029/030 stay Proposed — [AGI-CONSOLE.md](AGI-CONSOLE.md) |
| Phase 3c every.org webhook | Worker **code shipped**; live URL / every.org pointing / gift **PENDING** ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)) |
| Production CRM import | Blocked |

## Quick operator commands

```bash
# Public suite smoke (from AGI repo)
./scripts/smoke-public-suite.sh

# Workspace runtime uses Vercel env (already set on fund-intel project):
#   PLATFORM_SUPABASE_URL
#   PLATFORM_SUPABASE_ANON_KEY

# Allocation pilot (local Node — no Docker required)
cd services/allocation-middleware
# .env.pilot with platform Supabase keys (never commit)
npm test
# set -a && source .env.pilot && set +a && npm run start:hacker-dojo:seed
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
BASE_URL=http://127.0.0.1:8787 npm run verify:director
npm run accept:seed-loop   # allocate→proof→packet on seed (no every.org)

# AutoGive synthetic v1 (Civic Forge — disposable only)
npm run synthetic:validate
npm run public:fixture:synthetic
npm run synthetic:test
# supabase start && supabase db reset && six_roles.sql
# SYNTHETIC_SEED_CONFIRM=1 DB_URL="$DB_URL" npm run seed:synthetic
```

## Current baseline (suite)

```yaml
repository: Autonomous-Giving-Incorporated/Portfolio-Signals  # authoritative post-migration production repository
platform_supabase: utdioxwiskzatwoejgiu
legacy_staging_frozen: ecxkhihlbrcwpavfoaoq
reference_tenant: org_hacker_dojo
primary_master_admin: RESTRICTED_OPERATOR_REGISTRY
client_onboarding_pack: PENDING_MFA_DRY_RUN  # platform schema + Edge observed; operator script scripts/platform/dry-run-onboarding-pack.sh; issue #18
restore_drill: LOCAL_SYNTHETIC_OBSERVED  # 2026-08-15 at 2587aa5; issue #19 REOPENED; hosted isolated project still PENDING; not accepted RTO/RPO
```

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 22 + Hash: 645560ecfc722b6d040d9c21562681bbf579ba23
