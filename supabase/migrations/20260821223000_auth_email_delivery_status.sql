-- Production migration version 20260821223000.
-- Record provider delivery outcomes (Resend webhook) against the dispatch ledger
-- so bounced/complained admin/director magic links become visible. The send-side
-- `status` column is unchanged; delivery is a separate dimension matched by the
-- provider message id. Only hashes/ids are stored — never a raw recipient address.

alter table public.auth_email_dispatches
  add column if not exists delivery_status text
    check (delivery_status is null or delivery_status in ('delivered', 'bounced', 'complained', 'delayed')),
  add column if not exists delivery_updated_at timestamptz;

-- Service-role only: update the matching dispatch row(s) by provider message id.
-- Returns the number of rows updated (0 when the id is unknown — not an error).
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

  update public.auth_email_dispatches set
    delivery_status = p_delivery_status,
    delivery_updated_at = coalesce(p_occurred_at, now())
  where provider_message_id = left(p_provider_message_id, 160);

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.record_auth_email_delivery(text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_auth_email_delivery(text, text, timestamptz)
  to service_role;

comment on column public.auth_email_dispatches.delivery_status is
  'Latest provider delivery outcome (delivered/bounced/complained/delayed) from the Resend webhook; null until an event arrives.';

-- Provenance: auth-email hardening — Resend delivery feedback loop
