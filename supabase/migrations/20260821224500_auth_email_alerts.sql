-- Production migration version 20260821224500.
-- Durable, operator-readable alerts when an auth magic link hard-fails delivery
-- (bounced or complained). A bounced platform-admin / tenant-director sign-in is
-- otherwise silent; this surfaces it. Append-only; readable by platform admins.

create table if not exists public.auth_email_alerts (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.auth_email_dispatches(id) on delete cascade,
  kind public.auth_email_kind not null,
  reason text not null check (reason in ('bounced', 'complained')),
  created_at timestamptz not null default now()
);

create index if not exists auth_email_alerts_kind_created_idx
  on public.auth_email_alerts (kind, created_at desc);

alter table public.auth_email_alerts enable row level security;

revoke all on public.auth_email_alerts from anon, authenticated;
grant select on public.auth_email_alerts to authenticated;

-- Platform administrators may read alerts; no client role may write them (only
-- the security-definer recorder inserts).
create policy "platform admins read auth email alerts"
  on public.auth_email_alerts for select to authenticated
  using (public.is_master_admin());

-- Recreate the recorder so a bounced/complained outcome also opens an alert for
-- each matched dispatch, carrying the dispatch kind for operator triage.
create or replace function public.record_auth_email_delivery(
  p_provider_message_id text,
  p_delivery_status text,
  p_occurred_at timestamptz default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_delivery_status not in ('delivered', 'bounced', 'complained', 'delayed') then
    raise exception 'invalid_delivery_status';
  end if;
  if p_provider_message_id is null or length(p_provider_message_id) = 0 then
    raise exception 'provider_message_id_required';
  end if;

  with updated as (
    update public.auth_email_dispatches set
      delivery_status = p_delivery_status,
      delivery_updated_at = coalesce(p_occurred_at, now())
    where provider_message_id = left(p_provider_message_id, 160)
    returning id, kind
  ),
  alerted as (
    insert into public.auth_email_alerts (dispatch_id, kind, reason)
    select id, kind, p_delivery_status
    from updated
    where p_delivery_status in ('bounced', 'complained')
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end
$$;

revoke all on function public.record_auth_email_delivery(text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_auth_email_delivery(text, text, timestamptz)
  to service_role;

comment on table public.auth_email_alerts is
  'Append-only operator alerts for hard delivery failures (bounced/complained) of auth magic links; readable by platform admins.';

-- Provenance: auth-email hardening — delivery hard-failure alerts
