-- AGI-003: authoritative workspace context and audited client administration.

create or replace function public.get_workspace_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_is_master boolean;
  v_clients jsonb;
begin
  v_profile := public.require_active_profile();
  v_is_master := public.is_master_admin();

  if v_is_master then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'display_name', c.display_name,
      'state', c.state,
      'reference_tenant', c.reference_tenant,
      'role', m.role,
      'membership_version', m.membership_version
    ) order by c.display_name), '[]'::jsonb)
    into v_clients
    from public.clients c
    left join public.client_memberships m
      on m.client_id = c.id and m.user_id = auth.uid() and m.active = true;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'display_name', c.display_name,
      'state', c.state,
      'reference_tenant', c.reference_tenant,
      'role', m.role,
      'membership_version', m.membership_version
    ) order by c.display_name), '[]'::jsonb)
    into v_clients
    from public.client_memberships m
    join public.clients c on c.id = m.client_id
    where m.user_id = auth.uid() and m.active = true;
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'mfa_enforced', v_profile.mfa_enforced,
      'active', v_profile.active
    ),
    'is_master_admin', v_is_master,
    'clients', v_clients
  );
end $$;

create or replace function public.set_client_membership(
  p_client_id text,
  p_user_id uuid,
  p_role public.app_role,
  p_active boolean default true,
  p_rationale text default null
) returns public.client_memberships
language plpgsql security definer set search_path = public as $$
declare
  v_membership public.client_memberships;
  v_is_master boolean := public.is_master_admin();
  v_actor_role public.app_role := public.current_client_role(p_client_id);
  v_existing_role public.app_role;
  v_director_count integer;
begin
  perform public.require_privileged_mfa();
  if v_is_master and not (select mfa_enforced from public.profiles where id = auth.uid() and active = true) then
    raise exception 'mfa_required';
  end if;
  if not v_is_master and v_actor_role is distinct from 'director' then
    raise exception 'client_director_required';
  end if;
  if v_is_master and length(trim(coalesce(p_rationale, ''))) < 12 then
    raise exception 'admin_rationale_required';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and state <> 'suspended') then
    raise exception 'active_client_required';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and active = true) then
    raise exception 'active_target_profile_required';
  end if;

  select role into v_existing_role
  from public.client_memberships
  where client_id = p_client_id and user_id = p_user_id and active = true
  for update;

  if v_existing_role = 'director' and (p_role <> 'director' or not p_active) then
    select count(*) into v_director_count
    from public.client_memberships
    where client_id = p_client_id and role = 'director' and active = true;
    if v_director_count <= 1 then raise exception 'last_client_director_required'; end if;
  end if;

  insert into public.client_memberships(client_id, user_id, role, active)
  values (p_client_id, p_user_id, p_role, p_active)
  on conflict (client_id, user_id) do update
    set role = excluded.role,
        active = excluded.active,
        membership_version = public.client_memberships.membership_version + 1,
        updated_at = now()
  returning * into v_membership;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    p_client_id, auth.uid(), 'client_membership_set', 'client_membership', p_user_id::text,
    coalesce(nullif(trim(p_rationale), ''), 'client director membership administration'),
    jsonb_build_object('role', p_role, 'active', p_active, 'membership_version', v_membership.membership_version)
  );

  return v_membership;
end $$;

create or replace function public.provision_client(
  p_client_id text,
  p_slug text,
  p_display_name text,
  p_initial_director uuid,
  p_rationale text
) returns public.clients
language plpgsql security definer set search_path = public as $$
declare v_client public.clients;
begin
  perform public.require_active_profile();
  if not public.is_master_admin() then raise exception 'master_admin_required'; end if;
  if not (select mfa_enforced from public.profiles where id = auth.uid() and active = true) then raise exception 'mfa_required'; end if;
  if length(trim(p_rationale)) < 12 then raise exception 'provisioning_rationale_required'; end if;
  if not exists (select 1 from public.profiles where id = p_initial_director and active = true) then
    raise exception 'active_initial_director_required';
  end if;
  insert into public.clients(id, slug, display_name, state)
  values (p_client_id, p_slug, p_display_name, 'provisioning') returning * into v_client;
  insert into public.client_memberships(client_id, user_id, role)
  values (p_client_id, p_initial_director, 'director');
  insert into public.client_audit_log(client_id, actor_id, action, entity_type, entity_id, rationale, after_state)
  values (p_client_id, auth.uid(), 'client_provisioned', 'client', p_client_id, p_rationale,
    jsonb_build_object('initial_director', p_initial_director));
  return v_client;
end $$;

-- Membership mutations must pass through the audited RPC and last-director guard.
revoke insert, update, delete on public.client_memberships from authenticated;
revoke all on function public.get_workspace_context() from public;
revoke all on function public.set_client_membership(text, uuid, public.app_role, boolean, text) from public;
grant execute on function public.get_workspace_context() to authenticated;
grant execute on function public.set_client_membership(text, uuid, public.app_role, boolean, text) to authenticated;

-- Users may see basic identities of colleagues in a shared active client.
drop policy if exists "directors manage profiles" on public.profiles;
create policy "client colleagues read profiles" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1
    from public.client_memberships mine
    join public.client_memberships theirs on theirs.client_id = mine.client_id
    where mine.user_id = auth.uid() and mine.active = true
      and theirs.user_id = profiles.id and theirs.active = true
  ) or public.is_master_admin()
);
