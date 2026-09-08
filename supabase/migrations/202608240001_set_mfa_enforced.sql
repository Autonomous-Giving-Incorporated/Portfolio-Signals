-- Persist profiles.mfa_enforced after a verified AAL2 session.
-- Same flag the operator script scripts/platform/set-mfa-enforced.sql writes.
-- Callers cannot set the flag for another user, cannot clear it, and cannot
-- succeed on AAL1. Idempotent when the flag is already true.

create or replace function public.set_mfa_enforced()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.require_active_profile();

  if public.current_session_aal() is distinct from 'aal2' then
    raise exception 'aal2_session_required';
  end if;

  if v_profile.mfa_enforced is true then
    return v_profile;
  end if;

  update public.profiles
     set mfa_enforced = true,
         updated_at = now()
   where id = auth.uid()
     and active is true
  returning * into v_profile;

  if not found then
    raise exception 'inactive_or_missing_profile';
  end if;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(),
    'mfa_enforced',
    'profile',
    auth.uid()::text,
    jsonb_build_object('mfa_enforced', true)
  );

  return v_profile;
end
$$;

revoke all on function public.set_mfa_enforced() from public, anon, authenticated, service_role;
grant execute on function public.set_mfa_enforced() to authenticated;

comment on function public.set_mfa_enforced() is
  'Sets profiles.mfa_enforced true for auth.uid() only after current_session_aal() = aal2. Fail-closed. Idempotent.';
