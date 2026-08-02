begin;

insert into public.clients (id, slug, display_name, state) values
  ('org_jwt_active', 'jwt-active', 'JWT Active', 'active'),
  ('org_jwt_suspended', 'jwt-suspended', 'JWT Suspended', 'suspended');

insert into public.client_memberships (client_id, user_id, role, active) values
  ('org_jwt_active', '00000000-0000-0000-0000-000000000101', 'campaign_lead', true),
  ('org_jwt_suspended', '00000000-0000-0000-0000-000000000101', 'director', true),
  ('org_hacker_dojo', '00000000-0000-0000-0000-000000000101', 'auditor', false)
on conflict (client_id, user_id) do update
set role = excluded.role, active = excluded.active;

do $$
declare
  result jsonb;
  memberships jsonb;
begin
  result := public.agi_custom_access_token_hook(jsonb_build_object(
    'user_id', '00000000-0000-0000-0000-000000000101',
    'claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000101')
  ));
  memberships := result #> '{claims,client_memberships}';

  if jsonb_array_length(memberships) <> 1 then
    raise exception 'expected exactly one active membership claim, got %', memberships;
  end if;
  if memberships #>> '{0,client_id}' <> 'org_jwt_active'
     or memberships #>> '{0,role}' <> 'campaign_lead' then
    raise exception 'unexpected signed membership claim: %', memberships;
  end if;
  if result #>> '{claims,sub}' <> '00000000-0000-0000-0000-000000000101' then
    raise exception 'hook replaced an existing claim';
  end if;
end $$;

rollback;
