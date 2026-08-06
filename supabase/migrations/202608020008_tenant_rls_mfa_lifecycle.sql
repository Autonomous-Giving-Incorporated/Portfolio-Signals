-- Enforce active tenant and MFA policy at the shared RLS helper boundary.
create or replace function public.is_client_member(p_client_id text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.client_memberships m
    join public.clients c on c.id = m.client_id and c.state = 'active'
    join public.profiles p on p.id = m.user_id and p.active = true
    where m.client_id = p_client_id
      and m.user_id = auth.uid()
      and m.active = true
      and (m.role = 'board_viewer' or p.mfa_enforced = true)
  )
$$;

create or replace function public.current_client_role(p_client_id text) returns public.app_role
language sql stable security definer set search_path = public
as $$
  select m.role
  from public.client_memberships m
  join public.clients c on c.id = m.client_id and c.state = 'active'
  join public.profiles p on p.id = m.user_id and p.active = true
  where m.client_id = p_client_id
    and m.user_id = auth.uid()
    and m.active = true
    and (m.role = 'board_viewer' or p.mfa_enforced = true)
$$;
