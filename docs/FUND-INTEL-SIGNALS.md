# Fund Intel Signal / Opportunity / Recommendation

| Field | Value |
| --- | --- |
| Record contract | [SPEC-003 v2.1.0](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-003-signals-stack.md) (Accepted on Specs main after PR 8, `436e0fd`) |
| Consumer pin | Autonomous Giving Specs **v2.0.0** (`c089739`) — this PR does not move the pin |
| Status | **CODE_SHIPPED** in-repo · not live · not READY |
| Module | `services/allocation-middleware/src/intel/` (in-process; not a microservice) |
| Tests | `services/allocation-middleware/test/fund-intel.test.mjs` |

This is an in-process Fund Intel module. It is not a live event bus, not a `workers.dev` receipt, not a freeze SHA, not a live gift, and not leadership sign-off.

## What is in-repo

Append-only records owned by this repository (Fund Intel):

| Record | Required meaning | Public shape |
| --- | --- | --- |
| Signal | Immutable observation about a registered Need | EVENT-001 payload (`signalId`, `needId`, `source`, `subject`, `observedAt`, `capturedAt`, `confidence`) |
| Opportunity | Grouping of one Need and supporting `signalIds` | CONTRACT-001 (`open` \| `dismissed` \| `converted`) |
| Recommendation | Advisory proposal only | CONTRACT-002 |

Corrections are a new `signalId`. A later Recommendation is a new `recommendationId`. History is not rewritten.

In-process EVENT-001 / EVENT-002 / EVENT-003 payloads are retained on the intel store. They are **not** published on a network bus. Do not treat persistence as a live EVENT-001–003 receipt.

## Money and authority lock

- A Recommendation MUST NOT credit, debit, or lock a pot. Pot credit stays SPEC-026 (`chargeId` + `netAmount`).
- Intelligence MUST NOT create Approval, Allocation, Execution, Evidence, waive, or ImpactNotice.
- Stripe MUST NOT create Signals or gift summaries. `source: stripe` is rejected. `/webhooks/stripe` remains 404.
- Unverified connector input MUST NOT create a Signal. `every.org` and `csv` require `verified: true`.
- Signal `subject` / Opportunity `title` / Recommendation `rationale` MUST NOT contain donor email, name, or phone. Publish fails closed (`DONOR_PII_FORBIDDEN`).
- A gift without a Need MAY credit a pot and MUST NOT invent a Recommendation.

Gift write and Signal write are separate. `createService({ intel, resolveNeedForGift })` may call `maybeSignalFromVerifiedGift` **after** `creditGift` / CSV persist returns. Default `createService()` does not attach intel, so existing gift paths do not mint Signals.

A verified gift Signal, when produced, uses `source` `every.org` or `csv` and `subject` `{campaignKey}/{programKey}`. It does not copy donor PII.

## Staleness policy (implementation; not a SPEC TTL)

SPEC-003 v2.1.0 §25–26 requires a published horizon and **does not set a numeric TTL**. This repository publishes:

```yaml
id: fund-intel-staleness-v1
defaultHorizon: P90D
defaultHorizonDays: 90
basis: observedAt, else capturedAt
sourceClasses:
  every.org: P90D
  csv: P90D
  operator-note: P90D
  survey: P90D
  default: P90D
rule: >
  Stale Signals MUST NOT be the sole support for a new Recommendation
  or a new Opportunity. They MAY remain historical context when at
  least one non-stale supporting Signal remains. Opportunity MAY stay
  open or be dismissed. Do not mint a zero-rationale Recommendation.
```

Code: `services/allocation-middleware/src/intel/staleness.mjs` (`STALENESS_POLICY`).

## Out of scope (do not read this PR as)

- SPEC-029 Mission Graph / learning feedback — **Proposed only**. Not Accepted. A read-only in-process projection exists ([MISSION-GRAPH.md](MISSION-GRAPH.md)); it is not an Accept, not a SoR, and does not mint feedback Signals. No Impact → Recommendation path.
- SPEC-030 mission-intelligence metrics — **Proposed only**. Not Accepted. Versioned fail-closed policies exist ([MISSION-INTELLIGENCE-METRICS.md](MISSION-INTELLIGENCE-METRICS.md)); they return NOT_COMPUTABLE and do not invent scores.
- AGI console projection — read-only in-process view ([AGI-CONSOLE.md](AGI-CONSOLE.md)). Not a live product console. Not READY. Does not mint Signals or Accept SPEC-029/030.
- Graph database, forecasting, scoring-model training, or a new capability.
- Live Worker URL, live every.org pointing, or READY conformance.

## Topology

SPEC-003 allows a module inside a modular monolith. This implementation is in-process next to allocation-middleware. Recommendation state lives on a **separate** intel store from pots/gifts.

## How to exercise (local)

```bash
cd services/allocation-middleware
npm test
```

The Fund Intel cases are in `test/fund-intel.test.mjs`. They prove the happy path, pot isolation, new `signalId` on correction, missing Need, unverified/Stripe rejection, PII rejection, stale-only do-not-recommend, and gift-without-Need credit.
