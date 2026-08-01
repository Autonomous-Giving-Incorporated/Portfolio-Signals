-- HD-OI-012: authenticated campaign-control foundation
-- Private operational data belongs in an authenticated database, never in GitHub Pages.

create extension if not exists pgcrypto;

create type public.app_role as enum ('director','campaign_lead','development','board_viewer','data_steward','auditor');
create type public.consent_status as enum ('unknown','confirmed','restricted','suppressed');
create type public.relationship_class as enum ('verified_current','verified_historical','public_adjacency','thematic_fit');
create type public.opportunity_stage as enum ('identified','qualified','meeting','proposal','verbal','committed','received','declined','nurture','no_route');
create type public.opportunity_type as enum ('gift','sponsorship','grant','in_kind','introduction');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'board_viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.constituents (
  id uuid primary key default gen_random_uuid(),
  external_source text,
  external_id text,
  display_name text not null,
  organization text,
  email_ciphertext text,
  location_ciphertext text,
  relationship_class public.relationship_class not null,
  consent_status public.consent_status not null default 'unknown',
  relationship_owner uuid references public.profiles(id),
  source_receipt jsonb not null default '{}'::jsonb,
  restricted_notes_ciphertext text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_source, external_id)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  constituent_id uuid references public.constituents(id) on delete restrict,
  type public.opportunity_type not null,
  title text not null,
  stage public.opportunity_stage not null default 'identified',
  ask_amount numeric(14,2),
  designated_outcome text,
  decision_owner uuid references public.profiles(id),
  next_action text,
  next_action_at timestamptz,
  authorization_state text not null default 'not_reviewed'
    check (authorization_state in ('not_reviewed','approved','blocked','suppressed')),
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  status text not null default 'open' check (status in ('open','approved','rejected','deferred')),
  rationale text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  claim text not null,
  state text not null default 'unverified' check (state in ('unverified','verified','rejected','expired')),
  evidence jsonb not null default '[]'::jsonb,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.constituents enable row level security;
alter table public.opportunities enable row level security;
alter table public.decisions enable row level security;
alter table public.claims enable row level security;
alter table public.audit_log enable row level security;

create function public.current_role() returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create policy "users read own profile" on public.profiles
for select using (id = auth.uid());

create policy "directors manage profiles" on public.profiles
for all using (public.current_role() = 'director') with check (public.current_role() = 'director');

create policy "authorized staff read constituents" on public.constituents
for select using (public.current_role() in ('director','campaign_lead','development','data_steward','auditor'));

create policy "stewards manage constituents" on public.constituents
for all using (public.current_role() in ('director','campaign_lead','data_steward'))
with check (public.current_role() in ('director','campaign_lead','data_steward'));

create policy "staff read opportunities" on public.opportunities
for select using (public.current_role() in ('director','campaign_lead','development','board_viewer','auditor'));

create policy "campaign staff manage opportunities" on public.opportunities
for all using (public.current_role() in ('director','campaign_lead','development'))
with check (public.current_role() in ('director','campaign_lead','development'));

create policy "authenticated read decisions" on public.decisions
for select using (auth.uid() is not null);

create policy "directors decide" on public.decisions
for all using (public.current_role() in ('director','campaign_lead'))
with check (public.current_role() in ('director','campaign_lead'));

create policy "authenticated read verified claims" on public.claims
for select using (auth.uid() is not null);

create policy "stewards manage claims" on public.claims
for all using (public.current_role() in ('director','campaign_lead','data_steward'))
with check (public.current_role() in ('director','campaign_lead','data_steward'));

create policy "auditors and directors read audit log" on public.audit_log
for select using (public.current_role() in ('director','auditor'));

revoke insert, update, delete on public.audit_log from authenticated;
