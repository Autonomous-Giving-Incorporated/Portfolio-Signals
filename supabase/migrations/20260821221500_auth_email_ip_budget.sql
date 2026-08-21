-- Production migration version 20260821221500.
-- Add a durable per-source (hashed IP) budget to auth-email dispatch so a single
-- source cannot consume the shared anonymous global budget and deny legitimate
-- platform-admin / tenant-director sign-ins (self_sign_in is anonymous for every
-- audience). Complements the best-effort in-memory throttle in the Edge Function
-- and preserves every existing cap from 20260815012155_security_boundary_hardening.

alter table public.auth_email_dispatches
  add column if not exists request_ip_hash text
    check (request_ip_hash is null or request_ip_hash ~ '^[0-9a-f]{64}$');

create index if not exists auth_email_dispatches_ip_window_idx
  on public.auth_email_dispatches (request_ip_hash, requested_at)
  where request_ip_hash is not null;

-- Recreate with an optional p_request_ip_hash argument. All prior caps are
-- retained; a per-source cap is added when the hash is supplied.
create or replace function public.begin_auth_email_dispatch(
  p_recipient_hash text,
  p_kind public.auth_email_kind,
  p_client_id text default null,
  p_target_user_id uuid default null,
  p_requested_by uuid default null,
  p_request_ip_hash text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_recipient_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'recipient_hash_required';
  end if;
  if p_request_ip_hash is not null and p_request_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'request_ip_hash_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_recipient_hash, 0));
  if p_requested_by is null then
    perform pg_advisory_xact_lock(hashtextextended('auth_email_anonymous_global', 0));
  end if;

  -- Per-recipient cooldown.
  if exists (
    select 1 from public.auth_email_dispatches
    where recipient_hash = p_recipient_hash
      and requested_at > now() - interval '10 minutes'
      and status in ('pending', 'sent')
  ) then return null; end if;

  -- Per-requester hourly cap (authenticated director actions).
  if p_requested_by is not null and (
    select count(*) from public.auth_email_dispatches
    where requested_by = p_requested_by
      and requested_at > now() - interval '1 hour'
      and status in ('pending', 'sent')
  ) >= 20 then return null; end if;

  -- Service-wide anonymous provider budget.
  if p_requested_by is null and (
    select count(*) from public.auth_email_dispatches
    where requested_by is null
      and requested_at > now() - interval '1 hour'
      and status in ('pending', 'sent')
  ) >= 50 then return null; end if;

  -- Per-source cap: a single hashed IP may not exceed 10 dispatches in 10
  -- minutes, so one source cannot exhaust the anonymous budget above.
  if p_request_ip_hash is not null and (
    select count(*) from public.auth_email_dispatches
    where request_ip_hash = p_request_ip_hash
      and requested_at > now() - interval '10 minutes'
      and status in ('pending', 'sent')
  ) >= 10 then return null; end if;

  insert into public.auth_email_dispatches(
    recipient_hash, client_id, target_user_id, kind, requested_by, request_ip_hash
  ) values (
    p_recipient_hash, p_client_id, p_target_user_id, p_kind, p_requested_by, p_request_ip_hash
  ) returning id into v_id;
  return v_id;
end
$$;

-- The prior 5-argument overload is superseded; drop it so only the 6-argument
-- signature remains callable (avoids PostgREST overload ambiguity).
drop function if exists public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid);

revoke all on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid, text)
  to service_role;

comment on column public.auth_email_dispatches.request_ip_hash is
  'SHA-256 of the requesting client IP; used only for a per-source rate budget. Never a raw address.';

-- Provenance: auth-email hardening — durable per-source dispatch budget
