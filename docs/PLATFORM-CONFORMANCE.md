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

This repository implements an authenticated campaign and decision workspace, import review, public campaign presentation, and a Worker-hosted allocation middleware (observe/credit + co-located allocate/proof/packet). Fund Intel Signal / Opportunity / Recommendation records are **CODE_SHIPPED** in-process (`services/allocation-middleware/src/intel/`) against SPEC-003 v2.1.0. In-process EVENT-001–003 payloads are retained. They are not published on a live bus, not a live Worker receipt, and not READY. The repo therefore MUST NOT claim Required or Recommended platform conformance.

The existing decision and approval screens are local campaign controls. They are not the Autonomous Giving allocation authority defined by [SPEC-006](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/v2.0.0/specs/SPEC-006-capability-boundaries.md), and they must not be represented as such without an approved migration. Intelligence never allocates.

## v2 artifacts this Worker implements or tracks

Honest status only. In-repo is not live pointing, not a live gift, and not leadership sign-off.

| Artifact | Status on this repo |
| --- | --- |
| SPEC-003 v2.1.0 | CODE_SHIPPED in-process. Signal / Opportunity / Recommendation records + tests. Not live. Not READY. Evidence: [FUND-INTEL-SIGNALS.md](FUND-INTEL-SIGNALS.md). Consumer pin remains Specs v2.0.0. |
| CONTRACT-001 | In-repo Opportunity records. Not a live publication receipt. |
| CONTRACT-002 | In-repo Recommendation records. Advisory only; MUST NOT mutate pots. |
| EVENT-001 / EVENT-002 / EVENT-003 | Retained in-process. Not published as named live events. |
| SPEC-023 | Tracked. Gift summaries + pot credits; no donation capture; Stripe `/webhooks/stripe` returns 404. |
| SPEC-024 | Tracked. every.org inbound webhook; Stripe is not a donation connector; optional Resend for ImpactNotice email. |
| SPEC-026 | Partial. Worker `POST /webhooks/every-org` and Worker `POST /import/csv` are in-repo. Live every.org pointing remains operator-owned. Gift write and Signal write stay separate. |
| SPEC-027 | In-repo after proof/waive when opt-in contact and tenant `donation_link` exist. Not a live send receipt. |
| SPEC-028 | Tracked as suite topology and money pointer (Cloudflare + Supabase; no fifth capability). This repo is not the AGI control plane. |
| SPEC-029 | Proposed 0.1.0. Not Accepted. Read-only in-process projection CODE_SHIPPED (`src/intel/mission-graph.mjs`). Not live. Not READY. No SoR, no graph DB, no learning-feedback minting. Evidence: [MISSION-GRAPH.md](MISSION-GRAPH.md). Consumer pin remains Specs v2.0.0. |
| SPEC-030 | Proposed only. Not Accepted. Not implemented. No metrics, formulas, or forecasting. |
| CONTRACT-013 | In-repo ImpactNotice records (`am_impact_notices`). Not a live delivery receipt. |
| EVENT-011 | Not published as a named event. Do not treat CONTRACT-013 persistence as EVENT-011. |

## Intended boundary

Portfolio Signals is responsible for observing, normalizing, recommending, and crediting gift summaries. It never allocates. The target platform surface is:

| Capability | Target platform artifacts |
| --- | --- |
| Observe and normalize | SPEC-003, EVENT-001 — in-process CODE_SHIPPED; not live |
| Create opportunity | CONTRACT-001, SCHEMA-001, EVENT-002 — in-process CODE_SHIPPED; not live |
| Generate recommendation | CONTRACT-002, SCHEMA-002, EVENT-003 — in-process CODE_SHIPPED; not live |
| Preserve lifecycle semantics | SPEC-004, SPEC-005, SPEC-008 |
| Track gifts / credit pots | SPEC-023, SPEC-024, SPEC-026 |
| ImpactNotice after Evidence or waive | SPEC-027, CONTRACT-013 (in-repo); EVENT-011 not yet published |
| Mission Graph projection | SPEC-029 Proposed — read-only CODE_SHIPPED; not Accepted; not live |

## Exit criteria for Recommended conformance

1. Introduce an implementation-neutral Signal-to-Opportunity boundary with source provenance and idempotency.
2. Validate produced Opportunity payloads against SCHEMA-001 and publish EVENT-002.
3. Validate produced Recommendation payloads against SCHEMA-002 and publish EVENT-003.
4. Remove or isolate any allocation behavior from the Portfolio Signals responsibility boundary.
5. Add contract fixtures and integration evidence; update `platform-conformance.yml` with the exact IDs implemented.
6. Keep the v2 money lock: no AGI donation checkout; Stripe MUST NOT write gifts or pot credits.

## Non-goals

This document does not alter campaign controls, authorize real allocations, invent a live Worker URL, or prescribe transport technology. It only records the platform migration boundary and the v2.0.0 pin.
