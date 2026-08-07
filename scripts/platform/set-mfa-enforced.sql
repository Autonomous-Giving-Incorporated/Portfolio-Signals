-- scripts/platform/set-mfa-enforced.sql
-- Set profiles.mfa_enforced after the human has enrolled MFA in Supabase Auth.
-- NEVER set true unless enrollment is confirmed in Dashboard → Authentication → Users.
--
-- Run as postgres. Replace target_user_id and desired_mfa_enforced.
-- No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> true only after Auth MFA enrollment confirmed; false to clear <<<
  desired_mfa_enforced boolean := false;
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before set-mfa-enforced';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'profile % not found; run ensure-profile.sql first', target_user_id;
  end if;

  if desired_mfa_enforced is true then
    raise notice 'CONFIRM: set mfa_enforced=true only after Auth MFA enrollment is verified';
  end if;

  update public.profiles
  set mfa_enforced = desired_mfa_enforced,
      updated_at = now()
  where id = target_user_id
    and active = true;

  if not found then
    raise exception 'no active profile updated for %', target_user_id;
  end if;

  raise notice 'set-mfa-enforced % for %', desired_mfa_enforced, target_user_id;
end
$$;
