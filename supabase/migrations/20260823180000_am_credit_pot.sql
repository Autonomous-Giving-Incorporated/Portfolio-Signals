-- Atomic pot credit for webhook ingest. Service-role only.
-- Replaces unlocked REST read-modify-write on am_pots.credited_cents.
-- Not live. Not READY. Does not authorize a gift.

create or replace function public.am_credit_pot(
  p_client_id text,
  p_campaign_key text,
  p_program_key text,
  p_credited_cents bigint
)
returns table (
  client_id text,
  campaign_key text,
  program_key text,
  credited_cents bigint,
  allocated_cents bigint,
  inserted boolean
)
language plpgsql
set search_path = public
as $$
begin
  if p_client_id is null or length(btrim(p_client_id)) = 0 then
    raise exception 'client_id required';
  end if;
  if p_campaign_key is null or length(btrim(p_campaign_key)) = 0 then
    raise exception 'campaign_key required';
  end if;
  if p_program_key is null or length(btrim(p_program_key)) = 0 then
    raise exception 'program_key required';
  end if;
  if p_credited_cents is null or p_credited_cents <= 0 then
    raise exception 'credited increment must be positive';
  end if;

  return query
  with upsert as (
    insert into public.am_pots (
      client_id, campaign_key, program_key, credited_cents, allocated_cents
    )
    values (
      p_client_id, p_campaign_key, p_program_key, p_credited_cents, 0
    )
    on conflict (client_id, campaign_key, program_key)
    do update set
      credited_cents = public.am_pots.credited_cents + excluded.credited_cents,
      updated_at = now()
    returning
      public.am_pots.client_id,
      public.am_pots.campaign_key,
      public.am_pots.program_key,
      public.am_pots.credited_cents,
      public.am_pots.allocated_cents,
      (xmax = 0) as inserted
  )
  select
    upsert.client_id,
    upsert.campaign_key,
    upsert.program_key,
    upsert.credited_cents,
    upsert.allocated_cents,
    upsert.inserted
  from upsert;
end;
$$;

revoke all on function public.am_credit_pot(text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.am_credit_pot(text, text, text, bigint)
  to service_role;
