-- AGI-003: authoritative workspace context and audited administration.
begin;

insert into public.clients(id, slug, display_name, state)
values ('org_context_other', 'context-other', 'Context Other', 'active');
insert into public.client_memberships(client_id, user_id, role)
values ('org_context_other', '00000000-0000-0000-0000-000000000102', 'director');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
declare v_context jsonb;
begin
  v_context := public.get_workspace_context();
  if (v_context->>'is_master_admin')::boolean then raise exception 'director incorrectly marked master admin'; end if;
  if jsonb_array_length(v_context->'clients') <> 1 then raise exception 'director workspace context leaked another client'; end if;
  if v_context->'clients'->0->>'id' <> 'org_hacker_dojo' then raise exception 'wrong selected client context'; end if;

  begin
    update public.client_memberships set role = 'auditor'
    where client_id = 'org_hacker_dojo' and user_id = auth.uid();
    raise exception 'direct membership update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  perform public.set_client_membership(
    'org_hacker_dojo', '00000000-0000-0000-0000-000000000103', 'auditor', true,
    'Director assigns an auditor'
  );

  begin
    perform public.set_client_membership(
      'org_context_other', '00000000-0000-0000-0000-000000000103', 'auditor', true,
      'Cross client mutation attempt'
    );
    raise exception 'cross-client membership mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-client membership mutation unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%client_director_required%' then raise; end if;
  end;

  begin
    perform public.set_client_membership(
      'org_hacker_dojo', '00000000-0000-0000-0000-000000000101', 'auditor', false,
      'Attempt to remove final director'
    );
    raise exception 'last director removal unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'last director removal unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%last_client_director_required%' then raise; end if;
  end;
end $$;

reset role;
insert into public.platform_administrators(user_id, appointed_by, rationale)
values (
  '00000000-0000-0000-0000-000000000106',
  '00000000-0000-0000-0000-000000000101',
  'Synthetic master administrator acceptance test'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
declare v_context jsonb;
begin
  v_context := public.get_workspace_context();
  if not (v_context->>'is_master_admin')::boolean then raise exception 'master admin context missing'; end if;
  if jsonb_array_length(v_context->'clients') < 2 then raise exception 'master admin cannot enumerate client shells'; end if;

  perform public.provision_client(
    'org_context_new', 'context-new', 'Context New',
    '00000000-0000-0000-0000-000000000104',
    'Acceptance test client provisioning'
  );
  if public.is_client_member('org_context_new') then raise exception 'provisioning granted master client membership'; end if;
end $$;

reset role;
rollback;
