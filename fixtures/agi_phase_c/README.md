# AGI Phase C public-safe fixtures (Portfolio Signals copy)

Representative public-safe copies so this repository shares the same public
narrative vocabulary as AGI and Impact Relay. **Not a live campaign. Not a
live gift. Not READY.**

C3 public-data policy remains **PROPOSED**. These files do not approve it.

## Canonical

Community AI Lab / 25 laptops / 2500 USD (`canonical/`).

| File | Contract |
| --- | --- |
| `canonical/public_campaign.json` | This repo’s `schemas/public-campaign.schema.json` and AGI `validatePublicCampaign` |
| `canonical/public_impact.json` | Impact Relay public-impact shape and AGI `validatePublicImpact` |
| `canonical/narrative.json` | AGI `FundingDecision` + `ImpactEvent` (`2026-08-02`) |
| `canonical/spec011-notes.json` | SPEC-011 lifecycle order and fail-closed `NOT_COMPUTABLE` notes |

Public join key on the campaign / impact / narrative documents:
`alloc_community_ai_lab`.

SPEC-011’s demo `allocationId` is the UUID
`c6c2e191-3000-4000-8000-000000000001`. That value does **not** match
`^alloc_[a-z0-9_]+$` and is **NOT_COMPUTABLE** as
`public-campaign.allocations[].allocationId`. See `spec011-notes.json`.

## Non-canonical

Hacker Dojo / Community Hardware (`noncanonical/`). Labeled integration
fixtures only. Not the public demo.

| File | Source copy |
| --- | --- |
| `noncanonical/hacker-dojo-public-campaign.json` | AGI `validPublicCampaign` shape (`alloc_community_hardware`) |
| `noncanonical/hacker-dojo-public-impact.json` | Impact Relay `fixtures/agi_phase_c/public_impact.json` (18 attendees) |
| `noncanonical/community-hardware-narrative.json` | AGI `community-hardware-narrative.json` |

Hacker Dojo $250 / 18 attendees is this labeled non-canonical set. It is not
the SPEC-011 demo.

The existing allocation-middleware seed
`services/allocation-middleware/fixtures/hacker-dojo-pilot.json` is the same
non-canonical Hacker Dojo integration fixture (pilot seed, not the public
narrative).

## Live public document

`data/public-campaign.json` stays the fail-closed public shell. These fixture
trees are not that document and are not published on the Worker/CDN
(`.assetsignore` / `.vercelignore`).

## Out of scope

No secrets, login unpark, payments, Phase D runtime host, every.org pointing,
or production import.
