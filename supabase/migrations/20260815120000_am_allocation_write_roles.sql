-- Tighten allocation writes to director | campaign_lead | master_admin.
-- Any client member could previously insert allocations/proofs (too wide).
-- Also persist Worker-safe label/alias metadata (not Node file-store only).

create table if not exists public.am_org_meta (
  client_id text primary key references public.clients(id) on delete restrict,
  labels jsonb not null default '{}'::jsonb,
  aliases jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.am_org_meta enable row level security;

drop policy if exists am_org_meta_select on public.am_org_meta;
create policy am_org_meta_select on public.am_org_meta for select
  using (public.is_client_member(client_id) or public.is_master_admin());

drop policy if exists am_allocations_insert on public.am_allocations;
create policy am_allocations_insert on public.am_allocations for insert
  with check (
    public.is_master_admin()
    or public.current_client_role(client_id) in ('director', 'campaign_lead')
  );

drop policy if exists am_proofs_insert on public.am_proofs;
create policy am_proofs_insert on public.am_proofs for insert
  with check (
    public.is_master_admin()
    or public.current_client_role(client_id) in ('director', 'campaign_lead')
  );
