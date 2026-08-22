# AutoGive Synthetic Dataset v1 (repository fixture)

Canonical **development / disposable** universe for Portfolio Signals and allocation middleware.

```yaml
dataset: autogive-synthetic-dataset
version: 1.0.0
seed: 20260821
classification: SYNTHETIC_ONLY
tenant_id: org_synthetic_civic_forge
campaign_id: cmp_synthetic_builder_fund_2026
```

This is **not** live campaign data, **not** Every.org, and **not** `OBSERVED`.

## Why JSON, not the source CSV pack

The uploaded pack used `private_synthetic/*.csv`. This repository **rejects committed CSV/XLSX** (`validate-and-deploy`, `local-supabase-tests`, `AGENTS.md`, `SECURITY.md`). The pack was normalized to JSON. Original CSV SHA-256 values are recorded in `provenance.json`.

## Layout

```text
fixtures/autogive-v1/
  manifest.json                 dataset identity + expected counts
  provenance.json               SYNTHETIC_ONLY + original pack hashes
  SHA256SUMS.txt                hashes of committed fixture artifacts
  MAPPING.md                    field → table → classification
  README.md                     this file
  public/                       PUBLIC_ONLY aggregates (PS schema)
  private/                      NATIVE PS seed (roles, funds, donors, gifts, allocations)
  bridge/                       Impact Relay + public-impact (do not force into PS tables)
  middleware/pilot.json         privacy-safe gift summaries for allocation middleware
  edge_cases/acceptance-corpus.json
```

## Public vs private

| Tree | Allowed on public surfaces |
|---|---|
| `public/` | Yes — aggregate only, no donor rows |
| `private/` | No — RLS / workspace / middleware tests |
| `bridge/` | IR public-impact is aggregate-only; expenses/outcomes are private-to-IR |
| `middleware/` | Gift **summaries** only (`fixture-*` charge IDs, no emails) |

`data/public-campaign.json` is the **live fail-closed** shell. Do not overwrite it with this fixture. Validate the synthetic public file with `npm run public:fixture:synthetic`.

## Commands

```bash
# no database
npm run synthetic:validate
npm run public:fixture:synthetic
npm run synthetic:test

# disposable local Supabase only (refuses platform refs)
supabase start && supabase db reset
npm run seed:synthetic
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/024_autogive_synthetic_v1.sql

# allocation middleware (does not touch HD seed)
cd services/allocation-middleware
ORG_ID=org_synthetic_civic_forge MEMORY_ONLY=1 node scripts/seed-synthetic.mjs
```

Reset: `supabase db reset` then `npm run seed:synthetic` again. The seed is idempotent (`ON CONFLICT` / skipped charge IDs).

## IDs

- Tenant: `org_synthetic_civic_forge` (`^org_[a-z0-9_]+$`).
- Users: `00000000-0000-0000-0821-00000000000N` (N=1..6).
- Gifts: `fixture-gift_syn_NNNNN` (live-gift detector requires `fixture-` / `fixture_`).
- Allocations at the suite boundary: `alloc_community_hardware` and siblings — never replace these with random UUIDs.

## Impact Relay

Bridge fixtures in `bridge/` are the handoff. Next repo to integrate is Impact Relay, using the same IDs. This PR does not implement IR ingestion.
