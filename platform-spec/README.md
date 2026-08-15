# Platform specification pin

This repository **pins** the Autonomous Giving Platform Specification at:

| Field | Value |
| --- | --- |
| Repository | [Autonomous-Giving-Incorporated/Autonomous-Giving-Specs](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs) |
| Version | **2.0.0** |
| Release | https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/releases/tag/v2.0.0 |
| Tag / commit | `v2.0.0` / `c089739` |
| Service role | Intelligence (`fund-intel` capability; product name Portfolio Signals) |

Do **not** track floating `main` of the specs repository for production behavior. Consume the tagged release package or git tag `v2.0.0`.

Conformance remains **Experimental**. This pin is not a Required/Recommended runtime claim.

## Manifest

[`conformance.yml`](conformance.yml) declares which SPECs, contracts, and events Portfolio Signals implements or tracks (produces/consumes). Schema:

https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/v2.0.0/schemas/meta/conformance-manifest.schema.json

## Boundary (from platform canon)

Portfolio Signals observes, normalizes, recommends, and credits gift summaries only. It **must not** allocate funds, grant Approval, or process donations. every.org is the P0 connector. Stripe is tenant/SaaS billing only. In-process Signal / Opportunity / Recommendation records are CODE_SHIPPED against SPEC-003 v2.1.0; they are not live and not READY. SPEC-029 remains Proposed; a read-only in-process Mission Graph projection is CODE_SHIPPED and is not an Accept. SPEC-030 remains Proposed only.

## Updating the pin

1. Review the specs release notes and migration guide.
2. Bump `platform_spec.version` in `conformance.yml`.
3. Update produced/consumed artifact lists if the release changes them.
4. Re-run product validation against the pinned schemas from the release package.
