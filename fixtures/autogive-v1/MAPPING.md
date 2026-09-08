# Schema mapping — AutoGive Synthetic Dataset v1

Source pack fields are schema-oriented, not a drop-in SQL dump. This table is the
canonical adapter for Portfolio Signals. Classification uses the task vocabulary.

| Dataset entity | Classification | Portfolio Signals target | Transform | Authority |
|---|---|---|---|---|
| `roles.csv` → `private/roles.json` | NATIVE | `auth.users`, `profiles`, `client_memberships` | Map dataset roles onto `public.app_role`. Deterministic UUIDs `00000000-0000-0000-0821-00000000000N`. | Synthetic membership only |
| tenant `org_synthetic_civic_forge` | NATIVE | `clients` | `id=org_synthetic_civic_forge`, `slug=synthetic-civic-forge`, `state=active`, `reference_tenant=false` | Not the HD reference tenant |
| campaign `cmp_synthetic_builder_fund_2026` | NATIVE | `am_org_meta.labels` + middleware campaign key | Lowercased pot key via `normalizeKey` | Public ID stays the campaign string |
| `funds` | NATIVE | `am_pots` (campaign/program) | `public_allocation_id` is the suite join key, not a UUID | Restricted vs unrestricted is fixture metadata |
| `donors` | NATIVE | `constituents` | `external_source=autogive_synthetic_v1`, `external_id=donor_id`. `granted`→`confirmed`, `suppressed`→`suppressed`. Emails stay in private fixture JSON (`example.test`); DB stores classification in `source_receipt`, not a public surface. | No outreach |
| `gifts` | NATIVE | `am_gifts` (+ pot credit when `status=cleared`) | `charge_id=fixture-{gift_id}`, `source=fixture`. Pending/refunded rows stay in the JSON corpus and may be inserted as gifts **without** pot credit. | Not Every.org live |
| `allocations` (human_finance + approved) | NATIVE | `am_allocations.id` | Public ID is the PK (`alloc_community_hardware`, …). Agent-proposed row is **not** auto-approved. | Human gate |
| `allocations` (`decision_source=agent_proposal`) | NATIVE (negative) | not inserted as approved | Edge `edge_008` | Agent cannot approve |
| `evidence`, `expenses`, `programs`, `links`, `outcomes` | BRIDGE_ONLY | retained under `bridge/` | Impact Relay ledger/receipt/outcome domain | Do not invent PS expense tables |
| `public/portfolio-signals-public-campaign.json` | PUBLIC_ONLY | validates against `schemas/public-campaign.schema.json` | Does **not** replace `data/public-campaign.json` | Aggregate only |
| `bridge/impact-relay-public-impact.json` | BRIDGE_ONLY / PUBLIC_ONLY | IR public impact | Raised/committed/donor counts live here; PS public-campaign schema has no those fields | `raisedSource=pilot_synthetic` |
| edge corpus | mixed | see ownership below | Executable here or documented as IR | SYNTHETIC |

## Role map (dataset → `public.app_role`)

| Dataset role | `app_role` | Why |
|---|---|---|
| `director` | `director` | 1:1 |
| `finance_approver` | `director` | Allocation writes are `director` \| `campaign_lead` \| master_admin. Finance L3 is the director gate in this repo. |
| `program_manager` | `campaign_lead` | Closest operational write role |
| `evidence_reviewer` | `data_steward` | Claims / import / evidence adjacent |
| `analyst` | `development` | Read + opportunity, no constituent write |
| `viewer` | `board_viewer` | Aggregate / opportunity read; no constituents |

There is no native `finance_approver`, `program_manager`, `analyst`, or `viewer` enum. Do not add enum values just to make the pack load.

## Public allocation IDs (stable)

```text
alloc_community_hardware
alloc_access_scholarships
alloc_facility_resilience
alloc_community_programs
```

Internal pot keys are `community-hardware-fund`, `access-scholarships`, `facility-resilience`, `community-programs` under campaign `cmp_synthetic_builder_fund_2026`.

## Gift totals (do not falsify)

| Measure | Value | Where |
|---|---:|---|
| Gift **records** | 438 | `private/gifts.json` |
| Gift **amount sum** (all statuses) | 286450 | includes 2 pending + 2 refunded |
| Cleared gifts | 434 | pot-credit candidates |
| Cleared amount | 283990 | credited to `am_pots` / middleware |
| Public raised / committed | 286450 / 174200 | IR public-impact fixture only |
| Approved allocation sum | 174200 | 72000+42000+50200+10000 (includes proposed 10000) |

Public `data/public-campaign.json` remains the fail-closed live shell (targets 0). Synthetic public targets 420000 / 2000000 live under `public/`.

## Edge-case ownership

| Case | Type | Owner | PS behavior |
|---|---|---|---|
| `edge_001` | duplicate provider event | NATIVE | Idempotent skip on `charge_id` / middleware `creditGift` |
| `edge_002` | restricted fund overallocation | NATIVE | `OVER_ALLOCATION` / `allocated_cents <= credited_cents` |
| `edge_003` | expense without evidence | BRIDGE_ONLY | IR blocks approval; PS has no expense table |
| `edge_004` | duplicate invoice digest | BRIDGE_ONLY | IR quarantine; documented |
| `edge_005` | suppressed contact | NATIVE | `consent_status=suppressed`; no outreach export |
| `edge_006` | stale public aggregate | NATIVE (policy test) | Corpus `updatedAt=2026-08-01` fails closed after 7 days |
| `edge_007` | PII in public payload | NATIVE | Schema / privacy walk rejects `donor_email` |
| `edge_008` | agent financial approval | NATIVE | `board_viewer` / non-approver cannot insert `am_allocations` |
| `edge_009` | correction lineage | BRIDGE_ONLY | IR append-only receipts |
| `edge_010` | unverified outcome | BRIDGE_ONLY + PS claim | Outcome `NOT_COMPUTABLE`; optional `claims.state=unverified` |

## How to add a fixture entity

1. Add JSON under `private/` (NATIVE), `bridge/` (IR), or `public/` (aggregate).
2. Update `manifest.json` counts and `MAPPING.md`.
3. Run `npm run synthetic:validate` (regenerates checksum enforcement).
4. Extend `scripts/synthetic/seed.mjs` only if the entity is NATIVE.
5. Add an edge case to `edge_cases/acceptance-corpus.json` with `provenance: SYNTHETIC` and an owner field.

Never mark the new row `OBSERVED`.
