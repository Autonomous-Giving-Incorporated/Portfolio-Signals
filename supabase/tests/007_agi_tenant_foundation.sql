-- AGI-002 shared-tenant acceptance. Synthetic identities only.
begin;

insert into public.clients (id, slug, display_name, state)
values ('org_other_makerspace', 'other-makerspace', 'Other Makerspace', 'active');

insert into public.client_memberships (client_id, user_id, role) values
  ('org_hacker_dojo', '00000000-0000-0000-0000-000000000101', 'director'),
  ('org_hacker_dojo', '00000000-0000-0000-0000-000000000106', 'auditor'),
  ('org_other_makerspace', '00000000-0000-0000-0000-000000000102', 'director');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

do $$
begin
  if public.current_client_role('org_hacker_dojo') <> 'director' then
    raise exception 'Hacker Dojo director membership missing';
  end if;
  if public.current_client_role('org_other_makerspace') is not null then
    raise exception 'cross-tenant role leaked';
  end if;
  if (select count(*) from public.clients) <> 1 then
    raise exception 'director can enumerate another client';
  end if;
  if (select count(*) from public.client_memberships) <> 2 then
    raise exception 'director can enumerate another client membership';
  end if;
end $$;

do $$
begin
  begin
    perform public.provision_client(
      'org_forbidden', 'forbidden', 'Forbidden Client',
      '00000000-0000-0000-0000-000000000101', 'unauthorized provisioning attempt'
    );
    raise exception 'non-master provision unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'non-master provision unexpectedly succeeded' then raise; end if;
  end;
end $$;

reset role;
rollback;

