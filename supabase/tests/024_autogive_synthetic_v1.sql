-- AutoGive Synthetic Dataset v1 acceptance. Requires npm run seed:synthetic first.
-- SYNTHETIC_ONLY. Disposable database. Does not authorize outreach or OBSERVED claims.

begin;

do $$
begin
  if not exists (select 1 from public.clients where id = 'org_synthetic_civic_forge' and reference_tenant = false) then
    raise exception 'synthetic tenant missing — run npm run seed:synthetic';
  end if;
  if (select count(*) from public.client_memberships where client_id = 'org_synthetic_civic_forge') <> 6 then
    raise exception 'expected 6 synthetic memberships';
  end if;
  if (select count(*) from public.constituents where client_id = 'org_synthetic_civic_forge') <> 100 then
    raise exception 'expected 100 synthetic constituents';
  end if;
  if (select count(*) from public.am_gifts where client_id = 'org_synthetic_civic_forge') <> 438 then
    raise exception 'expected 438 synthetic gifts';
  end if;
  if exists (select 1 from public.am_gifts where client_id = 'org_synthetic_civic_forge' and source <> 'fixture') then
    raise exception 'synthetic gifts must use source=fixture';
  end if;
  if exists (
    select 1 from public.am_gifts
    where client_id = 'org_synthetic_civic_forge'
      and charge_id not like 'fixture-%'
  ) then
    raise exception 'synthetic charge_id must stay fixture-prefixed';
  end if;
  if not exists (select 1 from public.am_allocations where id = 'alloc_community_hardware' and client_id = 'org_synthetic_civic_forge') then
    raise exception 'public allocation id alloc_community_hardware missing';
  end if;
  if exists (select 1 from public.am_allocations where id = 'alloc_community_programs' and client_id = 'org_synthetic_civic_forge') then
    raise exception 'agent-proposed alloc_community_programs must not be auto-approved';
  end if;
  if exists (
    select 1 from public.constituents
    where client_id = 'org_synthetic_civic_forge'
      and (
        source_receipt->>'provenance' = 'OBSERVED'
        or source_receipt->>'classification' = 'OBSERVED'
        or source_receipt->>'claim_label' = 'OBSERVED'
      )
  ) then
    raise exception 'synthetic constituent receipt looks OBSERVED';
  end if;
  if (select credited_cents from public.am_pots
      where client_id = 'org_synthetic_civic_forge'
        and program_key = 'community-hardware-fund') <> 9091000 then
    raise exception 'hardware pot credited_cents drifted from cleared synthetic gifts';
  end if;
  if (select allocated_cents from public.am_pots
      where client_id = 'org_synthetic_civic_forge'
        and program_key = 'community-hardware-fund') <> 7200000 then
    raise exception 'hardware pot allocated_cents drifted';
  end if;
  if exists (
    select 1 from public.am_pots
    where client_id = 'org_synthetic_civic_forge'
      and program_key in ('facility-resilience', 'community-programs')
  ) then
    raise exception 'restricted pots without cleared gifts must not be created';
  end if;
  if (select count(*) from public.constituents
      where client_id = 'org_synthetic_civic_forge' and consent_status = 'suppressed') < 1 then
    raise exception 'suppressed synthetic contacts missing';
  end if;
end $$;

-- HD director cannot read Civic Forge rows (edge tenant isolation).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if exists (select 1 from public.am_gifts where client_id = 'org_synthetic_civic_forge') then
    raise exception 'HD director saw Civic Forge gifts';
  end if;
  if exists (select 1 from public.constituents where client_id = 'org_synthetic_civic_forge') then
    raise exception 'HD director saw Civic Forge constituents';
  end if;
end $$;

reset role;

-- Civic Forge director can read own gifts; board viewer cannot read constituents.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0821-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if not exists (select 1 from public.am_gifts where client_id = 'org_synthetic_civic_forge') then
    raise exception 'Civic Forge director cannot read own gifts';
  end if;
  if not exists (select 1 from public.constituents where client_id = 'org_synthetic_civic_forge' and external_id = 'donor_syn_0011' and consent_status = 'suppressed') then
    raise exception 'suppressed donor_syn_0011 missing for director';
  end if;
end $$;

do $$
begin
  insert into public.am_allocations (
    id, client_id, campaign_key, program_key, amount_cents, purpose, status,
    approved_at, approved_by
  ) values (
    'alloc_synthetic_director_ok', 'org_synthetic_civic_forge',
    'cmp_synthetic_builder_fund_2026', 'undesignated',
    100, 'Director write allowed', 'approved', now(), 'director@example.test'
  );
