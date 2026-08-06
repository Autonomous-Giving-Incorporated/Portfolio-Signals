-- AGI-002: tenant-scope all legacy campaign-control records and privileged paths.
-- Defaults preserve the Hacker Dojo pilot while clients migrate to explicit ids.

alter table public.constituents add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.opportunities add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.decisions add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.claims add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.audit_log add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.opportunity_notes add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.document_records add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.decision_events add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.import_batches add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.import_staging_rows add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.suppression_registry add column client_id text references public.clients(id) default 'org_hacker_dojo';
alter table public.import_exceptions add column client_id text references public.clients(id) default 'org_hacker_dojo';

update public.constituents set client_id = 'org_hacker_dojo' where client_id is null;
update public.opportunities set client_id = 'org_hacker_dojo' where client_id is null;
update public.decisions set client_id = 'org_hacker_dojo' where client_id is null;
update public.claims set client_id = 'org_hacker_dojo' where client_id is null;
update public.audit_log set client_id = 'org_hacker_dojo' where client_id is null;
update public.opportunity_notes n set client_id = o.client_id from public.opportunities o where n.opportunity_id = o.id;
update public.document_records d set client_id = o.client_id
  from public.opportunities o where d.opportunity_id = o.id;
update public.document_records d set client_id = de.client_id
  from public.decisions de where d.decision_id = de.id and d.opportunity_id is null;
update public.decision_events e set client_id = d.client_id from public.decisions d where e.decision_id = d.id;
update public.import_batches set client_id = 'org_hacker_dojo' where client_id is null;
update public.import_staging_rows r set client_id = b.client_id from public.import_batches b where r.batch_id = b.id;
update public.suppression_registry set client_id = 'org_hacker_dojo' where client_id is null;
update public.import_exceptions e set client_id = r.client_id from public.import_staging_rows r where e.staging_row_id = r.id;

alter table public.constituents alter column client_id set not null;
alter table public.opportunities alter column client_id set not null;
alter table public.decisions alter column client_id set not null;
alter table public.claims alter column client_id set not null;
alter table public.audit_log alter column client_id set not null;
alter table public.opportunity_notes alter column client_id set not null;
alter table public.document_records alter column client_id set not null;
alter table public.decision_events alter column client_id set not null;
alter table public.import_batches alter column client_id set not null;
alter table public.import_staging_rows alter column client_id set not null;
alter table public.suppression_registry alter column client_id set not null;
alter table public.import_exceptions alter column client_id set not null;

alter table public.constituents drop constraint if exists constituents_external_source_external_id_key;
alter table public.constituents add constraint constituents_client_external_key unique (client_id, external_source, external_id);
alter table public.decisions drop constraint if exists decisions_key_key;
alter table public.decisions add constraint decisions_client_key unique (client_id, key);
alter table public.document_records drop constraint if exists document_records_storage_path_key;
alter table public.document_records add constraint document_records_client_storage_path_key unique (client_id, storage_path);
alter table public.import_batches drop constraint if exists import_batches_source_sha256_key;
alter table public.import_batches add constraint import_batches_client_source_sha256_key unique (client_id, source_sha256);
alter table public.suppression_registry drop constraint if exists suppression_registry_match_hash_key;
alter table public.suppression_registry add constraint suppression_registry_client_match_hash_key unique (client_id, match_hash);

create index constituents_client_idx on public.constituents(client_id);
create index opportunities_client_idx on public.opportunities(client_id);
create index decisions_client_idx on public.decisions(client_id);
create index claims_client_idx on public.claims(client_id);
create index audit_log_client_idx on public.audit_log(client_id, occurred_at desc);
create index import_batches_client_idx on public.import_batches(client_id, created_at desc);

