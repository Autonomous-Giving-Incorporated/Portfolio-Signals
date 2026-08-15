-- Close the validated Slice 19 authentication, tenant-authorization, and
-- anonymous email-budget gaps. This migration changes enforcement only; it
-- creates no new governance or platform authority.

create or replace function public.current_session_aal()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt()->>'aal', ''),
    nullif(current_setting('request.jwt.claim.aal', true), ''),
    'aal1'
  )
$$;

revoke all on function public.current_session_aal() from public, anon;
grant execute on function public.current_session_aal() to anon, authenticated;

create or replace function public.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_administrators a
    join public.profiles p on p.id = a.user_id and p.active is true
    where a.user_id = auth.uid()
      and a.active is true
      and a.revoked_at is null
      and p.mfa_enforced is true
      and public.current_session_aal() = 'aal2'
  )
$$;

create or replace function public.is_client_member(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_memberships m
    join public.clients c on c.id = m.client_id and c.state = 'active'
    join public.profiles p on p.id = m.user_id and p.active is true
    where m.client_id = p_client_id
      and m.user_id = auth.uid()
      and m.active is true
      and (
        m.role = 'board_viewer'
        or (p.mfa_enforced is true and public.current_session_aal() = 'aal2')
      )
  )
$$;

create or replace function public.current_client_role(p_client_id text)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.client_memberships m
  join public.clients c on c.id = m.client_id and c.state = 'active'
  join public.profiles p on p.id = m.user_id and p.active is true
  where m.client_id = p_client_id
    and m.user_id = auth.uid()
    and m.active is true
    and (
      m.role = 'board_viewer'
      or (p.mfa_enforced is true and public.current_session_aal() = 'aal2')
    )
$$;

create or replace function public.require_privileged_mfa()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_privileged boolean;
begin
  v_profile := public.require_active_profile();
  select (
    exists (
      select 1 from public.platform_administrators
      where user_id = auth.uid() and active is true and revoked_at is null
    )
    or exists (
      select 1 from public.client_memberships
      where user_id = auth.uid() and active is true and role <> 'board_viewer'
    )
  ) into v_privileged;

  if v_privileged and v_profile.mfa_enforced is not true then
    raise exception 'mfa_required';
  end if;
  if v_privileged and public.current_session_aal() <> 'aal2' then
    raise exception 'aal2_session_required';
  end if;
  return v_profile;
end
$$;

create or replace function public.can_manage_onboarding_pack(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_session_aal() = 'aal2'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active is true and p.mfa_enforced is true
    )
    and (
      public.is_master_admin()
      or exists (
        select 1 from public.client_memberships m
        where m.client_id = p_client_id
          and m.user_id = auth.uid()
          and m.active is true
          and m.role = 'director'
      )
    )
$$;

-- Global profile lifecycle is platform authority. Tenant directors retain the
-- audited set_client_membership(..., p_active => false) path for their tenant.
create or replace function public.deactivate_profile(
  p_profile_id uuid,
  p_reason text default 'operator_revocation'
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_active_admins integer;
begin
  perform public.require_privileged_mfa();
  if not public.is_master_admin() then
    raise exception 'master_admin_required';
  end if;

  if exists (
    select 1 from public.platform_administrators
    where user_id = p_profile_id and active is true and revoked_at is null
  ) then
    select count(*) into v_active_admins
    from public.platform_administrators
    where active is true and revoked_at is null;
    if v_active_admins <= 1 then raise exception 'last_master_admin_required'; end if;
  end if;

  update public.profiles
  set active = false,
      deactivated_at = now(),
      deactivation_reason = coalesce(nullif(trim(p_reason), ''), 'operator_revocation'),
      updated_at = now()
  where id = p_profile_id
  returning * into v_profile;
  if not found then raise exception 'profile_not_found'; end if;

  update public.client_memberships
  set active = false,
      membership_version = membership_version + 1,
      updated_at = now()
  where user_id = p_profile_id and active is true;

  update public.platform_administrators
  set active = false, revoked_at = now()
  where user_id = p_profile_id and active is true;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(), 'profile_deactivated', 'profile', p_profile_id::text,
    jsonb_build_object('reason', v_profile.deactivation_reason, 'role', v_profile.role)
  );
  return v_profile;
end
$$;

create or replace function public.begin_auth_email_dispatch(
  p_recipient_hash text,
  p_kind public.auth_email_kind,
  p_client_id text default null,
  p_target_user_id uuid default null,
  p_requested_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_recipient_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'recipient_hash_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_recipient_hash, 0));
  if p_requested_by is null then
    perform pg_advisory_xact_lock(hashtextextended('auth_email_anonymous_global', 0));
  end if;

  if exists (
    select 1 from public.auth_email_dispatches
    where recipient_hash = p_recipient_hash
      and requested_at > now() - interval '10 minutes'
      and status in ('pending', 'sent')
  ) then return null; end if;

  if p_requested_by is not null and (
    select count(*) from public.auth_email_dispatches
    where requested_by = p_requested_by
      and requested_at > now() - interval '1 hour'
      and status in ('pending', 'sent')
  ) >= 20 then return null; end if;

  if p_requested_by is null and (
    select count(*) from public.auth_email_dispatches
    where requested_by is null
      and requested_at > now() - interval '1 hour'
      and status in ('pending', 'sent')
  ) >= 50 then return null; end if;

  insert into public.auth_email_dispatches(
    recipient_hash, client_id, target_user_id, kind, requested_by
  ) values (
    p_recipient_hash, p_client_id, p_target_user_id, p_kind, p_requested_by
  ) returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.is_master_admin() from public, anon;
revoke all on function public.is_client_member(text) from public, anon;
revoke all on function public.current_client_role(text) from public, anon;
revoke all on function public.require_privileged_mfa() from public, anon;
revoke all on function public.can_manage_onboarding_pack(text) from public, anon;
revoke all on function public.deactivate_profile(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- RLS policies call these helpers for both database roles. Anonymous callers
-- receive false/null because auth.uid() is null; granting execution avoids
-- turning an ordinary zero-row RLS result into a function-permission error.
grant execute on function public.is_master_admin() to anon, authenticated;
grant execute on function public.is_client_member(text) to anon, authenticated;
grant execute on function public.current_client_role(text) to anon, authenticated;
grant execute on function public.require_privileged_mfa() to authenticated;
grant execute on function public.can_manage_onboarding_pack(text) to authenticated;
grant execute on function public.deactivate_profile(uuid, text) to authenticated;
grant execute on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid)
  to service_role;

comment on column public.profiles.mfa_enforced is
  'Enrollment policy flag only. Privileged authorization also requires the current JWT aal claim to equal aal2.';

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice 19 + Hash: e7d251cc1b4bbe26270060bae03a662e95363794
