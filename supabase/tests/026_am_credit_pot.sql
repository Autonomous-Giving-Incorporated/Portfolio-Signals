-- Atomic pot credit. Synthetic only. Not READY. Not a live gift.
begin;

do $$
begin
  if has_function_privilege('anon', 'public.am_credit_pot(text,text,text,bigint)', 'execute')
    or has_function_privilege('authenticated', 'public.am_credit_pot(text,text,text,bigint)', 'execute') then
    raise exception 'am_credit_pot is executable outside service_role';
  end if;
  if not has_function_privilege('service_role', 'public.am_credit_pot(text,text,text,bigint)', 'execute') then
    raise exception 'service_role cannot execute am_credit_pot';
  end if;
end $$;

insert into public.clients (id, slug, display_name, state)
values ('org_hacker_dojo', 'hacker-dojo', 'Hacker Dojo', 'active')
on conflict (id) do update set state = 'active';

do $$
declare
  v_credited bigint;
  v_inserted boolean;
begin
  select credited_cents, inserted into strict v_credited, v_inserted
  from public.am_credit_pot('org_hacker_dojo', 'atomic-rmw', 'undesignated', 1000);
  if v_credited <> 1000 or v_inserted is not true then
    raise exception 'first credit should insert 1000: % %', v_credited, v_inserted;
  end if;

  select credited_cents, inserted into strict v_credited, v_inserted
  from public.am_credit_pot('org_hacker_dojo', 'atomic-rmw', 'undesignated', 1500);
  if v_credited <> 2500 or v_inserted is not false then
    raise exception 'second credit should increment to 2500: % %', v_credited, v_inserted;
  end if;
end $$;

do $$
begin
  begin
    perform public.am_credit_pot('org_hacker_dojo', 'atomic-rmw', 'undesignated', 0);
    raise exception 'zero increment was accepted';
  exception
    when others then
      if sqlerrm = 'zero increment was accepted' then raise; end if;
  end;
  begin
    perform public.am_credit_pot('org_hacker_dojo', 'atomic-rmw', 'undesignated', -5);
    raise exception 'negative increment was accepted';
  exception
    when others then
      if sqlerrm = 'negative increment was accepted' then raise; end if;
  end;
end $$;

rollback;