exception
  when others then
    raise exception 'Civic Forge director insert should succeed: %', sqlerrm;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0821-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal1', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if exists (select 1 from public.constituents where client_id = 'org_synthetic_civic_forge') then
    raise exception 'board viewer read constituents';
  end if;
end $$;

do $$
begin
  begin
    insert into public.am_allocations (
      id, client_id, campaign_key, program_key, amount_cents, purpose, status,
      approved_at, approved_by
    ) values (
      'alloc_synthetic_agent_denied', 'org_synthetic_civic_forge',
      'cmp_synthetic_builder_fund_2026', 'undesignated',
      100, 'Viewer must not approve', 'approved', now(), 'agent'
    );
    raise exception 'board viewer approved an allocation';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'board viewer approved an allocation' then raise; end if;
  end;
end $$;

reset role;

-- finance_approver maps to director; program_manager maps to campaign_lead.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0821-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  insert into public.am_allocations (
    id, client_id, campaign_key, program_key, amount_cents, purpose, status,
    approved_at, approved_by
  ) values (
    'alloc_synthetic_finance_ok', 'org_synthetic_civic_forge',
    'cmp_synthetic_builder_fund_2026', 'undesignated',
    100, 'Finance approver write allowed', 'approved', now(), 'finance@example.test'
  );
exception
  when others then
    raise exception 'Civic Forge finance_approver insert should succeed: %', sqlerrm;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0821-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if not exists (select 1 from public.am_gifts where client_id = 'org_synthetic_civic_forge') then
    raise exception 'Civic Forge campaign_lead cannot read gifts';
  end if;
  insert into public.am_allocations (
    id, client_id, campaign_key, program_key, amount_cents, purpose, status,
    approved_at, approved_by
  ) values (
    'alloc_synthetic_program_ok', 'org_synthetic_civic_forge',
    'cmp_synthetic_builder_fund_2026', 'undesignated',
    100, 'Program manager write allowed', 'approved', now(), 'program@example.test'
  );
exception
  when others then
    raise exception 'Civic Forge program_manager insert should succeed: %', sqlerrm;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0821-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if not exists (select 1 from public.constituents where client_id = 'org_synthetic_civic_forge') then
    raise exception 'Civic Forge data_steward cannot read constituents';
  end if;
  begin
    insert into public.am_allocations (
      id, client_id, campaign_key, program_key, amount_cents, purpose, status,
      approved_at, approved_by
    ) values (
      'alloc_synthetic_steward_denied', 'org_synthetic_civic_forge',
      'cmp_synthetic_builder_fund_2026', 'undesignated',
      100, 'Steward must not approve', 'approved', now(), 'reviewer@example.test'
    );
    raise exception 'data_steward approved an allocation';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'data_steward approved an allocation' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0821-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if not exists (select 1 from public.constituents where client_id = 'org_synthetic_civic_forge') then
    raise exception 'Civic Forge development cannot read constituents';
  end if;
  begin
    insert into public.am_allocations (
      id, client_id, campaign_key, program_key, amount_cents, purpose, status,
      approved_at, approved_by
    ) values (
      'alloc_synthetic_analyst_denied', 'org_synthetic_civic_forge',
      'cmp_synthetic_builder_fund_2026', 'undesignated',
      100, 'Analyst must not approve', 'approved', now(), 'analyst@example.test'
    );
    raise exception 'development approved an allocation';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'development approved an allocation' then raise; end if;
  end;
end $$;

reset role;

-- Duplicate gift is idempotent; overallocation cannot land on a pot.
do $$
declare
  v_before int;
  v_after int;
begin
  select count(*) into v_before from public.am_gifts where charge_id = 'fixture-gift_syn_00037';
  insert into public.am_gifts (
    charge_id, client_id, campaign_key, program_key, net_cents, gross_cents,
    currency, donated_at, source
  ) values (
    'fixture-gift_syn_00037', 'org_synthetic_civic_forge',
    'cmp_synthetic_builder_fund_2026', 'undesignated',
    1, 1, 'USD', '2026-08-21T00:00:00Z', 'fixture'
  )
  on conflict (charge_id) do nothing;
  select count(*) into v_after from public.am_gifts where charge_id = 'fixture-gift_syn_00037';
  if v_before <> 1 or v_after <> 1 then
    raise exception 'duplicate provider event was not idempotent';
  end if;
end $$;

do $$
begin
  begin
    update public.am_pots
      set allocated_cents = credited_cents + 1
      where client_id = 'org_synthetic_civic_forge'
        and program_key = 'community-hardware-fund';
    raise exception 'restricted pot accepted overallocation';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 'restricted pot accepted overallocation' then raise; end if;
  end;
end $$;

rollback;
