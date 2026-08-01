begin;

create type public.import_batch_status as enum ('uploaded','validating','exception_review','approved','rejected','promoted');
create type public.import_exception_status as enum ('open','resolved','waived','rejected');

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_sha256 text not null unique,
  source_type text not null check (source_type in ('xlsx','csv','pdf','api')),
  status public.import_batch_status not null default 'uploaded',
  uploaded_by uuid not null references public.profiles(id),
  row_count integer,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.import_staging_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_row integer not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  provenance jsonb not null default '{}'::jsonb,
  promotion_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  unique(batch_id, source_row)
);

create table public.import_exceptions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  staging_row_id uuid references public.import_staging_rows(id) on delete cascade,
  code text not null,
  severity text not null check (severity in ('info','warning','high','critical')),
  status public.import_exception_status not null default 'open',
  detail text not null,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.import_batches enable row level security;
alter table public.import_staging_rows enable row level security;
alter table public.import_exceptions enable row level security;

create policy "data stewards manage import batches" on public.import_batches
for all using (public.current_role() in ('director','campaign_lead','data_steward'))
with check (public.current_role() in ('director','campaign_lead','data_steward'));

create policy "data stewards manage staging rows" on public.import_staging_rows
for all using (public.current_role() in ('director','data_steward'))
with check (public.current_role() in ('director','data_steward'));

create policy "authorized roles view import exceptions" on public.import_exceptions
for select using (public.current_role() in ('director','campaign_lead','data_steward','auditor'));

create policy "data stewards resolve import exceptions" on public.import_exceptions
for update using (public.current_role() in ('director','data_steward'))
with check (public.current_role() in ('director','data_steward'));

create or replace function public.capture_audit_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events(actor_id, action, entity_type, entity_id, before_state, after_state)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_constituents after insert or update or delete on public.constituents
for each row execute function public.capture_audit_event();
create trigger audit_opportunities after insert or update or delete on public.opportunities
for each row execute function public.capture_audit_event();
create trigger audit_decisions after insert or update or delete on public.decisions
for each row execute function public.capture_audit_event();
create trigger audit_claims after insert or update or delete on public.claims
for each row execute function public.capture_audit_event();
create trigger audit_import_batches after insert or update or delete on public.import_batches
for each row execute function public.capture_audit_event();
create trigger audit_import_exceptions after insert or update or delete on public.import_exceptions
for each row execute function public.capture_audit_event();

revoke update, delete on public.audit_events from authenticated;

commit;
