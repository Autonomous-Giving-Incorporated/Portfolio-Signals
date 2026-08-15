-- Allocation host tenant isolation + write-role tightening.
-- Synthetic identities only. Does not authorize a live gift.
begin;

insert into public.clients (id, slug, display_name, state)
values ('org_am_isolation', 'am-isolation', 'Allocation Isolation Client', 'active')
on conflict (id) do update set state = 'active';

insert into public.am_gifts (
  charge_id, client_id, campaign_key, program_key, net_cents, gross_cents,
  currency, donated_at, source
) values
  ('fixture-hd-iso-001', 'org_hacker_dojo', 'hacker-dojo-420k', 'community-hardware-fund',
   10000, 10000, 'USD', '2026-08-01T00:00:00Z', 'fixture'),
  ('fixture-other-iso-001', 'org_am_isolation', 'other-campaign', 'other-program',
   5000, 5000, 'USD', '2026-08-01T00:00:00Z', 'fixture');

insert into public.am_allocations (
  id, client_id, campaign_key, program_key, amount_cents, purpose, status,
  approved_at, approved_by
) values
  ('alloc-hd-iso-1', 'org_hacker_dojo', 'hacker-dojo-420k', 'community-hardware-fund',
   100, 'HD isolation row', 'approved', '2026-08-01T00:00:00Z', 'director@example.invalid'),
  ('alloc-other-iso-1', 'org_am_isolation', 'other-campaign', 'other-program',
   100, 'Other isolation row', 'approved', '2026-08-01T00:00:00Z', 'other@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if not exists (select 1 from public.am_gifts where client_id = 'org_hacker_dojo') then
    raise exception 'HD director cannot read own gifts';
  end if;
  if exists (select 1 from public.am_gifts where client_id = 'org_am_isolation') then
    raise exception 'HD director saw another tenant gift';
  end if;
  if exists (select 1 from public.am_allocations where client_id = 'org_am_isolation') then
    raise exception 'HD director saw another tenant allocation';
  end if;
end $$;

do $$
begin
  insert into public.am_allocations (
    id, client_id, campaign_key, program_key, amount_cents, purpose, status,
    approved_at, approved_by
  ) values (
    'alloc-hd-iso-write', 'org_hacker_dojo', 'hacker-dojo-420k', 'community-hardware-fund',
    250, 'Director write allowed', 'approved', now(), 'director@example.invalid'
  );
exception
  when others then
    raise exception 'HD director insert should succeed: %', sqlerrm;
end $$;

do $$
begin
  begin
    insert into public.am_allocations (
      id, client_id, campaign_key, program_key, amount_cents, purpose, status,
      approved_at, approved_by
    ) values (
      'alloc-cross-iso-write', 'org_am_isolation', 'other-campaign', 'other-program',
      250, 'Cross-tenant write', 'approved', now(), 'director@example.invalid'
    );
    raise exception 'HD director wrote into another tenant';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'HD director wrote into another tenant' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if not exists (select 1 from public.am_gifts where client_id = 'org_hacker_dojo') then
    raise exception 'HD member cannot read own gifts';
  end if;
  begin
    insert into public.am_allocations (
      id, client_id, campaign_key, program_key, amount_cents, purpose, status,
      approved_at, approved_by
    ) values (
      'alloc-dev-iso-write', 'org_hacker_dojo', 'hacker-dojo-420k', 'community-hardware-fund',
      250, 'Development must not allocate', 'approved', now(), 'development@example.invalid'
    );
    raise exception 'development role inserted an allocation';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'development role inserted an allocation' then raise; end if;
  end;
end $$;

reset role;
rollback;
