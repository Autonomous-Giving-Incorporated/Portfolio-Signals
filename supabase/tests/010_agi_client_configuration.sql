-- AGI-005: immutable client configuration and governed client assets.
begin;

insert into public.clients(id, slug, display_name, state)
values ('org_config_other', 'config-other', 'Config Other', 'active');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000000','authenticated','authenticated','config-other@example.invalid','',now(),now(),now());
insert into public.profiles (id, display_name, role, active, mfa_enforced)
values ('00000000-0000-0000-0000-000000000201','Config Other Director','director',true,true);
insert into public.client_memberships(client_id, user_id, role)
values ('org_config_other', '00000000-0000-0000-0000-000000000201', 'director');

set local role service_role;
select public.register_client_asset(
  'org_hacker_dojo',
  'org_hacker_dojo/00000000-0000-0000-0000-000000000101/logo.png',
  'logo',
  'Hacker Dojo logo',
  'image/png',
  1024,
  '00000000-0000-0000-0000-000000000101'
);
select public.register_client_asset(
  'org_hacker_dojo',
  'org_hacker_dojo/00000000-0000-0000-0000-000000000101/hero.png',
  'hero',
  'Hacker Dojo hero',
  'image/png',
  2048,
  '00000000-0000-0000-0000-000000000101'
);
reset role;

set local role anon;
do $$
declare v_public jsonb;
begin
  v_public := public.get_public_client_config('hacker-dojo');
  if v_public is null then raise exception 'published config hidden from public'; end if;
  if v_public->>'client_id' <> 'org_hacker_dojo' then raise exception 'wrong public client config'; end if;
  if (select count(*) from public.client_assets) <> 0 then raise exception 'asset metadata leaked to anon'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
declare
  v_config jsonb := jsonb_build_object(
    'organization_name', 'Hacker Dojo',
    'product_name', 'Campaign Control Center',
    'campaign_title', 'Builder room campaign',
    'campaign_tagline', 'Fund the next builder.',
    'modules', jsonb_build_object('sponsors', true, 'grants', false),
    'theme', jsonb_build_object('primary', '#ED1C24', 'accent', '#33D6C5', 'background', '#071725'),
    'assets', jsonb_build_object(
      'logo_path', 'org_hacker_dojo/00000000-0000-0000-0000-000000000101/logo.png',
      'icon_path', null,
      'hero_path', 'org_hacker_dojo/00000000-0000-0000-0000-000000000101/hero.png'
    )
  );
  v_bad_config jsonb := jsonb_set(v_config, '{assets,logo_path}', to_jsonb('org_config_other/00000000-0000-0000-0000-000000000101/logo.png'::text));
  v_bad_modules jsonb := jsonb_set(v_config, '{modules,grants}', to_jsonb('yes'::text));
  v_bad_approvals jsonb := jsonb_set(v_config, '{approvals}', jsonb_build_object('decision_approvers', 3));
  v_draft public.client_config_versions;
  v_second public.client_config_versions;
  v_published public.client_config_versions;
  v_rollback public.client_config_versions;
