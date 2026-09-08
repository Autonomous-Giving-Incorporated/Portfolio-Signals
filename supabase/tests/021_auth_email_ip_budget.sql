-- Durable per-source (hashed IP) budget for auth-email dispatch (migration
-- 20260821221500). Verifies one hashed IP cannot exhaust the anonymous budget,
-- sources are isolated, null hashes preserve prior behavior, and malformed
-- hashes are rejected.
begin;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_ip text := repeat('b', 64);
  v_id uuid;
  i int;
begin
  -- 10 dispatches from one hashed IP (distinct recipients) are allowed.
  for i in 1..10 loop
    v_id := public.begin_auth_email_dispatch(
      lpad(to_hex(i), 64, '0'), 'tenant_member_magic_link', null, null, null, v_ip
    );
    if v_id is null then
      raise exception 'per-source budget rejected dispatch % before its ceiling', i;
    end if;
  end loop;

  -- The 11th from the same hashed IP is rejected despite a fresh recipient.
  if public.begin_auth_email_dispatch(
    lpad(to_hex(9999), 64, '0'), 'tenant_member_magic_link', null, null, null, v_ip
  ) is not null then
    raise exception 'per-source budget did not cap a single hashed IP';
  end if;

  -- A different source is unaffected by another source's exhausted budget.
  if public.begin_auth_email_dispatch(
    lpad(to_hex(10001), 64, '0'), 'tenant_member_magic_link', null, null, null, repeat('c', 64)
  ) is null then
    raise exception 'per-source budget leaked across distinct hashed IPs';
  end if;

  -- Null IP hash preserves prior behavior (no per-source cap applied).
  if public.begin_auth_email_dispatch(
    lpad(to_hex(20001), 64, '0'), 'tenant_member_magic_link', null, null, null, null
  ) is null then
    raise exception 'null request_ip_hash unexpectedly hit a per-source cap';
  end if;

  -- Malformed IP hash is rejected before any dispatch is recorded.
  begin
    perform public.begin_auth_email_dispatch(
      lpad(to_hex(30001), 64, '0'), 'tenant_member_magic_link', null, null, null, 'not-a-sha'
    );
    raise exception 'malformed request_ip_hash was accepted';
  exception when others then
    if sqlerrm not like '%request_ip_hash_invalid%' then
      raise exception 'unexpected error for malformed request_ip_hash: %', sqlerrm;
    end if;
  end;
end $$;

-- The dispatch ledger stores only the hash column, never a raw address.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'auth_email_dispatches'
      and column_name = 'request_ip_hash'
  ) then raise exception 'request_ip_hash column missing'; end if;
end $$;

reset role;
rollback;

-- Provenance: auth-email hardening — durable per-source dispatch budget
