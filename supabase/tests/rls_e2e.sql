-- HD-OI-019 executable six-role RLS acceptance checks.
-- Run after migrations and six_roles.sql in a disposable local project.
\set ON_ERROR_STOP on

create or replace function public.test_set_user(test_user uuid) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
end $$;

begin;

-- Synthetic operational rows owned by the director fixture.
insert into public.constituents (
  id, display_name, organization, relationship_class, consent_status, created_by
) values (
  '20000000-0000-0000-0000-000000000001',
  'Synthetic Constituent',
  'Synthetic Org',
  'public_adjacency',
  'confirmed',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.opportunities (
  id, constituent_id, type, title, stage, created_by
) values (
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  'sponsorship',
  'Synthetic Opportunity',
  'qualified',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.decisions (
  id, key, title, status
) values (
  '20000000-0000-0000-0000-000000000003',
  'synthetic-decision',
  'Synthetic Decision',
  'open'
);

insert into public.audit_log (actor_id, action, entity_type, entity_id)
values (
  '00000000-0000-0000-0000-000000000101',
  'synthetic_seed',
  'test',
  'seed'
);

-- Fixture identity checks for all six roles.
do $$
declare
  expected record;
begin
  for expected in
    select * from (values
      ('00000000-0000-0000-0000-000000000101'::uuid, 'director'::public.app_role),
      ('00000000-0000-0000-0000-000000000102'::uuid, 'campaign_lead'::public.app_role),
      ('00000000-0000-0000-0000-000000000103'::uuid, 'development'::public.app_role),
      ('00000000-0000-0000-0000-000000000104'::uuid, 'board_viewer'::public.app_role),
      ('00000000-0000-0000-0000-000000000105'::uuid, 'data_steward'::public.app_role),
      ('00000000-0000-0000-0000-000000000106'::uuid, 'auditor'::public.app_role)
    ) as t(user_id, role_name)
  loop
    perform public.test_set_user(expected.user_id);
    if public.current_role() is distinct from expected.role_name then
      raise exception 'fixture role mismatch for %', expected.role_name;
    end if;
    if expected.role_name <> 'board_viewer'
       and (public.require_active_profile()).mfa_enforced is not true then
      raise exception 'fixture MFA flag missing for %', expected.role_name;
    end if;
  end loop;
end $$;

set local role authenticated;

-- Director: full operational read of constituents and audit.
select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$
declare n integer;
begin
  select count(*) into n from public.constituents;
  if n < 1 then raise exception 'director cannot read constituents'; end if;
  select count(*) into n from public.audit_log;
  if n < 1 then raise exception 'director cannot read audit log'; end if;
  perform public.require_privileged_mfa();
end $$;

-- Campaign lead: can read constituents, cannot write audit directly.
select public.test_set_user('00000000-0000-0000-0000-000000000102');
do $$
declare n integer;
begin
  select count(*) into n from public.constituents;
  if n < 1 then raise exception 'campaign lead cannot read constituents'; end if;
  begin
    insert into public.audit_log(action, entity_type) values ('forbidden','test');
    raise exception 'campaign lead direct audit insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Development: may read constituents, may not insert constituents.
select public.test_set_user('00000000-0000-0000-0000-000000000103');
do $$
declare n integer;
begin
  select count(*) into n from public.constituents;
  if n < 1 then raise exception 'development cannot read constituents'; end if;
  begin
    insert into public.constituents(display_name, relationship_class, consent_status, created_by)
    values ('Blocked Insert', 'public_adjacency', 'unknown', auth.uid());
    raise exception 'development constituent insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%policy%' or sqlerrm like '%permission%' or sqlerrm like '%violates row-level security%' then
        null;
      else
        raise;
      end if;
  end;
end $$;

-- Board viewer: no constituent visibility; opportunities remain readable.
select public.test_set_user('00000000-0000-0000-0000-000000000104');
do $$
declare n integer;
begin
  select count(*) into n from public.constituents;
  if n <> 0 then raise exception 'board viewer unexpectedly read constituents'; end if;
  select count(*) into n from public.opportunities;
  if n < 1 then raise exception 'board viewer cannot read opportunities'; end if;
  -- RLS write denials often update zero rows rather than raising.
  update public.decisions
     set status = 'approved', rationale = 'blocked'
   where key = 'synthetic-decision';
  if found then
    raise exception 'board viewer decision write unexpectedly succeeded';
  end if;
end $$;

-- Data steward: may manage constituents, may not write decisions.
select public.test_set_user('00000000-0000-0000-0000-000000000105');
do $$
declare n integer;
begin
  select count(*) into n from public.constituents;
  if n < 1 then raise exception 'data steward cannot read constituents'; end if;
  update public.decisions
     set status = 'approved', rationale = 'blocked'
   where key = 'synthetic-decision';
  if found then
    raise exception 'data steward decision write unexpectedly succeeded';
  end if;
end $$;

-- Auditor: audit read allowed; direct audit insert forbidden.
select public.test_set_user('00000000-0000-0000-0000-000000000106');
do $$
declare n integer;
begin
  select count(*) into n from public.audit_log;
  if n < 1 then raise exception 'auditor cannot read audit log'; end if;
  select count(*) into n from public.constituents;
  if n < 1 then raise exception 'auditor cannot read constituents'; end if;
  begin
    insert into public.audit_log(action, entity_type) values ('forbidden','test');
    raise exception 'auditor direct audit insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Inactive profile fails closed for role resolution and privileged MFA helper.
reset role;
update public.profiles
   set active = false,
       deactivated_at = now(),
       deactivation_reason = 'synthetic_inactive_test'
 where id = '00000000-0000-0000-0000-000000000103';

set local role authenticated;
select public.test_set_user('00000000-0000-0000-0000-000000000103');
do $$
begin
  if public.current_role() is not null then
    raise exception 'inactive profile still resolves application role';
  end if;
  begin
    perform public.require_active_profile();
    raise exception 'inactive profile unexpectedly passed require_active_profile';
  exception
    when others then
      if sqlerrm not like '%inactive_or_missing_profile%' then
        raise;
      end if;
  end;
end $$;

-- Restore inactive fixture before MFA denial test on another role.
reset role;
update public.profiles
   set active = true,
       deactivated_at = null,
       deactivation_reason = null
 where id = '00000000-0000-0000-0000-000000000103';

update public.profiles
   set mfa_enforced = false
 where id = '00000000-0000-0000-0000-000000000102';

set local role authenticated;
select public.test_set_user('00000000-0000-0000-0000-000000000102');
do $$
begin
  begin
    perform public.require_privileged_mfa();
    raise exception 'privileged role without MFA unexpectedly accepted';
  exception
    when others then
      if sqlerrm not like '%mfa_required%' then
        raise;
      end if;
  end;
end $$;

-- Director may deactivate another profile; non-directors may not.
reset role;
update public.profiles
   set mfa_enforced = true
 where id = '00000000-0000-0000-0000-000000000102';

set local role authenticated;
select public.test_set_user('00000000-0000-0000-0000-000000000105');
do $$
begin
  begin
    perform public.deactivate_profile('00000000-0000-0000-0000-000000000103', 'unauthorized');
    raise exception 'non-director deactivation unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%insufficient_role%' then
        raise;
      end if;
  end;
end $$;

select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$
declare v public.profiles;
begin
  v := public.deactivate_profile('00000000-0000-0000-0000-000000000103', 'synthetic_revocation');
  if v.active then
    raise exception 'director deactivation did not clear active flag';
  end if;
end $$;

-- An expired JWT loses role resolution and cannot pass privileged checks.
select public.test_set_user('00000000-0000-0000-0000-000000000101');
select set_config(
  'request.jwt.claim.exp',
  (extract(epoch from now())::bigint - 1)::text,
  true
);
do $$
begin
  begin
    perform public.current_role();
    raise exception 'expired session unexpectedly resolved a role';
  exception
    when others then
      if sqlerrm not like '%session_expired%' then raise; end if;
  end;
  begin
    perform public.require_privileged_mfa();
    raise exception 'expired session unexpectedly passed privileged MFA';
  exception
    when others then
      if sqlerrm not like '%session_expired%' then raise; end if;
  end;
end $$;

-- Role changes take effect immediately for an already-issued user session.
reset role;
update public.profiles
   set role = 'board_viewer'
 where id = '00000000-0000-0000-0000-000000000105';
update public.client_memberships
   set role = 'board_viewer'
 where client_id = 'org_hacker_dojo'
   and user_id = '00000000-0000-0000-0000-000000000105';

set local role authenticated;
select public.test_set_user('00000000-0000-0000-0000-000000000105');
do $$
begin
  if public.current_role() is distinct from 'board_viewer'::public.app_role then
    raise exception 'role revocation was not reflected in the active session';
  end if;
  if public.current_client_role('org_hacker_dojo') is distinct from 'board_viewer'::public.app_role then
    raise exception 'client role revocation was not reflected in the active session';
  end if;
  begin
    perform public.create_import_batch(
      jsonb_build_object(
        'source_name', 'revoked-role.xlsx',
        'source_sha256', repeat('f', 64),
        'schema_version', 'synthetic-v1',
        'storage_object_path', 'org_hacker_dojo/quarantine/revoked-role.xlsx'
      ),
      '[]'::jsonb
    );
    raise exception 'revoked data-steward role unexpectedly created an import';
  exception
    when others then
      if sqlerrm not like '%insufficient_role%' then raise; end if;
  end;
end $$;

rollback;
