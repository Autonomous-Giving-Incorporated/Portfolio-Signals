begin;

-- HD-OI-019: reconcile the legacy audit/import migration with the canonical
-- quarantine schema introduced in 005_import_quarantine_and_suppression.sql.
-- This migration now owns audit triggers only and must not recreate import tables.

create or replace function public.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id text;
begin
  v_entity_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');

  insert into public.audit_log(
    actor_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state
  ) values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_constituents on public.constituents;
create trigger audit_constituents
after insert or update or delete on public.constituents
for each row execute function public.capture_audit_event();

drop trigger if exists audit_opportunities on public.opportunities;
create trigger audit_opportunities
after insert or update or delete on public.opportunities
for each row execute function public.capture_audit_event();

drop trigger if exists audit_decisions on public.decisions;
create trigger audit_decisions
after insert or update or delete on public.decisions
for each row execute function public.capture_audit_event();

drop trigger if exists audit_claims on public.claims;
create trigger audit_claims
after insert or update or delete on public.claims
for each row execute function public.capture_audit_event();

drop trigger if exists audit_import_batches on public.import_batches;
create trigger audit_import_batches
after insert or update or delete on public.import_batches
for each row execute function public.capture_audit_event();

drop trigger if exists audit_import_exceptions on public.import_exceptions;
create trigger audit_import_exceptions
after insert or update or delete on public.import_exceptions
for each row execute function public.capture_audit_event();

revoke insert, update, delete on public.audit_log from authenticated;

commit;
