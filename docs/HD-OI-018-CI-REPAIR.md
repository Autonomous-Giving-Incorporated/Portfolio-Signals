# HD-OI-018 — CI Migration Repair and Import-Gate Validation

## Observed failure

The first executable local Supabase run failed before policy assertions because two migration files used version `005`:

- `005_import_quarantine_and_suppression.sql`
- `005_private_storage.sql`

Supabase stores migration versions as unique keys, so the second migration was rejected.

## Repair

- Renumber private storage to `006_private_storage.sql`.
- Add CI rejection for duplicate migration prefixes.
- Add a synthetic import-gate corpus covering:
  - confirmed consent;
  - restricted consent;
  - unresolved duplicate exception;
  - suppression match.

## Evidence boundary

This repair does not claim the full suite passes until GitHub Actions completes on this branch. All fixtures are synthetic. No member, donor, attendee, or private campaign record is present.

## Acceptance gates

1. Local Supabase starts successfully.
2. Full migration chain applies in order.
3. Six-role fixtures load.
4. RLS acceptance checks execute.
5. Synthetic import-gate cases execute.
6. Static CI confirms unique migration versions.
7. No service-role secret or restricted export is committed.
