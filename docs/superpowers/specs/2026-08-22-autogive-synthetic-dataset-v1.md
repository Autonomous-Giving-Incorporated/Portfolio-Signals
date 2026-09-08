# AutoGive Synthetic Dataset v1 — Portfolio Signals integration

**Date:** 2026-08-22  
**Status:** Implementation in this PR. Not READY. Not OBSERVED production data.  
**Classification:** `SYNTHETIC_ONLY`

## Goal

One deterministic synthetic universe (`org_synthetic_civic_forge`) populates local/disposable Portfolio Signals, exercises real RLS and allocation middleware, and exposes stable `alloc_*` suite IDs. It does not overwrite live `data/public-campaign.json` and does not weaken production gates.

## Non-negotiables

- Never label these records `OBSERVED`.
- Never commit `.csv` / `.xlsx` (CI and `AGENTS.md` / `SECURITY.md` forbid them). The source pack used CSV; the repo stores JSON.
- Never treat synthetic consent as outreach authority.
- Never credit gifts as live Every.org (`source=fixture`, `chargeId` prefix `fixture-`).
- Hacker Dojo (`org_hacker_dojo`) remains the reference tenant.

## Mapping

See [`fixtures/autogive-v1/MAPPING.md`](../../../fixtures/autogive-v1/MAPPING.md).

## Commands

```bash
npm run synthetic:validate
npm run public:fixture:synthetic
npm run synthetic:test
# disposable Supabase only
supabase start && supabase db reset
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql
SYNTHETIC_SEED_CONFIRM=1 DB_URL="$DB_URL" npm run seed:synthetic
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/024_autogive_synthetic_v1.sql
```

Developer guide: [`docs/SYNTHETIC-DATASET.md`](../../SYNTHETIC-DATASET.md).

