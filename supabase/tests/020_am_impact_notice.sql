-- donation_link HTTPS check + ImpactNotice tenant isolation.
-- Synthetic identities only. Does not authorize a live gift or mark READY.
begin;

insert into public.clients (id, slug, display_name, state)
values ('org_am_notice', 'am-notice', 'Allocation Notice Client', 'active')
on conflict (id) do update set state = 'active';

update public.clients
set donation_link = 'https://www.every.org/hacker-dojo'
where id = 'org_hacker_dojo';

do $$
begin
  begin
    update public.clients
    set donation_link = 'http://insecure.example/give'
    where id = 'org_hacker_dojo';
    raise exception 'http donation_link was accepted';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 'http donation_link was accepted' then raise; end if;
  end;
end $$;

insert into public.am_gifts (
  charge_id, client_id, campaign_key, program_key, net_cents, gross_cents,
  currency, donated_at, source
) values
  ('fixture-hd-notice-001', 'org_hacker_dojo', 'hacker-dojo-420k', 'community-hardware-fund',
   10000, 10000, 'USD', '2026-08-01T00:00:00Z', 'fixture'),
  ('fixture-other-notice-001', 'org_am_notice', 'other-campaign', 'other-program',
   5000, 5000, 'USD', '2026-08-01T00:00:00Z', 'fixture');

insert into public.am_gift_contacts (charge_id, client_id, email, donor_principal)
values ('fixture-hd-notice-001', 'org_hacker_dojo', 'donor@example.invalid', 'donor_hd');

insert into public.am_allocations (
  id, client_id, campaign_key, program_key, amount_cents, purpose, status,
  approved_at, approved_by
) values
  ('alloc-hd-notice-1', 'org_hacker_dojo', 'hacker-dojo-420k', 'community-hardware-fund',
   100, 'HD notice row', 'approved', '2026-08-01T00:00:00Z', 'director@example.invalid'),
  ('alloc-other-notice-1', 'org_am_notice', 'other-campaign', 'other-program',
   100, 'Other notice row', 'approved', '2026-08-01T00:00:00Z', 'other@example.invalid');

insert into public.am_impact_notices (
  id, client_id, allocation_id, evidence_id, proof_waived, channel,
  donation_link, use_summary, charge_id, created_at
) values
  ('16c2e191-3000-4000-8000-000000000001', 'org_hacker_dojo', 'alloc-hd-notice-1',
   null, true, 'in_app', 'https://www.every.org/hacker-dojo',
   'Kitchen renovation materials for the community lab.',
   'fixture-hd-notice-001', '2026-08-15T18:00:00Z'),
  ('26c2e191-3000-4000-8000-000000000001', 'org_am_notice', 'alloc-other-notice-1',
   null, true, 'in_app', 'https://example.com/other-fundraiser',
   'Other tenant use summary.',
   'fixture-other-notice-001', '2026-08-15T18:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);

do $$
begin
  if not exists (select 1 from public.am_impact_notices where client_id = 'org_hacker_dojo') then
    raise exception 'HD director cannot read own ImpactNotice';
  end if;
  if exists (select 1 from public.am_impact_notices where client_id = 'org_am_notice') then
    raise exception 'HD director saw another tenant ImpactNotice';
  end if;
  if exists (select 1 from public.am_gift_contacts where client_id = 'org_am_notice') then
    raise exception 'HD director saw another tenant gift contact';
  end if;
  begin
    insert into public.am_impact_notices (
      id, client_id, allocation_id, proof_waived, channel, donation_link, use_summary
    ) values (
      '36c2e191-3000-4000-8000-000000000001', 'org_hacker_dojo', 'alloc-hd-notice-1',
      true, 'email', 'https://www.every.org/hacker-dojo', 'Should fail unique or RLS'
    );
    raise exception 'authenticated inserted an ImpactNotice';
  exception
    when insufficient_privilege then null;
    when unique_violation then
      raise exception 'authenticated reached unique before RLS deny';
    when others then
      if sqlerrm = 'authenticated inserted an ImpactNotice' then raise; end if;
  end;
end $$;

reset role;
rollback;
