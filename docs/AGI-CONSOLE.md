# AGI console projection (read-only)

| Field | Value |
| --- | --- |
| Composes | [SPEC-029](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-029-mission-graph-and-learning-feedback.md) **Proposed 0.1.0** + [SPEC-030](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-030-mission-intelligence-metrics.md) **Proposed 0.1.0** — neither is Accepted |
| Consumer pin | Autonomous Giving Specs **v2.0.0** (`c089739`) — this PR does not move the pin |
| Status | **CODE_SHIPPED** in-repo · not live · not READY |
| Module | `services/allocation-middleware/src/intel/console-projection.mjs` (pure reader; not a microservice; not a product console) |
| Tests | `services/allocation-middleware/test/console-projection.test.mjs` |

This is an in-process read-only operator/console *view* over records and projections that already exist. It is not a live AGI console, not a second system of record, not a `workers.dev` receipt, not a freeze SHA, not a live gift, and not leadership sign-off. SPEC-029 and SPEC-030 stay **Proposed**.

## What is in-repo

`projectAgiConsole` / `projectAgiConsoleFromRecords` compose `projectMissionGraph` and `evaluateMissionMetrics`. The view surfaces only what those readers already return:

| Surface | Source | Honest result |
| --- | --- | --- |
| Signal / Opportunity / Recommendation ids | Existing Fund Intel records | Ids that are already stored. Missing records are not invented. |
| Graph status | Mission Graph projection | `PROJECTED` / `EMPTY` / `NOT_COMPUTABLE` |
| Metric families (OFS, NPI, EC, FIL, MY, ECONF, ORR) | Fail-closed SPEC-030 policies | `status: NOT_COMPUTABLE`, `value: null`, stated reason (`MISSING_INPUTS` or `NO_FORMULA`) |
| Learning Feedback | Graph + metrics | `NOT_COMPUTABLE`, `mintsSignal: false` |

The object is marked `live: false`, `ready: false`, `sourceOfRecord: false`, `persisted: false`.

## Fail closed

- Missing inputs → `status: NOT_COMPUTABLE`, empty id lists, metric `value: null`.
- Present but empty records → `status: EMPTY`, empty id lists.
- ImpactNotice is not Impact. No Impact id is minted. No `Impact → Recommendation / Approval / Allocation / Execution` path.
- Learning Feedback remains `NOT_COMPUTABLE` (`NO_VERIFIED_IMPACT`, `mintsSignal: false`).
- Donor email / name / phone on a gift snapshot are omitted.

## Money and authority lock

The projection does not write Fund Intel or allocation stores, mint Signals, or credit, debit, or lock a pot. Recommendations remain advisory. Stripe is still tenant/SaaS billing only. This module does not add a live portal panel, HTTP console route, or donation processing.

## Out of scope (do not read this PR as)

- Accept of SPEC-029 or SPEC-030, or a consumer-pin bump off v2.0.0.
- A live product console, scores, learning, Impact, forecasting, or a `workers.dev` URL.
- Graph database, metrics warehouse, microservice, or a new system of record.
- Learning-feedback Signal minting.

## How to exercise (local)

```bash
cd services/allocation-middleware
npm test
```

Console-projection cases are in `test/console-projection.test.mjs`.
