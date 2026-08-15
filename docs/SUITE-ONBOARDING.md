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

| Step | Runbook | Role |
| --- | --- | --- |
| **C** | [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) | Platform people path |
| **B** | [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md) | Client lifecycle |
| **Doc pack** | [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md) | Private org docs (workspace **Onboarding pack**) |
| **D** | [SECOND-TENANT-ONBOARDING.md](SECOND-TENANT-ONBOARDING.md) | Second tenant + IR |
| **Pilot** | [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) | Allocation middleware |
| **Director JWT** | [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md) | `/login.html` |
| **Hosting** | [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md) · [ALLOCATION-DURABLE-HOST.md](ALLOCATION-DURABLE-HOST.md) | Node / tunnel / durable |
| **SMTP** | [PLATFORM-AUTH-SMTP.md](PLATFORM-AUTH-SMTP.md) | Auth email volume |
| **Secrets** | [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) | Rotation checklist |
| **IR bridge** | [IMPACT-RELAY.md](IMPACT-RELAY.md) | Console auth (no forge headers) |

## Done without every.org (or other blocked) login

These are already runnable and recorded as **OBSERVED** when CURRENT-STATE says so:

| Work | How to verify |
| --- | --- |
| People path (C) scripts + runbook | Follow OPERATOR-ACCESS; platform memberships |
| Client lifecycle (B) runbook | COMMERCIAL-CLIENT-LIFECYCLE |
| Second tenant (D) runbook | SECOND-TENANT-ONBOARDING |
| Director JWT **config** on pilot | `BASE_URL=… npm run verify:director` |
| Public HTTPS (ephemeral) | cloudflared + `pilot:smoke` |
| Seed allocate → proof → packet | Worker tests + `cd services/allocation-middleware && npm run accept:seed-loop` (Node). Live Worker URL PENDING CF secrets. |
| Setup wizard seed vs live | `/setup.html` shows **Seed only** until a **non-fixture** chargeId arrives |
| Durable host **recipe** + preflight | `cd services/allocation-middleware && npm run preflight:durable` |
| IR console host path (#48) | Bridge Bearer only; docs default-deny without `--trusted-proxy` |
| Secret hygiene / SMTP runbooks | Docs ready; dashboard actions still operator |
| **Doc pack code + platform schema/Edge** | Tables REST 200 + Edge unauth 401 OBSERVED; MFA dry-run tracked in [#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18) |

Fixture gifts (`chargeId` matching `fixture-*`) **never** mark every.org **Connected**.

## Needs login (or external admin)

| Work | Login / access |
| --- | --- |
| Live every.org webhook + full director acceptance ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)) | every.org **Hacker Dojo nonprofit admin** + director browser session |
| **Doc pack MFA dry-run → full OBSERVED** ([#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18)) | MFA director/master → Workspace Onboarding pack (5 required + park xlsx) — [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md) |
| **Qi / Ed first login + TOTP** | Operator-local links `scripts/platform/.onboarding-invite-links.md` (gitignored); then `set-mfa-enforced` — [PEOPLE-AND-PACK-HANDOFF.md](PEOPLE-AND-PACK-HANDOFF.md) |
| **Pack dry-run (primary now)** | Primary already `mfa_enforced`; can complete Onboarding pack without waiting on Qi/Ed — handoff above |
| Durable **named public** host | Cloudflare Workers — [CLOUDFLARE.md](CLOUDFLARE.md); `CLOUDFLARE_*` GitHub secrets |
| Live every.org webhook | Worker route shipped; operator still owns CF secrets, `WEBHOOK_TOKEN`, every.org Advanced URL, and a controlled gift |
| Custom SMTP (optional) | Platform Supabase Dashboard — [PLATFORM-AUTH-SMTP.md](PLATFORM-AUTH-SMTP.md) |
| Secret rotation after share/offboard | Operator secret manager — [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) |
| Vercel team invite acceptance | **Invitee only** (owner cannot accept for them) |

### every.org when you have admin

1. Public HTTPS **Worker** with webhook route (code in-repo — [CLOUDFLARE.md](CLOUDFLARE.md)). Live deploy and every.org pointing remain operator-owned. Local tunnel is for smoke only.  
2. Open `/setup.html` → copy webhook URL.  
3. every.org admin → Settings → Advanced → paste.  
4. $1 test gift.  
5. Setup shows **Connected** only for a **live** (non-fixture) chargeId.  
6. Allocate via director login; complete issue #20.

## Quick commands

```bash
cd services/allocation-middleware
# .env.pilot with platform Supabase (gitignored)
set -a && source .env.pilot && set +a
npm test
npm run start:hacker-dojo:seed   # or start:hacker-dojo after seed
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
BASE_URL=http://127.0.0.1:8787 npm run verify:director
npm run accept:seed-loop
# optional public edge:
# cloudflared tunnel --url http://127.0.0.1:8787
```

## Related suite surfaces

| Surface | URL |
| --- | --- |
| AGI workbench | https://autogive.app/ |
| Portfolio Signals | https://autogive.app/portfolio-signals/ |
| Workspace | https://autogive.app/portfolio-signals/workspace |
| Impact Relay public | https://autogive.app/impact-relay/ |
| Platform Supabase | ref `utdioxwiskzatwoejgiu` |

Suite GitHub Project notes: AGI [docs/GITHUB-PROJECT.md](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/GITHUB-PROJECT.md).
Specs progress map: [IMPLEMENTATION-PROGRESS](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/superpowers/IMPLEMENTATION-PROGRESS.md).

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 22 + Hash: 645560ecfc722b6d040d9c21562681bbf579ba23
