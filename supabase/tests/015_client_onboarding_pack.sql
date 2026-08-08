-- Client Onboarding Pack: authz, ready transition, parked confirm fail-closed.
begin;

insert into public.clients(id, slug, display_name, state)
values ('org_pack_other', 'pack-other', 'Pack Other', 'active');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000211','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pack-other-dir@example.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000212','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pack-nonmember@example.invalid','',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name, role, active, mfa_enforced)
values
  ('00000000-0000-0000-0000-000000000211','Pack Other Director','director',true,true),
  ('00000000-0000-0000-0000-000000000212','Pack Nonmember','development',true,true)
on conflict (id) do update
  set role = excluded.role, active = true, mfa_enforced = excluded.mfa_enforced;

insert into public.client_memberships(client_id, user_id, role, active)
values ('org_pack_other', '00000000-0000-0000-0000-000000000211', 'director', true)
on conflict (client_id, user_id) do update
  set role = excluded.role, active = true;

-- Non-member cannot get onboarding pack.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000212', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
begin
  begin
    perform public.get_onboarding_pack('org_hacker_dojo');
    raise exception 'non-member get_onboarding_pack unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'non-member get_onboarding_pack unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%onboarding_pack_forbidden%' then raise; end if;
  end;
end $$;
reset role;

-- Outsider director of other client cannot read pack.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000211', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
begin
  begin
    perform public.get_onboarding_pack('org_hacker_dojo');
    raise exception 'outsider director get_onboarding_pack unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'outsider director get_onboarding_pack unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%onboarding_pack_forbidden%' then raise; end if;
  end;
end $$;
reset role;

-- Authenticated cannot call service_role-only register.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
begin
  begin
    perform public.register_onboarding_document(
      'org_hacker_dojo',
      'onboarding/org_hacker_dojo/00000000-0000-0000-0000-000000000301/bylaws.pdf',
      'bylaws.pdf',
      'application/pdf',
      1024,
      repeat('a', 64),
      'governance',
      0.85,
      'v1-heuristics',
      'stored',
      '00000000-0000-0000-0000-000000000101'
    );
    raise exception 'authenticated register_onboarding_document unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'authenticated register_onboarding_document unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%permission denied%' then raise; end if;
  end;
end $$;
reset role;

-- Director with MFA can ensure pack and get pack view.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
declare
  v_pack public.client_onboarding_packs;
  v_view jsonb;
begin
  v_pack := public.ensure_onboarding_pack('org_hacker_dojo');
  if v_pack.client_id <> 'org_hacker_dojo' then raise exception 'ensure pack wrong client'; end if;
  if v_pack.status <> 'in_progress' then raise exception 'new pack not in_progress'; end if;
  if v_pack.template_version <> 'onboarding_pack_v1' then raise exception 'unexpected template_version'; end if;

  v_view := public.get_onboarding_pack('org_hacker_dojo');
  if v_view#>>'{pack,status}' <> 'in_progress' then raise exception 'get pack status wrong'; end if;
  if jsonb_array_length(v_view->'required_slots') <> 5 then raise exception 'required slots count wrong'; end if;
  if jsonb_array_length(v_view->'optional_slots') <> 6 then raise exception 'optional slots count wrong'; end if;
end $$;
reset role;

-- Service role registers documents (Edge path).
set local role service_role;
do $$
declare
  v_slots text[] := array[
    'org_legal_name_proof',
    'tax_exempt_or_ein',
    'governance',
    'brand_logo',
    'primary_contact'
  ];
  v_slot text;
  v_i int;
  v_doc_id uuid;
  v_path text;
  v_sha text;
  v_doc public.client_onboarding_documents;
  v_parked public.client_onboarding_documents;
