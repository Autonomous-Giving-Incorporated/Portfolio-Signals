# Second-tenant onboarding (suite)

Operator path to stand up a **second nonprofit** after people access (slice C) and commercial client lifecycle (slice B). Hacker Dojo (`org_hacker_dojo`) remains the **reference template**, not product identity.

**Platform (FI):** Supabase `utdioxwiskzatwoejgiu`  
**Workspace:** https://autogive.app/portfolio-signals/workspace  
**Evidence (IR):** Impact Relay package + local/S3 tenant store  
**Design:** [docs/superpowers/specs/2026-08-06-second-tenant-product-design.md](superpowers/specs/2026-08-06-second-tenant-product-design.md)

## Authority gates

```yaml
production_import: BLOCKED
service_role_on_vercel: PROHIBITED
secrets_in_git: PROHIBITED
self_serve_nonprofit_marketplace: OUT_OF_SCOPE  # this runbook is operator-only
```

- Shared id contract: **FI `client_id` == IR `tenant_id`** (form `org_[a-z0-9_]+`).
- Second tenant must have `reference_tenant = false` (only HD is the reference fixture).
- Master admin provisions/activates FI; director publishes FI brand config.
- IR registration is operator/library tooling — not browser service-role.

## Prerequisites

1. [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — master_admin + director MFA for the new org.  
2. [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md) — know provision → publish → activate.  
3. Impact Relay checkout with install per IR README (`clone_tenant_from_hacker_dojo` available).  
4. Choose a **synthetic** id, e.g. `org_second_makerspace` (do not re-activate HD if already active).

## Happy path

### 1. People (slice C)

- Invite director Auth user; ensure-profile; MFA; `mfa_enforced`.  
- master_admin already on platform.

### 2. Portfolio Signals client (slice B)

1. Platform admin → provision client with id `org_*`, slug, display name, initial director UUID.  
2. Director → Brand & content → enable ≥1 fundraising module → publish.  
3. master_admin → Activate.  
4. Optional: `scripts/platform/verify-client-lifecycle.sql` with `target_client_id`.

### 3. Impact Relay tenant (template clone)

From an Impact Relay checkout (operator machine; tenant-scoped data directory):

```python
from pathlib import Path
from impact_relay.storage.template import clone_tenant_from_hacker_dojo
from impact_relay.storage import open_storage

# Use a data dir dedicated to this tenant only
store = open_storage(Path("./data/org_second_makerspace"))
policy = clone_tenant_from_hacker_dojo(
    tenant_id="org_second_makerspace",  # MUST match FI client_id
    display_name="Second Makerspace",
)
store.tenants.upsert_from_policy(policy, template_source="org_hacker_dojo")
```

Notes:

- Same confidence / evidence / L3 **shape** as HD; new tenant ids.  
- Do **not** hard-code Hacker Dojo money invariants in product code — only fixtures/tests/docs.  
- See IR [docs/HACKER-DOJO-INTEGRATION.md](https://github.com/Autonomous-Giving-Incorporated/Impact-Relay/blob/main/docs/HACKER-DOJO-INTEGRATION.md).

### 4. Isolation verify

**FI**

- [ ] Second client `state = active`, `reference_tenant` is false  
- [ ] Active director membership for that client only  
- [ ] Published public config differs from HD when both published (`get_public_client_config` per slug)  
- [ ] Optional: `scripts/platform/verify-second-tenant-isolation.sql` if present  
- [ ] Automated baseline: `supabase/tests/014_agi_two_tenant_acceptance.sql` patterns  

**IR**

- [ ] `tenant_id` equals FI `client_id`  
- [ ] Registry row present; `template_source` = `org_hacker_dojo` (or equivalent)  
- [ ] Objects / ledger scoped under that tenant only  
- [ ] HD fixture/CI oracle still green  

## Failure modes

| Symptom | Fix |
| --- | --- |
| FI activate fails | COMMERCIAL-CLIENT-LIFECYCLE failure table |
| ID mismatch FI vs IR | Use identical `org_*` string |
| Cross-tenant data visible | Stop; isolation regression — run policy suite |
| Second tenant marked reference | Never set `reference_tenant` true except HD |
| IR clone confuses HD fixtures | Use separate data-dir; do not overwrite HD pilot store |
| Self-serve signup expected | Out of scope — operator path only |

## Synthetic ids

Examples: `org_second_makerspace`, `org_lifecycle_dry_run` (if activated in B). Prefer disposable labels for dry-runs.

## Related

- [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md)  
- [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md)  
- [CLIENT-CONFIGURATION.md](CLIENT-CONFIGURATION.md)  
- [AGI-SUITE-ARCHITECTURE.md](AGI-SUITE-ARCHITECTURE.md)  
- IR: [HACKER-DOJO-INTEGRATION.md](https://github.com/Autonomous-Giving-Incorporated/Impact-Relay/blob/main/docs/HACKER-DOJO-INTEGRATION.md)  
- IR: [docs/architecture/AGI-SUITE.md](https://github.com/Autonomous-Giving-Incorporated/Impact-Relay/blob/main/docs/architecture/AGI-SUITE.md)  
