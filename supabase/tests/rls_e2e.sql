-- Run after migrations and six_roles.sql in a disposable local project.
\set ON_ERROR_STOP on

create or replace function public.test_set_user(test_user uuid) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

begin;

select public.test_set_user('00000000-0000-0000-0000-000000000101');
do $$ begin
  if public.current_role() <> 'director' then raise exception 'director fixture failed'; end if;
end $$;

select public.test_set_user('00000000-0000-0000-0000-000000000104');
do $$ begin
  if public.current_role() <> 'board_viewer' then raise exception 'board fixture failed'; end if;
end $$;

-- Board viewers must not see constituents.
set local role authenticated;
select public.test_set_user('00000000-0000-0000-0000-000000000104');
do $$
declare n integer;
begin
  select count(*) into n from public.constituents;
  if n <> 0 then raise exception 'board viewer unexpectedly read constituents'; end if;
end $$;

-- Auditors can read audit records but cannot insert them directly.
select public.test_set_user('00000000-0000-0000-0000-000000000106');
do $$
begin
  begin
    insert into public.audit_log(action, entity_type) values ('forbidden','test');
    raise exception 'auditor direct audit insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
