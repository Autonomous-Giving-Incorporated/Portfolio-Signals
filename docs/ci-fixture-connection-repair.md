# CI Fixture Connection Repair

## Observed failure

The disposable Supabase stack started and the complete migration chain applied successfully. The fixture step then invoked `psql` without a usable connection URL because the workflow attempted to parse `DB_URL` using a line-specific `sed` expression. `psql` consequently fell back to the default local Unix socket and failed.

## Repair

The workflow now evaluates the trusted environment assignments emitted by `supabase status -o env`, verifies that `DB_URL` is populated, and reuses the validated value for both fixture loading and RLS acceptance tests.

## Evidence status

This repair does not claim fixture or RLS success until GitHub Actions completes on the repair branch.
