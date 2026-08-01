-- HD-OI-015: governed import quarantine and suppression enforcement
-- Source exports remain outside Git. This migration defines only controlled metadata and promotion rules.

create type public.import_batch_state as enum (
  'received','validating','exception_review','approved','rejected','promoted','purged'
);

create type public.import_row_state as enum (
  'staged','valid','exception','suppressed','duplicate','approved','promoted','rejected'
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_sha256 text not null,
  source_received_at timestamptz not null,
  row_count integer not null check (row_count >= 0),
  schema_version text not null,
  state public.import_batch_state not null default 'received',
  storage_object_path text not null,
  receipt jsonb not null default '{}'::jsonb,
  submitted_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_sha256)
);

create table if not exists public.import_staging_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_row_number integer not null check (source_row_number > 0),
  external_source text not null,
  external_id text,
  normalized_record jsonb not null,
  row_fingerprint text not null,
  state public.import_row_state not null default 'staged',
  exception_codes text[] not null default '{}',
  consent_candidate public.consent_status not null default 'unknown',
  relationship_candidate public.relationship_class,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  promoted_constituent_id uuid references public.constituents(id),
  created_at timestamptz not null default now(),
  unique (batch_id, source_row_number),
  unique (batch_id, row_fingerprint)
);

create table if not exists public.suppression_registry (
  id uuid primary key default gen_random_uuid(),
  match_hash text not null unique,
  reason text not null,
  source text not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.import_exceptions (
  id bigint generated always as identity primary key,
  staging_row_id bigint not null references public.import_staging_rows(id) on delete cascade,
  code text not null,
  severity text not null check (severity in ('info','warning','error','critical')),
  detail text not null,
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.import_batches enable row level security;
alter table public.import_staging_rows enable row level security;
alter table public.suppression_registry enable row level security;
alter table public.import_exceptions enable row level security;

create policy "stewards read import batches" on public.import_batches
for select using (public.current_role() in ('director','campaign_lead','data_steward','auditor'));

create policy "stewards manage import batches" on public.import_batches
for all using (public.current_role() in ('director','data_steward'))
with check (public.current_role() in ('director','data_steward'));

create policy "stewards read staging rows" on public.import_staging_rows
for select using (public.current_role() in ('director','data_steward','auditor'));

create policy "stewards manage staging rows" on public.import_staging_rows
for all using (public.current_role() in ('director','data_steward'))
with check (public.current_role() in ('director','data_steward'));

create policy "authorized read suppression registry" on public.suppression_registry
for select using (public.current_role() in ('director','campaign_lead','data_steward','auditor'));

create policy "stewards manage suppression registry" on public.suppression_registry
for all using (public.current_role() in ('director','data_steward'))
with check (public.current_role() in ('director','data_steward'));

create policy "authorized read import exceptions" on public.import_exceptions
for select using (public.current_role() in ('director','data_steward','auditor'));

create policy "stewards manage import exceptions" on public.import_exceptions
for all using (public.current_role() in ('director','data_steward'))
with check (public.current_role() in ('director','data_steward'));

create or replace function public.enforce_constituent_suppression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.consent_status = 'suppressed' then
    update public.opportunities
      set authorization_state = 'suppressed', updated_at = now()
      where constituent_id = new.id
        and authorization_state <> 'suppressed';
  end if;
  return new;
end;
$$;

create trigger constituents_enforce_suppression
after insert or update of consent_status on public.constituents
for each row execute function public.enforce_constituent_suppression();

create or replace function public.promote_import_row(p_row_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.import_staging_rows;
  v_constituent_id uuid;
begin
  if public.current_role() not in ('director','data_steward') then
    raise exception 'insufficient_role';
  end if;

  select * into v_row from public.import_staging_rows where id = p_row_id for update;
  if not found then raise exception 'row_not_found'; end if;
  if v_row.state <> 'approved' then raise exception 'row_not_approved'; end if;
  if v_row.consent_candidate in ('suppressed','restricted') then raise exception 'consent_blocks_promotion'; end if;
  if exists (select 1 from public.import_exceptions where staging_row_id = p_row_id and severity in ('error','critical') and resolved_at is null) then
    raise exception 'unresolved_blocking_exception';
  end if;

  insert into public.constituents (
    external_source, external_id, display_name, organization,
    relationship_class, consent_status, source_receipt, created_by
  ) values (
    v_row.external_source,
    v_row.external_id,
    coalesce(v_row.normalized_record->>'display_name','Unknown'),
    v_row.normalized_record->>'organization',
    coalesce(v_row.relationship_candidate,'public_adjacency'),
    v_row.consent_candidate,
    jsonb_build_object('batch_id',v_row.batch_id,'source_row_number',v_row.source_row_number,'fingerprint',v_row.row_fingerprint),
    auth.uid()
  )
  on conflict (external_source, external_id) do update
    set source_receipt = excluded.source_receipt,
        updated_at = now()
  returning id into v_constituent_id;

  update public.import_staging_rows
    set state = 'promoted', promoted_constituent_id = v_constituent_id
    where id = p_row_id;

  return v_constituent_id;
end;
$$;

revoke all on function public.promote_import_row(bigint) from public;
grant execute on function public.promote_import_row(bigint) to authenticated;
