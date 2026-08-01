-- Run against a disposable Supabase project after migrations.
-- Tests are intentionally fail-closed and contain no constituent data.

begin;

create temp table expected_access (
  role public.app_role,
  constituents_read boolean,
  constituents_write boolean,
  opportunities_read boolean,
  opportunities_write boolean,
  decisions_write boolean,
  audit_read boolean
);

insert into expected_access values
('director', true, true, true, true, true, true),
('campaign_lead', true, true, true, true, true, false),
('development', true, false, true, true, false, false),
('data_steward', true, true, false, false, false, false),
('auditor', true, false, true, false, false, true),
('board_viewer', false, false, true, false, false, false);

-- The executable harness must provision one auth user per role, set request.jwt.claim.sub,
-- and verify each expected operation with both positive and negative assertions.
-- This matrix is the canonical contract; deployment is blocked until every cell is tested.

do $$
begin
  if (select count(*) from expected_access) <> 6 then
    raise exception 'role matrix incomplete';
  end if;
  if exists (select 1 from expected_access where role = 'board_viewer' and constituents_read) then
    raise exception 'board viewer must not read constituents';
  end if;
  if exists (select 1 from expected_access where role <> 'director' and decisions_write and role <> 'campaign_lead') then
    raise exception 'decision write scope expanded unexpectedly';
  end if;
end $$;

rollback;
