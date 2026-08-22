-- SPEC-026 v1.1.0 tenant source + raw webhook persist.
-- Source is the tenant receiver. Stripe is never a donation source.
-- Raw payloads are vendor events, not AGI checkout records.

alter table public.am_org_meta
  add column if not exists source text not null default 'every.org';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'am_org_meta_source_check'
  ) then
    alter table public.am_org_meta
      add constraint am_org_meta_source_check
      check (source in ('every.org', 'givebutter', 'donorbox', 'csv'));
  end if;
end $$;

comment on column public.am_org_meta.source is
  'Tenant donation source: every.org | givebutter | donorbox | csv. Never stripe.';

create table if not exists public.am_webhook_events (
  id text primary key,
  client_id text not null references public.clients(id) on delete restrict,
  source text not null check (source in ('every.org', 'givebutter', 'donorbox', 'csv')),
  event_name text not null default '',
  charge_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists am_webhook_events_client_idx
  on public.am_webhook_events (client_id, created_at desc);

comment on table public.am_webhook_events is
  'Raw vendor webhook or CSV twin payload persisted before or with pot credit. Not a donation processor ledger. Member SELECT is denied; service-role writes and master-admin SELECT only.';

alter table public.am_webhook_events enable row level security;

drop policy if exists am_webhook_events_select on public.am_webhook_events;
create policy am_webhook_events_select on public.am_webhook_events for select
  using (public.is_master_admin());
