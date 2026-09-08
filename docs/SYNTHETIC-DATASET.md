# AutoGive Synthetic Dataset v1

Canonical **development / disposable** universe for Portfolio Signals. Classification is `SYNTHETIC_ONLY`. It is not live campaign data, not Every.org, and not `OBSERVED`.

```yaml
dataset: autogive-synthetic-dataset
version: 1.0.0
seed: 20260821
classification: SYNTHETIC_ONLY
tenant_id: org_synthetic_civic_forge
campaign_id: cmp_synthetic_builder_fund_2026
```

Hacker Dojo (`org_hacker_dojo`) remains the reference tenant. Civic Forge sits beside it.

## Commands

```bash
# clean local environment
supabase start && supabase db reset
psql "$(eval "$(supabase status -o env)"; printf '%s' "$DB_URL")" \
  -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql

# load synthetic universe (refuses platform/legacy refs)
eval "$(supabase status -o env)"
SYNTHETIC_SEED_CONFIRM=1 DB_URL="$DB_URL" npm run seed:synthetic

# validate (no database)
npm run synthetic:validate
npm run public:fixture:synthetic
npm run synthetic:test

# RLS / money / role acceptance (requires the seed above)
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/024_autogive_synthetic_v1.sql
```

Reset: `supabase db reset`, reload `six_roles.sql`, then `npm run seed:synthetic` again. The seed uses `ON CONFLICT` upserts and is safe to rerun.

Allocation middleware (does not replace the Hacker Dojo seed):

```bash
cd services/allocation-middleware
npm test
npm run seed:synthetic
# or MEMORY_ONLY=1 npm run seed:synthetic
```

## Where the fixture lives

One corpus: [`fixtures/autogive-v1/`](../fixtures/autogive-v1/). Do not scatter copies.

| Path | Classification | Surface |
|---|---|---|
| `private/` | NATIVE | RLS, workspace, finance, import, middleware |
| `public/` | PUBLIC_ONLY | Aggregate campaign JSON only |
| `bridge/` | BRIDGE_ONLY | Impact Relay ledger / evidence / outcomes |
| `middleware/pilot.json` | NATIVE | Privacy-safe gift summaries (`fixture-*` charge IDs) |
| `edge_cases/` | mixed | Acceptance corpus with explicit `owner` |

`data/public-campaign.json` is the live fail-closed shell. Do not overwrite it. Validate the synthetic public file with `npm run public:fixture:synthetic`.

Schema mapping: [`fixtures/autogive-v1/MAPPING.md`](../fixtures/autogive-v1/MAPPING.md).

## How IDs are generated

| Entity | ID rule |
|---|---|
| Tenant | `org_synthetic_civic_forge` |
| Users | `00000000-0000-0000-0821-00000000000N` (N=1..6) |
| Donors | `donor_syn_NNNN` as `constituents.external_id` |
| Gifts | JSON `gift_syn_NNNNN` → DB/middleware `fixture-gift_syn_NNNNN` |
| Public allocations | `alloc_community_hardware` and siblings — suite joins, not random UUIDs |

`am_allocations.id` is a global text primary key. Disposable SQL uses the public IDs because Hacker Dojo SQL fixtures do not insert those same rows. If both tenants later persist the same public ID in one database, keep the public ID at the contract boundary and use a tenant-scoped internal PK.

## Public vs private

Private synthetic fixtures may contain reserved `example.test` contacts. They must never appear on a public surface. Public JSON is aggregate-only: no donor rows, no emails, `piiAllowed=false`.

Raised / committed / donor-count figures live on the Impact Relay public-impact fixture (`raisedSource=pilot_synthetic`, `raisedClaimLabel=PILOT`), not on the Portfolio Signals public-campaign schema.

## Gift totals (do not falsify)

| Measure | Value |
|---:|---|
| Gift records | 438 |
| Gift amount sum (all statuses) | 286450 |
| Cleared gifts | 434 |
| Cleared amount (pot credit) | 283990 |

Pending and refunded rows stay in the corpus and in `am_gifts` with `source=fixture`. They do not increase `am_pots.credited_cents`.

## Why synthetic data must never become `OBSERVED`

`OBSERVED` means a real runtime check on production or an executed live stack. This corpus is generated (`seed: 20260821`) and labeled `SYNTHETIC` / `PILOT`. Relabeling it `OBSERVED` would present fixture money, consent, and evidence as live donor facts.

## How to add a fixture entity

1. Add JSON under `private/` (NATIVE), `bridge/` (IR), or `public/` (aggregate).
2. Update `manifest.json` counts and `MAPPING.md`.
3. Run `node scripts/synthetic/write-checksums.mjs` then `npm run synthetic:validate`.
4. Extend `scripts/synthetic/seed.mjs` only if the entity is NATIVE.
5. Never commit `.csv` / `.xlsx`. Never mark the row `OBSERVED`.

## How to add an edge case

Add an object to `edge_cases/acceptance-corpus.json` with `provenance: SYNTHETIC` and `owner: NATIVE` or `BRIDGE_ONLY`. If this repository owns the behavior, add an executable test (`tests/autogive-synthetic-v1.test.mjs`, middleware tests, or `024_*.sql`). If Impact Relay owns it, keep `bridge_owner: Impact-Relay` and do not duplicate IR logic here.

## How Impact Relay consumes bridge fixtures

`fixtures/autogive-v1/bridge/` is the handoff: evidence, expenses, programs, joins, outcomes, and the public-impact aggregate. Next repo to integrate is **Impact Relay**, using the same IDs. This repository does not implement IR ingestion.

## Production refusal

`npm run seed:synthetic` requires `DB_URL` and `SYNTHETIC_SEED_CONFIRM=1`. It refuses platform ref `utdioxwiskzatwoejgiu` and legacy staging `ecxkhihlbrcwpavfoaoq`. Passing those tests does not make the product READY.
