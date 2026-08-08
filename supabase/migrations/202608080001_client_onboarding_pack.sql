-- Client Onboarding Pack: private document checklist, RLS, and pack RPCs.
-- Storage objects live in campaign-private under:
--   onboarding/<client_id>/<document_id>/<safe_filename>
-- Mutations go through SECURITY DEFINER RPCs; register is service_role only
-- (Edge uploads then registers, mirroring register_client_asset).

create table public.client_onboarding_packs (
  client_id text primary key references public.clients(id) on delete restrict,
  template_version text not null default 'onboarding_pack_v1',
  status text not null default 'in_progress'
    check (status in ('in_progress', 'ready', 'archived')),
  ready_at timestamptz,
  ready_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete restrict,
  storage_bucket text not null default 'campaign-private'
    check (storage_bucket = 'campaign-private'),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  suggested_type text not null,
  suggested_confidence numeric not null default 0
    check (suggested_confidence >= 0 and suggested_confidence <= 1),
  classifier_version text not null default 'v1-heuristics',
  confirmed_type text,
  status text not null
    check (status in ('stored', 'confirmed', 'parked_crm', 'rejected', 'superseded')),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (client_id, sha256),
  unique (storage_path)
);

create index client_onboarding_documents_client_idx
  on public.client_onboarding_documents (client_id, status);

-- At most one active confirmed document per slot per client
-- (confirm RPC supersedes prior holders before claiming the slot).
create unique index client_onboarding_documents_one_confirmed_per_slot_idx
  on public.client_onboarding_documents (client_id, confirmed_type)
  where status = 'confirmed';

alter table public.client_onboarding_packs enable row level security;
alter table public.client_onboarding_documents enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_onboarding_pack(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active is true
      and p.mfa_enforced is true
  )
  and (
    public.is_master_admin()
    or exists (
      select 1 from public.client_memberships m
      where m.client_id = p_client_id
        and m.user_id = auth.uid()
        and m.active is true
        and m.role = 'director'
    )
  );
$$;

create or replace function public.onboarding_required_slots()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'org_legal_name_proof',
    'tax_exempt_or_ein',
    'governance',
    'brand_logo',
    'primary_contact'
  ]::text[];
$$;

create or replace function public.onboarding_optional_slots()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'w9',
    'board_list',
    'brand_kit',
    'campaign_brief',
    'impact_sample',
    'other'
  ]::text[];
$$;

create or replace function public.onboarding_all_slots()
returns text[]
language sql
immutable
set search_path = public
as $$
  select public.onboarding_required_slots() || public.onboarding_optional_slots();
$$;

create or replace function public.onboarding_document_to_jsonb(p_doc public.client_onboarding_documents)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_doc.id,
    'client_id', p_doc.client_id,
    'storage_bucket', p_doc.storage_bucket,
    'storage_path', p_doc.storage_path,
    'original_filename', p_doc.original_filename,
    'mime_type', p_doc.mime_type,
    'byte_size', p_doc.byte_size,
    'sha256', p_doc.sha256,
    'suggested_type', p_doc.suggested_type,
    'suggested_confidence', p_doc.suggested_confidence,
    'classifier_version', p_doc.classifier_version,
    'confirmed_type', p_doc.confirmed_type,
    'status', p_doc.status,
    'uploaded_by', p_doc.uploaded_by,
    'confirmed_by', p_doc.confirmed_by,
    'uploaded_at', p_doc.uploaded_at,
    'confirmed_at', p_doc.confirmed_at
  );
$$;

create or replace function public.onboarding_pack_to_jsonb(p_pack public.client_onboarding_packs)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'client_id', p_pack.client_id,
    'template_version', p_pack.template_version,
    'status', p_pack.status,
    'ready_at', p_pack.ready_at,
    'ready_by', p_pack.ready_by
  );
$$;

-- Recompute pack ready from confirmed required slots. Actor used for ready_by / audit.
create or replace function public.recompute_onboarding_pack_status(
  p_client_id text,
  p_actor uuid
) returns public.client_onboarding_packs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack public.client_onboarding_packs;
  v_required text[] := public.onboarding_required_slots();
  v_filled int;
  v_is_ready boolean;
  v_was_ready boolean;
