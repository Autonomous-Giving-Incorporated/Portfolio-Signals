-- AGI-002: shared-infrastructure tenant and platform-administration foundation.
-- A client id is the same durable identifier used by Fund-Intel and Impact Relay.

create type public.client_state as enum ('provisioning', 'active', 'suspended', 'archived');

create table public.clients (
  id text primary key check (id ~ '^org_[a-z0-9_]+$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (length(trim(display_name)) > 0),
  state public.client_state not null default 'provisioning',
  reference_tenant boolean not null default false,
  asset_quota_bytes bigint not null default 262144000 check (asset_quota_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_memberships (
  client_id text not null references public.clients(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  membership_version bigint not null default 1 check (membership_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create table public.platform_administrators (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  active boolean not null default true,
  appointed_by uuid references public.profiles(id) on delete restrict,
  rationale text not null check (length(trim(rationale)) >= 12),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.client_audit_log (
  id bigint generated always as identity primary key,
  client_id text references public.clients(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  rationale text,
  after_state jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

insert into public.clients (id, slug, display_name, state, reference_tenant)
values ('org_hacker_dojo', 'hacker-dojo', 'Hacker Dojo', 'active', true);

alter table public.clients enable row level security;
alter table public.client_memberships enable row level security;
alter table public.platform_administrators enable row level security;
alter table public.client_audit_log enable row level security;

create function public.is_master_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.platform_administrators
    where user_id = auth.uid() and active = true and revoked_at is null
  )
$$;

create function public.is_client_member(p_client_id text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.client_memberships
    where client_id = p_client_id and user_id = auth.uid() and active = true
  )
$$;

create function public.current_client_role(p_client_id text) returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.client_memberships
  where client_id = p_client_id and user_id = auth.uid() and active = true
$$;

create function public.provision_client(
  p_client_id text,
  p_slug text,
  p_display_name text,
  p_initial_director uuid,
  p_rationale text
) returns public.clients
language plpgsql security definer set search_path = public
as $$
declare
  v_client public.clients;
begin
  if not public.is_master_admin() then
    raise exception 'master_admin_required';
  end if;
  if length(trim(p_rationale)) < 12 then
    raise exception 'provisioning_rationale_required';
  end if;
  if not exists (select 1 from public.profiles where id = p_initial_director and active = true) then
    raise exception 'active_initial_director_required';
  end if;

  insert into public.clients (id, slug, display_name, state)
  values (p_client_id, p_slug, p_display_name, 'provisioning')
  returning * into v_client;

  insert into public.client_memberships (client_id, user_id, role)
  values (p_client_id, p_initial_director, 'director');

  insert into public.client_audit_log (
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    p_client_id, auth.uid(), 'client_provisioned', 'client', p_client_id,
    p_rationale, jsonb_build_object('initial_director', p_initial_director)
  );

  return v_client;
end
$$;

create policy "members read their clients" on public.clients
for select using (public.is_client_member(id) or public.is_master_admin());

create policy "master admins manage clients" on public.clients
for all using (public.is_master_admin()) with check (public.is_master_admin());

create policy "members read client memberships" on public.client_memberships
for select using (public.is_client_member(client_id) or public.is_master_admin());

create policy "directors manage client memberships" on public.client_memberships
for all using (
  public.current_client_role(client_id) = 'director' or public.is_master_admin()
) with check (
  public.current_client_role(client_id) = 'director' or public.is_master_admin()
);

create policy "master admins read own platform assignment" on public.platform_administrators
for select using (user_id = auth.uid() and public.is_master_admin());

create policy "authorized users read client audit" on public.client_audit_log
for select using (
  public.current_client_role(client_id) in ('director', 'auditor') or public.is_master_admin()
);

revoke all on function public.provision_client(text, text, text, uuid, text) from public;
grant execute on function public.provision_client(text, text, text, uuid, text) to authenticated;
revoke insert, update, delete on public.client_audit_log from authenticated;
revoke insert, update, delete on public.platform_administrators from authenticated;

comment on table public.clients is
  'A.G.I. tenants. clients.id must equal the Impact Relay tenant_id.';
comment on table public.platform_administrators is
  'Platform authority only; membership does not imply access to client-private records.';

