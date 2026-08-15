-- Serialize recipient dispatch decisions and suppress duplicate provider sends
-- during the magic-link cooldown window.
create or replace function public.begin_auth_email_dispatch(
  p_recipient_hash text,
  p_kind public.auth_email_kind,
  p_client_id text default null,
  p_target_user_id uuid default null,
  p_requested_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_recipient_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'recipient_hash_required';
  end if;

  -- Prevent concurrent requests for the same recipient from both observing an
  -- empty cooldown window and sending separate provider messages.
  perform pg_advisory_xact_lock(hashtextextended(p_recipient_hash, 0));

  if exists (
    select 1 from public.auth_email_dispatches
    where recipient_hash = p_recipient_hash
      and requested_at > now() - interval '10 minutes'
      and status in ('pending', 'sent')
  ) then
    return null;
  end if;

  if p_requested_by is not null and (
    select count(*) from public.auth_email_dispatches
    where requested_by = p_requested_by
      and requested_at > now() - interval '1 hour'
      and status in ('pending', 'sent')
  ) >= 20 then
    return null;
  end if;

  insert into public.auth_email_dispatches(
    recipient_hash, client_id, target_user_id, kind, requested_by
  ) values (
    p_recipient_hash, p_client_id, p_target_user_id, p_kind, p_requested_by
  ) returning id into v_id;
  return v_id;
end $$;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice 18 + Hash: b67241f265e5a887b205cd60f6dcfa8912847b72
