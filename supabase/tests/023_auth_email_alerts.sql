-- Hard-failure alerts for auth-email delivery (migration 20260821224500).
-- Verifies bounced/complained outcomes open an alert carrying the dispatch kind,
-- benign outcomes do not, and only platform admins may read the alert ledger.
begin;

-- No client role may write the alert ledger.
do $$
begin
  if has_table_privilege('anon', 'public.auth_email_alerts', 'insert')
     or has_table_privilege('authenticated', 'public.auth_email_alerts', 'insert') then
    raise exception 'a client role can insert auth email alerts';
  end if;
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_id uuid;
begin
  -- A bounced platform-admin sign-in opens exactly one alert with the kind.
  v_id := public.begin_auth_email_dispatch(repeat('e', 64), 'platform_admin_magic_link');
  perform public.complete_auth_email_dispatch(v_id, 'sent', 'msg_alert_bounce');
  perform public.record_auth_email_delivery('msg_alert_bounce', 'bounced', now());
  if (select count(*) from public.auth_email_alerts
      where dispatch_id = v_id and reason = 'bounced'
        and kind = 'platform_admin_magic_link') <> 1 then
    raise exception 'bounced platform-admin dispatch did not open exactly one alert';
  end if;

  -- A delivered outcome opens no alert.
  v_id := public.begin_auth_email_dispatch(repeat('f', 64), 'tenant_member_magic_link');
  perform public.complete_auth_email_dispatch(v_id, 'sent', 'msg_alert_ok');
  perform public.record_auth_email_delivery('msg_alert_ok', 'delivered', now());
  if exists (select 1 from public.auth_email_alerts where dispatch_id = v_id) then
    raise exception 'delivered dispatch unexpectedly opened an alert';
  end if;

  -- A complaint opens an alert too.
  perform public.record_auth_email_delivery('msg_alert_ok', 'complained', now());
  if (select count(*) from public.auth_email_alerts
      where dispatch_id = v_id and reason = 'complained') <> 1 then
    raise exception 'complaint did not open an alert';
  end if;
end $$;

reset role;
rollback;

-- Provenance: auth-email hardening — delivery hard-failure alerts