begin
  select * into v_pack
  from public.client_onboarding_packs
  where client_id = p_client_id
  for update;

  if not found then
    insert into public.client_onboarding_packs(client_id)
    values (p_client_id)
    returning * into v_pack;
  end if;

  if v_pack.status = 'archived' then
    return v_pack;
  end if;

  select count(distinct d.confirmed_type) into v_filled
  from public.client_onboarding_documents d
  where d.client_id = p_client_id
    and d.status = 'confirmed'
    and d.confirmed_type = any (v_required);

  v_is_ready := (v_filled = cardinality(v_required));
  v_was_ready := (v_pack.status = 'ready');

  if v_is_ready and not v_was_ready then
    update public.client_onboarding_packs
    set status = 'ready',
        ready_at = now(),
        ready_by = p_actor,
        updated_at = now()
    where client_id = p_client_id
    returning * into v_pack;

    insert into public.client_audit_log(
      client_id, actor_id, action, entity_type, entity_id, rationale, after_state
    ) values (
      p_client_id, p_actor, 'onboarding_pack_ready', 'client_onboarding_pack', p_client_id,
      'all required onboarding slots confirmed',
      jsonb_build_object('status', 'ready', 'ready_by', p_actor)
    );
  elsif not v_is_ready and v_was_ready then
    update public.client_onboarding_packs
    set status = 'in_progress',
        ready_at = null,
        ready_by = null,
        updated_at = now()
    where client_id = p_client_id
    returning * into v_pack;

    insert into public.client_audit_log(
      client_id, actor_id, action, entity_type, entity_id, rationale, after_state
    ) values (
      p_client_id, p_actor, 'onboarding_pack_demoted', 'client_onboarding_pack', p_client_id,
      'required onboarding slot no longer confirmed',
      jsonb_build_object('status', 'in_progress')
    );
  else
    update public.client_onboarding_packs
    set updated_at = now()
    where client_id = p_client_id
    returning * into v_pack;
  end if;

  return v_pack;
end;
$$;

