-- HD-OI-019: signed document access authorization, TTL, and audit checks.
\set ON_ERROR_STOP on

create or replace function public.test_set_user(test_user uuid) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.aal', 'aal2', true);
  perform set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
end $$;

grant execute on function public.test_set_user(uuid) to authenticated;

begin;

insert into public.document_records (
  id, storage_bucket, storage_path, display_name, classification,
  checksum_sha256, content_type, size_bytes, uploaded_by
) values (
  '30000000-0000-0000-0000-000000000010',
  'campaign-private',
  '00000000-0000-0000-0000-000000000101/signed-url-test.pdf',
  'Synthetic signed URL test',
  'restricted',
  repeat('c', 64),
  'application/pdf',
  128,
  '00000000-0000-0000-0000-000000000101'
), (
  '30000000-0000-0000-0000-000000000011',
  'campaign-private',
  '00000000-0000-0000-0000-000000000101/deleted-test.pdf',
  'Synthetic deleted document',
  'restricted',
  repeat('d', 64),
  'application/pdf',
  128,
  '00000000-0000-0000-0000-000000000101'
);

update public.document_records
set deleted_at = now()
where id = '30000000-0000-0000-0000-000000000011';

set local role authenticated;

-- Board viewers cannot authorize private document access.
select public.test_set_user('00000000-0000-0000-0000-000000000104');
do $$
begin
  begin
    perform public.record_document_access('30000000-0000-0000-0000-000000000010', 60);
    raise exception 'board viewer document access unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%insufficient_role%' then raise; end if;
  end;
end $$;

-- TTL must remain in the explicitly supported 30-300 second range.
select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$
begin
  begin
    perform public.record_document_access('30000000-0000-0000-0000-000000000010', 29);
    raise exception 'short document TTL unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%invalid_ttl%' then raise; end if;
  end;
  begin
    perform public.record_document_access('30000000-0000-0000-0000-000000000010', 301);
    raise exception 'long document TTL unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%invalid_ttl%' then raise; end if;
  end;
end $$;

-- Missing and soft-deleted metadata fail closed.
do $$
begin
  begin
    perform public.record_document_access('30000000-0000-0000-0000-000000000099', 60);
    raise exception 'missing document access unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%document_not_found%' then raise; end if;
  end;
  begin
    perform public.record_document_access('30000000-0000-0000-0000-000000000011', 60);
    raise exception 'deleted document access unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%document_not_found%' then raise; end if;
  end;
end $$;

-- Successful authorization returns bounded expiry and writes privacy-safe audit evidence.
do $$
declare
  v_result jsonb;
  v_audit public.audit_log;
begin
  v_result := public.record_document_access(
    '30000000-0000-0000-0000-000000000010',
    90
  );
  if (v_result->>'ttl_seconds')::integer <> 90 then
    raise exception 'document access returned wrong TTL';
  end if;
  if (v_result->>'expires_at')::timestamptz not between now() + interval '85 seconds' and now() + interval '95 seconds' then
    raise exception 'document access returned wrong expiry';
  end if;

  select * into v_audit from public.audit_log
  where id = (v_result->>'audit_id')::bigint;
  if not found
     or v_audit.actor_id <> '00000000-0000-0000-0000-000000000101'
     or v_audit.action <> 'document_access_authorized'
     or v_audit.entity_id <> '30000000-0000-0000-0000-000000000010'
     or (v_audit.after_state->>'ttl_seconds')::integer <> 90 then
    raise exception 'document access audit evidence missing or incorrect';
  end if;
  if v_audit.after_state::text like '%signed-url-test.pdf%' then
    raise exception 'document access audit leaked storage path';
  end if;
end $$;

rollback;
