-- HD-OI-019: atomically create an import batch and its quarantine rows.
-- Any invalid or duplicate staging row rolls back the batch in the same transaction.

create or replace function public.create_import_batch(
  p_batch jsonb,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_batch public.import_batches;
  v_staged_row_count integer;
begin
  v_profile := public.require_privileged_mfa();
  if v_profile.role not in ('director', 'data_steward') then
    raise exception 'insufficient_role';
  end if;
  if jsonb_typeof(p_batch) <> 'object' or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_import_payload';
  end if;
  if coalesce(p_batch->>'source_name', '') = ''
     or coalesce(p_batch->>'source_sha256', '') !~ '^[a-fA-F0-9]{64}$'
     or coalesce(p_batch->>'schema_version', '') = ''
     or coalesce(p_batch->>'storage_object_path', '') = '' then
    raise exception 'invalid_import_metadata';
  end if;

  insert into public.import_batches (
    source_name,
    source_sha256,
    source_received_at,
    row_count,
    schema_version,
    state,
    storage_object_path,
    receipt,
    submitted_by
  ) values (
    p_batch->>'source_name',
    lower(p_batch->>'source_sha256'),
    coalesce((p_batch->>'source_received_at')::timestamptz, now()),
    jsonb_array_length(p_rows),
    p_batch->>'schema_version',
    'received',
    p_batch->>'storage_object_path',
    coalesce(p_batch->'receipt', '{}'::jsonb),
    auth.uid()
  ) returning * into v_batch;

  insert into public.import_staging_rows (
    batch_id,
    source_row_number,
    external_source,
    external_id,
    normalized_record,
    row_fingerprint,
    state,
    exception_codes,
    consent_candidate,
    relationship_candidate
  )
  select
    v_batch.id,
    coalesce(nullif(item.value->>'source_row_number', '')::integer, item.ordinality::integer),
    coalesce(nullif(item.value->>'external_source', ''), 'native_workbook'),
    nullif(item.value->>'external_id', ''),
    coalesce(item.value->'normalized_record', item.value),
    item.value->>'row_fingerprint',
    'staged',
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item.value->'exception_codes', '[]'::jsonb))),
      '{}'::text[]
    ),
    coalesce(nullif(item.value->>'consent_candidate', ''), 'unknown')::public.consent_status,
    nullif(item.value->>'relationship_candidate', '')::public.relationship_class
  from jsonb_array_elements(p_rows) with ordinality as item(value, ordinality);

  get diagnostics v_staged_row_count = row_count;
  if v_staged_row_count <> jsonb_array_length(p_rows) then
    raise exception 'staging_row_count_mismatch';
  end if;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(),
    'import_batch_created',
    'import_batch',
    v_batch.id::text,
    jsonb_build_object(
      'source_sha256', v_batch.source_sha256,
      'row_count', v_staged_row_count,
      'promotion_authorized', false
    )
  );

  return jsonb_build_object(
    'batch', to_jsonb(v_batch),
    'staged_row_count', v_staged_row_count,
    'promotion_authorized', false
  );
end;
$$;

revoke all on function public.create_import_batch(jsonb, jsonb) from public;
grant execute on function public.create_import_batch(jsonb, jsonb) to authenticated;
