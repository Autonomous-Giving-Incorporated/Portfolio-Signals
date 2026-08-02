-- AGI-009: final two-tenant configuration, RLS, and JWT claim acceptance.
begin;

insert into public.clients (id, slug, display_name, state)
values ('org_second_tenant', 'second-tenant', 'Second Tenant', 'active');

insert into public.client_memberships (client_id, user_id, role, active)
values ('org_second_tenant', '00000000-0000-0000-0000-000000000102', 'director', true)
on conflict (client_id, user_id) do update
set role = excluded.role, active = true;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
declare
  v_config jsonb := jsonb_build_object(
    'organization_name', 'Second Tenant',
    'product_name', 'A.G.I. Campaign Control',
    'campaign_title', 'Second tenant independent campaign',
    'campaign_tagline', 'An isolated public tenant projection.',
    'modules', jsonb_build_object('sponsors', false, 'grants', true),
    'approvals', jsonb_build_object('decision_approvers', 2),
    'theme', jsonb_build_object('primary', '#16325C', 'accent', '#19734A', 'background', '#F5F7FB'),
    'assets', jsonb_build_object('logo_path', null, 'icon_path', null, 'hero_path', null)
  );
  v_draft public.client_config_versions;
begin
  v_draft := public.save_client_config_draft(
    'org_second_tenant', v_config, 'Create isolated second tenant configuration'
  );
  perform public.publish_client_config(v_draft.id, 'Publish isolated second tenant configuration');
end $$;

reset role;
set local role anon;

do $$
declare
  v_hacker_dojo jsonb := public.get_public_client_config('hacker-dojo');
  v_second jsonb := public.get_public_client_config('second-tenant');
begin
  if v_hacker_dojo->>'client_id' <> 'org_hacker_dojo' then
    raise exception 'Hacker Dojo public projection missing';
  end if;
  if v_second->>'client_id' <> 'org_second_tenant' then
    raise exception 'second tenant public projection missing';
  end if;
  if v_hacker_dojo #>> '{config,organization_name}' = v_second #>> '{config,organization_name}' then
    raise exception 'tenant organization branding collapsed into one projection';
  end if;
  if (v_second #>> '{config,modules,sponsors}')::boolean then
    raise exception 'second tenant sponsor module setting was not preserved';
  end if;
  if not (v_second #>> '{config,modules,grants}')::boolean then
    raise exception 'second tenant grant module setting was not preserved';
  end if;
  if (v_second #>> '{config,approvals,decision_approvers}')::integer <> 2 then
    raise exception 'second tenant approval policy was not preserved';
  end if;
end $$;

reset role;

do $$
declare
  v_event jsonb;
  v_memberships jsonb;
begin
  v_event := public.agi_custom_access_token_hook(jsonb_build_object(
    'user_id', '00000000-0000-0000-0000-000000000102',
    'claims', jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000000000102',
      'aud', 'authenticated'
    )
  ));
  v_memberships := v_event #> '{claims,client_memberships}';

  if jsonb_array_length(v_memberships) <> 2 then
    raise exception 'expected two signed active memberships, got %', v_memberships;
  end if;
  if not v_memberships @> '[{"client_id":"org_hacker_dojo","role":"campaign_lead"}]'::jsonb then
    raise exception 'Hacker Dojo signed membership missing: %', v_memberships;
  end if;
  if not v_memberships @> '[{"client_id":"org_second_tenant","role":"director"}]'::jsonb then
    raise exception 'second tenant signed membership missing: %', v_memberships;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

do $$
begin
  if exists (
    select 1 from public.client_config_versions where client_id = 'org_second_tenant'
  ) then
    raise exception 'cross-tenant private configuration unexpectedly visible';
  end if;
  begin
    perform public.save_client_config_draft(
      'org_second_tenant', '{}'::jsonb, 'Attempt cross tenant configuration mutation'
    );
    raise exception 'cross-tenant configuration mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-tenant configuration mutation unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%client_director_required%' then raise; end if;
  end;
end $$;

rollback;
