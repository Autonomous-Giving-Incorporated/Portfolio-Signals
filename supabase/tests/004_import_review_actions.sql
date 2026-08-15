-- HD-OI-019: approve / reject / promote actions under live role claims.
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

begin;

insert into public.import_batches (
  id, source_name, source_sha256, source_received_at, row_count,
  schema_version, state, storage_object_path, submitted_by
) values (
  '10000000-0000-0000-0000-000000000019',
  'synthetic-review-actions.xlsx',
  repeat('c', 64),
  now(),
  3,
  'synthetic-v1',
  'exception_review',
  'synthetic/fixtures/review-actions.xlsx',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.import_staging_rows (
  batch_id, source_row_number, external_source, external_id,
  normalized_record, row_fingerprint, state, exception_codes,
  consent_candidate, relationship_candidate
) values
(
  '10000000-0000-0000-0000-000000000019', 1,
  'synthetic', 'review-confirmed',
  '{"display_name":"Review Confirmed"}'::jsonb,
  repeat('5', 64), 'staged', '{}', 'confirmed', 'public_adjacency'
),
(
  '10000000-0000-0000-0000-000000000019', 2,
  'synthetic', 'review-reject-me',
  '{"display_name":"Review Reject"}'::jsonb,
  repeat('6', 64), 'staged', '{}', 'confirmed', 'public_adjacency'
),
(
  '10000000-0000-0000-0000-000000000019', 3,
  'synthetic', 'review-blocked',
  '{"display_name":"Review Restricted"}'::jsonb,
  repeat('7', 64), 'staged', '{consent_restricted}', 'restricted', 'public_adjacency'
);

create temp table review_ids (
  external_id text primary key,
  staging_row_id bigint not null
);
insert into review_ids(external_id, staging_row_id)
select external_id, id
from public.import_staging_rows
where batch_id = '10000000-0000-0000-0000-000000000019';
grant select on review_ids to authenticated;

set local role authenticated;

-- Unauthorized role cannot approve.
select public.test_set_user('00000000-0000-0000-0000-000000000104');
do $$
declare v_id bigint;
begin
  select staging_row_id into v_id from review_ids where external_id = 'review-confirmed';
  begin
    perform public.approve_import_row(v_id);
    raise exception 'board viewer approve unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%insufficient_role%' then raise; end if;
  end;
end $$;

-- Director approves eligible row.
select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$
declare
  v_id bigint;
  v_row public.import_staging_rows;
begin
  select staging_row_id into v_id from review_ids where external_id = 'review-confirmed';
  v_row := public.approve_import_row(v_id);
  if v_row.state <> 'approved' then
    raise exception 'approve did not set approved state';
  end if;
end $$;

-- Restricted consent cannot be approved.
do $$
declare v_id bigint;
begin
  select staging_row_id into v_id from review_ids where external_id = 'review-blocked';
  begin
    perform public.approve_import_row(v_id);
    raise exception 'restricted row approve unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%consent_blocks_approval%' then raise; end if;
  end;
end $$;

-- Reject flow.
do $$
declare
  v_id bigint;
  v_row public.import_staging_rows;
begin
  select staging_row_id into v_id from review_ids where external_id = 'review-reject-me';
  v_row := public.reject_import_row(v_id, 'synthetic_reject');
  if v_row.state <> 'rejected' then
    raise exception 'reject did not set rejected state';
  end if;
end $$;

-- Promote approved eligible row.
do $$
declare
  v_id bigint;
  v_constituent uuid;
begin
  select staging_row_id into v_id from review_ids where external_id = 'review-confirmed';
  v_constituent := public.promote_import_row(v_id);
  if v_constituent is null then
    raise exception 'promote returned null constituent';
  end if;
  if not public.test_import_row_was_promoted(v_id, v_constituent) then
    raise exception 'promote did not mark row promoted';
  end if;
end $$;

-- Rejected row cannot be promoted.
do $$
declare v_id bigint;
begin
  select staging_row_id into v_id from review_ids where external_id = 'review-reject-me';
  begin
    perform public.promote_import_row(v_id);
    raise exception 'rejected row promote unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%row_not_approved%' then raise; end if;
  end;
end $$;

rollback;
