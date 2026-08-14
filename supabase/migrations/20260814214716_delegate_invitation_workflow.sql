-- AGI platform Auth: tenant-scoped infrastructure delegates, invitation
-- acceptance, audited sign-in dispatches, revocation, and least privilege.

create type public.delegate_invitation_state as enum (
  'pending', 'accepted', 'revoked', 'expired'
);

create type public.auth_email_kind as enum (
  'platform_admin_magic_link',
  'tenant_member_magic_link',
  'delegate_invite',
  'delegate_magic_link',
  'delegate_access_changed'
);

create table public.client_delegate_invitations (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete restrict,
  email text not null check (
    email = lower(trim(email)) and
    email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  scopes text[] not null,
  state public.delegate_invitation_state not null default 'pending',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  rationale text not null check (length(trim(rationale)) >= 12),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '72 hours'),
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  accepted_by uuid references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  constraint delegate_invitation_scopes_valid check (
    cardinality(scopes) between 1 and 5 and
    scopes <@ array[
      'workspace_access',
      'identity_support',
      'integration_operations',
      'delivery_observability',
      'configuration_support'
    ]::text[]
  ),
  constraint delegate_invitation_expiry_valid check (expires_at > requested_at)
);

create unique index client_delegate_one_pending_email
  on public.client_delegate_invitations(client_id, email)
  where state = 'pending';

create table public.infrastructure_delegations (
  client_id text not null,
  user_id uuid not null,
  scopes text[] not null,
  active boolean not null default true,
  delegation_version bigint not null default 1 check (delegation_version > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text,
  primary key (client_id, user_id),
  foreign key (client_id, user_id)
    references public.client_memberships(client_id, user_id) on delete cascade,
  constraint infrastructure_delegation_scopes_valid check (
    cardinality(scopes) between 1 and 5 and
    scopes <@ array[
      'workspace_access',
      'identity_support',
      'integration_operations',
      'delivery_observability',
      'configuration_support'
    ]::text[]
  )
);

create table public.auth_email_dispatches (
  id uuid primary key default gen_random_uuid(),
  recipient_hash text not null check (recipient_hash ~ '^[0-9a-f]{64}$'),
  client_id text references public.clients(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  kind public.auth_email_kind not null,
  requested_by uuid references public.profiles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'suppressed')),
  provider_message_id text,
  error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.client_delegate_invitations enable row level security;
alter table public.infrastructure_delegations enable row level security;
alter table public.auth_email_dispatches enable row level security;

create policy "directors read delegate invitations"
on public.client_delegate_invitations for select to authenticated
using (
  public.current_client_role(client_id) = 'director' or public.is_master_admin()
);

create policy "tenant peers read delegations"
on public.infrastructure_delegations for select to authenticated
using (
  public.is_client_member(client_id) or public.is_master_admin()
);

grant select on public.client_delegate_invitations to authenticated;
grant select on public.infrastructure_delegations to authenticated;
revoke all on public.auth_email_dispatches from anon, authenticated;
revoke insert, update, delete on public.client_delegate_invitations from authenticated;
revoke insert, update, delete on public.infrastructure_delegations from authenticated;

create or replace function public.request_delegate_invitation(
  p_client_id text,
  p_email text,
  p_scopes text[],
  p_rationale text
) returns public.client_delegate_invitations
language plpgsql security definer set search_path = public, auth as $$
declare
  v_invitation public.client_delegate_invitations;
  v_email text := lower(trim(p_email));
begin
  perform public.require_privileged_mfa();
  if public.current_client_role(p_client_id) is distinct from 'director' then
    raise exception 'client_director_required';
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then
    raise exception 'invitation_rationale_required';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and state = 'active') then
    raise exception 'active_client_required';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'valid_delegate_email_required';
  end if;
  if cardinality(p_scopes) < 1 or not (
    p_scopes <@ array[
      'workspace_access', 'identity_support', 'integration_operations',
      'delivery_observability', 'configuration_support'
    ]::text[]
  ) then
    raise exception 'valid_delegate_scopes_required';
  end if;
  if (
    select count(*) from public.client_delegate_invitations
    where requested_by = auth.uid() and requested_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'delegate_invitation_rate_limited';
  end if;

  update public.client_delegate_invitations
  set state = 'expired'
  where client_id = p_client_id and email = v_email
    and state = 'pending' and expires_at <= now();

  insert into public.client_delegate_invitations(
    client_id, email, scopes, requested_by, rationale
  ) values (
    p_client_id, v_email, array(select distinct unnest(p_scopes)),
    auth.uid(), trim(p_rationale)
  )
  on conflict (client_id, email) where state = 'pending'
  do update set
    scopes = excluded.scopes,
    requested_by = excluded.requested_by,
    rationale = excluded.rationale,
    requested_at = now(),
    expires_at = now() + interval '72 hours'
  returning * into v_invitation;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    p_client_id, auth.uid(), 'delegate_invitation_requested',
    'client_delegate_invitation', v_invitation.id::text, trim(p_rationale),
    jsonb_build_object('scopes', v_invitation.scopes, 'expires_at', v_invitation.expires_at)
  );

  return v_invitation;