begin
  for v_i in 1..5 loop
    v_slot := v_slots[v_i];
    v_doc_id := ('00000000-0000-0000-0000-00000000030' || v_i::text)::uuid;
    v_path := 'onboarding/org_hacker_dojo/' || v_doc_id::text || '/' || v_slot || '.pdf';
    v_sha := repeat(chr(96 + v_i), 64); -- aaaa..., bbbb..., ... eeee...
    v_doc := public.register_onboarding_document(
      'org_hacker_dojo',
      v_path,
      v_slot || '.pdf',
      'application/pdf',
      1000 + v_i,
      v_sha,
      v_slot,
      0.8,
      'v1-heuristics',
      'stored',
      '00000000-0000-0000-0000-000000000101'
    );
    if v_doc.id <> v_doc_id then raise exception 'register did not preserve document id from path'; end if;
    if v_doc.status <> 'stored' then raise exception 'registered doc not stored'; end if;
  end loop;

  -- Dedupe on (client_id, sha256): same hash returns existing row.
  v_doc := public.register_onboarding_document(
    'org_hacker_dojo',
    'onboarding/org_hacker_dojo/00000000-0000-0000-0000-000000000399/dup.pdf',
    'dup.pdf',
    'application/pdf',
    999,
    repeat('a', 64),
    'uncategorized',
    0,
    'v1-heuristics',
    'stored',
    '00000000-0000-0000-0000-000000000101'
  );
  if v_doc.id <> '00000000-0000-0000-0000-000000000301'::uuid then
    raise exception 'sha256 dedupe did not return existing document';
  end if;

  -- Parked CRM document.
  v_parked := public.register_onboarding_document(
    'org_hacker_dojo',
    'onboarding/org_hacker_dojo/00000000-0000-0000-0000-000000000390/donors.xlsx',
    'donors.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    2048,
    repeat('f', 64),
    'parked_crm',
    1,
    'v1-heuristics',
    'parked_crm',
    '00000000-0000-0000-0000-000000000101'
  );
  if v_parked.status <> 'parked_crm' then raise exception 'parked doc status wrong'; end if;

  begin
    perform public.register_onboarding_document(
      'org_hacker_dojo',
      'onboarding/org_hacker_dojo/00000000-0000-0000-0000-000000000391/bad.exe',
      'bad.exe',
      'application/octet-stream',
      100,
      repeat('0', 64),
      'uncategorized',
      0,
      'v1-heuristics',
      'rejected',
      '00000000-0000-0000-0000-000000000101'
    );
    raise exception 'rejected status register unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'rejected status register unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%onboarding_document_rejected%' then raise; end if;
  end;

  -- Replacement logo for supersede test.
  perform public.register_onboarding_document(
    'org_hacker_dojo',
    'onboarding/org_hacker_dojo/00000000-0000-0000-0000-000000000380/logo2.png',
    'logo2.png',
    'image/png',
    512,
    repeat('9', 64),
    'brand_logo',
    0.8,
    'v1-heuristics',
    'stored',
    '00000000-0000-0000-0000-000000000101'
  );
end $$;
reset role;

-- Director confirms required slots → ready; parked cannot confirm; unconfirm demotes.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
declare
  v_result jsonb;
  v_pack public.client_onboarding_packs;
  v_slots text[] := array[
    'org_legal_name_proof',
    'tax_exempt_or_ein',
    'governance',
    'brand_logo',
    'primary_contact'
  ];
  v_i int;
  v_doc_id uuid;
  v_access jsonb;
  v_prev public.client_onboarding_documents;
