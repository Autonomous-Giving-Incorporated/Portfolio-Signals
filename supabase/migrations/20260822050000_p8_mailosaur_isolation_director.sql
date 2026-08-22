-- Promote the synthetic Mailosaur P8 recipient to isolation-tenant director
-- so auth-email can render the tenant-administrator template.
-- Isolation tenant only. Not Hacker Dojo. Not a platform administrator.
-- No-op when the Auth user is absent (local db reset).
insert into public.profiles (id, display_name, role, active, mfa_enforced)
select u.id, 'P8 Mailosaur Isolation Director', 'director'::public.app_role, true, false
from auth.users u
where lower(u.email) = 'p8-isolation@qpbqeifu.mailosaur.net'
on conflict (id) do update
  set display_name = excluded.display_name,
      role = 'director',
      active = true,
      mfa_enforced = false,
      deactivated_at = null;

insert into public.client_memberships (client_id, user_id, role, active)
select 'org_platform_isolation', u.id, 'director'::public.app_role, true
from auth.users u
where lower(u.email) = 'p8-isolation@qpbqeifu.mailosaur.net'
on conflict (client_id, user_id) do update
  set role = 'director',
      active = true,
      updated_at = now();
