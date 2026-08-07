-- scripts/platform/bootstrap-master-admin.sql
-- FIRST platform master_admin bootstrap only (initial suite operator).
--
-- For ADDITIONAL master_admins, do not re-copy this file ad-hoc. Use the
-- parameterized path instead:
--   docs/OPERATOR-ACCESS-ONBOARDING.md  (Flow A)
--   ensure-profile.sql → set-mfa-enforced.sql → grant-master-admin.sql
--   verify-operator-access.sql
--
-- Run in Supabase SQL editor as postgres AFTER the Auth user exists
-- (invite the operator email first).
--
-- Replace the UUID string in the DO block with the id from
-- Authentication → Users (or: select id from auth.users where email = '...').
--
-- Profiles schema (001 + 007): id, display_name NOT NULL, role, active,
-- mfa_enforced, ... Platform admin lives in platform_administrators (012),
-- not app_role. No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  operator_user_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  if operator_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace operator_user_id with the Auth user uuid before bootstrap';
  end if;

  if not exists (select 1 from auth.users where id = operator_user_id) then
    raise exception 'auth user % not found; invite the operator first', operator_user_id;
  end if;

  -- Ensure profile row exists (no auth→profiles trigger in this repo).
  -- display_name is NOT NULL (001_campaign_control.sql).
  insert into public.profiles (id, display_name, role, active, mfa_enforced)
  values (
    operator_user_id,
    'AGI Platform Operator',
    'director',
    true,
    false
  )
  on conflict (id) do update
  set active = true,
      deactivated_at = null,
      deactivation_reason = null,
      updated_at = now();

  -- master_admin is a platform_administrators row (012_agi_tenant_foundation.sql),
  -- not a value of public.app_role.
  insert into public.platform_administrators (user_id, active, rationale)
  values (
    operator_user_id,
    true,
    'Initial AGI platform master_admin bootstrap for suite operations'
  )
  on conflict (user_id) do update
  set active = true,
      revoked_at = null,
      rationale = excluded.rationale;

  raise notice 'master_admin bootstrap complete for %', operator_user_id;
end
$$;

-- Reference tenant should already exist from migration 012.
select id, slug, display_name, state, reference_tenant
from public.clients
where id = 'org_hacker_dojo';

-- Confirm platform assignment (run as postgres / service role).
select user_id, active, revoked_at, rationale, created_at
from public.platform_administrators
where active = true and revoked_at is null;
