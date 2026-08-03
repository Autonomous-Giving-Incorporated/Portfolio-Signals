-- Allocation middleware tables (transaction-light pots / gifts / allocations / proofs).
-- client_id matches public.clients.id (e.g. org_hacker_dojo).

create table if not exists public.am_gifts (
  charge_id text primary key,
  client_id text not null references public.clients(id) on delete restrict,
  campaign_key text not null,
  program_key text not null,
  net_cents bigint not null check (net_cents >= 0),
  gross_cents bigint not null check (gross_cents >= 0),
  currency text not null default 'USD',
  donated_at timestamptz not null,
  source text not null default 'every.org',
  created_at timestamptz not null default now()
);

create table if not exists public.am_pots (
  client_id text not null references public.clients(id) on delete restrict,
  campaign_key text not null,
  program_key text not null,
  credited_cents bigint not null default 0 check (credited_cents >= 0),
  allocated_cents bigint not null default 0 check (allocated_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (client_id, campaign_key, program_key),
  check (allocated_cents <= credited_cents)
);

create table if not exists public.am_allocations (
  id text primary key,
  client_id text not null references public.clients(id) on delete restrict,
  campaign_key text not null,
  program_key text not null,
  amount_cents bigint not null check (amount_cents > 0),
  purpose text not null,
  status text not null default 'approved',
  approved_at timestamptz not null,
  approved_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.am_proofs (
  id text primary key,
  allocation_id text not null references public.am_allocations(id) on delete cascade,
  client_id text not null references public.clients(id) on delete restrict,
  uri text not null,
  note text not null default '',
  attached_by text not null default '',
  attached_at timestamptz not null default now()
);

create table if not exists public.am_exceptions (
  id text primary key,
  client_id text not null references public.clients(id) on delete restrict,
  code text not null,
  message text not null,
  open boolean not null default true,
  ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists am_gifts_client_idx on public.am_gifts (client_id);
create index if not exists am_allocations_client_idx on public.am_allocations (client_id);
create index if not exists am_exceptions_client_open_idx on public.am_exceptions (client_id, open);

alter table public.am_gifts enable row level security;
alter table public.am_pots enable row level security;
alter table public.am_allocations enable row level security;
alter table public.am_proofs enable row level security;
alter table public.am_exceptions enable row level security;

-- Members can read their tenant rows; writes via service role / edge for webhooks.
create policy am_gifts_select on public.am_gifts for select
  using (public.is_client_member(client_id) or public.is_master_admin());
create policy am_pots_select on public.am_pots for select
  using (public.is_client_member(client_id) or public.is_master_admin());
create policy am_allocations_select on public.am_allocations for select
  using (public.is_client_member(client_id) or public.is_master_admin());
create policy am_proofs_select on public.am_proofs for select
  using (public.is_client_member(client_id) or public.is_master_admin());
create policy am_exceptions_select on public.am_exceptions for select
  using (public.is_client_member(client_id) or public.is_master_admin());

-- Directors can insert allocations and proofs for their client.
create policy am_allocations_insert on public.am_allocations for insert
  with check (
    public.is_master_admin()
    or public.current_client_role(client_id) in ('director', 'master_admin')
    or public.is_client_member(client_id)
  );
create policy am_proofs_insert on public.am_proofs for insert
  with check (public.is_client_member(client_id) or public.is_master_admin());
