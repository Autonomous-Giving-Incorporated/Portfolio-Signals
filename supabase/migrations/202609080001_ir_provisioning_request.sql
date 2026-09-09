-- Request/state only: NOT an IR policy pack, registry row, storage workspace or
-- runtime readiness. The policy provenance/persistence bridge remains blocked.
-- The migration executor owns the transaction, including its ledger insert.
create table public.ir_provisioning_requests (
  operation_id uuid primary key default gen_random_uuid(),
  client_id text not null unique references public.clients(id) on delete restrict
    check (client_id ~ '^org_[a-z0-9_]+$'),
  tenant_id text generated always as (client_id) stored,
  idempotency_key uuid not null unique,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  rationale text not null check (length(trim(rationale)) between 12 and 2000),
  state text not null default 'requested' check (state = 'requested'),
  runtime_ready boolean not null default false check (runtime_ready = false),
  created_at timestamptz not null default now()
);
-- Private metadata, with no direct REST reads/writes, even for platform admins.
-- No permissive RLS policies and no object bucket until a policy bridge exists.
alter table public.ir_provisioning_requests enable row level security;
revoke all on public.ir_provisioning_requests from public, anon, authenticated, service_role;

create function public.request_ir_provisioning(
  p_client_id text, p_idempotency_key uuid, p_rationale text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_request public.ir_provisioning_requests;
  v_state public.client_state;
begin
  perform public.require_active_profile();
  if not public.is_master_admin() then
    raise exception 'master_admin_required' using errcode = '42501';
  end if;
  if p_client_id is null or p_client_id !~ '^org_[a-z0-9_]+$' then
    raise exception 'invalid_client_id' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if p_rationale is null or length(trim(p_rationale)) not between 12 and 2000 then
    raise exception 'provisioning_rationale_required' using errcode = '22023';
  end if;
  -- Serialize same-key requests, then same-client requests. No overwrite/upsert.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select state into v_state from public.clients where id = p_client_id for update;
  if not found then raise exception 'existing_client_required' using errcode = '22023'; end if;
  if v_state not in ('provisioning', 'active') then
    raise exception 'client_state_not_eligible' using errcode = '22023';
  end if;
  select * into v_request from public.ir_provisioning_requests where idempotency_key = p_idempotency_key;
  if found then
    if v_request.client_id <> p_client_id or v_request.rationale <> p_rationale then
      raise exception 'idempotency_conflict' using errcode = '23505';
    end if;
    return to_jsonb(v_request) || jsonb_build_object('replayed', true);
  end if;
  if exists (select 1 from public.ir_provisioning_requests where client_id = p_client_id) then
    raise exception 'client_request_conflict' using errcode = '23505';
  end if;
  insert into public.ir_provisioning_requests(client_id, idempotency_key, requested_by, rationale, state, runtime_ready)
  values (p_client_id, p_idempotency_key, auth.uid(), p_rationale, 'requested', false)
  returning * into v_request;
  insert into public.client_audit_log(client_id, actor_id, action, entity_type, entity_id, rationale, after_state)
  values (p_client_id, auth.uid(), 'ir_provisioning_requested', 'ir_provisioning_request',
    v_request.operation_id::text, p_rationale, to_jsonb(v_request));
  return to_jsonb(v_request) || jsonb_build_object('replayed', false);
end $$;
revoke all on function public.request_ir_provisioning(text, uuid, text) from public, anon, service_role;
grant execute on function public.request_ir_provisioning(text, uuid, text) to authenticated;
create function public.get_ir_provisioning_request(p_client_id text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_request public.ir_provisioning_requests;
begin
  perform public.require_active_profile();
  if not public.is_master_admin() then
    raise exception 'master_admin_required' using errcode = '42501';
  end if;
  if p_client_id is null or p_client_id !~ '^org_[a-z0-9_]+$' then
    raise exception 'invalid_client_id' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'existing_client_required' using errcode = '22023';
  end if;
  select * into v_request from public.ir_provisioning_requests where client_id = p_client_id;
  if not found then return null; end if;
  return to_jsonb(v_request);
end $$;
revoke all on function public.get_ir_provisioning_request(text) from public, anon, service_role;
grant execute on function public.get_ir_provisioning_request(text) to authenticated;
