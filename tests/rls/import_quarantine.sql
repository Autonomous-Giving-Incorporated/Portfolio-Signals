-- HD-OI-015 executable acceptance checks.
-- Run against a disposable local Supabase/Postgres environment after all migrations.
-- The harness must create auth users and profiles for each role before executing role blocks.

begin;

-- Structural assertions.
do $$
begin
  if to_regclass('public.import_batches') is null then raise exception 'missing import_batches'; end if;
  if to_regclass('public.import_staging_rows') is null then raise exception 'missing import_staging_rows'; end if;
  if to_regclass('public.import_exceptions') is null then raise exception 'missing import_exceptions'; end if;
  if to_regclass('public.suppression_registry') is null then raise exception 'missing suppression_registry'; end if;
end $$;

-- RLS must be enabled on every quarantine relation.
do $$
declare
  rel text;
  enabled boolean;
begin
  foreach rel in array array['import_batches','import_staging_rows','import_exceptions','suppression_registry'] loop
    select relrowsecurity into enabled from pg_class where oid = ('public.' || rel)::regclass;
    if enabled is not true then raise exception 'RLS disabled on %', rel; end if;
  end loop;
end $$;

-- Promotion function must be security definer and not executable by anonymous/public.
do $$
declare
  definer boolean;
begin
  select prosecdef into definer
  from pg_proc
  where oid = 'public.promote_import_row(bigint)'::regprocedure;
  if definer is not true then raise exception 'promote_import_row must be security definer'; end if;
  if has_function_privilege('public','public.promote_import_row(bigint)','EXECUTE') then
    raise exception 'public must not execute promote_import_row';
  end if;
end $$;

-- Suppression propagation behavior.
-- A test harness should set request.jwt.claim.sub to the director test user and insert fixtures.
-- Expected invariant: changing constituents.consent_status to suppressed updates all related
-- opportunities.authorization_state to suppressed in the same transaction.

rollback;

-- Required role matrix executed by CI integration harness:
-- director: read/write batches, rows, exceptions, suppression registry; promote approved clean rows
-- data_steward: same as director except profile/decision authority remains unchanged
-- campaign_lead: read batches and suppression registry; cannot stage, approve, or promote rows
-- development: no quarantine or suppression-registry access
-- board_viewer: no quarantine or suppression-registry access
-- auditor: read-only batches, rows, exceptions, suppression registry
-- anonymous: no access
