-- HD-OI-019: identity and MFA readiness controls
-- Privileged campaign roles must be able to record MFA enforcement without storing secrets.

alter table public.profiles
  add column if not exists mfa_enforced boolean not null default false,
  add column if not exists last_authenticated_at timestamptz,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text;

comment on column public.profiles.mfa_enforced is
  'Application gate: privileged surfaces require true. Supabase Auth MFA enrollment is configured in the project, not stored as a secret here.';

create or replace function public.require_active_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true;

  if not found then
    raise exception 'inactive_or_missing_profile';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.require_active_profile() from public;
grant execute on function public.require_active_profile() to authenticated;

-- Board viewers may remain MFA-optional for aggregate read surfaces.
-- Privileged operational roles must be marked mfa_enforced before production use.
create or replace function public.require_privileged_mfa()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.require_active_profile();

  if v_profile.role in ('director','campaign_lead','development','data_steward','auditor')
     and v_profile.mfa_enforced is not true then
    raise exception 'mfa_required';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.require_privileged_mfa() from public;
grant execute on function public.require_privileged_mfa() to authenticated;

create or replace function public.deactivate_profile(
  p_profile_id uuid,
  p_reason text default 'operator_revocation'
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.app_role;
  v_profile public.profiles;
begin
  v_actor := public.current_role();
  if v_actor is distinct from 'director' then
    raise exception 'insufficient_role';
  end if;

  update public.profiles
     set active = false,
         deactivated_at = now(),
         deactivation_reason = coalesce(nullif(trim(p_reason), ''), 'operator_revocation'),
         updated_at = now()
   where id = p_profile_id
  returning * into v_profile;

  if not found then
    raise exception 'profile_not_found';
  end if;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(),
    'profile_deactivated',
    'profile',
    p_profile_id::text,
    jsonb_build_object('reason', v_profile.deactivation_reason, 'role', v_profile.role)
  );

  return v_profile;
end;
$$;

revoke all on function public.deactivate_profile(uuid, text) from public;
grant execute on function public.deactivate_profile(uuid, text) to authenticated;
