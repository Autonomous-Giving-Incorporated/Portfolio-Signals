# Allocation middleware — Portfolio Signals role

**Status:** MVP shipped · local pilot smoke green against platform Supabase (`utdioxwiskzatwoejgiu`) · director JWT OBSERVED · public HTTPS OBSERVED (ephemeral cloudflared) · Worker webhook route shipped · live every.org pointing still open ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)) · seed-loop accept OBSERVED
**Canonical design:** [Specs design doc](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/superpowers/specs/2026-08-03-allocation-middleware-design.md)  
**Suite summary:** [AGI PRODUCT-ALLOCATION-MIDDLEWARE](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/PRODUCT-ALLOCATION-MIDDLEWARE.md)  
**Director login:** platform project + HD membership (see [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md)); operator already has master_admin + HD director on production Auth.

## Positioning

Portfolio Signals remains the **intelligence / observe** boundary: signals, opportunities, recommendations, and—in the middleware product—**gift summary ingestion and pot credits** from donation platforms. Fund Intel records live in-process at `services/allocation-middleware/src/intel/` (**CODE_SHIPPED**, not live, not READY). A Recommendation MUST NOT mutate a pot. See [FUND-INTEL-SIGNALS.md](FUND-INTEL-SIGNALS.md).

It does **not** own human approval of allocations (Autonomous Giving capability) or deep evidence verification (Impact Relay capability). The MVP co-locates allocate/proof/packet UI with credit ingestion in a modular monolith package (Specs SPEC-002A / SPEC-020 Profile B).

## Relevance to Portfolio Signals

| Middleware concept | Portfolio Signals affinity |
| --- | --- |
| every.org / connector adapters | Observation of external fundraising state |
| Campaign pot / program slice credits | Normalized “what came in” without full ledger |
| Allocation proposals (optional) | Recommendation-style suggestions; still non-authorizing until approved |
| Exception: unmapped fundraiser/designation | Operator review of new external keys |

## Explicit non-overlap

- No payment processing  
- No deep QuickBooks/bank sync as product center  
- No replacing Impact Relay proof/receipts for the full donor chain  

## Package location

```text
services/allocation-middleware/
```

Public `data/public-campaign.json` contracts for the GitHub Pages suite remain separate and advisory-only.

## Implementation status (2026-08-03)

| Area | State |
| --- | --- |
| Domain (pots, gifts, allocate, exceptions, packet) | Shipped |
| Fund Intel Signal / Opportunity / Recommendation | CODE_SHIPPED in-process (`src/intel/`); not live; not READY |
| Mission Graph projection (SPEC-029 Proposed) | CODE_SHIPPED read-only (`src/intel/mission-graph.mjs`); not live; not READY; not Accepted |
| Mission Intelligence metrics (SPEC-030 Proposed) | CODE_SHIPPED fail-closed policies (`src/intel/metrics.mjs`); not live; not READY; not Accepted; no formula |
| AGI console projection (read-only view) | CODE_SHIPPED (`src/intel/console-projection.mjs`); not live; not READY; not a product console; SPEC-029/030 stay Proposed |
| every.org webhook (`POST /webhooks/every-org`) | Shipped |
| CSV import | Shipped on Node (`POST /import/csv`) and Worker (same path; director write; SPEC-026 twin) |
| Operator UI (Available · Allocate · Inbox · Packet) | Shipped |
| File-backed durable store (`DATA_FILE`) | Shipped |
| Proof + `MISSING_PROOF` SLA | Shipped |
| Setup wizard (`/setup.html`, webhook — not OAuth) | Shipped |
| Supabase director JWT + membership | Shipped (`/login.html`) |
| Hacker Dojo pilot seed + `SEED_ON_BOOT` | Shipped |
| Docker Compose pilot host | Shipped (local) |
| Optional Fly / Render / Railway recipes | Historical only — not the designed host |
| Live every.org gifts for Hacker Dojo | **Operator step** ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20) — live URL + gift; Worker route already in-repo) |
| Public HTTPS (ephemeral tunnel) | OBSERVED (Phase 3b local smoke) |
| Named durable public host | **Cloudflare Workers** — [CLOUDFLARE.md](CLOUDFLARE.md) |
| Seed allocate→proof→packet | OBSERVED — `npm run accept:seed-loop` |
| Tenant `donation_link` + ImpactNotice after proof/waive | In-repo (SPEC-027). Not a live send receipt. Resend + named host remain operator-owned. |

### Local (Hacker Dojo default)

```bash
cd services/allocation-middleware
npm test
npm run start:hacker-dojo:seed    # org_hacker_dojo + SEED_ON_BOOT
# open http://127.0.0.1:8787
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
```

| Path | Use |
| --- | --- |
| `/` | Available / allocate / proof / packet |
| `/login.html` | Director login (Supabase JWT) |
| `/setup.html` | every.org webhook wizard (later) |

Default org id: **`org_hacker_dojo`**. Generic demos can still set `ORG_ID=org_demo`.

### Auth

| Mode | When |
| --- | --- |
| Supabase director / campaign_lead JWT | Preferred for pilot writes |
| `OPERATOR_TOKEN` | Dev / emergency fallback (`ALLOW_OPERATOR_TOKEN_FALLBACK`) |
| `WEBHOOK_TOKEN` | every.org webhook (`x-webhook-token` or `?token=`) |

### Related docs

| Doc | Purpose |
| --- | --- |
| [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) | Local + hosted pilot runbook |
| [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md) | Supabase membership + `/login.html` |
| [ALLOCATION-MIDDLEWARE-PRODUCTION.md](ALLOCATION-MIDDLEWARE-PRODUCTION.md) | Deploy gates, env, Fly |
| Package [README](../services/allocation-middleware/README.md) | npm scripts |

### Plans (Specs)

- [MVP implementation plan](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-allocation-middleware.md)  
- [Hacker Dojo pilot hosting plan](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-hacker-dojo-pilot-hosting.md)  

### Persistence reference

| Feature | How |
| --- | --- |
| File store | `DATA_FILE=./data/hacker-dojo.json` |
| Supabase DDL | Migration `202608030001_allocation_middleware.sql` (optional; Node pilot uses file store) |
| Proof | `POST /proofs` + `MISSING_PROOF` after `PROOF_SLA_HOURS` |
