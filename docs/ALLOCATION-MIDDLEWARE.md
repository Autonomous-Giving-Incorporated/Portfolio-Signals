# Allocation middleware — Portfolio Signals role

**Status:** MVP shipped · local pilot smoke green against platform Supabase (`utdioxwiskzatwoejgiu`) · director JWT OBSERVED · public HTTPS OBSERVED (ephemeral cloudflared) · live every.org webhook still open (#73) · seed-loop accept OBSERVED
**Canonical design:** [Specs design doc](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/specs/2026-08-03-allocation-middleware-design.md)  
**Suite summary:** [AGI PRODUCT-ALLOCATION-MIDDLEWARE](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PRODUCT-ALLOCATION-MIDDLEWARE.md)  
**Director login:** platform project + HD membership (see [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md)); operator already has master_admin + HD director on production Auth.

## Positioning

Portfolio Signals remains the **intelligence / observe** boundary: signals, opportunities, recommendations, and—in the middleware product—**gift summary ingestion and pot credits** from donation platforms.

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
| every.org webhook (`POST /webhooks/every-org`) | Shipped |
| CSV import | Shipped |
| Operator UI (Available · Allocate · Inbox · Packet) | Shipped |
| File-backed durable store (`DATA_FILE`) | Shipped |
| Proof + `MISSING_PROOF` SLA | Shipped |
| Setup wizard (`/setup.html`, webhook — not OAuth) | Shipped |
| Supabase director JWT + membership | Shipped (`/login.html`) |
| Hacker Dojo pilot seed + `SEED_ON_BOOT` | Shipped |
| Docker Compose pilot host | Shipped (default) |
| Optional Fly / Render / Railway recipes | Shipped |
| Live every.org gifts for Hacker Dojo | **Operator step** (#73 — not yet wired) |
| Public HTTPS (ephemeral tunnel) | OBSERVED (Phase 3b) |
| Named durable public host | **Optional** (Render / Railway / Fly / VPS) |
| Seed allocate→proof→packet | OBSERVED — `npm run accept:seed-loop` |

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

- [MVP implementation plan](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-allocation-middleware.md)  
- [Hacker Dojo pilot hosting plan](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-hacker-dojo-pilot-hosting.md)  

### Persistence reference

| Feature | How |
| --- | --- |
| File store | `DATA_FILE=./data/hacker-dojo.json` |
| Supabase DDL | Migration `202608030001_allocation_middleware.sql` (optional; Node pilot uses file store) |
| Proof | `POST /proofs` + `MISSING_PROOF` after `PROOF_SLA_HOURS` |
