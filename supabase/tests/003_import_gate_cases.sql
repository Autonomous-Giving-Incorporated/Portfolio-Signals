-- HD-OI-018: synthetic import-gate acceptance cases
-- Runs only against disposable local data. No production identifiers are used.

begin;

-- These fixtures are intentionally synthetic and must never be replaced with
-- copied member, donor, or attendee records.

insert into public.import_batches (
  id, source_name, source_sha256, state, created_by
) values (
  '10000000-0000-0000-0000-000000000018',
  'synthetic-import-gates.xlsx',
  repeat('a', 64),
  'review',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.import_rows (
  id, batch_id, row_number, source_payload, normalized_payload,
  state, consent_status, duplicate_state
) values
(
  '10000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000018',
  1,
  '{"name":"Synthetic Confirmed"}'::jsonb,
  '{"display_name":"Synthetic Confirmed"}'::jsonb,
  'reviewable', 'confirmed', 'clear'
),
(
  '10000000-0000-0000-0000-000000000102',
  '10000000-0000-0000-0000-000000000018',
  2,
  '{"name":"Synthetic Unknown"}'::jsonb,
  '{"display_name":"Synthetic Unknown"}'::jsonb,
  'blocked', 'unknown', 'clear'
),
(
  '10000000-0000-0000-0000-000000000103',
  '10000000-0000-0000-0000-000000000018',
  3,
  '{"name":"Synthetic Duplicate"}'::jsonb,
  '{"display_name":"Synthetic Duplicate"}'::jsonb,
  'blocked', 'confirmed', 'possible_duplicate'
),
(
  '10000000-0000-0000-0000-000000000104',
  '10000000-0000-0000-0000-000000000018',
  4,
  '{"name":"Synthetic Suppressed"}'::jsonb,
  '{"display_name":"Synthetic Suppressed"}'::jsonb,
  'blocked', 'suppressed', 'clear'
);

-- Confirm the four mandatory gate classes exist in the disposable corpus.
do $$
begin
  if (select count(*) from public.import_rows where batch_id = '10000000-0000-0000-0000-000000000018') <> 4 then
    raise exception 'synthetic import corpus is incomplete';
  end if;

  if not exists (
    select 1 from public.import_rows
    where id = '10000000-0000-0000-0000-000000000101'
      and consent_status = 'confirmed'
      and duplicate_state = 'clear'
      and state = 'reviewable'
  ) then
    raise exception 'eligible synthetic row is not reviewable';
  end if;

  if exists (
    select 1 from public.import_rows
    where id in (
      '10000000-0000-0000-0000-000000000102',
      '10000000-0000-0000-0000-000000000103',
      '10000000-0000-0000-0000-000000000104'
    ) and state <> 'blocked'
  ) then
    raise exception 'a consent, duplicate, or suppression case bypassed blocking';
  end if;
end $$;

rollback;
