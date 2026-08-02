-- AGI-002: operational records and privileged RPCs must fail closed across clients.
begin;

insert into public.clients (id, slug, display_name, state)
values ('org_operational_isolation', 'operational-isolation', 'Operational Isolation Client', 'active')
on conflict (id) do update set state = 'active';

insert into public.client_memberships (client_id, user_id, role, active)
values ('org_operational_isolation', '00000000-0000-0000-0000-000000000102', 'director', true)
on conflict (client_id, user_id) do update set role = excluded.role, active = true;

insert into public.constituents (
  client_id, external_source, external_id, display_name, relationship_class,
  consent_status, created_by
) values (
  'org_operational_isolation', 'synthetic', 'other-client-person', 'Other Client Constituent',
  'verified_current', 'confirmed', '00000000-0000-0000-0000-000000000102'
);

insert into public.opportunities (client_id, type, title, created_by)
values ('org_operational_isolation', 'gift', 'Other Client Opportunity', '00000000-0000-0000-0000-000000000102');

insert into public.decisions (client_id, key, title)
values ('org_operational_isolation', 'other-client-decision', 'Other Client Decision');

insert into public.claims (client_id, claim, state)
values ('org_operational_isolation', 'Other client private claim', 'verified');

insert into public.import_batches (
  client_id, source_name, source_sha256, source_received_at, row_count,
  schema_version, storage_object_path, submitted_by
) values (
  'org_operational_isolation', 'other-client.xlsx', repeat('8', 64), now(), 1,
  'synthetic-v1', 'org_operational_isolation/quarantine/other-client.xlsx',
  '00000000-0000-0000-0000-000000000102'
);

insert into public.import_staging_rows (
  client_id, batch_id, source_row_number, external_source, external_id,
  normalized_record, row_fingerprint, state, consent_candidate
)
select
  'org_operational_isolation', id, 1, 'synthetic', 'other-client-row',
  '{"display_name":"Other Client Import"}'::jsonb, repeat('9', 64), 'staged', 'confirmed'
from public.import_batches
where client_id = 'org_operational_isolation' and source_sha256 = repeat('8', 64);

create temporary table agi_other_row_id as
select id from public.import_staging_rows
where client_id = 'org_operational_isolation'
limit 1;
grant select on agi_other_row_id to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
declare v_other_row_id bigint;
begin
  if exists (select 1 from public.constituents where client_id = 'org_operational_isolation') then
    raise exception 'cross-client constituent visible';
  end if;
  if exists (select 1 from public.opportunities where client_id = 'org_operational_isolation') then
    raise exception 'cross-client opportunity visible';
  end if;
  if exists (select 1 from public.decisions where client_id = 'org_operational_isolation') then
    raise exception 'cross-client decision visible';
  end if;
  if exists (select 1 from public.claims where client_id = 'org_operational_isolation') then
    raise exception 'cross-client claim visible';
  end if;
  begin
    if exists (select 1 from public.import_batches where client_id = 'org_operational_isolation') then
      raise exception 'cross-client import batch visible';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  select id into v_other_row_id from agi_other_row_id;

  begin
    perform public.approve_import_row(v_other_row_id);
    raise exception 'cross-client approve_import_row unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-client approve_import_row unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%insufficient_role%' then raise; end if;
  end;
end $$;

reset role;
rollback;
