-- Durable empty scaffold only. No runtime activation or legacy storage adoption.
-- The migration executor owns the transaction, including its ledger insert.
create function public.ir_empty_policy(p_client_id text) returns text
language sql immutable strict set search_path = public as $$
  select replace('{"format":"ir-policy-v1","policy":{"attribution":{"allowed_methods":[],"default_method":"DIRECT_RESTRICTED"},"authority":{"l3_command_types":["approve_expense","reject_expense","publish_use_of_funds_receipt","send_notification","publish_public_evidence","change_attribution_policy","correct_published_amount","reverse_expense","supersede_expense"]},"confidence":{"block_below":0.75,"recommend_high":0.95},"display_name":"TENANT","evidence":{"require_donor_visible":true,"sufficient_kinds":["invoice","receipt","accounting_ref"]},"notifications":{"default_email_topics":[],"fixture_consent_allowed":false,"require_separate_send_approval":true},"source_path":null,"tenant_id":"TENANT","version":"fi-empty-v1"}}', 'TENANT', p_client_id)
$$;
revoke all on function public.ir_empty_policy(text) from public, anon, authenticated, service_role;
alter table public.ir_provisioning_requests add constraint ir_request_scaffold_binding unique(client_id,operation_id,idempotency_key);
create table public.ir_workspace_scaffolds (
 client_id text primary key references public.clients(id) on delete restrict
   check (client_id ~ '^org_[a-z0-9_]+$' and length(client_id) <= 128),
 tenant_id text generated always as (client_id) stored,
 operation_id uuid not null unique references public.ir_provisioning_requests(operation_id) on delete restrict,
 idempotency_key uuid not null unique,
 policy_json text not null check (policy_json = public.ir_empty_policy(client_id)),
 state text not null default 'scaffold_persisted' check (state = 'scaffold_persisted'),
 runtime_ready boolean not null default false check (runtime_ready = false),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 foreign key(client_id,operation_id,idempotency_key) references public.ir_provisioning_requests(client_id,operation_id,idempotency_key) on delete restrict
);
alter table public.ir_workspace_scaffolds enable row level security;
revoke all on public.ir_workspace_scaffolds from public, anon, authenticated, service_role;
create function public.ir_scaffold_immutable() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'immutable_scaffold' using errcode = '55000'; end $$;
revoke all on function public.ir_scaffold_immutable() from public, anon, authenticated, service_role;
create trigger ir_scaffold_immutable before update or delete on public.ir_workspace_scaffolds
for each row execute function public.ir_scaffold_immutable();
create function public.execute_ir_provisioning(p_client_id text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.ir_provisioning_requests; s public.ir_workspace_scaffolds; v_state public.client_state;
begin
 perform public.require_active_profile();
 if not public.is_master_admin() then raise exception 'master_admin_required' using errcode='42501'; end if;
 if p_client_id is null or p_client_id !~ '^org_[a-z0-9_]+$' or length(p_client_id)>128 or p_operation_id is null then
   raise exception 'invalid_provisioning_identity' using errcode='22023'; end if;
 select state into v_state from public.clients where id=p_client_id for update;
 if not found then raise exception 'existing_client_required' using errcode='22023'; end if;
 if v_state not in ('provisioning','active') then raise exception 'client_state_not_eligible' using errcode='22023'; end if;
 select * into r from public.ir_provisioning_requests where client_id=p_client_id and operation_id=p_operation_id;
 if not found then raise exception 'request_binding_mismatch' using errcode='22023'; end if;
 select * into s from public.ir_workspace_scaffolds where client_id=p_client_id;
 if found then
   if s.operation_id <> r.operation_id or s.idempotency_key <> r.idempotency_key then
     raise exception 'scaffold_conflict' using errcode='23505'; end if;
   return to_jsonb(s);
 end if;
 insert into public.ir_workspace_scaffolds(client_id,operation_id,idempotency_key,policy_json,state,runtime_ready,created_by)
 values(p_client_id,r.operation_id,r.idempotency_key,public.ir_empty_policy(p_client_id),'scaffold_persisted',false,auth.uid()) returning * into s;
 insert into public.client_audit_log(client_id,actor_id,action,entity_type,entity_id,rationale,after_state)
 values(p_client_id,auth.uid(),'ir_scaffold_persisted','ir_workspace_scaffold',p_operation_id::text,r.rationale,to_jsonb(s));
 return to_jsonb(s);
end $$;
revoke all on function public.execute_ir_provisioning(text,uuid) from public, anon, service_role;
grant execute on function public.execute_ir_provisioning(text,uuid) to authenticated;
create function public.get_ir_workspace_scaffold(p_client_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.ir_workspace_scaffolds;
begin
 perform public.require_active_profile();
 if not public.is_master_admin() then raise exception 'master_admin_required' using errcode='42501'; end if;
 if p_client_id is null or p_client_id !~ '^org_[a-z0-9_]+$' or length(p_client_id)>128 then
   raise exception 'invalid_provisioning_identity' using errcode='22023'; end if;
 if not exists(select 1 from public.clients where id=p_client_id) then raise exception 'existing_client_required' using errcode='22023'; end if;
 select * into s from public.ir_workspace_scaffolds where client_id=p_client_id;
 if not found then return null; end if;
 return to_jsonb(s);
end $$;
revoke all on function public.get_ir_workspace_scaffold(text) from public, anon, service_role;
grant execute on function public.get_ir_workspace_scaffold(text) to authenticated;