drop policy if exists "authorized staff read constituents" on public.constituents;
drop policy if exists "stewards manage constituents" on public.constituents;
drop policy if exists "staff read opportunities" on public.opportunities;
drop policy if exists "campaign staff manage opportunities" on public.opportunities;
drop policy if exists "authenticated read decisions" on public.decisions;
drop policy if exists "directors decide" on public.decisions;
drop policy if exists "authenticated read verified claims" on public.claims;
drop policy if exists "stewards manage claims" on public.claims;
drop policy if exists "auditors and directors read audit log" on public.audit_log;
drop policy if exists "staff read opportunity notes" on public.opportunity_notes;
drop policy if exists "campaign staff create notes" on public.opportunity_notes;
drop policy if exists "authorized staff read document metadata" on public.document_records;
drop policy if exists "stewards manage document metadata" on public.document_records;
drop policy if exists "authenticated read decision events" on public.decision_events;
drop policy if exists "stewards read import batches" on public.import_batches;
drop policy if exists "stewards manage import batches" on public.import_batches;
drop policy if exists "stewards read staging rows" on public.import_staging_rows;
drop policy if exists "stewards manage staging rows" on public.import_staging_rows;
drop policy if exists "authorized read suppression registry" on public.suppression_registry;
drop policy if exists "stewards manage suppression registry" on public.suppression_registry;
drop policy if exists "authorized read import exceptions" on public.import_exceptions;
drop policy if exists "stewards manage import exceptions" on public.import_exceptions;

create policy "client staff read constituents" on public.constituents for select using
  (public.current_client_role(client_id) in ('director','campaign_lead','development','data_steward','auditor'));
create policy "client stewards manage constituents" on public.constituents for all using
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward')) with check
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward'));
create policy "client staff read opportunities" on public.opportunities for select using
  (public.current_client_role(client_id) in ('director','campaign_lead','development','board_viewer','auditor'));
create policy "client campaign staff manage opportunities" on public.opportunities for all using
  (public.current_client_role(client_id) in ('director','campaign_lead','development')) with check
  (public.current_client_role(client_id) in ('director','campaign_lead','development'));
create policy "client members read decisions" on public.decisions for select using (public.is_client_member(client_id));
create policy "client directors decide" on public.decisions for all using
  (public.current_client_role(client_id) in ('director','campaign_lead')) with check
  (public.current_client_role(client_id) in ('director','campaign_lead'));
create policy "client members read claims" on public.claims for select using (public.is_client_member(client_id));
create policy "client stewards manage claims" on public.claims for all using
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward')) with check
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward'));
create policy "client auditors read audit" on public.audit_log for select using
  (public.current_client_role(client_id) in ('director','auditor'));
create policy "client staff read opportunity notes" on public.opportunity_notes for select using
  (public.current_client_role(client_id) in ('director','campaign_lead','development','data_steward','auditor'));
create policy "client staff create notes" on public.opportunity_notes for insert with check
  (public.current_client_role(client_id) in ('director','campaign_lead','development','data_steward'));
create policy "client staff read document metadata" on public.document_records for select using
  (public.current_client_role(client_id) in ('director','campaign_lead','development','data_steward','auditor'));
create policy "client stewards manage document metadata" on public.document_records for all using
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward')) with check
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward'));
create policy "client members read decision events" on public.decision_events for select using (public.is_client_member(client_id));
create policy "client stewards read import batches" on public.import_batches for select using
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward','auditor'));
create policy "client stewards manage import batches" on public.import_batches for all using
  (public.current_client_role(client_id) in ('director','data_steward')) with check
  (public.current_client_role(client_id) in ('director','data_steward'));
create policy "client stewards read staging rows" on public.import_staging_rows for select using
  (public.current_client_role(client_id) in ('director','data_steward','auditor'));
create policy "client stewards manage staging rows" on public.import_staging_rows for all using
  (public.current_client_role(client_id) in ('director','data_steward')) with check
  (public.current_client_role(client_id) in ('director','data_steward'));
create policy "client authorized read suppression" on public.suppression_registry for select using
  (public.current_client_role(client_id) in ('director','campaign_lead','data_steward','auditor'));
create policy "client stewards manage suppression" on public.suppression_registry for all using
  (public.current_client_role(client_id) in ('director','data_steward')) with check
  (public.current_client_role(client_id) in ('director','data_steward'));
create policy "client authorized read exceptions" on public.import_exceptions for select using
  (public.current_client_role(client_id) in ('director','data_steward','auditor'));
create policy "client stewards manage exceptions" on public.import_exceptions for all using
  (public.current_client_role(client_id) in ('director','data_steward')) with check
  (public.current_client_role(client_id) in ('director','data_steward'));

