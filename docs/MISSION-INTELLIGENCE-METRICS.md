# Mission Intelligence metric policies (fail-closed)

| Field | Value |
| --- | --- |
| Spec | [SPEC-030](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-030-mission-intelligence-metrics.md) **Proposed 0.1.0** — not Accepted |
| Consumer pin | Autonomous Giving Specs **v2.0.0** (`c089739`) — this PR does not move the pin |
| Status | **CODE_SHIPPED** in-repo · not live · not READY |
| Module | `services/allocation-middleware/src/intel/metrics.mjs` (in-process policies; not a microservice; not a metrics warehouse) |
| Tests | `services/allocation-middleware/test/metrics.test.mjs` |

This is an in-process map of versioned calculation policies. It is not a live dashboard, not a `workers.dev` receipt, not a freeze SHA, not a live gift, and not leadership sign-off. SPEC-030 stays **Proposed**.

## Families (from SPEC-030 — do not invent an eighth)

SPEC-030 names **seven** families. There is no PIN family.

| Id | Name | Policy version | Policy status |
| --- | --- | --- | --- |
| OFS | Opportunity Fit Score | 0.1.0 | proposed |
| NPI | Need Pressure Index | 0.1.0 | proposed |
| EC | Evidence Completeness | 0.1.0 | proposed |
| FIL | Funding-to-Impact Latency | 0.1.0 | proposed |
| MY | Mission Yield | 0.1.0 | proposed |
| ECONF | Evidence Confidence | 0.1.0 | proposed |
| ORR | Opportunity Realization Rate | 0.1.0 | proposed |

Each policy object has `id`, `version`, `status: proposed`, required inputs, admissible evidence, staleness handling, classification mapping, tenant/project applicability, and failure conditions. `formula` is `null`.

## Fail closed — SPEC-030 gives no formula

SPEC-030 “intentionally defines no arbitrary scoring formula” and “does not accept a formula by naming a metric.” Forecasting is later work. Therefore every `evaluateMetric` / `evaluateMissionMetrics` path returns:

- `status: NOT_COMPUTABLE`
- `epistemic: NOT_COMPUTABLE`
- `value: null`
- `reason: MISSING_INPUTS` when required inputs are missing or empty (ImpactNotice does not satisfy verified Impact)
- `reason: NO_FORMULA` when required inputs are present but computing a number would invent a formula SPEC-030 does not give

Outputs retain the SPEC-030 required fields (metric id, policy version, produced time, tenant/project scope, input identifier refs, provenance, epistemic class, reproducibility). They do not invent a score, baseline, index, rate, or latency.

Learning Feedback remains `NOT_COMPUTABLE` (`NO_VERIFIED_IMPACT`, `mintsSignal: false`).

## Money and authority lock

The evaluator does not write Fund Intel records, mint Signals, credit/debit/lock pots, treat ImpactNotice as Impact, or add `Impact → Recommendation / Approval / Allocation / Execution`. Donor email / name / phone are omitted from retained refs. Stripe is still tenant/SaaS billing only.

## Out of scope (do not read this PR as)

- Accept of SPEC-030, or a consumer-pin bump off v2.0.0.
- Numeric scores, baselines, live dashboards, or forecasting. A read-only console *view* that repeats these fail-closed results lives in [AGI-CONSOLE.md](AGI-CONSOLE.md); it is not a dashboard and is not READY.
- A metrics warehouse, microservice, or new system of record.
- Learning-feedback Signal minting.

## How to exercise (local)

```bash
cd services/allocation-middleware
npm test
```

Metric-policy cases are in `test/metrics.test.mjs`.