end $$;

create or replace function public.authorize_delegate_sign_in(
  p_client_id text,
  p_user_id uuid,
  p_rationale text
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_scopes text[];
begin
  perform public.require_privileged_mfa();
  if public.current_client_role(p_client_id) is distinct from 'director' then
    raise exception 'client_director_required';
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then
    raise exception 'sign_in_rationale_required';
  end if;

  select d.scopes into v_scopes
  from public.client_memberships m
  join public.infrastructure_delegations d
    on d.client_id = m.client_id and d.user_id = m.user_id
  where m.client_id = p_client_id and m.user_id = p_user_id
    and m.role = 'infrastructure_delegate' and m.active = true and d.active = true;
  if v_scopes is null then raise exception 'active_delegate_required'; end if;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    p_client_id, auth.uid(), 'delegate_sign_in_requested',
    'client_membership', p_user_id::text, trim(p_rationale),
    jsonb_build_object('scopes', v_scopes)
  );

  return jsonb_build_object(
    'client_id', p_client_id,
    'target_user_id', p_user_id,
    'scopes', v_scopes,
    'requested_by', auth.uid()
  );
end $$;

create or replace function public.revoke_delegate_invitation(
  p_invitation_id uuid,
  p_rationale text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_invitation public.client_delegate_invitations;
begin
  perform public.require_privileged_mfa();
  select * into v_invitation
  from public.client_delegate_invitations
  where id = p_invitation_id for update;
  if v_invitation.id is null then raise exception 'delegate_invitation_not_found'; end if;
  if public.current_client_role(v_invitation.client_id) is distinct from 'director' then
    raise exception 'client_director_required';
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then
    raise exception 'revocation_rationale_required';
  end if;
  if v_invitation.state <> 'pending' then raise exception 'delegate_invitation_not_pending'; end if;

  update public.client_delegate_invitations set
    state = 'revoked', revoked_by = auth.uid(), revoked_at = now()
  where id = v_invitation.id;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    v_invitation.client_id, auth.uid(), 'delegate_invitation_revoked',
    'client_delegate_invitation', v_invitation.id::text, trim(p_rationale),
    jsonb_build_object(
      'email_hash', encode(extensions.digest(v_invitation.email, 'sha256'), 'hex'),
      'state', 'revoked'
    )
  );
  return jsonb_build_object('invitation_id', v_invitation.id, 'state', 'revoked');
end $$;

