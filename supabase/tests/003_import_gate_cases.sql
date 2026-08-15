-- HD-OI-018: synthetic import-gate acceptance cases
-- Runs only against disposable local data after six_roles.sql.
-- No production identifiers are used.

\set ON_ERROR_STOP on

create or replace function public.test_set_user(test_user uuid) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.aal', 'aal2', true);
  perform set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
end $$;

revoke execute on function public.test_set_user(uuid) from public, anon;
grant execute on function public.test_set_user(uuid) to authenticated;

create or replace function public.test_import_row_was_promoted(
  test_row_id bigint,
  test_constituent_id uuid
) returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1
    from public.import_staging_rows
    where id = test_row_id
      and state = 'promoted'
      and promoted_constituent_id = test_constituent_id
  );
$$;

revoke execute on function public.test_import_row_was_promoted(bigint, uuid) from public, anon;
grant execute on function public.test_import_row_was_promoted(bigint, uuid) to authenticated;

begin;

-- Structural quarantine contract.
do $$
declare
  rel text;
  enabled boolean;
  definer boolean;
begin
  if to_regclass('public.import_batches') is null then raise exception 'missing import_batches'; end if;
  if to_regclass('public.import_staging_rows') is null then raise exception 'missing import_staging_rows'; end if;
  if to_regclass('public.import_exceptions') is null then raise exception 'missing import_exceptions'; end if;
  if to_regclass('public.suppression_registry') is null then raise exception 'missing suppression_registry'; end if;

  foreach rel in array array['import_batches','import_staging_rows','import_exceptions','suppression_registry'] loop
    select relrowsecurity into enabled from pg_class where oid = ('public.' || rel)::regclass;
    if enabled is not true then raise exception 'RLS disabled on %', rel; end if;
  end loop;

  select prosecdef into definer
  from pg_proc
  where oid = 'public.promote_import_row(bigint)'::regprocedure;
  if definer is not true then raise exception 'promote_import_row must be security definer'; end if;
  if has_function_privilege('public','public.promote_import_row(bigint)','EXECUTE') then
    raise exception 'public must not execute promote_import_row';
  end if;
end $$;

