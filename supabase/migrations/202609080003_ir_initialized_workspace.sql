-- Read-only IR storage core. Allocation am_* is NOT an Impact Relay ledger.
-- No command execution, publication, notifications, activation or readiness grant.
begin;
create schema ir_private;
revoke all on schema ir_private from public, anon, authenticated, service_role;

-- This is an exact, version-pinned template, not a general JSON canonicalizer.
create function ir_private.portable_policy(p_client_id text) returns text
language sql immutable strict set search_path = pg_catalog as $$
 select replace(replace(replace(public.ir_empty_policy(p_client_id),
  '"format":"ir-policy-v1"','"format":"ir-portable-policy-v1"'),
  '"block_below":0.75','"block_below":"0.75"'),'"recommend_high":0.95','"recommend_high":"0.95"')
$$;
create function ir_private.portable_scaffold(p_client_id text, p_key uuid) returns text
language sql immutable strict set search_path = pg_catalog as $$
 select '{"empty_state":{"entities":[],"ledger_commands":[],"outbox_events":[]},"format":"ir-empty-scaffold-v1","idempotency_key":"'
  || p_key::text || '","policy":' || ir_private.portable_policy(p_client_id)
  || ',"policy_sha256":"' || encode(sha256(convert_to(ir_private.portable_policy(p_client_id),'UTF8')),'hex')
  || '","readiness":{"operational":false,"scaffold_verified":false},"tenant_id":"' || p_client_id || '"}'
$$;

create table ir_private.policy_artifacts (
 tenant_id text primary key references public.ir_workspace_scaffolds(client_id) on delete restrict,
 operation_id uuid not null unique,
 idempotency_key uuid not null unique,
 policy_version text not null check(policy_version='fi-empty-v1'),
 policy_json text not null check(policy_json=ir_private.portable_policy(tenant_id)),
 policy_sha256 text not null check(policy_sha256=encode(sha256(convert_to(policy_json,'UTF8')),'hex')),
 portable_json text not null check(portable_json=ir_private.portable_scaffold(tenant_id,idempotency_key)),
 artifact_sha256 text not null check(artifact_sha256=encode(sha256(convert_to(portable_json,'UTF8')),'hex')),
 provenance text not null check(provenance='fi-empty-v1:202609080003'),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(tenant_id,operation_id,idempotency_key,policy_sha256),
 foreign key(tenant_id,operation_id,idempotency_key) references public.ir_provisioning_requests(client_id,operation_id,idempotency_key) on delete restrict
);
create table ir_private.workspaces (
 tenant_id text primary key,
 operation_id uuid not null unique,
 idempotency_key uuid not null unique,
 policy_sha256 text not null,
 storage_version text not null check(storage_version='fi-ir-readonly-v1'),
 state text not null check(state='initialized'),
 runtime_ready boolean not null check(not runtime_ready),
 operational boolean not null check(not operational),
 organization jsonb not null check(organization=jsonb_build_object('id',tenant_id,'name',tenant_id,'policy_version','fi-empty-v1')),
 initialized_by uuid not null references public.profiles(id) on delete restrict,
 initialized_at timestamptz not null default now(),
 foreign key(tenant_id,operation_id,idempotency_key,policy_sha256) references ir_private.policy_artifacts(tenant_id,operation_id,idempotency_key,policy_sha256) on delete restrict
);
-- Durable genesis snapshot, rather than arrays invented by a GET handler. The
-- first storage version cannot append commands; a reviewed migration is required.
create table ir_private.ledger_states (
 tenant_id text primary key references ir_private.workspaces(tenant_id) on delete restrict,
 revision bigint not null check(revision=0),
 empty_state jsonb not null check(empty_state='{"entities":[],"ledger_commands":[],"outbox_events":[]}'::jsonb)
);
alter table ir_private.policy_artifacts enable row level security;
alter table ir_private.workspaces enable row level security;
alter table ir_private.ledger_states enable row level security;
create trigger ir_policy_immutable before update or delete on ir_private.policy_artifacts for each row execute function public.ir_scaffold_immutable();
create trigger ir_workspace_immutable before update or delete on ir_private.workspaces for each row execute function public.ir_scaffold_immutable();
create trigger ir_ledger_immutable before update or delete on ir_private.ledger_states for each row execute function public.ir_scaffold_immutable();
revoke all on all tables in schema ir_private from public, anon, authenticated, service_role;
revoke all on all functions in schema ir_private from public, anon, authenticated, service_role;

