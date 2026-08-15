-- AGI-007: single- and two-person decision approval policies.
begin;

insert into public.clients(id, slug, display_name, state)
values ('org_dual_approval', 'dual-approval', 'Dual Approval', 'active');
insert into public.client_memberships(client_id, user_id, role)
values
  ('org_dual_approval', '00000000-0000-0000-0000-000000000101', 'director'),
  ('org_dual_approval', '00000000-0000-0000-0000-000000000102', 'campaign_lead');
insert into public.client_config_versions(client_id, version, state, config, published_at)
values (
  'org_dual_approval', 1, 'published',
  jsonb_build_object(
    'organization_name', 'Dual Approval', 'product_name', 'Fundraising Workspace',
    'campaign_title', 'Dual approval campaign', 'campaign_tagline', 'Two people decide.',
    'modules', jsonb_build_object('sponsors', true, 'grants', true),
    'approvals', jsonb_build_object('decision_approvers', 2),
    'theme', jsonb_build_object('primary', '#112233', 'accent', '#445566', 'background', '#778899'),
    'assets', jsonb_build_object('logo_path', null, 'icon_path', null, 'hero_path', null)
  ), now()
);
insert into public.decisions(id, client_id, key, title, status)
values
  ('40000000-0000-0000-0000-000000000001', 'org_hacker_dojo', 'agi-single-approval', 'Single approval decision', 'open'),
  ('40000000-0000-0000-0000-000000000002', 'org_dual_approval', 'agi-dual-approval', 'Dual approval decision', 'open'),
  ('40000000-0000-0000-0000-000000000003', 'org_dual_approval', 'agi-direct-update', 'Direct update guard', 'open');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
declare v_decision public.decisions;
begin
  v_decision := public.decide('40000000-0000-0000-0000-000000000001', 'approved', 'Single approver completes this governed decision');
  if v_decision.status <> 'approved' then raise exception 'single approval policy did not finalize'; end if;

  v_decision := public.decide('40000000-0000-0000-0000-000000000002', 'approved', 'First distinct approver records governed approval');
  if v_decision.status <> 'open' then raise exception 'dual approval finalized after first approver'; end if;

  begin
    perform public.decide('40000000-0000-0000-0000-000000000002', 'approved', 'Same approver attempts a duplicate approval');
    raise exception 'duplicate approver unexpectedly counted twice';
  exception when unique_violation then null;
  end;

  begin
    update public.decisions set status = 'approved', rationale = 'Direct update bypass attempt'
    where id = '40000000-0000-0000-0000-000000000003';
    raise exception 'direct terminal update unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'direct terminal update unexpectedly succeeded' then raise; end if;
    if sqlerrm not like '%decision_rpc_required%' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select set_config('request.jwt.claim.exp', (extract(epoch from now())::bigint + 3600)::text, true);
do $$
declare v_decision public.decisions;
begin
  begin
    perform public.decide('40000000-0000-0000-0000-000000000002', 'rejected', 'Second approver attempts conflicting terminal status');
    raise exception 'conflicting approval status unexpectedly accepted';
  exception when others then
    if sqlerrm = 'conflicting approval status unexpectedly accepted' then raise; end if;
    if sqlerrm not like '%approval_status_conflict%' then raise; end if;
  end;

  v_decision := public.decide('40000000-0000-0000-0000-000000000002', 'approved', 'Second distinct approver completes governed approval');
  if v_decision.status <> 'approved' then raise exception 'dual approval did not finalize after second approver'; end if;
  if (select count(*) from public.decision_approvals where decision_id = v_decision.id) <> 2 then
    raise exception 'dual approval evidence count incorrect';
  end if;
end $$;
reset role;
rollback;
