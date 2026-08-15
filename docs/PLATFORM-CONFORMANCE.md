# Autonomous Giving Platform conformance

| Field | Value |
| --- | --- |
| Platform specification release | `v2.0.0` (tag `v2.0.0`, commit `c089739`) |
| Repository role | Portfolio Signals — Fund Intel (intelligence) implementation |
| Current conformance level | Experimental |
| Declaration | [`platform-conformance.yml`](../platform-conformance.yml) · [`platform-spec/conformance.yml`](../platform-spec/conformance.yml) |
| Governing canon | [Autonomous-Giving-Specs v2.0.0](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/releases/tag/v2.0.0) |

This is an **experimental pin**, not a Required or Recommended runtime claim and not a READY receipt.

## Money and host lock (v2.0.0)

AGI **never processes donations**. It tracks gift summaries completed on third-party platforms. **every.org** is the P0 donation-source connector. **Stripe** is tenant/SaaS billing only and MUST NOT credit pots or create gifts. Designed stack is **Cloudflare Workers + platform Supabase**. Render, Fly, Railway, Cloud Run, and GitHub Pages are historical hosts, not current guidance.

## Current assessment

This repository implements an authenticated campaign and decision workspace, import review, public campaign presentation, and a Worker-hosted allocation middleware (observe/credit + co-located allocate/proof/packet). It does not yet publish or consume the canonical `SignalDetected`, `OpportunityCreated`, or `RecommendationGenerated` events, and it does not yet validate the shared Opportunity or Recommendation contracts. It therefore MUST NOT claim Required or Recommended platform conformance.

The existing decision and approval screens are local campaign controls. They are not the Autonomous Giving allocation authority defined by [SPEC-006](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/v2.0.0/specs/SPEC-006-capability-boundaries.md), and they must not be represented as such without an approved migration. Intelligence never allocates.

## v2 artifacts this Worker implements or tracks

Honest status only. In-repo is not live pointing, not a live gift, and not leadership sign-off.

| Artifact | Status on this repo |
| --- | --- |
| SPEC-023 | Tracked. Gift summaries + pot credits; no donation capture; Stripe `/webhooks/stripe` returns 404. |
| SPEC-024 | Tracked. every.org inbound webhook; Stripe is not a donation connector; optional Resend for ImpactNotice email. |
| SPEC-026 | Partial. Worker `POST /webhooks/every-org` is in-repo. Node CSV import (`services/allocation-middleware` `POST /import/csv`) is in-repo. Worker CSV twin is **in-flight** on [PR 26](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/pull/26), not on `main`. Live every.org pointing remains operator-owned. |
| SPEC-027 | In-repo after proof/waive when opt-in contact and tenant `donation_link` exist. Not a live send receipt. |
| SPEC-028 | Tracked as suite topology and money pointer (Cloudflare + Supabase; no fifth capability). This repo is not the AGI control plane. |
| CONTRACT-013 | In-repo ImpactNotice records (`am_impact_notices`). Not a live delivery receipt. |
| EVENT-011 | Not published as a named event. Do not treat CONTRACT-013 persistence as EVENT-011. |

## Intended boundary

Portfolio Signals is responsible for observing, normalizing, recommending, and crediting gift summaries. It never allocates. The target platform surface is:

| Capability | Target platform artifacts |
| --- | --- |
| Observe and normalize | SPEC-003, EVENT-001 |
| Create opportunity | CONTRACT-001, SCHEMA-001, EVENT-002 |
| Generate recommendation | CONTRACT-002, SCHEMA-002, EVENT-003 |
| Preserve lifecycle semantics | SPEC-004, SPEC-005, SPEC-008 |
| Track gifts / credit pots | SPEC-023, SPEC-024, SPEC-026 |
| ImpactNotice after Evidence or waive | SPEC-027, CONTRACT-013 (in-repo); EVENT-011 not yet published |

## Exit criteria for Recommended conformance

1. Introduce an implementation-neutral Signal-to-Opportunity boundary with source provenance and idempotency.
2. Validate produced Opportunity payloads against SCHEMA-001 and publish EVENT-002.
3. Validate produced Recommendation payloads against SCHEMA-002 and publish EVENT-003.
4. Remove or isolate any allocation behavior from the Portfolio Signals responsibility boundary.
5. Add contract fixtures and integration evidence; update `platform-conformance.yml` with the exact IDs implemented.
6. Keep the v2 money lock: no AGI donation checkout; Stripe MUST NOT write gifts or pot credits.

## Non-goals

This document does not alter campaign controls, authorize real allocations, invent a live Worker URL, or prescribe transport technology. It only records the platform migration boundary and the v2.0.0 pin.