create or replace function public.accept_delegate_invitation(
  p_invitation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_invitation public.client_delegate_invitations;
  v_user auth.users;
  v_display_name text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null or v_user.email is null then raise exception 'verified_email_required'; end if;

  select * into v_invitation
  from public.client_delegate_invitations
  where id = p_invitation_id for update;
  if v_invitation.id is null then raise exception 'delegate_invitation_not_found'; end if;
  if v_invitation.state <> 'pending' then raise exception 'delegate_invitation_not_pending'; end if;
  if v_invitation.expires_at <= now() then
    update public.client_delegate_invitations set state = 'expired' where id = p_invitation_id;
    raise exception 'delegate_invitation_expired';
  end if;
  if lower(v_user.email) <> v_invitation.email then
    raise exception 'delegate_invitation_email_mismatch';
  end if;

  v_display_name := coalesce(
    nullif(trim(v_user.raw_user_meta_data->>'display_name'), ''),
    split_part(v_user.email, '@', 1)
  );
  insert into public.profiles(id, display_name, role, active)
  values (v_user.id, v_display_name, 'infrastructure_delegate', true)
  on conflict (id) do update set active = true, updated_at = now();

  insert into public.client_memberships(client_id, user_id, role, active)
  values (v_invitation.client_id, v_user.id, 'infrastructure_delegate', true)
  on conflict (client_id, user_id) do update set
    role = 'infrastructure_delegate', active = true,
    membership_version = public.client_memberships.membership_version + 1,
    updated_at = now();

  insert into public.infrastructure_delegations(
    client_id, user_id, scopes, active, created_by
  ) values (
    v_invitation.client_id, v_user.id, v_invitation.scopes, true,
    v_invitation.requested_by
  )
  on conflict (client_id, user_id) do update set
    scopes = excluded.scopes, active = true,
    delegation_version = public.infrastructure_delegations.delegation_version + 1,
    updated_at = now(), revoked_by = null, revoked_at = null, revocation_reason = null;

  update public.client_delegate_invitations set
    state = 'accepted', accepted_by = v_user.id, accepted_at = now()
  where id = v_invitation.id;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    v_invitation.client_id, v_user.id, 'delegate_invitation_accepted',
    'infrastructure_delegation', v_user.id::text, 'Recipient accepted delegate access',
    jsonb_build_object('scopes', v_invitation.scopes)
  );

  return jsonb_build_object(
    'client_id', v_invitation.client_id,
    'role', 'infrastructure_delegate',
    'scopes', v_invitation.scopes
  );
end $$;

create or replace function public.revoke_infrastructure_delegate(
  p_client_id text,
  p_user_id uuid,
  p_rationale text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_scopes text[];
begin
  perform public.require_privileged_mfa();
  if public.current_client_role(p_client_id) is distinct from 'director' then
    raise exception 'client_director_required';
  end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then
    raise exception 'revocation_rationale_required';
  end if;
  update public.infrastructure_delegations set
    active = false,
    delegation_version = delegation_version + 1,
    updated_at = now(),
    revoked_by = auth.uid(),
    revoked_at = now(),
    revocation_reason = trim(p_rationale)
  where client_id = p_client_id and user_id = p_user_id and active = true
  returning scopes into v_scopes;
  if v_scopes is null then raise exception 'active_delegate_required'; end if;

  update public.client_memberships set
    active = false,
    membership_version = membership_version + 1,
    updated_at = now()
  where client_id = p_client_id and user_id = p_user_id
    and role = 'infrastructure_delegate';

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    p_client_id, auth.uid(), 'infrastructure_delegate_revoked',
    'infrastructure_delegation', p_user_id::text, trim(p_rationale),
    jsonb_build_object('active', false, 'scopes', v_scopes)
  );
  return jsonb_build_object('client_id', p_client_id, 'user_id', p_user_id, 'active', false);
end $$;

