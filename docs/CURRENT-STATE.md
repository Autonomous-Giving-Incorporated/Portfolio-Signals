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
tenant_assets_layout: assets/tenants/\u003cslug\u003e/  # HD under assets/tenants/hacker-dojo/
legacy_hd_staging_ref: ecxkhihlbrcwpavfoaoq  # FROZEN for new tenancy
```

PLACEHOLDER_WILL_FIX