-- scripts/platform/ensure-profile.sql
-- Ensure public.profiles exists for an Auth user. Does NOT set mfa_enforced.
--
-- Run as postgres (Dashboard SQL) AFTER the Auth user exists.
-- Replace target_user_id and display_name before running.
-- No secrets belong in this file.
-- After run, verify with verify-operator-access.sql (when available).

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> REPLACE display name (non-empty) <<<
  target_display_name text := 'Operator Display Name';
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before ensure-profile';
  end if;

  if length(trim(target_display_name)) = 0
     or target_display_name = 'Operator Display Name' then
    raise exception 'replace target_display_name with a real display name before ensure-profile';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'auth user % not found; invite the user first', target_user_id;
  end if;

  insert into public.profiles (id, display_name, role, active, mfa_enforced)
  values (
    target_user_id,
    trim(target_display_name),
    'director',
    true,
    false
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      active = true,
      deactivated_at = null,
      deactivation_reason = null,
      updated_at = now();
  -- Intentionally do NOT touch mfa_enforced on conflict.

  raise notice 'ensure-profile complete for % (mfa_enforced unchanged on conflict)', target_user_id;
end
$$;
