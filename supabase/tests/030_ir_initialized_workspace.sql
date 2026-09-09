-- Initialized read-only core: durable binding, restrictive ACLs, atomic rollback.
begin;
create function public.test_ir_init_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then if position(expected in sqlerrm)=0 then raise; end if; return; end;
 raise exception 'expected failure: %',statement;
end $$;
grant execute on function public.test_ir_init_error(text,text) to anon,authenticated,service_role;
insert into public.platform_administrators(user_id,appointed_by,rationale)
values('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000101','Synthetic initialization acceptance');
insert into public.clients(id,slug,display_name,state) values('org_ir_init','ir-init','Initialize','provisioning');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000106';
set local request.jwt.claim.aal='aal2';
select set_config('request.jwt.claim.exp',(extract(epoch from now())::bigint+3600)::text,true);
select public.request_ir_provisioning('org_ir_init','30000000-0000-4000-8000-000000000001','Initialize empty private storage');
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_ir_init',(public.get_ir_provisioning_request('org_ir_init')->>'operation_id')::uuid)$q$,'reserved_request_binding_required');
select public.execute_ir_provisioning('org_ir_init',(public.get_ir_provisioning_request('org_ir_init')->>'operation_id')::uuid);
do $$ declare w jsonb; begin
 if public.open_ir_workspace('org_ir_init') is not null then raise exception 'reservation initialized storage'; end if;
 w := public.initialize_ir_workspace('org_ir_init',(public.get_ir_provisioning_request('org_ir_init')->>'operation_id')::uuid);
 if w->>'state' <> 'initialized' or w->>'operational' <> 'false' or w->>'runtime_ready' <> 'false'
  or w->'empty_state' <> '{"entities":[],"ledger_commands":[],"outbox_events":[]}'::jsonb
  or w->>'ledger_revision' <> '0' or w#>>'{organization,id}' <> 'org_ir_init'
  or w->>'policy_sha256' <> encode(sha256(convert_to(w->>'policy_json','UTF8')),'hex')
  or w->>'artifact_sha256' <> encode(sha256(convert_to(w->>'portable_json','UTF8')),'hex')
  then raise exception 'invalid initialized workspace'; end if;
 if public.open_ir_workspace('org_ir_init') is distinct from w then raise exception 'reopen mismatch'; end if;
 if public.initialize_ir_workspace('org_ir_init',(w->>'operation_id')::uuid) is distinct from w then raise exception 'replay mismatch'; end if;
 if public.open_ir_workspace('org_hacker_dojo') is not null then raise exception 'cross tenant read'; end if;
end $$;
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_ir_init','30000000-0000-4000-8000-000000000099')$q$,'reserved_request_binding_required');
select public.test_ir_init_error($q$select public.open_ir_workspace(' org_ir_init')$q$,'invalid_provisioning_identity');
set local request.jwt.claim.aal='aal1';
select public.test_ir_init_error($q$select public.open_ir_workspace('org_ir_init')$q$,'master_admin_required');
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_ir_init','30000000-0000-4000-8000-000000000099')$q$,'master_admin_required');
set local request.jwt.claim.aal='aal2';
reset role;
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_schema_privilege(r,'ir_private','usage') then raise exception 'private schema exposed to %',r; end if;
  foreach t in array array['policy_artifacts','workspaces','ledger_states'] loop
   if has_table_privilege(r,'ir_private.'||t,'select,insert,update,delete,truncate') then raise exception 'private table exposed to %',r; end if;
  end loop;
 end loop;
 if (select count(*) from public.client_audit_log where action='ir_workspace_initialized') <> 1 then raise exception 'duplicate audit'; end if;
 if (select state from public.clients where id='org_ir_init') <> 'provisioning' then raise exception 'activation occurred'; end if;
end $$;
select public.test_ir_init_error($q$update ir_private.policy_artifacts set policy_sha256=repeat('0',64)$q$,'immutable_scaffold');
select public.test_ir_init_error($q$update ir_private.workspaces set operational=true$q$,'immutable_scaffold');
select public.test_ir_init_error($q$update ir_private.ledger_states set empty_state='{}'$q$,'immutable_scaffold');
select public.test_ir_init_error($q$delete from ir_private.ledger_states$q$,'immutable_scaffold');
set local role service_role;
select public.test_ir_init_error($q$select public.open_ir_workspace('org_ir_init')$q$,'permission denied');
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_ir_init','30000000-0000-4000-8000-000000000099')$q$,'permission denied');
set local role anon;
select public.test_ir_init_error($q$select public.open_ir_workspace('org_ir_init')$q$,'permission denied');
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_ir_init','30000000-0000-4000-8000-000000000099')$q$,'permission denied');
reset role;
-- Failure after all three inserts must leave none, while preserving reservation.
create function public.test_ir_init_audit_failure() returns trigger language plpgsql as $$
begin if new.action='ir_workspace_initialized' then raise exception 'synthetic_audit_failure'; end if; return new; end $$;
create trigger test_ir_init_audit_failure before insert on public.client_audit_log for each row execute function public.test_ir_init_audit_failure();
set local role authenticated;
select public.request_ir_provisioning('org_hacker_dojo','30000000-0000-4000-8000-000000000002','Atomic initialized workspace rollback');
select public.execute_ir_provisioning('org_hacker_dojo',(public.get_ir_provisioning_request('org_hacker_dojo')->>'operation_id')::uuid);
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_hacker_dojo',(public.get_ir_provisioning_request('org_hacker_dojo')->>'operation_id')::uuid)$q$,'synthetic_audit_failure');
reset role;
do $$ begin
 if exists(select 1 from ir_private.policy_artifacts where tenant_id='org_hacker_dojo')
 or exists(select 1 from ir_private.workspaces where tenant_id='org_hacker_dojo')
 or exists(select 1 from ir_private.ledger_states where tenant_id='org_hacker_dojo') then raise exception 'partial initialization persisted'; end if;
end $$;
drop trigger test_ir_init_audit_failure on public.client_audit_log;
set local role authenticated;
select public.initialize_ir_workspace('org_hacker_dojo',(public.get_ir_provisioning_request('org_hacker_dojo')->>'operation_id')::uuid);
reset role;
update public.clients set state='suspended' where id='org_ir_init';
set local role authenticated;
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_ir_init',(public.get_ir_provisioning_request('org_ir_init')->>'operation_id')::uuid)$q$,'client_state_not_eligible');
do $$ begin if public.open_ir_workspace('org_ir_init')->>'state' <> 'initialized' then raise exception 'recovery unavailable'; end if; end $$;
reset role;
update public.platform_administrators set revoked_at=now() where user_id='00000000-0000-0000-0000-000000000106';
set local role authenticated;
select public.test_ir_init_error($q$select public.open_ir_workspace('org_ir_init')$q$,'master_admin_required');
select public.test_ir_init_error($q$select public.initialize_ir_workspace('org_ir_init','30000000-0000-4000-8000-000000000099')$q$,'master_admin_required');
reset role;
rollback;
