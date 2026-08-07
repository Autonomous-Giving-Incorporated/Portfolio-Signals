# Autonomous Giving Platform conformance

| Field | Value |
| --- | --- |
| Platform specification release | `v1.0.0` |
| Repository role | Portfolio Signals — intelligence implementation |
| Current conformance level | Experimental |
| Declaration | [`platform-conformance.yml`](../platform-conformance.yml) |
| Governing canon | [Autonomous-Giving-Specs v1.0.0](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/tree/v1.0.0) |

## Current assessment

This repository currently implements an authenticated campaign and decision workspace, import review, and public campaign presentation. It does not yet publish or consume the canonical `SignalDetected`, `OpportunityCreated`, or `RecommendationGenerated` events, and it does not yet validate the shared Opportunity or Recommendation contracts. It therefore MUST NOT claim Required or Recommended platform conformance.

The existing decision and approval screens are local campaign controls. They are not the Autonomous Giving allocation authority defined by [SPEC-006](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/v1.0.0/specs/SPEC-006-service-boundaries.md), and they must not be represented as such without an approved migration.

## Intended boundary

Portfolio Signals is responsible for observing, normalizing, and recommending. It never allocates. The target platform surface is:

| Capability | Target platform artifacts |
| --- | --- |
| Observe and normalize | SPEC-003, EVENT-001 |
| Create opportunity | CONTRACT-001, SCHEMA-001, EVENT-002 |
| Generate recommendation | CONTRACT-002, SCHEMA-002, EVENT-003 |
| Preserve lifecycle semantics | SPEC-004, SPEC-005, SPEC-008 |

## Exit criteria for Recommended conformance

1. Introduce an implementation-neutral Signal-to-Opportunity boundary with source provenance and idempotency.
2. Validate produced Opportunity payloads against SCHEMA-001 and publish EVENT-002.
3. Validate produced Recommendation payloads against SCHEMA-002 and publish EVENT-003.
4. Remove or isolate any allocation behavior from the Portfolio Signals responsibility boundary.
5. Add contract fixtures and integration evidence; update `platform-conformance.yml` with the exact IDs implemented.

## Non-goals

This document does not alter campaign controls, authorize real allocations, or prescribe transport technology. It only records the platform migration boundary.
