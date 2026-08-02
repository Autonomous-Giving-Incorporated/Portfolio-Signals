-- AGI-005: immutable client configuration, governed public assets, publication, and rollback.

create type public.client_config_state as enum ('draft', 'published', 'archived');

create table public.client_config_versions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete restrict,
  version integer not null check (version > 0),
  state public.client_config_state not null default 'draft',
  config jsonb not null,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  supersedes_version integer,
  unique (client_id, version)
);

create unique index client_config_one_published_idx
on public.client_config_versions(client_id) where state = 'published';

create table public.client_assets (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete restrict,
  storage_bucket text not null default 'agi-public-assets' check (storage_bucket = 'agi-public-assets'),
  storage_path text not null,
  asset_kind text not null check (asset_kind in ('logo','icon','hero','background','document')),
  alt_text text not null default '',
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','image/svg+xml','application/pdf')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (client_id, storage_path),
  check (storage_path ~ ('^' || client_id || '/' || uploaded_by::text || '/[^/]+$'))
);

alter table public.client_config_versions enable row level security;
alter table public.client_assets enable row level security;

create policy "client members read configuration history" on public.client_config_versions for select using
  (public.is_client_member(client_id) or public.is_master_admin());
create policy "client members read asset metadata" on public.client_assets for select using
  (public.is_client_member(client_id) or public.is_master_admin());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'agi-public-assets', 'agi-public-assets', true, 10485760,
  array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public reads published client assets" on storage.objects for select to public using
  (bucket_id = 'agi-public-assets');
-- No authenticated insert/update/delete policies are created for agi-public-assets.
-- Uploads must be performed atomically by a service-role Edge Function that writes
-- storage and then calls register_client_asset with the verified end-user id.

