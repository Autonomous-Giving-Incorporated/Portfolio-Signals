-- Tenant source allowlist + webhook event persist. Synthetic only. Not READY.
begin;

insert into public.am_org_meta (client_id, source)
values ('org_hacker_dojo', 'givebutter')
on conflict (client_id) do update set source = excluded.source;

do $$
begin
  begin
    update public.am_org_meta set source = 'stripe' where client_id = 'org_hacker_dojo';
    raise exception 'stripe source was accepted';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 'stripe source was accepted' then raise; end if;
  end;
end $$;

insert into public.am_webhook_events (
  id, client_id, source, event_name, charge_id, payload
) values (
  'wh_fixture_gb_1',
  'org_hacker_dojo',
  'givebutter',
  'transaction.succeeded',
  'fixture-gb-txn-001',
  '{"event":"transaction.succeeded","data":{"id":"fixture-gb-txn-001"}}'::jsonb
);

do $$
begin
  begin
    insert into public.am_webhook_events (
      id, client_id, source, event_name, payload
    ) values (
      'wh_fixture_stripe_1',
      'org_hacker_dojo',
      'stripe',
      'checkout.session.completed',
      '{}'::jsonb
    );
    raise exception 'stripe webhook event source was accepted';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 'stripe webhook event source was accepted' then raise; end if;
  end;
end $$;

rollback;
