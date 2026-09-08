# C3 public-data policy — written deferral (2026-08-22)

**Status: DEFERRED, still PROPOSED.** This is **not** leadership sign-off, **not** engineering sign-off, **not** READY, and **not** a freeze SHA.

The draft remains [Autonomous-Giving-Incorporated `docs/PUBLIC_DATA_POLICY.md`](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/PUBLIC_DATA_POLICY.md) (decision packet in [AGI PR 23](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/pull/23)). Impact Relay tracks the same unsigned gate in [`docs/CONTRACT-GOVERNANCE.md`](https://github.com/Autonomous-Giving-Incorporated/Impact-Relay/blob/main/docs/CONTRACT-GOVERNANCE.md).

## Decision

C3 evidence-access / retention / redaction / public-publication rules stay **PROPOSED**.

Required sign-off (Portfolio Signals owner, Impact Relay owner, AGI engineering, plus leadership) has **not** occurred. Until it does:

- AGI Phase D (runtime read-only narrative) stays **gated**
- SPEC-028 login runtime stays **PARKED** on the AGI public site
- Live `data/public-campaign.json` stays the authenticated/blocked shell
- Live `data/public-impact.json` stays the gated empty shell (`source: gated:public_shell`, `outcomes: []`)
- Civic Forge and Phase C fixtures stay `SYNTHETIC_ONLY` / in-repo only
- Fail-closed AGI fallback stays Community AI Lab

This deferral does **not** change the draft rules. It records that they are not approved.

## 2026-08-22 packet update

AGI turned the draft into a four-seat sign-off packet. Recommended answers are the fail-closed rules already enforced by the public-source adapter. The sign-off table is still empty. A cloud agent must not fill it or flip `PUBLIC_DATA_POLICY_STATUS`.

## Why not approve from this session

A cloud agent cannot supply the three-owner + leadership signatures the draft itself requires. Approving C3 from this checkout would invent sign-off.

## Re-open condition

C3 leaves PROPOSED only when the named owners record explicit approval on the AGI policy sign-off table and change `PUBLIC_DATA_POLICY_STATUS` in the same follow-up. Until then, treat this file as the current Portfolio Signals receipt.

Related: [PRODUCTION-READINESS-AND-CONTINUATION-2026-08-22.md](PRODUCTION-READINESS-AND-CONTINUATION-2026-08-22.md) Wave 1.3.
