-- HD-OI-014: editable pipeline workflows, approvals, document metadata, and policy tests

create type public.document_classification as enum ('public','internal','restricted','privileged');

alter table public.opportunities
  add column if not exists version integer not null default 1,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists last_reviewed_by uuid references public.profiles(id);

create table if not exists public.opportunity_notes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  body_ciphertext text not null,
  classification public.document_classification not null default 'restricted',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.document_records (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null default 'campaign-private',
  storage_path text not null unique,
  display_name text not null,
  classification public.document_classification not null default 'restricted',
  opportunity_id uuid references public.opportunities(id) on delete set null,
  decision_id uuid references public.decisions(id) on delete set null,
  checksum_sha256 text,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.decision_events (
  id bigint generated always as identity primary key,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  from_status text,
  to_status text not null,
  rationale text,
  actor_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now()
);

alter table public.opportunity_notes enable row level security;
alter table public.document_records enable row level security;
alter table public.decision_events enable row level security;

create policy "staff read opportunity notes" on public.opportunity_notes
for select using (public.current_role() in ('director','campaign_lead','development','data_steward','auditor'));

create policy "campaign staff create notes" on public.opportunity_notes
for insert with check (public.current_role() in ('director','campaign_lead','development','data_steward'));

create policy "authorized staff read document metadata" on public.document_records
for select using (public.current_role() in ('director','campaign_lead','development','data_steward','auditor'));

create policy "stewards manage document metadata" on public.document_records
for all using (public.current_role() in ('director','campaign_lead','data_steward'))
with check (public.current_role() in ('director','campaign_lead','data_steward'));

create policy "authenticated read decision events" on public.decision_events
for select using (auth.uid() is not null);

revoke insert, update, delete on public.decision_events from authenticated;

create or replace function public.record_decision_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.decision_events(decision_id, from_status, to_status, rationale, actor_id)
    values (new.id, old.status, new.status, new.rationale, auth.uid());
  end if;
  return new;
end;
$$;

create trigger decisions_transition_audit
after update on public.decisions
for each row execute function public.record_decision_transition();

create or replace function public.advance_opportunity_stage(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_stage public.opportunity_stage,
  p_next_action text default null,
  p_next_action_at timestamptz default null
) returns public.opportunities
language plpgsql security invoker set search_path = public as $$
declare result public.opportunities;
begin
  update public.opportunities
     set stage = p_stage,
         next_action = p_next_action,
         next_action_at = p_next_action_at,
         version = version + 1,
         last_reviewed_at = now(),
         last_reviewed_by = auth.uid(),
         updated_at = now()
   where id = p_opportunity_id
     and version = p_expected_version
  returning * into result;
  if result.id is null then
    raise exception 'opportunity version conflict or access denied';
  end if;
  return result;
end;
$$;

create or replace function public.decide(
  p_decision_id uuid,
  p_status text,
  p_rationale text
) returns public.decisions
language plpgsql security invoker set search_path = public as $$
declare result public.decisions;
begin
  if p_status not in ('approved','rejected','deferred') then
    raise exception 'invalid terminal decision status';
  end if;
  update public.decisions
     set status = p_status,
         rationale = p_rationale,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_decision_id and status = 'open'
  returning * into result;
  if result.id is null then
    raise exception 'decision is not open or access denied';
  end if;
  return result;
end;
$$;