-- Uploader authorization for service_role register path (auth.uid() is null).
create or replace function public.can_user_manage_onboarding_pack(
  p_user_id uuid,
  p_client_id text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.active is true
      and p.mfa_enforced is true
  )
  and (
    exists (
      select 1 from public.platform_administrators pa
      where pa.user_id = p_user_id
        and pa.active is true
        and pa.revoked_at is null
    )
    or exists (
      select 1 from public.client_memberships m
      where m.client_id = p_client_id
        and m.user_id = p_user_id
        and m.active is true
        and m.role = 'director'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: SELECT for manage-capable users only; mutations via SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------

create policy "manage-capable users read onboarding packs"
  on public.client_onboarding_packs
  for select
  to authenticated
  using (public.can_manage_onboarding_pack(client_id));

create policy "manage-capable users read onboarding documents"
  on public.client_onboarding_documents
  for select
  to authenticated
  using (public.can_manage_onboarding_pack(client_id));

revoke insert, update, delete on public.client_onboarding_packs from authenticated;
revoke insert, update, delete on public.client_onboarding_documents from authenticated;
grant select on public.client_onboarding_packs to authenticated;
grant select on public.client_onboarding_documents to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.ensure_onboarding_pack(p_client_id text)
returns public.client_onboarding_packs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack public.client_onboarding_packs;
begin
  if not public.can_manage_onboarding_pack(p_client_id) then
    raise exception 'onboarding_pack_forbidden';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'client_not_found';
  end if;

  insert into public.client_onboarding_packs(client_id)
  values (p_client_id)
  on conflict (client_id) do nothing;

  select * into v_pack
  from public.client_onboarding_packs
  where client_id = p_client_id;

  return v_pack;
end;
$$;

create or replace function public.get_onboarding_pack(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack public.client_onboarding_packs;
  v_required text[] := public.onboarding_required_slots();
  v_optional text[] := public.onboarding_optional_slots();
  v_all text[] := public.onboarding_all_slots();
  v_slots jsonb := '{}'::jsonb;
  v_slot text;
  v_doc public.client_onboarding_documents;
  v_docs jsonb;
  v_is_required boolean;
begin
  if not public.can_manage_onboarding_pack(p_client_id) then
    raise exception 'onboarding_pack_forbidden';
  end if;

  v_pack := public.ensure_onboarding_pack(p_client_id);

  foreach v_slot in array v_all loop
    v_is_required := v_slot = any (v_required);
    select * into v_doc
    from public.client_onboarding_documents d
    where d.client_id = p_client_id
      and d.status = 'confirmed'
      and d.confirmed_type = v_slot
    order by d.confirmed_at desc nulls last
    limit 1;

    if found then
      v_slots := v_slots || jsonb_build_object(
        v_slot,
        jsonb_build_object(
          'required', v_is_required,
          'document', public.onboarding_document_to_jsonb(v_doc)
        )
      );
    else
      v_slots := v_slots || jsonb_build_object(
        v_slot,
        jsonb_build_object(
          'required', v_is_required,
          'document', null
        )
      );
    end if;
  end loop;

  select coalesce(jsonb_agg(public.onboarding_document_to_jsonb(d) order by d.uploaded_at desc), '[]'::jsonb)
  into v_docs
  from public.client_onboarding_documents d
  where d.client_id = p_client_id
    and d.status is distinct from 'superseded';

  return jsonb_build_object(
    'pack', public.onboarding_pack_to_jsonb(v_pack),
    'required_slots', to_jsonb(v_required),
    'optional_slots', to_jsonb(v_optional),
    'slots', v_slots,
    'documents', v_docs
  );
end;
$$;

create or replace function public.register_onboarding_document(
  p_client_id text,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_suggested_type text,
  p_suggested_confidence numeric,
  p_classifier_version text,
  p_status text,
  p_uploaded_by uuid
) returns public.client_onboarding_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.client_onboarding_documents;
  v_doc_id uuid;
  v_safe_name text;
  v_path_prefix text;
  v_path_doc text;
  v_path_name text;
  v_path_extra text;
begin
  -- service_role path: authorize via p_uploaded_by (auth.uid() is typically null).
  if not public.can_user_manage_onboarding_pack(p_uploaded_by, p_client_id) then
    raise exception 'onboarding_pack_forbidden';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'client_not_found';
  end if;

  if p_status is not distinct from 'rejected' then
    raise exception 'onboarding_document_rejected';
  end if;

  if p_status is null or p_status not in ('stored', 'parked_crm') then
    raise exception 'invalid_onboarding_document_status';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 26214400 then
    raise exception 'invalid_byte_size';
  end if;

  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_sha256';
  end if;

  if p_status = 'parked_crm' then
    if p_suggested_type is distinct from 'parked_crm' then
      raise exception 'invalid_suggested_type';
    end if;
  elsif p_suggested_type is null
    or (
      p_suggested_type <> 'uncategorized'
      and p_suggested_type <> 'parked_crm'
      and not (p_suggested_type = any (public.onboarding_all_slots()))
    )
  then
    raise exception 'invalid_suggested_type';
  end if;

  if p_suggested_confidence is null
    or p_suggested_confidence < 0
    or p_suggested_confidence > 1
  then
    raise exception 'invalid_suggested_confidence';
  end if;

  -- Path: onboarding/<client_id>/<document_id>/<safe_filename>
  -- Use split_part + fixed checks (do not embed raw client_id in a regex).
  v_path_prefix := split_part(coalesce(p_storage_path, ''), '/', 1);
  v_path_doc := split_part(coalesce(p_storage_path, ''), '/', 3);
  v_path_name := split_part(coalesce(p_storage_path, ''), '/', 4);
  v_path_extra := split_part(coalesce(p_storage_path, ''), '/', 5);

  if p_storage_path is null
    or p_storage_path like '%..%'
    or v_path_prefix is distinct from 'onboarding'
    or split_part(p_storage_path, '/', 2) is distinct from p_client_id
    or v_path_doc !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or length(trim(v_path_name)) < 1
    or v_path_extra is distinct from ''
  then
    raise exception 'invalid_onboarding_storage_path';
  end if;

  v_doc_id := v_path_doc::uuid;
  v_safe_name := v_path_name;

  if length(trim(coalesce(p_original_filename, ''))) < 1 then
    raise exception 'invalid_original_filename';
  end if;

  if length(trim(coalesce(p_mime_type, ''))) < 1 then
    raise exception 'invalid_mime_type';
  end if;

  -- Dedupe: same client + sha256 returns existing inventory row.
  select * into v_result
  from public.client_onboarding_documents
  where client_id = p_client_id and sha256 = p_sha256;

  if found then
    return v_result;
  end if;

  insert into public.client_onboarding_packs(client_id)
  values (p_client_id)
  on conflict (client_id) do nothing;

  insert into public.client_onboarding_documents(
    id,
    client_id,
    storage_path,
    original_filename,
    mime_type,
    byte_size,
    sha256,
    suggested_type,
    suggested_confidence,
    classifier_version,
    status,
    uploaded_by
  ) values (
    v_doc_id,
    p_client_id,
    p_storage_path,
    p_original_filename,
    p_mime_type,
    p_byte_size,
    p_sha256,
    p_suggested_type,
    coalesce(p_suggested_confidence, 0),
    coalesce(nullif(trim(p_classifier_version), ''), 'v1-heuristics'),
    p_status,
    p_uploaded_by
  )
  returning * into v_result;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    p_client_id,
    p_uploaded_by,
    'onboarding_document_uploaded',
    'client_onboarding_document',
    v_result.id::text,
    'onboarding document registered after private storage write',
    jsonb_build_object(
      'status', v_result.status,
      'suggested_type', v_result.suggested_type,
      'byte_size', v_result.byte_size,
      'sha256', v_result.sha256,
      'storage_path', v_result.storage_path,
      'safe_filename', v_safe_name
    )
  );

  return v_result;
end;
$$;

create or replace function public.confirm_onboarding_document(
  p_document_id uuid,
  p_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.client_onboarding_documents;
  v_pack public.client_onboarding_packs;
  v_actor uuid := auth.uid();
begin
  select * into v_doc
  from public.client_onboarding_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'onboarding_document_not_found';
  end if;

  if not public.can_manage_onboarding_pack(v_doc.client_id) then
    raise exception 'onboarding_pack_forbidden';
  end if;

  if v_doc.status in ('parked_crm', 'rejected', 'superseded') then
    raise exception 'onboarding_document_not_confirmable';
  end if;

  if p_type is null or not (p_type = any (public.onboarding_all_slots())) then
    raise exception 'invalid_onboarding_slot_type';
  end if;

  -- Supersede any other active confirmed doc bound to this slot.
  update public.client_onboarding_documents
  set status = 'superseded',
      confirmed_at = coalesce(confirmed_at, now())
  where client_id = v_doc.client_id
    and id <> p_document_id
    and status = 'confirmed'
    and confirmed_type = p_type;

  update public.client_onboarding_documents
  set status = 'confirmed',
      confirmed_type = p_type,
      confirmed_by = v_actor,
      confirmed_at = now()
  where id = p_document_id
  returning * into v_doc;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    v_doc.client_id,
    v_actor,
    'onboarding_document_confirmed',
    'client_onboarding_document',
    v_doc.id::text,
    'director confirmed onboarding document type',
    jsonb_build_object('confirmed_type', p_type, 'status', 'confirmed')
  );

  v_pack := public.recompute_onboarding_pack_status(v_doc.client_id, v_actor);

  return jsonb_build_object(
    'document', public.onboarding_document_to_jsonb(v_doc),
    'pack', public.onboarding_pack_to_jsonb(v_pack)
  );
end;
$$;

create or replace function public.unconfirm_onboarding_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.client_onboarding_documents;
  v_pack public.client_onboarding_packs;
  v_actor uuid := auth.uid();
  v_prev_type text;
begin
  select * into v_doc
  from public.client_onboarding_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'onboarding_document_not_found';
  end if;

  if not public.can_manage_onboarding_pack(v_doc.client_id) then
    raise exception 'onboarding_pack_forbidden';
  end if;

  if v_doc.status is distinct from 'confirmed' then
    raise exception 'onboarding_document_not_confirmed';
  end if;

  v_prev_type := v_doc.confirmed_type;

  update public.client_onboarding_documents
  set status = 'stored',
      confirmed_type = null,
      confirmed_by = null,
      confirmed_at = null
  where id = p_document_id
  returning * into v_doc;

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    v_doc.client_id,
    v_actor,
    'onboarding_document_unconfirmed',
    'client_onboarding_document',
    v_doc.id::text,
    'director unconfirmed onboarding document type',
    jsonb_build_object('previous_type', v_prev_type, 'status', 'stored')
  );

  v_pack := public.recompute_onboarding_pack_status(v_doc.client_id, v_actor);

  return jsonb_build_object(
    'document', public.onboarding_document_to_jsonb(v_doc),
    'pack', public.onboarding_pack_to_jsonb(v_pack)
  );
end;
$$;

create or replace function public.issue_onboarding_document_access(
  p_document_id uuid,
  p_ttl_seconds int default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.client_onboarding_documents;
  v_audit_id bigint;
  v_expires_at timestamptz;
begin
  select * into v_doc
  from public.client_onboarding_documents
  where id = p_document_id;

  if not found then
    raise exception 'onboarding_document_not_found';
  end if;

  if not public.can_manage_onboarding_pack(v_doc.client_id) then
    raise exception 'onboarding_pack_forbidden';
  end if;

  if p_ttl_seconds is null or p_ttl_seconds < 30 or p_ttl_seconds > 300 then
    raise exception 'invalid_ttl';
  end if;

  v_expires_at := now() + make_interval(secs => p_ttl_seconds);

  insert into public.client_audit_log(
    client_id, actor_id, action, entity_type, entity_id, rationale, after_state
  ) values (
    v_doc.client_id,
    auth.uid(),
    'onboarding_document_access',
    'client_onboarding_document',
    v_doc.id::text,
    'authorized short-lived onboarding document access',
    jsonb_build_object(
      'ttl_seconds', p_ttl_seconds,
      'expires_at', v_expires_at,
      'storage_bucket', v_doc.storage_bucket
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'storage_bucket', v_doc.storage_bucket,
    'storage_path', v_doc.storage_path,
    'expires_at', v_expires_at,
    'audit_id', v_audit_id,
    'ttl_seconds', p_ttl_seconds
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.can_manage_onboarding_pack(text) from public;
revoke all on function public.ensure_onboarding_pack(text) from public;
revoke all on function public.get_onboarding_pack(text) from public;
revoke all on function public.register_onboarding_document(text, text, text, text, bigint, text, text, numeric, text, text, uuid) from public;
revoke all on function public.register_onboarding_document(text, text, text, text, bigint, text, text, numeric, text, text, uuid) from anon, authenticated;
revoke all on function public.confirm_onboarding_document(uuid, text) from public;
revoke all on function public.unconfirm_onboarding_document(uuid) from public;
revoke all on function public.issue_onboarding_document_access(uuid, int) from public;
revoke all on function public.recompute_onboarding_pack_status(text, uuid) from public;
revoke all on function public.can_user_manage_onboarding_pack(uuid, text) from public;
revoke all on function public.onboarding_required_slots() from public;
revoke all on function public.onboarding_optional_slots() from public;
revoke all on function public.onboarding_all_slots() from public;
revoke all on function public.onboarding_document_to_jsonb(public.client_onboarding_documents) from public;
revoke all on function public.onboarding_pack_to_jsonb(public.client_onboarding_packs) from public;

grant execute on function public.can_manage_onboarding_pack(text) to authenticated;
grant execute on function public.ensure_onboarding_pack(text) to authenticated;
grant execute on function public.get_onboarding_pack(text) to authenticated;
grant execute on function public.confirm_onboarding_document(uuid, text) to authenticated;
grant execute on function public.unconfirm_onboarding_document(uuid) to authenticated;
grant execute on function public.issue_onboarding_document_access(uuid, int) to authenticated;

-- Edge Function only: storage write then register (mirrors register_client_asset).
grant execute on function public.register_onboarding_document(text, text, text, text, bigint, text, text, numeric, text, text, uuid) to service_role;

-- Internal helpers remain callable by SECURITY DEFINER pack RPCs (owner execute).
grant execute on function public.recompute_onboarding_pack_status(text, uuid) to postgres;
grant execute on function public.can_user_manage_onboarding_pack(uuid, text) to postgres;

comment on table public.client_onboarding_packs is
  'Per-client onboarding checklist pack (template onboarding_pack_v1). ready ≠ client activated or import authorized.';
comment on table public.client_onboarding_documents is
  'Private onboarding documents in campaign-private; confirm is human-only; parked_crm never fills org-proof slots.';
comment on function public.register_onboarding_document(text, text, text, text, bigint, text, text, numeric, text, text, uuid) is
  'service_role only after Edge storage write. Path: onboarding/<client_id>/<document_id>/<safe_filename>. Authorizes via p_uploaded_by director-or-master + mfa_enforced.';
