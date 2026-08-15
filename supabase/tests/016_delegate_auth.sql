-- Synthetic delegate invitation, least-privilege, revocation, and dispatch tests.
begin;

-- Supabase public-schema defaults must not widen security-definer RPC access.
do $$
begin
  if has_function_privilege(
    'anon', 'public.request_delegate_invitation(text,text,text[],text)', 'execute'
  ) then raise exception 'anon can execute delegate invitation RPC'; end if;
  if not has_function_privilege(
    'authenticated', 'public.request_delegate_invitation(text,text,text[],text)', 'execute'
  ) then raise exception 'authenticated cannot execute delegate invitation RPC'; end if;
  if has_function_privilege(
    'anon', 'public.resolve_auth_email_context(text)', 'execute'
  ) then raise exception 'anon can resolve auth email context'; end if;
  if has_function_privilege(
    'authenticated', 'public.resolve_auth_email_context(text)', 'execute'
  ) then raise exception 'authenticated can resolve auth email context'; end if;
  if not has_function_privilege(
    'service_role', 'public.resolve_auth_email_context(text)', 'execute'
  ) then raise exception 'service role cannot resolve auth email context'; end if;
  if has_function_privilege(
    'anon',
    'public.begin_auth_email_dispatch(text,public.auth_email_kind,text,uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.begin_auth_email_dispatch(text,public.auth_email_kind,text,uuid,uuid)',
    'execute'
  ) then raise exception 'non-service role can open auth email dispatch'; end if;
end $$;

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
select set_config('request.jwt.claim.aal', 'aal2', true);
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
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
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
  v_id := public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link');
  if v_id is null then raise exception 'initial recipient dispatch was rejected'; end if;
  if public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link') is not null then
    raise exception 'recipient cooldown did not suppress a duplicate dispatch';
  end if;

  perform public.complete_auth_email_dispatch(v_id, 'failed', null, 'synthetic_provider_failure');
  v_id := public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link');
  if v_id is null then raise exception 'failed dispatch blocked a legitimate retry'; end if;
  perform public.complete_auth_email_dispatch(v_id, 'sent', 'synthetic-provider-id');
  if public.begin_auth_email_dispatch(v_hash, 'tenant_member_magic_link') is not null then
    raise exception 'sent dispatch did not retain the recipient cooldown';
  end if;

  -- One recipient cooldown is insufficient: rotating recipients must still hit
  -- the service-wide anonymous provider budget.
  for i in 1..49 loop
    if public.begin_auth_email_dispatch(
      lpad(to_hex(i), 64, '0'), 'tenant_member_magic_link'
    ) is null then
      raise exception 'anonymous dispatch budget rejected before its documented ceiling';
    end if;
  end loop;
  if public.begin_auth_email_dispatch(
    lpad(to_hex(500), 64, '0'), 'tenant_member_magic_link'
  ) is not null then
    raise exception 'anonymous recipient rotation bypassed the global dispatch budget';
  end if;
end $$;
reset role;

rollback;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice 18 + Hash: b67241f265e5a887b205cd60f6dcfa8912847b72