create or replace function public.resolve_auth_email_context(p_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_user auth.users;
  v_context jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  select * into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user.id is null then return null; end if;

  if exists (
    select 1 from public.platform_administrators
    where user_id = v_user.id and active = true and revoked_at is null
  ) then
    return jsonb_build_object(
      'user_id', v_user.id,
      'audience', 'platform_admin',
      'display_name', coalesce(v_user.raw_user_meta_data->>'display_name', split_part(v_user.email, '@', 1))
    );
  end if;

  select jsonb_build_object(
    'user_id', v_user.id,
    'audience', case when m.role = 'infrastructure_delegate' then 'delegate' else 'tenant_member' end,
    'display_name', coalesce(p.display_name, split_part(v_user.email, '@', 1)),
    'client_id', c.id,
    'client_name', c.display_name,
    'role', m.role,
    'scopes', coalesce(to_jsonb(d.scopes), '[]'::jsonb)
  ) into v_context
  from public.client_memberships m
  join public.clients c on c.id = m.client_id and c.state = 'active'
  join public.profiles p on p.id = m.user_id and p.active = true
  left join public.infrastructure_delegations d
    on d.client_id = m.client_id and d.user_id = m.user_id and d.active = true
  where m.user_id = v_user.id and m.active = true
  order by (m.role = 'infrastructure_delegate') desc, c.display_name
  limit 1;

  return coalesce(v_context, jsonb_build_object(
    'user_id', v_user.id,
    'audience', 'unassigned',
    'display_name', coalesce(v_user.raw_user_meta_data->>'display_name', split_part(v_user.email, '@', 1))
  ));
end $$;

create or replace function public.begin_auth_email_dispatch(
  p_recipient_hash text,
  p_kind public.auth_email_kind,
  p_client_id text default null,
  p_target_user_id uuid default null,
  p_requested_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_recipient_hash !~ '^[0-9a-f]{64}$' then raise exception 'recipient_hash_required'; end if;
  if (
    select count(*) from public.auth_email_dispatches
    where recipient_hash = p_recipient_hash
      and requested_at > now() - interval '15 minutes'
      and status in ('pending', 'sent')
  ) >= 3 then return null; end if;
  if p_requested_by is not null and (
    select count(*) from public.auth_email_dispatches
    where requested_by = p_requested_by
      and requested_at > now() - interval '1 hour'
      and status in ('pending', 'sent')
  ) >= 20 then return null; end if;

  insert into public.auth_email_dispatches(
    recipient_hash, client_id, target_user_id, kind, requested_by
  ) values (
    p_recipient_hash, p_client_id, p_target_user_id, p_kind, p_requested_by
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.complete_auth_email_dispatch(
  p_dispatch_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error_code text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_status not in ('sent', 'failed', 'suppressed') then
    raise exception 'invalid_dispatch_status';
  end if;
  update public.auth_email_dispatches set
    status = p_status,
    provider_message_id = left(p_provider_message_id, 160),
    error_code = left(p_error_code, 120),
    completed_at = now()
  where id = p_dispatch_id and status = 'pending';
end $$;

-- Delegates are privileged identities for MFA purposes, but gain no campaign,
-- donor, decision, import, or money permissions from the role itself.
create or replace function public.require_privileged_mfa()
returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare v_profile public.profiles;
begin
  v_profile := public.require_active_profile();
  if (
    public.is_master_admin() or exists (
      select 1 from public.client_memberships
      where user_id = auth.uid() and active = true and role <> 'board_viewer'
    )
  ) and v_profile.mfa_enforced is not true then
    raise exception 'mfa_required';
  end if;
  return v_profile;
end $$;

-- Existing role administration cannot mint an unscoped delegate.
create or replace function public.set_client_membership(
  p_client_id text,
  p_user_id uuid,
  p_role public.app_role,
  p_active boolean default true,
  p_rationale text default null
) returns public.client_memberships
language plpgsql security definer set search_path = public as $$
declare
  v_membership public.client_memberships;
  v_is_master boolean := public.is_master_admin();
  v_actor_role public.app_role := public.current_client_role(p_client_id);
  v_existing_role public.app_role;
  v_director_count integer;
begin
  perform public.require_privileged_mfa();
  if p_role = 'infrastructure_delegate' then
    raise exception 'use_delegate_invitation_workflow';
  end if;
  if not v_is_master and v_actor_role is distinct from 'director' then
    raise exception 'client_director_required';
  end if;
  if v_is_master and length(trim(coalesce(p_rationale, ''))) < 12 then
    raise exception 'admin_rationale_required';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and state <> 'suspended') then
    raise exception 'active_client_required';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and active = true) then
    raise exception 'active_target_profile_required';
  end if;
  select role into v_existing_role from public.client_memberships
  where client_id = p_client_id and user_id = p_user_id and active = true for update;
  if v_existing_role = 'director' and (p_role <> 'director' or not p_active) then
    select count(*) into v_director_count from public.client_memberships
    where client_id = p_client_id and role = 'director' and active = true;
    if v_director_count <= 1 then raise exception 'last_client_director_required'; end if;
  end if;
  insert into public.client_memberships(client_id, user_id, role, active)
  values (p_client_id, p_user_id, p_role, p_active)
  on conflict (client_id, user_id) do update set
    role = excluded.role, active = excluded.active,
    membership_version = public.client_memberships.membership_version + 1,
    updated_at = now()
  returning * into v_membership;
  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    p_client_id, auth.uid(), 'client_membership_set', 'client_membership', p_user_id::text,
    coalesce(nullif(trim(p_rationale), ''), 'client director membership administration'),
    jsonb_build_object('role', p_role, 'active', p_active, 'membership_version', v_membership.membership_version)
  );
  return v_membership;
end $$;

-- Attach scope context to the existing workspace response without granting
-- platform admins tenant-private access.
create or replace function public.get_workspace_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_is_master boolean;
  v_clients jsonb;
begin
  v_profile := public.require_active_profile();
  v_is_master := public.is_master_admin();
  if v_is_master then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'display_name', c.display_name,
      'state', c.state, 'reference_tenant', c.reference_tenant,
      'role', m.role, 'membership_version', m.membership_version,
      'delegate_scopes', coalesce(to_jsonb(d.scopes), '[]'::jsonb)
    ) order by c.display_name), '[]'::jsonb) into v_clients
    from public.clients c
    left join public.client_memberships m
      on m.client_id = c.id and m.user_id = auth.uid() and m.active = true
    left join public.infrastructure_delegations d
      on d.client_id = m.client_id and d.user_id = m.user_id and d.active = true;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'display_name', c.display_name,
      'state', c.state, 'reference_tenant', c.reference_tenant,
      'role', m.role, 'membership_version', m.membership_version,
      'delegate_scopes', coalesce(to_jsonb(d.scopes), '[]'::jsonb)
    ) order by c.display_name), '[]'::jsonb) into v_clients
    from public.client_memberships m
    join public.clients c on c.id = m.client_id
    left join public.infrastructure_delegations d
      on d.client_id = m.client_id and d.user_id = m.user_id and d.active = true
    where m.user_id = auth.uid() and m.active = true;
  end if;
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id, 'display_name', v_profile.display_name,
      'mfa_enforced', v_profile.mfa_enforced, 'active', v_profile.active
    ),
    'is_master_admin', v_is_master,
    'clients', v_clients
  );
