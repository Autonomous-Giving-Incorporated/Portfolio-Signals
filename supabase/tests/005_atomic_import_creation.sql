-- HD-OI-019: atomic import creation, authorization, and rollback checks.
\set ON_ERROR_STOP on

create or replace function public.test_set_user(test_user uuid) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
end $$;

begin;
set local role authenticated;

-- Board viewers cannot create import batches.
select public.test_set_user('00000000-0000-0000-0000-000000000104');
do $$
begin
  begin
    perform public.create_import_batch(
      jsonb_build_object(
        'source_name', 'unauthorized.xlsx',
        'source_sha256', repeat('b', 64),
        'schema_version', 'synthetic-v1',
        'storage_object_path', 'org_hacker_dojo/quarantine/unauthorized.xlsx'
      ),
      '[]'::jsonb
    );
    raise exception 'board viewer atomic import unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%insufficient_role%' then raise; end if;
  end;
end $$;

-- A data steward can atomically create the batch and all staged rows.
select public.test_set_user('00000000-0000-0000-0000-000000000105');
do $$
declare
  v_result jsonb;
  v_batch_id uuid;
begin
  v_result := public.create_import_batch(
    jsonb_build_object(
      'source_name', 'atomic-success.xlsx',
      'source_sha256', repeat('d', 64),
      'source_received_at', now(),
      'schema_version', 'synthetic-v1',
      'storage_object_path', 'org_hacker_dojo/quarantine/atomic-success.xlsx',
      'receipt', jsonb_build_object('promotion_authorized', false)
    ),
    jsonb_build_array(
      jsonb_build_object(
        'source_row_number', 1,
        'external_source', 'synthetic',
        'normalized_record', jsonb_build_object('display_name', 'Atomic One'),
        'row_fingerprint', repeat('1', 64),
        'consent_candidate', 'unknown'
      ),
      jsonb_build_object(
        'source_row_number', 2,
        'external_source', 'synthetic',
        'normalized_record', jsonb_build_object('display_name', 'Atomic Two'),
        'row_fingerprint', repeat('2', 64),
        'consent_candidate', 'confirmed'
      )
    )
  );

  v_batch_id := (v_result->'batch'->>'id')::uuid;
  if (v_result->>'staged_row_count')::integer <> 2 then
    raise exception 'atomic import returned wrong staged row count';
  end if;
  if (v_result->>'promotion_authorized')::boolean is not false then
    raise exception 'atomic import granted promotion authority';
  end if;
  if not exists (
    select 1 from public.import_batches
    where id = v_batch_id
      and submitted_by = '00000000-0000-0000-0000-000000000105'
      and row_count = 2
      and state = 'received'
  ) then
    raise exception 'atomic import batch missing or incorrect';
  end if;
  if (select count(*) from public.import_staging_rows where batch_id = v_batch_id) <> 2 then
    raise exception 'atomic import staging rows missing';
  end if;
end $$;

-- Audit rows are intentionally visible only to directors and auditors.
select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$
begin
  if not exists (
    select 1
    from public.audit_log a
    join public.import_batches b on b.id::text = a.entity_id
    where a.action = 'import_batch_created'
      and b.source_sha256 = repeat('d', 64)
  ) then
    raise exception 'atomic import audit event missing';
  end if;
end $$;

-- A row constraint failure rolls the entire batch back, leaving no orphan.
select public.test_set_user('00000000-0000-0000-0000-000000000105');
do $$
begin
  begin
    perform public.create_import_batch(
      jsonb_build_object(
        'source_name', 'atomic-rollback.xlsx',
        'source_sha256', repeat('e', 64),
        'schema_version', 'synthetic-v1',
        'storage_object_path', 'org_hacker_dojo/quarantine/atomic-rollback.xlsx'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'source_row_number', 1,
          'normalized_record', '{}'::jsonb,
          'row_fingerprint', repeat('3', 64)
        ),
        jsonb_build_object(
          'source_row_number', 1,
          'normalized_record', '{}'::jsonb,
          'row_fingerprint', repeat('4', 64)
        )
      )
    );
    raise exception 'duplicate source row unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  if exists (select 1 from public.import_batches where source_sha256 = repeat('e', 64)) then
    raise exception 'failed atomic import left an orphaned batch';
  end if;
end $$;

rollback;
