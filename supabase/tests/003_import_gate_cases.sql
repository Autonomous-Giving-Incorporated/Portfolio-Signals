-- HD-OI-018: synthetic import-gate acceptance cases
-- Runs only against disposable local data. No production identifiers are used.

begin;

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
  '00000000-0000-0000-0000-000000000001'
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

rollback;
