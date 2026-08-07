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

## Live URLs

| Surface | URL |
| --- | --- |
| Public portal | https://autogive.app/portfolio-signals/ |
| Authenticated workspace | https://autogive.app/portfolio-signals/workspace |
| Suite home | https://autogive.app/ |
| Impact Relay public | https://autogive.app/impact-relay/ |
| Platform Supabase | https://supabase.com/dashboard/project/utdioxwiskzatwoejgiu |

## Read in this order

1. [CURRENT-STATE.md](CURRENT-STATE.md) — live production vs historical evidence  
2. [PLATFORM.md](PLATFORM.md) — hosts, Supabase ref, env rules  
3. [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — identity, roles, workspace login  
4. [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — master_admin and director people path  
5. [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md) — provision → publish → activate  
6. [BRAND-SYSTEM.md](BRAND-SYSTEM.md) — AGI product chrome vs `assets/tenants/<slug>/`  
7. [ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md) + [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) — Phase 3 pilot  
8. [DATA-PLACEMENT.md](DATA-PLACEMENT.md) — where private data may live  
9. [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md) — migrations / operator SQL  
10. [IMPACT-RELAY.md](IMPACT-RELAY.md) / live-cohort docs — IR integration  

## Phase status (2026-08-07)

| Phase | Status |
| --- | --- |
| Public suite on autogive.app | Live |
| Phase 2 platform Auth + workspace | **Operator-complete** (login verified) |
| Phase 3 allocation middleware pilot | Local smoke green; **production host open** |
| Production CRM import | Blocked |

## Quick operator commands

```bash
# Public suite smoke (from AGI repo)
./scripts/smoke-public-suite.sh

# Workspace runtime uses Vercel env (already set on fund-intel project):
#   PLATFORM_SUPABASE_URL
#   PLATFORM_SUPABASE_ANON_KEY

# Allocation pilot (local)
cd services/allocation-middleware
# create .env.pilot from platform keys (never commit)
npm test
# start: see package.json start:hacker-dojo:seed / compose:up
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
```

## Current baseline (suite)

```yaml
repository: scrimshawlife-ctrl/Fund-Intel
platform_supabase: utdioxwiskzatwoejgiu
legacy_staging_frozen: ecxkhihlbrcwpavfoaoq
reference_tenant: org_hacker_dojo
primary_master_admin: scrimshawlife@gmail.com
```
