-- scripts/platform/verify-operator-access.sql
-- Read-only checks for a user after Flow A or Flow B.
-- Replace target_user_id and optional target_client_id (empty string = skip membership check).
-- Run as postgres. No secrets belong in this file.

do $$
declare
  -- >>> REPLACE THIS UUID before running <<<
  target_user_id uuid := '00000000-0000-0000-0000-000000000000';
  -- >>> optional client id e.g. org_hacker_dojo; leave empty to skip <<<
  target_client_id text := '';
  v_profile public.profiles%rowtype;
  v_admin public.platform_administrators%rowtype;
  v_membership public.client_memberships%rowtype;
begin
  if target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'replace target_user_id with the Auth user uuid before verify-operator-access';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'auth user % missing', target_user_id;
  end if;

  select * into v_profile from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile % missing', target_user_id;
  end if;

  raise notice 'profile: display_name=%, active=%, mfa_enforced=%, role=%',
    v_profile.display_name, v_profile.active, v_profile.mfa_enforced, v_profile.role;

  select * into v_admin
  from public.platform_administrators
  where user_id = target_user_id;

  if found then
    raise notice 'platform_admin: active=%, revoked_at=%, rationale=%',
      v_admin.active, v_admin.revoked_at, v_admin.rationale;
  else
    raise notice 'platform_admin: none';
  end if;

  if length(trim(target_client_id)) > 0 then
    select * into v_membership
    from public.client_memberships
    where client_id = target_client_id and user_id = target_user_id;

    if found then
      raise notice 'membership %: role=%, active=%',
        target_client_id, v_membership.role, v_membership.active;
    else
      raise exception 'no membership for user % on client %', target_user_id, target_client_id;
    end if;
  end if;

  raise notice 'verify-operator-access complete';
end
$$;
