-- HD-OI-019: authorize and audit bounded signed-document URL issuance.

create or replace function public.record_document_access(
  p_document_id uuid,
  p_ttl_seconds integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_document public.document_records;
  v_audit_id bigint;
  v_expires_at timestamptz;
begin
  v_profile := public.require_privileged_mfa();
  if v_profile.role not in ('director','campaign_lead','development','data_steward','auditor') then
    raise exception 'insufficient_role';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 30 or p_ttl_seconds > 300 then
    raise exception 'invalid_ttl';
  end if;

  select * into v_document
  from public.document_records
  where id = p_document_id
    and deleted_at is null;
  if not found then
    raise exception 'document_not_found';
  end if;

  v_expires_at := now() + make_interval(secs => p_ttl_seconds);
  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(),
    'document_access_authorized',
    'document_record',
    p_document_id::text,
    jsonb_build_object(
      'ttl_seconds', p_ttl_seconds,
      'expires_at', v_expires_at,
      'storage_bucket', v_document.storage_bucket
    )
  ) returning id into v_audit_id;

  return jsonb_build_object(
    'audit_id', v_audit_id,
    'expires_at', v_expires_at,
    'ttl_seconds', p_ttl_seconds,
    'storage_bucket', v_document.storage_bucket,
    'storage_path', v_document.storage_path
  );
end;
$$;

revoke all on function public.record_document_access(uuid, integer) from public;
grant execute on function public.record_document_access(uuid, integer) to authenticated;
