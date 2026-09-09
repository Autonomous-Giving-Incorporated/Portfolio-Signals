-- Local/disposable only. Entire fixture and all test writes roll back.
begin;
-- Assertions execute as the caller, never as a privileged test helper.
create function public.test_ir_error(statement text, expected text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise; end if;
    return;
  end;
  raise exception 'expected failure: %', statement;
end $$;
grant execute on function public.test_ir_error(text, text) to anon, authenticated, service_role;
insert into public.platform_administrators(user_id, appointed_by, rationale)
values ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000101', 'Synthetic provisioning request test');
insert into public.clients(id, slug, display_name, state)
values ('org_ir_request_test', 'ir-request-test', 'IR request test', 'provisioning');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
declare v_result jsonb;
begin
  v_result := public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review');
  if v_result->>'state' is distinct from 'requested' or v_result->>'runtime_ready' is distinct from 'false'
    or v_result->>'client_id' is distinct from 'org_ir_request_test'
    or v_result->>'tenant_id' is distinct from 'org_ir_request_test'
    or v_result->>'replayed' is distinct from 'false' then
    raise exception 'request contract mismatch: %', v_result;
  end if;
end $$;
-- Same arguments replay exactly; a status read is not provisioning/readiness.
do $$
declare first_result jsonb; replay jsonb;
begin
  first_result := public.get_ir_provisioning_request('org_ir_request_test');
  replay := public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review');
  if replay->>'replayed' is distinct from 'true' or replay->>'operation_id' is distinct from first_result->>'operation_id'
    or replay - 'replayed' is distinct from first_result then raise exception 'replay changed request'; end if;
  if public.get_ir_provisioning_request('org_hacker_dojo') is not null then raise exception 'read created request'; end if;
end $$;
-- Payload/key conflicts are explicit, with no overwrites.
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Different request rationale')$q$, 'idempotency_conflict');
select public.test_ir_error($q$select public.request_ir_provisioning('org_hacker_dojo', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'idempotency_conflict');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000002', 'Request IR bridge review')$q$, 'client_request_conflict');
select public.test_ir_error($q$select public.request_ir_provisioning(' org_ir_request_test', '10000000-0000-4000-8000-000000000002', 'Request IR bridge review')$q$, 'invalid_client_id');
select public.test_ir_error($q$select public.request_ir_provisioning('org_missing', '10000000-0000-4000-8000-000000000002', 'Request IR bridge review')$q$, 'existing_client_required');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', null, 'Request IR bridge review')$q$, 'idempotency_key_required');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000002', null)$q$, 'provisioning_rationale_required');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000002', 'short')$q$, 'provisioning_rationale_required');
select public.test_ir_error($q$select * from public.ir_provisioning_requests$q$, 'permission denied');
select public.test_ir_error($q$update public.ir_provisioning_requests set runtime_ready = true$q$, 'permission denied');
select public.test_ir_error($q$delete from public.ir_provisioning_requests$q$, 'permission denied');
select public.test_ir_error($q$insert into public.ir_provisioning_requests(client_id) values ('org_hacker_dojo')$q$, 'permission denied');

