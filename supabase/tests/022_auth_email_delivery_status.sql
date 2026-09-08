-- Resend delivery feedback loop for auth-email dispatch (migration 20260821223000).
-- Verifies record_auth_email_delivery updates by provider message id, validates
-- inputs, tolerates unknown ids, and stays service-role only.
begin;

-- Non-service roles must not be able to record delivery outcomes.
do $$
begin
  if has_function_privilege(
    'anon', 'public.record_auth_email_delivery(text,text,timestamptz)', 'execute'
  ) or has_function_privilege(
    'authenticated', 'public.record_auth_email_delivery(text,text,timestamptz)', 'execute'
  ) then raise exception 'non-service role can record auth email delivery'; end if;
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_id uuid;
  v_updated integer;
begin
  -- Open + complete a dispatch so there is a provider message id to match.
  v_id := public.begin_auth_email_dispatch(repeat('d', 64), 'platform_admin_magic_link');
  if v_id is null then raise exception 'setup dispatch was rejected'; end if;
  perform public.complete_auth_email_dispatch(v_id, 'sent', 'msg_delivery_test');

  -- A matching delivery event updates exactly one row.
  v_updated := public.record_auth_email_delivery('msg_delivery_test', 'delivered', now());
  if v_updated <> 1 then raise exception 'delivered event did not update the dispatch (rows=%)', v_updated; end if;
  if (select delivery_status from public.auth_email_dispatches where id = v_id) <> 'delivered' then
    raise exception 'delivery_status was not persisted';
  end if;

  -- A later complaint supersedes the prior outcome.
  perform public.record_auth_email_delivery('msg_delivery_test', 'complained', now());
  if (select delivery_status from public.auth_email_dispatches where id = v_id) <> 'complained' then
    raise exception 'later delivery event did not supersede';
  end if;

  -- Unknown provider id is a no-op (0 rows), not an error.
  if public.record_auth_email_delivery('msg_unknown', 'bounced', now()) <> 0 then
    raise exception 'unknown provider id unexpectedly matched a row';
  end if;

  -- Invalid status is rejected.
  begin
    perform public.record_auth_email_delivery('msg_delivery_test', 'exploded', now());
    raise exception 'invalid delivery status was accepted';
  exception when others then
    if sqlerrm not like '%invalid_delivery_status%' then
      raise exception 'unexpected error for invalid status: %', sqlerrm;
    end if;
  end;
end $$;

reset role;
rollback;

-- Provenance: auth-email hardening — Resend delivery feedback loop
