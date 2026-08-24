-- Privileged MFA persist: AAL2 sets the existing profiles.mfa_enforced flag;
-- AAL1 and enroll-without-verify stay fail-closed.
begin;

create or replace function public.test_set_user(test_user uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.aal', 'aal2', true);
end
$$;
revoke execute on function public.test_set_user(uuid) from public, anon;
grant execute on function public.test_set_user(uuid) to authenticated;

reset role;
update public.profiles
   set mfa_enforced = false
 where id = '00000000-0000-0000-0000-000000000102';

set local role authenticated;
select public.test_set_user('00000000-0000-0000-0000-000000000102');
select set_config('request.jwt.claim.aal', 'aal1', true);

do $$
begin
  begin
    perform public.set_mfa_enforced();
    raise exception 'AAL1 set_mfa_enforced unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'AAL1 set_mfa_enforced unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%aal2_session_required%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.aal', 'aal2', true);

do $$
declare
  v_profile public.profiles;
  v_again public.profiles;
  v_audit integer;
begin
  v_profile := public.set_mfa_enforced();
  if v_profile.mfa_enforced is not true then
    raise exception 'AAL2 set_mfa_enforced did not persist mfa_enforced';
  end if;
  if v_profile.id <> '00000000-0000-0000-0000-000000000102'::uuid then
    raise exception 'set_mfa_enforced wrote a different profile';
  end if;

  v_again := public.set_mfa_enforced();
  if v_again.mfa_enforced is not true then
    raise exception 'idempotent set_mfa_enforced lost mfa_enforced';
  end if;

  select count(*) into v_audit
  from public.audit_log
  where actor_id = '00000000-0000-0000-0000-000000000102'
    and action = 'mfa_enforced'
    and entity_id = '00000000-0000-0000-0000-000000000102';
  if v_audit <> 1 then
    raise exception 'expected one mfa_enforced audit row, found %', v_audit;
  end if;
end $$;

reset role;
update public.profiles
   set mfa_enforced = true
 where id = '00000000-0000-0000-0000-000000000102';

rollback;
