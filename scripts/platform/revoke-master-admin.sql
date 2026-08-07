-- scripts/platform/revoke-master-admin.sql
-- Soft-revoke platform master_admin (active=false, revoked_at=now()).
-- Does not delete Auth user or profile.
--
-- Run as postgres. Replace target_user_id and rationale.
-- No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> REPLACE with rationale length >= 12 <<<
  revoke_rationale text := 'REPLACE_WITH_RATIONALE';
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before revoke-master-admin';
  end if;

  if length(trim(revoke_rationale)) < 12 or revoke_rationale = 'REPLACE_WITH_RATIONALE' then
    raise exception 'revoke_rationale must be a real string of at least 12 characters';
  end if;

  update public.platform_administrators
  set active = false,
      revoked_at = now(),
      rationale = trim(revoke_rationale)
  where user_id = target_user_id;

  if not found then
    raise exception 'no platform_administrators row for %', target_user_id;
  end if;

  raise notice 'revoke-master-admin complete for %', target_user_id;
end
$$;
