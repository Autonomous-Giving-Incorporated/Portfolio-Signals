-- Disposable fixture only; no hosted execution.
begin;
create function public.test_scaffold_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then if position(expected in sqlerrm)=0 then raise; end if; return; end;
 raise exception 'expected failure: %',statement;
end $$;
grant execute on function public.test_scaffold_error(text,text) to anon,authenticated,service_role;
insert into public.platform_administrators(user_id, appointed_by, rationale)
values ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000101','Synthetic scaffold acceptance');
insert into public.clients(id,slug,display_name,state) values ('org_ir_scaffold','ir-scaffold','Scaffold','provisioning');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000106';
set local request.jwt.claim.aal = 'aal2';
select set_config('request.jwt.claim.exp',(extract(epoch from now())::bigint+3600)::text,true);
do $$ declare r jsonb; s jsonb; begin
  r := public.request_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001','Create empty scaffold only');
  s := public.execute_ir_provisioning('org_ir_scaffold',(r->>'operation_id')::uuid);
  if s->>'state' is distinct from 'scaffold_persisted' or s->>'runtime_ready' is distinct from 'false'
    or s->>'client_id' is distinct from 'org_ir_scaffold' or s->>'tenant_id' is distinct from 'org_ir_scaffold'
    or (s->>'policy_json')::jsonb #>> '{policy,tenant_id}' is distinct from 'org_ir_scaffold'
    or (s->>'policy_json')::jsonb #> '{policy,notifications,default_email_topics}' <> '[]'::jsonb
    then raise exception 'invalid scaffold: %',s; end if;
  if public.get_ir_workspace_scaffold('org_ir_scaffold') is distinct from s then raise exception 'readback mismatch'; end if;
  if public.execute_ir_provisioning('org_ir_scaffold',(r->>'operation_id')::uuid) is distinct from s then raise exception 'retry changed record'; end if;
  if public.get_ir_workspace_scaffold('org_hacker_dojo') is not null then raise exception 'read created record'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.client_audit_log where action='ir_scaffold_persisted') <> 1 then raise exception 'audit duplicated'; end if;
end $$;
-- Every read and write rechecks human authority; no role-token fallback.
set local role authenticated;
set local request.jwt.claim.aal='aal1';
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'master_admin_required');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'master_admin_required');
set local request.jwt.claim.aal='aal2';
set local request.jwt.claim.exp='1';
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'session_expired');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'session_expired');
select set_config('request.jwt.claim.exp',(extract(epoch from now())::bigint+3600)::text,true);
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'master_admin_required');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'master_admin_required');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000106';
reset role; update public.platform_administrators set revoked_at=now() where user_id='00000000-0000-0000-0000-000000000106'; set local role authenticated;
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'master_admin_required');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'master_admin_required');
reset role; update public.platform_administrators set revoked_at=null where user_id='00000000-0000-0000-0000-000000000106'; set local role authenticated;
reset role; update public.profiles set mfa_enforced=false where id='00000000-0000-0000-0000-000000000106'; set local role authenticated;
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'master_admin_required');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'master_admin_required');
reset role; update public.profiles set mfa_enforced=true where id='00000000-0000-0000-0000-000000000106'; set local role authenticated;
reset role; update public.profiles set active=false where id='00000000-0000-0000-0000-000000000106'; set local role authenticated;
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'inactive_or_missing_profile');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'inactive_or_missing_profile');
reset role; update public.profiles set active=true where id='00000000-0000-0000-0000-000000000106'; set local role authenticated;
set local role anon;
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'permission denied');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'permission denied');
select public.test_scaffold_error($q$select * from public.ir_workspace_scaffolds$q$,'permission denied');
select public.test_scaffold_error($q$update public.ir_workspace_scaffolds set runtime_ready=true$q$,'permission denied');
select public.test_scaffold_error($q$delete from public.ir_workspace_scaffolds$q$,'permission denied');
set local role service_role;
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold('org_ir_scaffold')$q$,'permission denied');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'permission denied');
select public.test_scaffold_error($q$select * from public.ir_workspace_scaffolds$q$,'permission denied');
select public.test_scaffold_error($q$update public.ir_workspace_scaffolds set runtime_ready=true$q$,'permission denied');
select public.test_scaffold_error($q$delete from public.ir_workspace_scaffolds$q$,'permission denied');
set local role authenticated;
select public.test_scaffold_error($q$select * from public.ir_workspace_scaffolds$q$,'permission denied');
select public.test_scaffold_error($q$update public.ir_workspace_scaffolds set runtime_ready=true$q$,'permission denied');
select public.test_scaffold_error($q$delete from public.ir_workspace_scaffolds$q$,'permission denied');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_hacker_dojo',(public.get_ir_provisioning_request('org_ir_scaffold')->>'operation_id')::uuid)$q$,'request_binding_mismatch');
select public.test_scaffold_error($q$select public.get_ir_workspace_scaffold(' org_ir_scaffold')$q$,'invalid_provisioning_identity');
reset role;
select public.test_scaffold_error($q$update public.ir_workspace_scaffolds set policy_json='{}'$q$,'immutable_scaffold');
select public.test_scaffold_error($q$delete from public.ir_workspace_scaffolds$q$,'immutable_scaffold');
update public.clients set state='suspended' where id='org_ir_scaffold'; set local role authenticated;
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_ir_scaffold','20000000-0000-4000-8000-000000000001')$q$,'client_state_not_eligible');
do $$ begin if public.get_ir_workspace_scaffold('org_ir_scaffold')->>'state' <> 'scaffold_persisted' then raise exception 'recovery read unavailable'; end if; end $$;
reset role;
-- Audit failure rolls back scaffold; same request remains recoverable.
create function public.test_scaffold_audit_failure() returns trigger language plpgsql as $$
begin if new.action='ir_scaffold_persisted' then raise exception 'synthetic_audit_failure'; end if; return new; end $$;
create trigger test_scaffold_audit_failure before insert on public.client_audit_log for each row execute function public.test_scaffold_audit_failure();
set local role authenticated;
select public.request_ir_provisioning('org_hacker_dojo','20000000-0000-4000-8000-000000000002','Atomic scaffold audit test');
select public.test_scaffold_error($q$select public.execute_ir_provisioning('org_hacker_dojo',(public.get_ir_provisioning_request('org_hacker_dojo')->>'operation_id')::uuid)$q$,'synthetic_audit_failure');
do $$ begin if public.get_ir_workspace_scaffold('org_hacker_dojo') is not null then raise exception 'audit failure left scaffold'; end if; end $$;
reset role;
drop trigger test_scaffold_audit_failure on public.client_audit_log;
insert into public.clients(id,slug,display_name,state) values('org_ir_mismatch','ir-mismatch','Mismatch','provisioning');
select public.test_scaffold_error($q$insert into public.ir_workspace_scaffolds(client_id,operation_id,idempotency_key,policy_json,created_by)
 select 'org_ir_mismatch',operation_id,idempotency_key,public.ir_empty_policy('org_ir_mismatch'),requested_by
 from public.ir_provisioning_requests where client_id='org_hacker_dojo'$q$,'foreign key constraint');
set local role authenticated;
select public.execute_ir_provisioning('org_hacker_dojo',(public.get_ir_provisioning_request('org_hacker_dojo')->>'operation_id')::uuid);
reset role;
rollback;