end $$;

revoke all on function public.request_delegate_invitation(text, text, text[], text) from public;
revoke all on function public.authorize_delegate_sign_in(text, uuid, text) from public;
revoke all on function public.revoke_delegate_invitation(uuid, text) from public;
revoke all on function public.accept_delegate_invitation(uuid) from public;
revoke all on function public.revoke_infrastructure_delegate(text, uuid, text) from public;
revoke all on function public.resolve_auth_email_context(text) from public;
revoke all on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid) from public;
revoke all on function public.complete_auth_email_dispatch(uuid, text, text, text) from public;

grant execute on function public.request_delegate_invitation(text, text, text[], text) to authenticated;
grant execute on function public.authorize_delegate_sign_in(text, uuid, text) to authenticated;
grant execute on function public.revoke_delegate_invitation(uuid, text) to authenticated;
grant execute on function public.accept_delegate_invitation(uuid) to authenticated;
grant execute on function public.revoke_infrastructure_delegate(text, uuid, text) to authenticated;
grant execute on function public.resolve_auth_email_context(text) to service_role;
grant execute on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid) to service_role;
grant execute on function public.complete_auth_email_dispatch(uuid, text, text, text) to service_role;

comment on table public.infrastructure_delegations is
  'Tenant-scoped infrastructure support access. It grants no campaign or donor authority.';
comment on table public.client_delegate_invitations is
  'Audited director-issued invitations; recipient acceptance is required before membership activation.';

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 622346cc565b1d6c7ebfc75eb7590b8dd03af601