begin
  if (select count(*) from public.client_assets) <> 2 then raise exception 'client member cannot read asset metadata'; end if;

  begin
    perform public.save_client_config_draft('org_hacker_dojo', v_bad_approvals, 'Draft with invalid approval configuration');
    raise exception 'invalid approval configuration unexpectedly accepted';
  exception when others then
    if sqlerrm = 'invalid approval configuration unexpectedly accepted' then raise; end if;
    if sqlerrm not like '%invalid_client_approval_policy%' then raise; end if;
  end;

  begin
    perform public.save_client_config_draft('org_hacker_dojo', v_bad_modules, 'Draft with invalid module configuration');
    raise exception 'invalid module configuration unexpectedly accepted';
  exception when others then
    if sqlerrm = 'invalid module configuration unexpectedly accepted' then raise; end if;
    if sqlerrm not like '%invalid_client_modules%' then raise; end if;
  end;

  begin
    insert into storage.objects(bucket_id, name, owner_id)
    values ('agi-public-assets', 'org_hacker_dojo/00000000-0000-0000-0000-000000000101/direct.png', auth.uid()::text);
    raise exception 'authenticated direct storage insert unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'authenticated direct storage insert unexpectedly succeeded' then raise; end if;
  end;

  begin
    perform public.register_client_asset(
      'org_hacker_dojo', 'org_hacker_dojo/00000000-0000-0000-0000-000000000101/auth.png',
      'logo', 'Auth upload', 'image/png', 100,
      '00000000-0000-0000-0000-000000000101'
    );
    raise exception 'authenticated asset registration unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'authenticated asset registration unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%permission denied%' then raise; end if;
  end;

  begin
    perform public.save_client_config_draft('org_hacker_dojo', v_bad_config, 'Draft with invalid cross tenant asset path');
    raise exception 'cross-tenant asset path unexpectedly accepted';
  exception when others then
    if sqlerrm = 'cross-tenant asset path unexpectedly accepted' then raise; end if;
    if sqlerrm not like '%invalid_asset_path%' then raise; end if;
  end;

  v_draft := public.save_client_config_draft('org_hacker_dojo', v_config, 'Initial governed draft config');
  if v_draft.state <> 'draft' then raise exception 'new config version is not draft'; end if;
  if (public.get_public_client_config('hacker-dojo')->>'version')::integer = v_draft.version then raise exception 'draft leaked publicly'; end if;

  v_published := public.publish_client_config(v_draft.id, 'Publish governed config');
  if v_published.state <> 'published' or v_published.published_by <> auth.uid() then raise exception 'draft was not published by director'; end if;
  if (public.get_public_client_config('hacker-dojo')->>'version')::integer <> v_published.version then raise exception 'published config not visible publicly'; end if;
  if (public.get_public_client_config('hacker-dojo')#>>'{config,modules,grants}')::boolean then raise exception 'disabled grant module not preserved publicly'; end if;

  begin
    perform public.publish_client_config(v_published.id, 'Republish already published config');
    raise exception 'non-draft publish unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'non-draft publish unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%draft_configuration_required%' then raise; end if;
  end;

  v_second := public.save_client_config_draft(
    'org_hacker_dojo',
    jsonb_set(v_config, '{campaign_title}', to_jsonb('Second governed campaign'::text)),
    'Second governed draft config'
  );
  perform public.publish_client_config(v_second.id, 'Publish second governed config');
  if (select count(*) from public.client_config_versions where client_id = 'org_hacker_dojo' and state = 'published') <> 1 then
    raise exception 'more than one published version after second publish';
  end if;

  v_rollback := public.rollback_client_config('org_hacker_dojo', v_published.version, 'Rollback to first governed config');
  if v_rollback.version <= v_second.version then raise exception 'rollback did not create a new immutable version'; end if;
  if v_rollback.supersedes_version <> v_published.version then raise exception 'rollback source version not recorded'; end if;
  if v_rollback.state <> 'published' then raise exception 'rollback version not published'; end if;
  if (select count(*) from public.client_config_versions where client_id = 'org_hacker_dojo' and state = 'published') <> 1 then
    raise exception 'more than one published version after rollback';
  end if;

  begin
    perform public.save_client_config_draft('org_config_other', v_config, 'Cross tenant draft denial');
    raise exception 'cross-tenant director mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-tenant director mutation unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%client_director_required%' then raise; end if;
  end;
end $$;

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  begin
    perform public.publish_client_config(
      (select id from public.client_config_versions where client_id = 'org_hacker_dojo' and state = 'draft' order by version desc limit 1),
      'Other director publish denial'
    );
    raise exception 'other tenant director publish unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'other tenant director publish unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%client_director_required%' and sqlerrm not like '%configuration_version_not_found%' then raise; end if;
  end;

  if (select count(*) from public.client_assets where client_id = 'org_hacker_dojo') <> 0 then raise exception 'asset metadata leaked cross tenant'; end if;
end $$;

reset role;
rollback;
