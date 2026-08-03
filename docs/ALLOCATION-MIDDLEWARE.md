# Allocation middleware — Fund Intel role

**Canonical design:** [Specs design doc](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/specs/2026-08-03-allocation-middleware-design.md)  
**Suite summary:** [AGI PRODUCT-ALLOCATION-MIDDLEWARE](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PRODUCT-ALLOCATION-MIDDLEWARE.md)

## Positioning

Fund Intel remains the **intelligence / observe** boundary: signals, opportunities, recommendations, and—in the middleware product—**gift summary ingestion and pot credits** from donation platforms.

It does **not** own human approval of allocations (Autonomous Giving capability) or evidence verification (Impact Relay capability).

## Relevance to Fund Intel

| Middleware concept | Fund Intel affinity |
| --- | --- |
| every.org / connector adapters | Observation of external fundraising state |
| Campaign pot / program slice credits | Normalized “what came in” without full ledger |
| Allocation proposals (optional) | Recommendation-style suggestions; still non-authorizing until approved |
| Exception: unmapped fundraiser/designation | Operator review of new external keys |

## Explicit non-overlap

- No payment processing  
- No deep QuickBooks/bank sync as product center  
- No replacing Impact Relay proof/receipts  

## Implementation note

When middleware ships, prefer **capability modules** co-located in a modular monolith per Specs SPEC-002A / SPEC-020. Public `data/public-campaign.json` contracts for the GitHub Pages suite remain separate and advisory-only.
