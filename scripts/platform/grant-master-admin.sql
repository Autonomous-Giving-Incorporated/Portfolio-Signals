-- scripts/platform/grant-master-admin.sql
-- Grant or reactivate platform master_admin. Does NOT create client membership.
-- Profile must exist (ensure-profile). Prefer mfa_enforced=true before privileged work.
--
-- Run as postgres. Replace target_user_id and rationale.
-- No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> REPLACE with rationale length >= 12 <<<
  grant_rationale text := 'REPLACE_WITH_RATIONALE';
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before grant-master-admin';
  end if;

  if length(trim(grant_rationale)) < 12 or grant_rationale = 'REPLACE_WITH_RATIONALE' then
    raise exception 'grant_rationale must be a real string of at least 12 characters';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = target_user_id and active = true
  ) then
    raise exception 'active profile % required; run ensure-profile.sql first', target_user_id;
  end if;

  insert into public.platform_administrators (user_id, active, rationale)
  values (target_user_id, true, trim(grant_rationale))
  on conflict (user_id) do update
  set active = true,
      revoked_at = null,
      rationale = excluded.rationale;

  raise notice 'grant-master-admin complete for %', target_user_id;
  raise notice 'platform admin does not grant tenant-private membership by itself';
end
$$;