begin
  -- Confirming parked_crm to tax slot must fail.
  begin
    perform public.confirm_onboarding_document(
      '00000000-0000-0000-0000-000000000390'::uuid,
      'tax_exempt_or_ein'
    );
    raise exception 'parked_crm confirm to tax slot unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'parked_crm confirm to tax slot unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%onboarding_document_not_confirmable%' then raise; end if;
  end;

  for v_i in 1..5 loop
    v_doc_id := ('00000000-0000-0000-0000-00000000030' || v_i::text)::uuid;
    v_result := public.confirm_onboarding_document(v_doc_id, v_slots[v_i]);
    if v_result#>>'{document,status}' <> 'confirmed' then
      raise exception 'confirm did not set status confirmed for %', v_slots[v_i];
    end if;
    if v_result#>>'{document,confirmed_type}' <> v_slots[v_i] then
      raise exception 'confirm wrong type for %', v_slots[v_i];
    end if;
  end loop;

  if v_result#>>'{pack,status}' <> 'ready' then
    raise exception 'pack not ready after confirming all required slots';
  end if;

  select * into v_pack from public.client_onboarding_packs where client_id = 'org_hacker_dojo';
  if v_pack.status <> 'ready' or v_pack.ready_at is null or v_pack.ready_by is distinct from auth.uid() then
    raise exception 'pack ready fields not set';
  end if;

  if not exists (
    select 1 from public.client_audit_log
    where client_id = 'org_hacker_dojo' and action = 'onboarding_pack_ready'
  ) then
    raise exception 'onboarding_pack_ready audit missing';
  end if;

  -- Unconfirm one required slot demotes pack.
  v_result := public.unconfirm_onboarding_document('00000000-0000-0000-0000-000000000301'::uuid);
  if v_result#>>'{pack,status}' <> 'in_progress' then
    raise exception 'pack not demoted after unconfirm';
  end if;
  if v_result#>>'{document,status}' <> 'stored' then
    raise exception 'unconfirm did not return stored status';
  end if;

  if not exists (
    select 1 from public.client_audit_log
    where client_id = 'org_hacker_dojo' and action = 'onboarding_pack_demoted'
  ) then
    raise exception 'onboarding_pack_demoted audit missing';
  end if;

  -- Re-confirm to restore ready.
  v_result := public.confirm_onboarding_document(
    '00000000-0000-0000-0000-000000000301'::uuid,
    'org_legal_name_proof'
  );
  if v_result#>>'{pack,status}' <> 'ready' then
    raise exception 'pack not ready after reconfirm';
  end if;

  -- Supersede brand_logo with replacement doc; pack stays ready.
  v_result := public.confirm_onboarding_document(
    '00000000-0000-0000-0000-000000000380'::uuid,
    'brand_logo'
  );
  if v_result#>>'{document,status}' <> 'confirmed' then
    raise exception 'replacement brand_logo not confirmed';
  end if;
  select * into v_prev from public.client_onboarding_documents
  where id = '00000000-0000-0000-0000-000000000304'::uuid;
  if v_prev.status <> 'superseded' then
    raise exception 'prior brand_logo not superseded';
  end if;
  if v_result#>>'{pack,status}' <> 'ready' then
    raise exception 'pack should stay ready after supersede replacement';
  end if;

  v_access := public.issue_onboarding_document_access(
    '00000000-0000-0000-0000-000000000380'::uuid,
    60
  );
  if v_access->>'storage_bucket' <> 'campaign-private' then
    raise exception 'access bucket wrong';
  end if;
  if v_access->>'storage_path' is null then
    raise exception 'access path missing';
  end if;
  if v_access->>'audit_id' is null then
    raise exception 'access audit_id missing';
  end if;
  if (v_access->>'expires_at') is null then
    raise exception 'access expires_at missing';
  end if;

  begin
    perform public.issue_onboarding_document_access(
      '00000000-0000-0000-0000-000000000380'::uuid,
      5
    );
    raise exception 'invalid ttl unexpectedly accepted';
  exception when others then
    if sqlerrm = 'invalid ttl unexpectedly accepted' then raise; end if;
    if sqlerrm not like '%invalid_ttl%' then raise; end if;
  end;
end $$;
reset role;

-- Outsider still cannot select document rows via RLS.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000211', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
begin
  if (select count(*) from public.client_onboarding_documents where client_id = 'org_hacker_dojo') <> 0 then
    raise exception 'onboarding documents leaked cross tenant';
  end if;
  if (select count(*) from public.client_onboarding_packs where client_id = 'org_hacker_dojo') <> 0 then
    raise exception 'onboarding pack row leaked cross tenant';
  end if;
end $$;
reset role;

rollback;
