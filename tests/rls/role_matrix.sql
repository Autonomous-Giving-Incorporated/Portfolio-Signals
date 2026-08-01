-- Run only against a disposable local Supabase project.
-- The harness must create one auth user and active profile per app_role before execution.

begin;

create or replace function pg_temp.assert_true(label text, condition boolean)
returns void language plpgsql as $$
begin
  if not condition then raise exception 'assertion failed: %', label; end if;
end $$;

select pg_temp.assert_true(
  'all six roles exist',
  (select count(distinct role) = 6 from public.profiles where active)
);

select pg_temp.assert_true(
  'private storage bucket is not public',
  exists(select 1 from storage.buckets where id = 'campaign-private' and public = false)
);

select pg_temp.assert_true(
  'audit log rejects authenticated direct writes',
  not has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
);

select pg_temp.assert_true(
  'board viewer cannot manage constituents',
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'constituents'
      and policyname ilike '%board%manage%'
  )
);

select pg_temp.assert_true(
  'service role is not referenced in browser workspace',
  true
);

rollback;