create function public.open_ir_workspace(p_client_id text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare s jsonb; result jsonb;
begin
 -- Existing boundary checks active/unexpired human profile, live platform-admin
 -- appointment, AAL2 and MFA enforcement before any lookup in private storage.
 s := public.get_ir_workspace_scaffold(p_client_id);
 if s is null then return null; end if;
 select to_jsonb(w) || jsonb_build_object('client_id',w.tenant_id,
   'policy_json',p.policy_json,'portable_json',p.portable_json,'artifact_sha256',p.artifact_sha256,
   'provenance',p.provenance,'policy_created_by',p.created_by,'policy_created_at',p.created_at,
   'ledger_revision',l.revision,'empty_state',l.empty_state)
 into result from ir_private.workspaces w
 join ir_private.policy_artifacts p on p.tenant_id=w.tenant_id
 join ir_private.ledger_states l on l.tenant_id=w.tenant_id
 where w.tenant_id=p_client_id and w.operation_id=(s->>'operation_id')::uuid
   and w.idempotency_key=(s->>'idempotency_key')::uuid
   and w.policy_sha256=p.policy_sha256;
 if result is null and exists(select 1 from ir_private.workspaces where tenant_id=p_client_id) then
   raise exception 'workspace_integrity_failure' using errcode='55000'; end if;
 return result;
end $$;
create function public.initialize_ir_workspace(p_client_id text,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare s jsonb; result jsonb; v_state public.client_state; p ir_private.policy_artifacts;
begin
 s := public.get_ir_workspace_scaffold(p_client_id);
 if p_operation_id is null or s is null or (s->>'operation_id')::uuid <> p_operation_id then
   raise exception 'reserved_request_binding_required' using errcode='22023'; end if;
 select state into v_state from public.clients where id=p_client_id for update;
 if v_state not in ('provisioning','active') then raise exception 'client_state_not_eligible' using errcode='22023'; end if;
 result := public.open_ir_workspace(p_client_id);
 if result is not null then return result; end if;
 -- Plain inserts intentionally reject any partial/preexisting storage. Never adopt.
 insert into ir_private.policy_artifacts(tenant_id,operation_id,idempotency_key,policy_version,policy_json,portable_json,provenance,created_by,policy_sha256,artifact_sha256)
 values(p_client_id,p_operation_id,(s->>'idempotency_key')::uuid,'fi-empty-v1',ir_private.portable_policy(p_client_id),
  ir_private.portable_scaffold(p_client_id,(s->>'idempotency_key')::uuid),'fi-empty-v1:202609080003',auth.uid(),
  encode(sha256(convert_to(ir_private.portable_policy(p_client_id),'UTF8')),'hex'),
  encode(sha256(convert_to(ir_private.portable_scaffold(p_client_id,(s->>'idempotency_key')::uuid),'UTF8')),'hex')) returning * into p;
 insert into ir_private.workspaces(tenant_id,operation_id,idempotency_key,policy_sha256,storage_version,state,runtime_ready,operational,organization,initialized_by)
 values(p_client_id,p_operation_id,p.idempotency_key,p.policy_sha256,'fi-ir-readonly-v1','initialized',false,false,
  jsonb_build_object('id',p_client_id,'name',p_client_id,'policy_version','fi-empty-v1'),auth.uid());
 insert into ir_private.ledger_states(tenant_id,revision,empty_state)
 values(p_client_id,0,'{"entities":[],"ledger_commands":[],"outbox_events":[]}'::jsonb);
 result := public.open_ir_workspace(p_client_id);
 insert into public.client_audit_log(client_id,actor_id,action,entity_type,entity_id,rationale,after_state)
 select p_client_id,auth.uid(),'ir_workspace_initialized','ir_workspace',p_operation_id::text,r.rationale,
  jsonb_build_object('tenant_id',p_client_id,'operation_id',p_operation_id,'policy_sha256',p.policy_sha256,
   'artifact_sha256',p.artifact_sha256,'storage_version','fi-ir-readonly-v1','operational',false)
 from public.ir_provisioning_requests r where r.operation_id=p_operation_id;
 return result;
end $$;
revoke all on function public.open_ir_workspace(text) from public,anon,service_role;
revoke all on function public.initialize_ir_workspace(text,uuid) from public,anon,service_role;
grant execute on function public.open_ir_workspace(text) to authenticated;
grant execute on function public.initialize_ir_workspace(text,uuid) to authenticated;
commit;
