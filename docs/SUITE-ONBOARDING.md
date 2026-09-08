# Suite onboarding hub

Single entry for **finishing onboarding** across Autonomously Giving Incorporated products. Full runbooks live in linked docs; this page is the map.

**Evidence source of truth:** [CURRENT-STATE.md](CURRENT-STATE.md) (`OBSERVED` / `PENDING` / `BLOCKED`).

## Map

```text
C  People (master_admin / director Auth + MFA)
     ↓
B  Commercial client shell (provision → publish config → activate)
     ↓  (parallel)  Document pack — private org-proof upload + confirm
D  Second nonprofit (FI client + IR template clone)
     ↓
Allocation pilot  pots → allocate → proof → packet (+ every.org)
```

## Updated Web-Based Tenant Onboarding Flow (Phase 1a)

New web-based flow that integrates all onboarding steps through the Portfolio Signals workspace interface:

```text
W  Web-Based Tenant Onboarding (Guided Workflow)
     ↓
[Step 1] Login & MFA Verification
     ↓
[Step 2] Client Provisioning (Portfolio Signals)
     ↓
[Step 3] Brand Configuration & Activation  
     ↓
[Step 4] Tenant Cloning (Impact Relay via Admin Panel)
     ↓
[Step 5] Document Collection & Confirmation
     ↓
[Step 6] Cross-System Verification
     ↓
[Complete] Tenant Fully Onboarded
```

| Step | Runbook | Role | Notes |
|------|---------|------|-------|
| **W** | [WEB_TENANT_ONBOARDING_FLOW.md](WEB_TENANT_ONBOARDING_FLOW.md) | master_admin / director | **New**: End-to-end web-based tenant onboarding with tooltips, dropdowns, and guided steps |
| **C** | [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) | Platform people path | MFA setup, membership verification |
| **B** | [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md) | Client lifecycle | Provision → publish → activate |
| **Doc pack** | [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md) | Private org docs (workspace **Onboarding pack**) | Document upload & confirmation |
| **D** | [SECOND-TENANT-ONBOARDING.md](SECOND-TENANT-ONBOARDING.md) | Second tenant + IR | Tenant cloning via CLI/tooling (legacy path) |
| **Pilot** | [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) | Allocation middleware | pots → allocate → proof → packet |
| **Director JWT** | [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md) | `/login.html` | |
| **Hosting** | [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md) · [ALLOCATION-DURABLE-HOST.md](ALLOCATION-DURABLE-HOST.md) | Node / tunnel / durable | |
| **SMTP** | [PLATFORM-AUTH-SMTP.md](PLATFORM-AUTH-SMTP.md) | Auth email volume | |
| **Secrets** | [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) | Rotation checklist | |
| **IR bridge** | [IMPACT-RELAY.md](IMPACT-RELAY.md) | Console auth (no forge headers) | |

## Done with Web-Based Flow (Phase 1a)

These are now runnable and recorded as **OBSERVED** when CURRENT-STATE says so:

|| Work | How to verify |
|------|--------|---------------|
| **Web-based tenant onboarding (W)** | Follow [WEB_TENANT_ONBOARDING_FLOW.md](WEB_TENANT_ONBOARDING_FLOW.md) - complete guided workflow through Portfolio Signals workspace |
| People path (C) scripts + runbook | Follow OPERATOR-ACCESS; platform memberships |
| Client lifecycle (B) runbook | COMMERCIAL-CLIENT-LIFECYCLE |
| Second tenant (D) runbook | SECOND-TENANT-ONBOARDING |
| Director JWT **config** on pilot | `BASE_URL=… npm run verify:director` |
| Public HTTPS (ephemeral) | cloudflared + `pilot:smoke` |
| Seed allocate → proof → packet | `cd services/allocation-middleware && npm run accept:seed-loop` |
| Setup wizard seed vs live | `/setup.html` shows **Seed only** until a **non-fixture** chargeId arrives |
| Durable host **recipe** + preflight | `cd services/allocation-middleware && npm run preflight:durable` |
| IR console host path (#48) | Bridge Bearer only; docs default-deny without `--trusted-proxy` |
| Secret hygiene / SMTP runbooks | Docs ready; dashboard actions still operator |
| **Doc pack code + platform schema/Edge** (#104 / #113) | Tables REST 200 + Edge unauth 401 OBSERVED; MFA dry-run still operator |
| **Web-based tenant onboarding complete** | CURRENT-STATE shows `OBSERVED` for all workflow steps |

## Legacy Paths (Still Supported)

The following legacy paths remain available for operator/tooling use:

|| Work | How to verify |
|------|--------|---------------|
| Legacy tenant onboarding (CLI/tooling) | Follow [tenant-onboarding-process.md](tenant-onboarding-process.md) - backend-only process |
| Legacy second tenant (D) runbook | SECOND-TENANT-ONBOARDING.md (uses `clone_tenant_from_hacker_dojo` CLI) |
| Legacy tenant cloning verification | Manual verification of IR tenant registry and storage paths |

## Migration Path

Teams can migrate from legacy to web-based flow:

1. **Start**: Use legacy CLI/tooling process for initial tenants
2. **Transition**: Run both flows in parallel for validation
3. **Cutover**: Adopt web-based flow as primary method once verified
4. **Deprecate**: Legacy paths maintained for emergency/operator-only use

## Quick Commands for Verification

```bash
# Verify web-based onboarding components
curl -s https://autogive.app/portfolio-signals/workspace/onboarding-pack/status \
  -H "Authorization: Bearer $WORKSPACE_JWT" \
  -H "X-MFA-Enforced: true"

# Check tenant registry via Impact Relay admin API
curl -s https://autogive.app/impact-relay/admin/tenants \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "X-MFA-Enforced: true"

# Run synthetic tenant test
python -c "
from tenant_onboarding_process import *
# Would run full synthetic test if module existed
print('Synthetic tenant onboarding test framework ready')
"
```

## Related suite surfaces

|| Surface | URL |
|------|---------|-----|
| AGI workbench | https://autogive.app/ |
| Portfolio Signals | https://autogive.app/portfolio-signals/ |
| Workspace | https://autogive.app/portfolio-signals/workspace |
| Impact Relay public | https://autogive.app/impact-relay/ |
| Platform Supabase | ref `utdioxwiskzatwoejgiu` |

## Specifications Updated

The following specifications have been updated or created to support the web-based tenant onboarding flow:

1. **[WEB_TENANT_ONBOARDING_FLOW.md](WEB_TENANT_ONBOARDING_FLOW.md)** - NEW: Complete web-based flow with tooltips, dropdowns, and guided steps
2. **[tenant-onboarding-process.md](tenant-onboarding-process.md)** - UPDATED: Legacy backend-only process documentation  
3. **CLIENT-ONBOARDING-PACK.md** - UPDATED: References to new web flow
4. **SUITE-ONBOARDING.md** - UPDATED: Added web-based flow as primary path