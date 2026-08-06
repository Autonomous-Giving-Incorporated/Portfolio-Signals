-- scripts/platform/verify-platform-isolation.sql
-- Platform isolation checks for AGI multi-tenant foundation.
--
-- Run as postgres (Dashboard SQL / service role) after migrations 012+.
-- Expect: org_hacker_dojo (reference tenant from 012); second synthetic tenant
-- org_platform_isolation for isolation fixtures.
--
-- Manual RLS check: as a director-only user of one tenant, select * from
-- public.clients must not return the other tenant. Patterns under auth.uid()
-- context: supabase/tests/007_agi_tenant_foundation.sql
--
-- No secrets belong in this file.

-- Reference tenant from migration 012_agi_tenant_foundation.sql
select id, slug, display_name, state, reference_tenant
from public.clients
where id = 'org_hacker_dojo';

-- Second synthetic tenant for isolation verification (not a reference tenant).
insert into public.clients (id, slug, display_name, state, reference_tenant)
values (
  'org_platform_isolation',
  'platform-isolation',
  'Platform Isolation Fixture',
  'active',
  false
)
on conflict (id) do nothing;

select count(*) as client_count from public.clients;

select id, slug, display_name, state, reference_tenant
from public.clients
where id in ('org_hacker_dojo', 'org_platform_isolation')
order by id;

-- Expect at least two clients after insert (reference + isolation fixture).
do $$
declare
  v_count integer;
  v_ref boolean;
begin
  select count(*) into v_count
  from public.clients
  where id in ('org_hacker_dojo', 'org_platform_isolation');

  if v_count < 2 then
    raise exception 'isolation fixture incomplete: expected org_hacker_dojo and org_platform_isolation';
  end if;

  select reference_tenant into v_ref
  from public.clients
  where id = 'org_hacker_dojo';

  if v_ref is not true then
    raise exception 'org_hacker_dojo must be reference_tenant = true (migration 012)';
  end if;

  select reference_tenant into v_ref
  from public.clients
  where id = 'org_platform_isolation';

  if v_ref is true then
    raise exception 'org_platform_isolation must not be a reference tenant';
  end if;

  raise notice 'platform isolation fixtures present (client pair ok)';
end
$$;

-- ---------------------------------------------------------------------------
-- Manual RLS isolation (optional; requires synthetic memberships + JWT sub)
-- Mirror of supabase/tests/007_agi_tenant_foundation.sql under auth context:
--
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '<director-only-user-uuid>', true);
--
--   -- director of org_hacker_dojo must NOT see org_platform_isolation:
--   select id from public.clients;  -- expect only membership tenants (+ master_admin sees all)
--
--   reset role;
-- ---------------------------------------------------------------------------