create or replace function public.capture_audit_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
begin
  insert into public.audit_log(client_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  values (
    coalesce(v_new->>'client_id', v_old->>'client_id', 'org_hacker_dojo'), auth.uid(), lower(tg_op),
    tg_table_name, coalesce(v_new->>'id', v_old->>'id'),
    case when tg_op in ('UPDATE','DELETE') then v_old end,
    case when tg_op in ('INSERT','UPDATE') then v_new end
  );
  return coalesce(new, old);
end $$;

create or replace function public.record_decision_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.decision_events(client_id, decision_id, from_status, to_status, rationale, actor_id)
    values (new.client_id, new.id, old.status, new.status, new.rationale, auth.uid());
  end if;
  return new;
end $$;

create or replace function public.promote_import_row(p_row_id bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_row public.import_staging_rows; v_constituent_id uuid;
begin
  select * into v_row from public.import_staging_rows where id = p_row_id for update;
  if not found then raise exception 'row_not_found'; end if;
  if coalesce(public.current_client_role(v_row.client_id)::text, '') not in ('director','data_steward') then raise exception 'insufficient_role'; end if;
  if v_row.state <> 'approved' then raise exception 'row_not_approved'; end if;
  if v_row.consent_candidate in ('suppressed','restricted') then raise exception 'consent_blocks_promotion'; end if;
  if exists (select 1 from public.import_exceptions where client_id = v_row.client_id and staging_row_id = p_row_id and severity in ('error','critical') and resolved_at is null) then
    raise exception 'unresolved_blocking_exception';
  end if;
  insert into public.constituents (
    client_id, external_source, external_id, display_name, organization,
    relationship_class, consent_status, source_receipt, created_by
  ) values (
    v_row.client_id, v_row.external_source, v_row.external_id,
    coalesce(v_row.normalized_record->>'display_name','Unknown'), v_row.normalized_record->>'organization',
    coalesce(v_row.relationship_candidate,'public_adjacency'), v_row.consent_candidate,
    jsonb_build_object('batch_id',v_row.batch_id,'source_row_number',v_row.source_row_number,'fingerprint',v_row.row_fingerprint), auth.uid()
  ) on conflict (client_id, external_source, external_id) do update
    set source_receipt = excluded.source_receipt, updated_at = now()
  returning id into v_constituent_id;
  update public.import_staging_rows set state = 'promoted', promoted_constituent_id = v_constituent_id where id = p_row_id and client_id = v_row.client_id;
  return v_constituent_id;
end $$;

create or replace function public.record_document_access(p_document_id uuid, p_ttl_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_document public.document_records; v_audit_id bigint; v_expires_at timestamptz;
begin
  perform public.require_unexpired_session();
  if p_ttl_seconds is null or p_ttl_seconds < 30 or p_ttl_seconds > 300 then raise exception 'invalid_ttl'; end if;
  select * into v_document from public.document_records where id = p_document_id and deleted_at is null;
  if not found then raise exception 'document_not_found'; end if;
  if coalesce(public.current_client_role(v_document.client_id)::text, '') not in ('director','campaign_lead','development','data_steward','auditor') then raise exception 'insufficient_role'; end if;
  v_expires_at := now() + make_interval(secs => p_ttl_seconds);
  insert into public.audit_log(client_id, actor_id, action, entity_type, entity_id, after_state)
  values (v_document.client_id, auth.uid(), 'document_access_authorized', 'document_record', p_document_id::text,
    jsonb_build_object('ttl_seconds', p_ttl_seconds, 'expires_at', v_expires_at, 'storage_bucket', v_document.storage_bucket))
  returning id into v_audit_id;
  return jsonb_build_object('client_id', v_document.client_id, 'audit_id', v_audit_id, 'expires_at', v_expires_at,
    'ttl_seconds', p_ttl_seconds, 'storage_bucket', v_document.storage_bucket, 'storage_path', v_document.storage_path);
end $$;

create or replace function public.enforce_constituent_suppression() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.consent_status = 'suppressed' then
    update public.opportunities
       set authorization_state = 'suppressed', updated_at = now()
     where client_id = new.client_id
       and constituent_id = new.id
       and authorization_state <> 'suppressed';
  end if;
  return new;
end $$;

create or replace function public.approve_import_row(p_row_id bigint) returns public.import_staging_rows
language plpgsql security definer set search_path = public as $$
declare v_row public.import_staging_rows;
begin
  perform public.require_privileged_mfa();
  select * into v_row from public.import_staging_rows where id = p_row_id for update;
  if not found then raise exception 'row_not_found'; end if;
  if coalesce(public.current_client_role(v_row.client_id)::text, '') not in ('director','data_steward') then raise exception 'insufficient_role'; end if;
  if v_row.state in ('promoted','rejected') then raise exception 'row_terminal'; end if;
  if v_row.consent_candidate in ('suppressed','restricted') then raise exception 'consent_blocks_approval'; end if;
  if exists (select 1 from public.import_exceptions where client_id = v_row.client_id and staging_row_id = p_row_id and severity in ('error','critical') and resolved_at is null) then
    raise exception 'unresolved_blocking_exception';
  end if;
  update public.import_staging_rows set state = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_row_id and client_id = v_row.client_id returning * into v_row;
  insert into public.audit_log(client_id, actor_id, action, entity_type, entity_id, after_state)
  values (v_row.client_id, auth.uid(), 'import_row_approved', 'import_staging_row', p_row_id::text,
    jsonb_build_object('batch_id', v_row.batch_id, 'state', v_row.state));
  return v_row;
end $$;

create or replace function public.reject_import_row(p_row_id bigint, p_reason text default 'rejected_in_review') returns public.import_staging_rows
language plpgsql security definer set search_path = public as $$
declare v_row public.import_staging_rows; v_reason text := coalesce(nullif(trim(p_reason), ''), 'rejected_in_review');
begin
  perform public.require_privileged_mfa();
  select * into v_row from public.import_staging_rows where id = p_row_id for update;
  if not found then raise exception 'row_not_found'; end if;
  if coalesce(public.current_client_role(v_row.client_id)::text, '') not in ('director','data_steward') then raise exception 'insufficient_role'; end if;
  if v_row.state = 'promoted' then raise exception 'row_already_promoted'; end if;
  update public.import_staging_rows
     set state = 'rejected', exception_codes = case when 'manual_reject' = any(exception_codes) then exception_codes else array_append(exception_codes, 'manual_reject') end
   where id = p_row_id and client_id = v_row.client_id returning * into v_row;
  insert into public.import_exceptions(client_id, staging_row_id, code, severity, detail, resolution, resolved_by, resolved_at)
  values (v_row.client_id, p_row_id, 'manual_reject', 'info', v_reason, 'rejected', auth.uid(), now());
  insert into public.audit_log(client_id, actor_id, action, entity_type, entity_id, after_state)
  values (v_row.client_id, auth.uid(), 'import_row_rejected', 'import_staging_row', p_row_id::text,
    jsonb_build_object('batch_id', v_row.batch_id, 'reason', v_reason));
  return v_row;
end $$;

create or replace function public.resolve_import_exception(p_exception_id bigint, p_resolution text) returns public.import_exceptions
language plpgsql security definer set search_path = public as $$
declare v_exception public.import_exceptions; v_resolution text := nullif(trim(p_resolution), '');
begin
  perform public.require_privileged_mfa();
  if v_resolution is null then raise exception 'resolution_required'; end if;
  select * into v_exception from public.import_exceptions where id = p_exception_id for update;
  if not found or v_exception.resolved_at is not null then raise exception 'exception_not_found_or_resolved'; end if;
  if coalesce(public.current_client_role(v_exception.client_id)::text, '') not in ('director','data_steward') then raise exception 'insufficient_role'; end if;
  update public.import_exceptions set resolution = v_resolution, resolved_by = auth.uid(), resolved_at = now()
   where id = p_exception_id and client_id = v_exception.client_id returning * into v_exception;
  insert into public.audit_log(client_id, actor_id, action, entity_type, entity_id, after_state)
  values (v_exception.client_id, auth.uid(), 'import_exception_resolved', 'import_exception', p_exception_id::text,
    jsonb_build_object('resolution', v_resolution, 'staging_row_id', v_exception.staging_row_id));
  return v_exception;
end $$;

create or replace function public.create_import_batch(p_batch jsonb, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_client_id text := coalesce(nullif(p_batch->>'client_id', ''), 'org_hacker_dojo');
  v_batch public.import_batches;
  v_staged_row_count integer;
begin
  perform public.require_privileged_mfa();
  if coalesce(public.current_client_role(v_client_id)::text, '') not in ('director','data_steward') then raise exception 'insufficient_role'; end if;
  if jsonb_typeof(p_batch) <> 'object' or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_import_payload'; end if;
  if coalesce(p_batch->>'source_name', '') = ''
     or coalesce(p_batch->>'source_sha256', '') !~ '^[a-fA-F0-9]{64}$'
     or coalesce(p_batch->>'schema_version', '') = ''
     or coalesce(p_batch->>'storage_object_path', '') = '' then raise exception 'invalid_import_metadata'; end if;
  if split_part(p_batch->>'storage_object_path', '/', 1) <> v_client_id then raise exception 'invalid_client_storage_path'; end if;
  insert into public.import_batches(client_id, source_name, source_sha256, source_received_at, row_count, schema_version, state, storage_object_path, receipt, submitted_by)
  values (v_client_id, p_batch->>'source_name', lower(p_batch->>'source_sha256'), coalesce((p_batch->>'source_received_at')::timestamptz, now()),
    jsonb_array_length(p_rows), p_batch->>'schema_version', 'received', p_batch->>'storage_object_path', coalesce(p_batch->'receipt', '{}'::jsonb), auth.uid())
  returning * into v_batch;
  insert into public.import_staging_rows(client_id, batch_id, source_row_number, external_source, external_id, normalized_record, row_fingerprint, state, exception_codes, consent_candidate, relationship_candidate)
  select v_client_id, v_batch.id, coalesce(nullif(item.value->>'source_row_number', '')::integer, item.ordinality::integer),
    coalesce(nullif(item.value->>'external_source', ''), 'native_workbook'), nullif(item.value->>'external_id', ''),
    coalesce(item.value->'normalized_record', item.value), item.value->>'row_fingerprint', 'staged',
    coalesce(array(select jsonb_array_elements_text(coalesce(item.value->'exception_codes', '[]'::jsonb))), '{}'::text[]),
    coalesce(nullif(item.value->>'consent_candidate', ''), 'unknown')::public.consent_status,
    nullif(item.value->>'relationship_candidate', '')::public.relationship_class
  from jsonb_array_elements(p_rows) with ordinality as item(value, ordinality);
  get diagnostics v_staged_row_count = row_count;
  if v_staged_row_count <> jsonb_array_length(p_rows) then raise exception 'staging_row_count_mismatch'; end if;
  insert into public.audit_log(client_id, actor_id, action, entity_type, entity_id, after_state)
  values (v_client_id, auth.uid(), 'import_batch_created', 'import_batch', v_batch.id::text,
    jsonb_build_object('source_sha256', v_batch.source_sha256, 'row_count', v_staged_row_count, 'promotion_authorized', false));
  return jsonb_build_object('batch', to_jsonb(v_batch), 'staged_row_count', v_staged_row_count, 'promotion_authorized', false);
end $$;

drop policy if exists "authorized staff read private campaign objects" on storage.objects;
drop policy if exists "stewards upload private campaign objects" on storage.objects;
drop policy if exists "stewards update owned private campaign objects" on storage.objects;
drop policy if exists "directors delete private campaign objects" on storage.objects;

create policy "client staff read private campaign objects" on storage.objects for select to authenticated using (
  bucket_id = 'campaign-private'
  and public.current_client_role((storage.foldername(name))[1]) in ('director','campaign_lead','development','data_steward','auditor')
);
create policy "client stewards upload private campaign objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'campaign-private'
  and public.current_client_role((storage.foldername(name))[1]) in ('director','campaign_lead','data_steward')
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "client stewards update owned private campaign objects" on storage.objects for update to authenticated using (
  bucket_id = 'campaign-private' and owner_id = auth.uid()::text
  and public.current_client_role((storage.foldername(name))[1]) in ('director','campaign_lead','data_steward')
) with check (
  bucket_id = 'campaign-private' and owner_id = auth.uid()::text
  and public.current_client_role((storage.foldername(name))[1]) in ('director','campaign_lead','data_steward')
);
create policy "client directors delete private campaign objects" on storage.objects for delete to authenticated using (
  bucket_id = 'campaign-private' and public.current_client_role((storage.foldername(name))[1]) = 'director'
);
