# Mission Graph projection (read-only)

| Field | Value |
| --- | --- |
| Spec | [SPEC-029](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-029-mission-graph-and-learning-feedback.md) **Proposed 0.1.0** — not Accepted |
| Consumer pin | Autonomous Giving Specs **v2.0.0** (`c089739`) — this PR does not move the pin |
| Status | **CODE_SHIPPED** in-repo · not live · not READY |
| Module | `services/allocation-middleware/src/intel/mission-graph.mjs` (pure reader; not a microservice) |
| Tests | `services/allocation-middleware/test/mission-graph.test.mjs` |

This is an in-process read-only projection over existing Fund Intel records and existing allocation-trail objects. It is not a live graph, not a graph database, not a second system of record, not a `workers.dev` receipt, and not leadership sign-off. SPEC-029 stays **Proposed**.

## What is in-repo

`projectMissionGraph` / `projectMissionGraphFromRecords` return a graph-shaped view (`nodes`, `edges`, `notComputable`) from snapshots that already exist:

| When present | Projected as | Owner |
| --- | --- | --- |
| Registered Need + Signal / Opportunity / Recommendation | Need, Signal, Opportunity, Recommendation | fund-intel |
| Pot + gift credit | Pot, GiftCredit | allocation-middleware |
| Allocation (`approved` + `approvedBy` / `approvedAt`) | Approval + Allocation (same canonical allocation id) | allocation-middleware |
| Proof | Evidence | allocation-middleware |
| ImpactNotice | ImpactNotice — **not** Impact | allocation-middleware |

Edges are created only from stored identifiers (`needId`, `signalIds`, `opportunityId`, pot path, `allocationId`, `evidenceId`). Missing targets are `NOT_COMPUTABLE`. Nodes and edges are not persisted.

## Fail closed

- Missing inputs → `status: NOT_COMPUTABLE`, empty nodes/edges.
- Present but empty records → `status: EMPTY`, empty nodes/edges.
- Execution, Receipt, Verification, and Impact have no canonical records here → `NOT_COMPUTABLE`. Gift summary is not Receipt. ImpactNotice is not Impact.
- Learning Feedback would mint a **new** Fund Intel Signal from verified Impact. No verified Impact exists. The projection returns `learningFeedback.status: NOT_COMPUTABLE` and `mintsSignal: false`. It does not publish a Signal.
- No `Impact → Recommendation / Approval / Allocation / Execution` path.
- Donor email / name / phone on a gift snapshot are omitted.

## Money and authority lock

The projection does not credit, debit, or lock a pot. Recommendations remain advisory. Stripe and unverified connectors still cannot create Signals. This module does not add donation processing or an AGI console UI.

## Out of scope (do not read this PR as)

- Accept of SPEC-029, or a consumer-pin bump off v2.0.0.
- SPEC-030 Accept, formulas, forecasting, or historical metric versions. Fail-closed policies live in [MISSION-INTELLIGENCE-METRICS.md](MISSION-INTELLIGENCE-METRICS.md); SPEC-030 stays Proposed.
- Learning-feedback Signal minting.
- Graph database, materialized SoR, or a new capability.

## How to exercise (local)

```bash
cd services/allocation-middleware
npm test
```

Mission Graph cases are in `test/mission-graph.test.mjs`.