create or replace function public.validate_client_config(p_client_id text, p_config jsonb) returns void
language plpgsql stable set search_path = public as $$
declare v_color text; v_asset_path text;
begin
  if jsonb_typeof(p_config) <> 'object' then raise exception 'invalid_client_config'; end if;
  if length(trim(coalesce(p_config->>'organization_name', ''))) not between 1 and 100 then raise exception 'invalid_organization_name'; end if;
  if length(trim(coalesce(p_config->>'product_name', ''))) not between 1 and 100 then raise exception 'invalid_product_name'; end if;
  if length(coalesce(p_config->>'campaign_title', '')) > 160 then raise exception 'invalid_campaign_title'; end if;
  if length(coalesce(p_config->>'campaign_tagline', '')) > 280 then raise exception 'invalid_campaign_tagline'; end if;
  if p_config ? 'modules' and (
    jsonb_typeof(p_config->'modules') <> 'object'
    or jsonb_typeof(p_config#>'{modules,sponsors}') is distinct from 'boolean'
    or jsonb_typeof(p_config#>'{modules,grants}') is distinct from 'boolean'
  ) then raise exception 'invalid_client_modules'; end if;
  if p_config ? 'approvals' and (
    jsonb_typeof(p_config->'approvals') <> 'object'
    or coalesce((p_config#>>'{approvals,decision_approvers}')::integer, 0) not in (1, 2)
  ) then raise exception 'invalid_client_approval_policy'; end if;
  foreach v_color in array array[
    p_config#>>'{theme,primary}', p_config#>>'{theme,accent}', p_config#>>'{theme,background}'
  ] loop
    if v_color is not null and v_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'invalid_theme_color'; end if;
  end loop;
  foreach v_asset_path in array array[
    p_config#>>'{assets,logo_path}', p_config#>>'{assets,icon_path}', p_config#>>'{assets,hero_path}'
  ] loop
    if v_asset_path is not null and (
      v_asset_path like '%..%'
      or v_asset_path like 'http%'
      or v_asset_path !~ ('^' || p_client_id || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$')
      or not exists (
        select 1 from public.client_assets
        where client_id = p_client_id and storage_path = v_asset_path and deleted_at is null
      )
    ) then
      raise exception 'invalid_asset_path';
    end if;
  end loop;
end $$;

create or replace function public.save_client_config_draft(
  p_client_id text, p_config jsonb, p_rationale text
) returns public.client_config_versions
language plpgsql security definer set search_path = public as $$
declare v_version integer; v_result public.client_config_versions;
begin
  perform public.require_privileged_mfa();
  if public.current_client_role(p_client_id) is distinct from 'director' then raise exception 'client_director_required'; end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then raise exception 'configuration_rationale_required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_client_id));
  perform public.validate_client_config(p_client_id, p_config);
  select coalesce(max(version), 0) + 1 into v_version from public.client_config_versions where client_id = p_client_id;
  insert into public.client_config_versions(client_id, version, config, created_by)
  values (p_client_id, v_version, p_config, auth.uid()) returning * into v_result;
  insert into public.client_audit_log(client_id, actor_id, action, entity_type, entity_id, rationale, after_state)
  values (p_client_id, auth.uid(), 'client_config_draft_saved', 'client_config_version', v_result.id::text,
    p_rationale, jsonb_build_object('version', v_version));
  return v_result;
end $$;

create or replace function public.publish_client_config(
  p_version_id uuid, p_rationale text
) returns public.client_config_versions
language plpgsql security definer set search_path = public as $$
declare v_result public.client_config_versions;
begin
  perform public.require_privileged_mfa();
  select * into v_result from public.client_config_versions where id = p_version_id for update;
  if not found then raise exception 'configuration_version_not_found'; end if;
  perform pg_advisory_xact_lock(hashtext(v_result.client_id));
  if public.current_client_role(v_result.client_id) is distinct from 'director' then raise exception 'client_director_required'; end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then raise exception 'publication_rationale_required'; end if;
  if v_result.state is distinct from 'draft' then raise exception 'draft_configuration_required'; end if;
  perform public.validate_client_config(v_result.client_id, v_result.config);
  update public.client_config_versions set state = 'archived'
  where client_id = v_result.client_id and state = 'published' and id <> p_version_id;
  update public.client_config_versions
  set state = 'published', published_by = auth.uid(), published_at = now()
  where id = p_version_id returning * into v_result;
  insert into public.client_audit_log(client_id, actor_id, action, entity_type, entity_id, rationale, after_state)
  values (v_result.client_id, auth.uid(), 'client_config_published', 'client_config_version', v_result.id::text,
    p_rationale, jsonb_build_object('version', v_result.version));
  return v_result;
end $$;

create or replace function public.rollback_client_config(
  p_client_id text, p_source_version integer, p_rationale text
) returns public.client_config_versions
language plpgsql security definer set search_path = public as $$
declare v_source public.client_config_versions; v_result public.client_config_versions; v_next integer;
begin
  perform public.require_privileged_mfa();
  if public.current_client_role(p_client_id) is distinct from 'director' then raise exception 'client_director_required'; end if;
  if length(trim(coalesce(p_rationale, ''))) < 12 then raise exception 'rollback_rationale_required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_client_id));
  select * into v_source from public.client_config_versions where client_id = p_client_id and version = p_source_version;
  if not found then raise exception 'configuration_version_not_found'; end if;
  perform public.validate_client_config(p_client_id, v_source.config);
  select coalesce(max(version), 0) + 1 into v_next from public.client_config_versions where client_id = p_client_id;
  update public.client_config_versions set state = 'archived' where client_id = p_client_id and state = 'published';
  insert into public.client_config_versions(
    client_id, version, state, config, created_by, published_by, published_at, supersedes_version
  ) values (
    p_client_id, v_next, 'published', v_source.config, auth.uid(), auth.uid(), now(), p_source_version
  ) returning * into v_result;
  insert into public.client_audit_log(client_id, actor_id, action, entity_type, entity_id, rationale, after_state)
  values (p_client_id, auth.uid(), 'client_config_rolled_back', 'client_config_version', v_result.id::text,
    p_rationale, jsonb_build_object('version', v_next, 'source_version', p_source_version));
  return v_result;
end $$;

create or replace function public.register_client_asset(
  p_client_id text, p_storage_path text, p_asset_kind text, p_alt_text text,
  p_mime_type text, p_byte_size bigint, p_uploaded_by uuid
) returns public.client_assets
language plpgsql security definer set search_path = public as $$
declare v_result public.client_assets; v_used bigint; v_quota bigint;
begin
  if not exists (
    select 1 from public.client_memberships
    where client_id = p_client_id and user_id = p_uploaded_by and role = 'director' and active = true
  ) then raise exception 'client_director_required'; end if;
  if p_storage_path !~ ('^' || p_client_id || '/' || p_uploaded_by::text || '/[^/]+$') then raise exception 'invalid_asset_path'; end if;
  select asset_quota_bytes into v_quota from public.clients where id = p_client_id;
  select coalesce(sum(byte_size), 0) into v_used from public.client_assets where client_id = p_client_id and deleted_at is null;
  if v_used + p_byte_size > v_quota then raise exception 'client_asset_quota_exceeded'; end if;
  insert into public.client_assets(client_id, storage_path, asset_kind, alt_text, mime_type, byte_size, uploaded_by)
  values (p_client_id, p_storage_path, p_asset_kind, coalesce(p_alt_text, ''), p_mime_type, p_byte_size, p_uploaded_by)
  returning * into v_result;
  insert into public.client_audit_log(client_id, actor_id, action, entity_type, entity_id, rationale, after_state)
  values (p_client_id, p_uploaded_by, 'client_asset_registered', 'client_asset', v_result.id::text,
    'director registered governed public asset', jsonb_build_object('kind', p_asset_kind, 'byte_size', p_byte_size));
  return v_result;
end $$;

create or replace function public.get_public_client_config(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'client_id', c.id,
    'slug', c.slug,
    'display_name', c.display_name,
    'version', v.version,
    'published_at', v.published_at,
    'config', v.config
  )
  from public.clients c
  join public.client_config_versions v on v.client_id = c.id and v.state = 'published'
  where c.slug = p_slug and c.state = 'active'
$$;

revoke insert, update, delete on public.client_config_versions from authenticated;
revoke insert, update, delete on public.client_assets from authenticated;
revoke all on function public.validate_client_config(text, jsonb) from public;
revoke all on function public.save_client_config_draft(text, jsonb, text) from public;
revoke all on function public.publish_client_config(uuid, text) from public;
revoke all on function public.rollback_client_config(text, integer, text) from public;
revoke all on function public.register_client_asset(text, text, text, text, text, bigint, uuid) from public;
revoke all on function public.register_client_asset(text, text, text, text, text, bigint, uuid) from anon, authenticated;
revoke all on function public.get_public_client_config(text) from public;
grant execute on function public.save_client_config_draft(text, jsonb, text) to authenticated;
grant execute on function public.publish_client_config(uuid, text) to authenticated;
grant execute on function public.rollback_client_config(text, integer, text) to authenticated;
grant execute on function public.register_client_asset(text, text, text, text, text, bigint, uuid) to service_role;
grant execute on function public.get_public_client_config(text) to anon, authenticated;

insert into public.client_config_versions(client_id, version, state, config, published_at)
values (
  'org_hacker_dojo', 1, 'published',
  jsonb_build_object(
    'organization_name', 'Hacker Dojo',
    'product_name', 'Campaign Control Center',
    'campaign_title', 'Keep the room where builders become possible.',
    'campaign_tagline', 'Come home. Build something. Fund the next builder.',
    'modules', jsonb_build_object('sponsors', true, 'grants', true),
    'approvals', jsonb_build_object('decision_approvers', 1),
    'theme', jsonb_build_object('primary', '#ED1C24', 'accent', '#33D6C5', 'background', '#071725'),
    'assets', jsonb_build_object('logo_path', null, 'icon_path', null, 'hero_path', null)
  ),
  now()
)
on conflict (client_id, version) do nothing;
