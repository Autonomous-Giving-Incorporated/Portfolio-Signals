-- AGI-007: onboarding-configurable one- or two-person decision approvals.

create table public.decision_approvals (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete restrict,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  approver_id uuid not null references public.profiles(id) on delete restrict,
  requested_status text not null check (requested_status in ('approved','rejected','deferred')),
  rationale text not null,
  created_at timestamptz not null default now(),
  unique (decision_id, approver_id)
);

alter table public.decision_approvals enable row level security;
create policy "client members read decision approvals" on public.decision_approvals for select using
  (public.is_client_member(client_id) or public.is_master_admin());
revoke insert, update, delete on public.decision_approvals from authenticated;

create or replace function public.guard_decision_terminal_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and current_user <> pg_get_userbyid((
       select proowner from pg_proc where oid = 'public.decide(uuid,text,text)'::regprocedure
     )) then
    raise exception 'decision_rpc_required';
  end if;
  return new;
end $$;

drop trigger if exists decisions_terminal_transition_guard on public.decisions;
create trigger decisions_terminal_transition_guard
before update on public.decisions
for each row execute function public.guard_decision_terminal_transition();

create or replace function public.decide(
  p_decision_id uuid,
  p_status text,
  p_rationale text
) returns public.decisions
language plpgsql security definer set search_path = public as $$
declare
  v_decision public.decisions;
  v_config jsonb;
  v_required integer := 1;
  v_count integer;
begin
  perform public.require_privileged_mfa();
  if p_status not in ('approved','rejected','deferred') then raise exception 'invalid_terminal_decision_status'; end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then raise exception 'decision_rationale_required'; end if;

  select * into v_decision from public.decisions where id = p_decision_id for update;
  if not found or v_decision.status <> 'open' then raise exception 'decision_not_open'; end if;
  if public.current_client_role(v_decision.client_id) is distinct from 'director'
     and public.current_client_role(v_decision.client_id) is distinct from 'campaign_lead' then
    raise exception 'decision_approver_required';
  end if;

  select config into v_config from public.client_config_versions
  where client_id = v_decision.client_id and state = 'published';
  v_required := coalesce((v_config#>>'{approvals,decision_approvers}')::integer, 1);
  if v_required not in (1, 2) then raise exception 'invalid_decision_approval_policy'; end if;

  if exists (
    select 1 from public.decision_approvals
    where decision_id = p_decision_id and requested_status <> p_status
  ) then raise exception 'approval_status_conflict'; end if;

  insert into public.decision_approvals(client_id, decision_id, approver_id, requested_status, rationale)
  values (v_decision.client_id, p_decision_id, auth.uid(), p_status, trim(p_rationale));

  select count(*) into v_count from public.decision_approvals
  where decision_id = p_decision_id and requested_status = p_status;

  if v_count >= v_required then
    update public.decisions
    set status = p_status, rationale = p_rationale, decided_by = auth.uid(), decided_at = now()
    where id = p_decision_id returning * into v_decision;
  end if;
  return v_decision;
end $$;

revoke all on function public.decide(uuid, text, text) from public, anon;
grant execute on function public.decide(uuid, text, text) to authenticated;