-- AAL1, expired, ordinary tenant director, revoked admin, missing MFA, inactive
-- profile, anonymous and service-role callers cannot write OR read requests.
select set_config('request.jwt.claim.aal', 'aal1', true);
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'master_admin_required');
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'master_admin_required');
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', '1', true);
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'session_expired');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'session_expired');
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'master_admin_required');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'master_admin_required');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
reset role;
update public.platform_administrators set revoked_at = now() where user_id = '00000000-0000-0000-0000-000000000106';
set local role authenticated;
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'master_admin_required');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'master_admin_required');
reset role;
update public.platform_administrators set revoked_at = null where user_id = '00000000-0000-0000-0000-000000000106';
update public.profiles set mfa_enforced = false where id = '00000000-0000-0000-0000-000000000106';
set local role authenticated;
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'master_admin_required');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'master_admin_required');
reset role;
update public.profiles set mfa_enforced = true, active = false where id = '00000000-0000-0000-0000-000000000106';
set local role authenticated;
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'inactive_or_missing_profile');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'inactive_or_missing_profile');
reset role;
update public.profiles set active = true where id = '00000000-0000-0000-0000-000000000106';
set local role anon;
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'permission denied');
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'permission denied');
select public.test_ir_error($q$select * from public.ir_provisioning_requests$q$, 'permission denied');
set local role service_role;
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'permission denied');
select public.test_ir_error($q$select public.get_ir_provisioning_request('org_ir_request_test')$q$, 'permission denied');
select public.test_ir_error($q$select * from public.ir_provisioning_requests$q$, 'permission denied');
select public.test_ir_error($q$update public.ir_provisioning_requests set state = 'running'$q$, 'permission denied');
select public.test_ir_error($q$update public.ir_provisioning_requests set runtime_ready = true$q$, 'permission denied');
select public.test_ir_error($q$delete from public.ir_provisioning_requests$q$, 'permission denied');
reset role;

-- Even owner-side accidental writes cannot forge readiness or tenant binding.
select public.test_ir_error($q$update public.ir_provisioning_requests set runtime_ready = true$q$, 'check constraint');
select public.test_ir_error($q$update public.ir_provisioning_requests set state = 'succeeded'$q$, 'check constraint');
select public.test_ir_error($q$update public.ir_provisioning_requests set tenant_id = 'org_foreign'$q$, 'can only be updated to DEFAULT');

-- Audit insertion failure must roll back the operation; retry must create it.
create function public.test_ir_audit_failure() returns trigger language plpgsql as $$
begin
  if new.action = 'ir_provisioning_requested' then raise exception 'synthetic_audit_failure'; end if;
  return new;
end $$;
create trigger test_ir_audit_failure before insert on public.client_audit_log
for each row execute function public.test_ir_audit_failure();
set local role authenticated;
select public.test_ir_error($q$select public.request_ir_provisioning('org_hacker_dojo', '10000000-0000-4000-8000-000000000003', 'Request IR bridge review')$q$, 'synthetic_audit_failure');
reset role;
do $$ begin
  if exists(select 1 from public.ir_provisioning_requests where client_id = 'org_hacker_dojo') then raise exception 'audit failure left request'; end if;
  if (select count(*) from public.client_audit_log where action = 'ir_provisioning_requested') <> 1 then raise exception 'audit count mismatch'; end if;
  if (select state from public.clients where id = 'org_ir_request_test') <> 'provisioning' then raise exception 'request activated client'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ir_provisioning_requests'::regclass) then raise exception 'RLS not enabled'; end if;
  if exists(select 1 from pg_policies where tablename = 'ir_provisioning_requests') then raise exception 'request table has permissive policy'; end if;
end $$;
drop trigger test_ir_audit_failure on public.client_audit_log;
set local role authenticated;
do $$ begin
  if public.request_ir_provisioning('org_hacker_dojo', '10000000-0000-4000-8000-000000000003', 'Request IR bridge review')->>'replayed' <> 'false' then raise exception 'rollback retry incorrectly replayed'; end if;
end $$;
reset role;
update public.clients set state = 'suspended' where id = 'org_ir_request_test';
set local role authenticated;
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'client_state_not_eligible');
-- Suspension blocks execution intent, not authorized recovery reads.
do $$ begin
  if public.get_ir_provisioning_request('org_ir_request_test')->>'state' is distinct from 'requested' then
    raise exception 'suspended request unavailable for recovery';
  end if;
end $$;
reset role;
update public.clients set state = 'archived' where id = 'org_ir_request_test';
set local role authenticated;
select public.test_ir_error($q$select public.request_ir_provisioning('org_ir_request_test', '10000000-0000-4000-8000-000000000001', 'Request IR bridge review')$q$, 'client_state_not_eligible');
do $$ begin
  if public.get_ir_provisioning_request('org_ir_request_test')->>'runtime_ready' is distinct from 'false' then
    raise exception 'archived request changed readiness';
  end if;
end $$;
rollback;
