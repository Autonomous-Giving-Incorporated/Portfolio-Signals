-- Synthetic delegate invitation, least-privilege, revocation, and dispatch tests.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000107',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'delegate@example.invalid', '',
  now(), now(), now()
);

-- A tenant director with MFA can issue a scoped invitation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

create temporary table delegate_test_state(invitation_id uuid) on commit drop;
insert into delegate_test_state(invitation_id)
select id from public.request_delegate_invitation(
  'org_hacker_dojo',
  'delegate@example.invalid',
  array['workspace_access', 'delivery_observability'],
  'Synthetic tenant infrastructure support'
);

do $$
begin
  if not exists (
    select 1 from public.client_delegate_invitations
    where id = (select invitation_id from delegate_test_state)
      and state = 'pending'
      and scopes @> array['workspace_access']::text[]
  ) then raise exception 'scoped delegate invitation was not created'; end if;
end $$;

-- The matching recipient explicitly accepts; no campaign authority is added.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000107', true);
select public.accept_delegate_invitation((select invitation_id from delegate_test_state));
reset role;

update public.profiles
set mfa_enforced = true
where id = '00000000-0000-0000-0000-000000000107';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000107', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
declare
  v_context jsonb;
  v_visible_opportunities integer;
begin
  v_context := public.get_workspace_context();
  if v_context#>>'{clients,0,role}' <> 'infrastructure_delegate' then
    raise exception 'workspace context omitted delegate role';
  end if;
  if not (v_context#>'{clients,0,delegate_scopes}' @> '["workspace_access"]'::jsonb) then
    raise exception 'workspace context omitted delegate scopes';
  end if;

  select count(*) into v_visible_opportunities from public.opportunities;
  if v_visible_opportunities <> 0 then
    raise exception 'delegate unexpectedly read campaign opportunities';
  end if;

  begin
    perform public.set_client_membership(
      'org_hacker_dojo',
      '00000000-0000-0000-0000-000000000107',
      'development', true, 'Delegate cannot promote itself'
    );
    raise exception 'delegate membership promotion unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'delegate membership promotion unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%client_director_required%' then raise; end if;
  end;
end $$;
reset role;

-- A director can issue a sign-in and can revoke active delegate access.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
select public.authorize_delegate_sign_in(
  'org_hacker_dojo',
  '00000000-0000-0000-0000-000000000107',
  'Synthetic support session requested'
);
select public.revoke_infrastructure_delegate(
  'org_hacker_dojo',
  '00000000-0000-0000-0000-000000000107',
  'Synthetic support engagement completed'
);
reset role;

do $$
begin
  if exists (
    select 1 from public.client_memberships
    where client_id = 'org_hacker_dojo'
      and user_id = '00000000-0000-0000-0000-000000000107'
      and active = true
  ) then raise exception 'revoked delegate membership remained active'; end if;
  if exists (
    select 1 from public.infrastructure_delegations
    where client_id = 'org_hacker_dojo'
      and user_id = '00000000-0000-0000-0000-000000000107'
      and active = true
  ) then raise exception 'revoked infrastructure delegation remained active'; end if;
end $$;

-- Pending invitation revocation is a separate audited path.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
update delegate_test_state set invitation_id = (
  select id from public.request_delegate_invitation(
    'org_hacker_dojo', 'pending@example.invalid', array['workspace_access'],
    'Synthetic pending invitation lifecycle'
  )
);
select public.revoke_delegate_invitation(
  (select invitation_id from delegate_test_state),
  'Synthetic invitation no longer needed'
);
reset role;

-- Only the service role may resolve recipients or open the dispatch ledger.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
do $$
declare
  v_context jsonb;
  v_hash text := repeat('a', 64);
  v_id uuid;
begin
  v_context := public.resolve_auth_email_context('director@example.invalid');
  if v_context->>'audience' <> 'tenant_member' then
    raise exception 'director email context was not tenant_member';
  end if;
  perform public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link');
  perform public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link');
  perform public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link');
  v_id := public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link');
  if v_id is not null then raise exception 'recipient rate limit did not fail closed'; end if;
end $$;
reset role;

rollback;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: pending
