-- Tenant outbound Donation Link + ImpactNotice persistence (SPEC-027 / CONTRACT-013).
-- donation_link is an HTTPS CTA to the tenant's third-party receiver, not AGI checkout.
-- ImpactNotice is issued only after Evidence (am_proofs) or an explicit human waive.

alter table public.clients
  add column if not exists donation_link text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_donation_link_https'
  ) then
    alter table public.clients
      add constraint clients_donation_link_https
      check (donation_link is null or donation_link ~ '^https://[^[:space:]]+$');
  end if;
end $$;

comment on column public.clients.donation_link is
  'Outbound HTTPS Donation Link (tenant receiver). Null omits CTA. Never a Stripe Checkout Session.';

alter table public.am_org_meta
  add column if not exists donation_link text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'am_org_meta_donation_link_https'
  ) then
    alter table public.am_org_meta
      add constraint am_org_meta_donation_link_https
      check (donation_link is null or donation_link ~ '^https://[^[:space:]]+$');
  end if;
end $$;

create table if not exists public.am_gift_contacts (
  charge_id text primary key references public.am_gifts(charge_id) on delete cascade,
  client_id text not null references public.clients(id) on delete restrict,
  email text,
  donor_principal text,
  created_at timestamptz not null default now(),
  check (email is not null or donor_principal is not null),
  check (
    email is null
    or (
      email = lower(trim(email))
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and char_length(email) <= 254
    )
  )
);

comment on table public.am_gift_contacts is
  'Opt-in connector identity only. Never invent email or a donor principal.';

create table if not exists public.am_proof_waivers (
  allocation_id text primary key references public.am_allocations(id) on delete cascade,
  client_id text not null references public.clients(id) on delete restrict,
  waived_by text not null check (length(trim(waived_by)) > 0),
  waived_at timestamptz not null default now(),
  note text not null default ''
);

comment on table public.am_proof_waivers is
  'Explicit human waive of Evidence. MISSING_PROOF is not a waive.';

create table if not exists public.am_impact_notices (
  id text primary key,
  client_id text not null references public.clients(id) on delete restrict,
  allocation_id text not null references public.am_allocations(id) on delete cascade,
  evidence_id text,
  proof_waived boolean not null default false,
  channel text not null check (channel in ('email', 'push', 'in_app')),
  donation_link text not null check (donation_link ~ '^https://[^[:space:]]+$'),
  use_summary text not null check (length(trim(use_summary)) > 0),
  charge_id text references public.am_gifts(charge_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, allocation_id),
  check (proof_waived = true or evidence_id is not null)
);

comment on table public.am_impact_notices is
  'CONTRACT-013 ImpactNotice intent. One row per allocation. Payload has no donor PII.';

create table if not exists public.am_impact_notice_deliveries (
  id text primary key,
  notice_id text not null references public.am_impact_notices(id) on delete cascade,
  client_id text not null references public.clients(id) on delete restrict,
  channel text not null check (channel in ('email', 'push', 'in_app')),
  status text not null check (status in ('attempted', 'sent', 'skipped', 'failed')),
  attempted_at timestamptz not null default now(),
  detail text not null default '',
  unique (notice_id, channel)
);

create index if not exists am_gift_contacts_client_idx
  on public.am_gift_contacts (client_id);
create index if not exists am_impact_notices_client_idx
  on public.am_impact_notices (client_id);
create index if not exists am_impact_notice_deliveries_client_idx
  on public.am_impact_notice_deliveries (client_id);

alter table public.am_gift_contacts enable row level security;
alter table public.am_proof_waivers enable row level security;
alter table public.am_impact_notices enable row level security;
alter table public.am_impact_notice_deliveries enable row level security;

drop policy if exists am_gift_contacts_select on public.am_gift_contacts;
create policy am_gift_contacts_select on public.am_gift_contacts for select
  using (public.is_client_member(client_id) or public.is_master_admin());

drop policy if exists am_proof_waivers_select on public.am_proof_waivers;
create policy am_proof_waivers_select on public.am_proof_waivers for select
  using (public.is_client_member(client_id) or public.is_master_admin());

drop policy if exists am_proof_waivers_insert on public.am_proof_waivers;
create policy am_proof_waivers_insert on public.am_proof_waivers for insert
  with check (
    public.is_master_admin()
    or public.current_client_role(client_id) in ('director', 'campaign_lead')
  );

drop policy if exists am_impact_notices_select on public.am_impact_notices;
create policy am_impact_notices_select on public.am_impact_notices for select
  using (public.is_client_member(client_id) or public.is_master_admin());

drop policy if exists am_impact_notice_deliveries_select on public.am_impact_notice_deliveries;
create policy am_impact_notice_deliveries_select on public.am_impact_notice_deliveries for select
  using (public.is_client_member(client_id) or public.is_master_admin());
