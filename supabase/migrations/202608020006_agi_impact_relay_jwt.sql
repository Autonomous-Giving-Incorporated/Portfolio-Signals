-- AGI-008: signed tenant membership claims for Impact Relay.
-- Configure public.agi_custom_access_token_hook as the Supabase Auth custom
-- access-token hook. Impact Relay validates the resulting JWT via JWKS and
-- selects only the membership matching its configured tenant_id.

create or replace function public.agi_custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  memberships jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'client_id', m.client_id,
        'role', m.role,
        'membership_version', m.membership_version
      ) order by m.client_id
    ),
    '[]'::jsonb
  )
  into memberships
  from public.client_memberships m
  join public.clients c on c.id = m.client_id
  where m.user_id = (event ->> 'user_id')::uuid
    and m.active
    and c.state = 'active';

  claims := jsonb_set(claims, '{client_memberships}', memberships, true);
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

revoke all on function public.agi_custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.agi_custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.clients, public.client_memberships to supabase_auth_admin;

comment on function public.agi_custom_access_token_hook(jsonb) is
  'Supabase Auth hook that signs active client memberships into short-lived access tokens for Impact Relay.';
