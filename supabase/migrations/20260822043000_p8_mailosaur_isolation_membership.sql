-- Synthetic Mailosaur P8 recipient. No-op when the Auth user is absent
-- (local db reset). Isolation-tenant board_viewer only; not a platform admin.
insert into public.profiles (id, display_name, role, active, mfa_enforced)
select u.id, 'P8 Mailosaur Isolation', 'board_viewer'::public.app_role, true, false
from auth.users u
where lower(u.email) = 'p8-isolation@qpbqeifu.mailosaur.net'
on conflict (id) do update
  set display_name = excluded.display_name,
      role = 'board_viewer',
      active = true,
      deactivated_at = null;

insert into public.client_memberships (client_id, user_id, role, active)
select 'org_platform_isolation', u.id, 'board_viewer'::public.app_role, true
from auth.users u
where lower(u.email) = 'p8-isolation@qpbqeifu.mailosaur.net'
on conflict (client_id, user_id) do update
  set role = 'board_viewer',
      active = true,
      updated_at = now();