insert into public.import_batches (
  id, source_name, source_sha256, source_received_at, row_count,
  schema_version, state, storage_object_path, submitted_by
) values (
  '10000000-0000-0000-0000-000000000018',
  'synthetic-import-gates.xlsx',
  repeat('a', 64),
  now(),
  4,
  'synthetic-v1',
  'exception_review',
  'synthetic/fixtures/import-gates.xlsx',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.import_staging_rows (
  batch_id, source_row_number, external_source, external_id,
  normalized_record, row_fingerprint, state, exception_codes,
  consent_candidate, relationship_candidate
) values
(
  '10000000-0000-0000-0000-000000000018', 1,
  'synthetic', 'confirmed-001',
  '{"display_name":"Synthetic Confirmed"}'::jsonb,
  repeat('1', 64), 'approved', '{}', 'confirmed', 'public_adjacency'
),
(
  '10000000-0000-0000-0000-000000000018', 2,
  'synthetic', 'restricted-002',
  '{"display_name":"Synthetic Restricted"}'::jsonb,
  repeat('2', 64), 'approved', '{consent_restricted}', 'restricted', 'public_adjacency'
),
(
  '10000000-0000-0000-0000-000000000018', 3,
  'synthetic', 'duplicate-003',
  '{"display_name":"Synthetic Duplicate"}'::jsonb,
  repeat('3', 64), 'duplicate', '{possible_duplicate}', 'confirmed', 'public_adjacency'
),
(
  '10000000-0000-0000-0000-000000000018', 4,
  'synthetic', 'suppressed-004',
  '{"display_name":"Synthetic Suppressed"}'::jsonb,
  repeat('4', 64), 'suppressed', '{suppression_match}', 'suppressed', 'public_adjacency'
);

insert into public.import_exceptions (staging_row_id, code, severity, detail)
select id, 'possible_duplicate', 'error', 'Synthetic unresolved duplicate fixture'
from public.import_staging_rows
where batch_id = '10000000-0000-0000-0000-000000000018'
  and external_id = 'duplicate-003';

do $$
begin
  if (select count(*) from public.import_staging_rows where batch_id = '10000000-0000-0000-0000-000000000018') <> 4 then
    raise exception 'synthetic import corpus is incomplete';
  end if;

  if not exists (
    select 1 from public.import_staging_rows
    where external_id = 'confirmed-001'
      and consent_candidate = 'confirmed'
      and state = 'approved'
  ) then
    raise exception 'eligible synthetic row is not approved';
  end if;

  if not exists (
    select 1 from public.import_staging_rows
    where external_id = 'restricted-002'
      and consent_candidate = 'restricted'
  ) then
    raise exception 'restricted-consent fixture missing';
  end if;

  if not exists (
    select 1 from public.import_staging_rows r
    join public.import_exceptions e on e.staging_row_id = r.id
    where r.external_id = 'duplicate-003'
      and e.severity = 'error'
      and e.resolved_at is null
  ) then
    raise exception 'unresolved duplicate fixture missing';
  end if;

  if not exists (
    select 1 from public.import_staging_rows
    where external_id = 'suppressed-004'
      and consent_candidate = 'suppressed'
      and state = 'suppressed'
  ) then
    raise exception 'suppression fixture missing';
  end if;
end $$;

-- Capture synthetic row ids before role switching so RLS cannot hide fixtures.
create temp table gate_row_ids (
  external_id text primary key,
  staging_row_id bigint not null
);

insert into gate_row_ids (external_id, staging_row_id)
select external_id, id
from public.import_staging_rows
where batch_id = '10000000-0000-0000-0000-000000000018';

-- Temp tables are owned by the session superuser; authenticated JWT tests need read access.
grant select on gate_row_ids to authenticated;

-- Force suppressed row into approved state while still superuser so promotion
-- gate is evaluated on consent rather than staging lifecycle state.
update public.import_staging_rows
set state = 'approved'
where id = (select staging_row_id from gate_row_ids where external_id = 'suppressed-004');

-- Promotion gates under authenticated JWT claims.
set local role authenticated;
select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$
declare
  v_id bigint;
begin
  select staging_row_id into v_id from gate_row_ids where external_id = 'restricted-002';
  begin
    perform public.promote_import_row(v_id);
    raise exception 'restricted consent unexpectedly promoted';
  exception
    when others then
      if sqlerrm not like '%consent_blocks_promotion%' then
        raise;
      end if;
  end;
end $$;

do $$
declare
  v_id bigint;
begin
  select staging_row_id into v_id from gate_row_ids where external_id = 'suppressed-004';
  begin
    perform public.promote_import_row(v_id);
    raise exception 'suppressed record unexpectedly promoted';
  exception
    when others then
      if sqlerrm not like '%consent_blocks_promotion%' then
        raise;
      end if;
  end;
end $$;

-- Unauthorized role must not promote eligible rows.
select public.test_set_user('00000000-0000-0000-0000-000000000104');
do $$
declare
  v_id bigint;
begin
  select staging_row_id into v_id from gate_row_ids where external_id = 'confirmed-001';
  begin
    perform public.promote_import_row(v_id);
    raise exception 'unauthorized promotion unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%insufficient_role%' then
        raise;
      end if;
  end;
end $$;

-- Eligible confirmed row promotes only for steward/director.
select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$
declare
  v_id bigint;
  v_constituent uuid;
begin
  select staging_row_id into v_id from gate_row_ids where external_id = 'confirmed-001';
  v_constituent := public.promote_import_row(v_id);
  if v_constituent is null then
    raise exception 'eligible confirmed row did not promote';
  end if;
  if not public.test_import_row_was_promoted(v_id, v_constituent) then
    raise exception 'eligible promotion did not mark row promoted';
  end if;
end $$;

rollback;
