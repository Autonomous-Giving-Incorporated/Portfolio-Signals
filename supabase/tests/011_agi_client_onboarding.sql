-- AGI-006: onboarding activation gate and authority isolation.
begin;

insert into public.clients(id, slug, display_name, state)
values
  ('org_onboarding_ready', 'onboarding-ready', 'Onboarding Ready', 'provisioning'),
  ('org_onboarding_missing', 'onboarding-missing', 'Onboarding Missing', 'provisioning');
insert into public.client_memberships(client_id, user_id, role)
values
  ('org_onboarding_ready', '00000000-0000-0000-0000-000000000101', 'director'),
  ('org_onboarding_missing', '00000000-0000-0000-0000-000000000101', 'director');
insert into public.client_config_versions(client_id, version, state, config, published_at)
values (
  'org_onboarding_ready', 1, 'published',
  jsonb_build_object(
    'organization_name', 'Onboarding Ready',
    'product_name', 'Fundraising Workspace',
    'campaign_title', 'Ready campaign',
    'campaign_tagline', 'Ready for governed activation.',
    'modules', jsonb_build_object('sponsors', true, 'grants', false),
    'theme', jsonb_build_object('primary', '#112233', 'accent', '#445566', 'background', '#778899'),
    'assets', jsonb_build_object('logo_path', null, 'icon_path', null, 'hero_path', null)
  ), now()
);
insert into public.platform_administrators(user_id, appointed_by, rationale)
values ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000101', 'Synthetic onboarding activation administrator');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
begin
  begin
    perform public.activate_client('org_onboarding_ready', 'Director attempts platform activation');
    raise exception 'tenant director activation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'tenant director activation unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%master_admin_required%' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000106', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
declare v_client public.clients;
begin
  begin
    perform public.activate_client('org_onboarding_missing', 'Attempt activation without published configuration');
    raise exception 'client without configuration unexpectedly activated';
  exception when others then
    if sqlerrm = 'client without configuration unexpectedly activated' then raise; end if;
    if sqlerrm not like '%published_client_configuration_required%' then raise; end if;
  end;

  v_client := public.activate_client('org_onboarding_ready', 'Master administrator completes governed onboarding');
  if v_client.state <> 'active' then raise exception 'ready client was not activated'; end if;
  if not exists (
    select 1 from public.client_audit_log
    where client_id = 'org_onboarding_ready' and action = 'client_onboarding_completed'
  ) then raise exception 'onboarding activation audit event missing'; end if;

  begin
    perform public.activate_client('org_onboarding_ready', 'Repeat activation should fail closed');
    raise exception 'repeat activation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'repeat activation unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%provisioning_client_required%' then raise; end if;
  end;
end $$;
reset role;
rollback;
