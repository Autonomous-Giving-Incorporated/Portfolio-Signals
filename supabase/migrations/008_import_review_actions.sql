-- HD-OI-019: director/steward import-review actions under live RLS.

create or replace function public.approve_import_row(p_row_id bigint)
returns public.import_staging_rows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.import_staging_rows;
begin
  if public.current_role() not in ('director','data_steward') then
    raise exception 'insufficient_role';
  end if;

  select * into v_row from public.import_staging_rows where id = p_row_id for update;
  if not found then raise exception 'row_not_found'; end if;
  if v_row.state in ('promoted','rejected') then
    raise exception 'row_terminal';
  end if;
  if v_row.consent_candidate in ('suppressed','restricted') then
    raise exception 'consent_blocks_approval';
  end if;
  if exists (
    select 1 from public.import_exceptions
    where staging_row_id = p_row_id
      and severity in ('error','critical')
      and resolved_at is null
  ) then
    raise exception 'unresolved_blocking_exception';
  end if;

  update public.import_staging_rows
     set state = 'approved',
         approved_by = auth.uid(),
         approved_at = now()
   where id = p_row_id
  returning * into v_row;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(),
    'import_row_approved',
    'import_staging_row',
    p_row_id::text,
    jsonb_build_object('batch_id', v_row.batch_id, 'state', v_row.state)
  );

  return v_row;
end;
$$;

create or replace function public.reject_import_row(
  p_row_id bigint,
  p_reason text default 'rejected_in_review'
) returns public.import_staging_rows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.import_staging_rows;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'rejected_in_review');
begin
  if public.current_role() not in ('director','data_steward') then
    raise exception 'insufficient_role';
  end if;

  select * into v_row from public.import_staging_rows where id = p_row_id for update;
  if not found then raise exception 'row_not_found'; end if;
  if v_row.state = 'promoted' then raise exception 'row_already_promoted'; end if;

  update public.import_staging_rows
     set state = 'rejected',
         exception_codes = case
           when 'manual_reject' = any(exception_codes) then exception_codes
           else array_append(exception_codes, 'manual_reject')
         end
   where id = p_row_id
  returning * into v_row;

  insert into public.import_exceptions(staging_row_id, code, severity, detail, resolution, resolved_by, resolved_at)
  values (
    p_row_id,
    'manual_reject',
    'info',
    v_reason,
    'rejected',
    auth.uid(),
    now()
  );

  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(),
    'import_row_rejected',
    'import_staging_row',
    p_row_id::text,
    jsonb_build_object('batch_id', v_row.batch_id, 'reason', v_reason)
  );

  return v_row;
end;
$$;

create or replace function public.resolve_import_exception(
  p_exception_id bigint,
  p_resolution text
) returns public.import_exceptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exception public.import_exceptions;
  v_resolution text := nullif(trim(p_resolution), '');
begin
  if public.current_role() not in ('director','data_steward') then
    raise exception 'insufficient_role';
  end if;
  if v_resolution is null then
    raise exception 'resolution_required';
  end if;

  update public.import_exceptions
     set resolution = v_resolution,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_exception_id
     and resolved_at is null
  returning * into v_exception;

  if not found then
    raise exception 'exception_not_found_or_resolved';
  end if;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, after_state)
  values (
    auth.uid(),
    'import_exception_resolved',
    'import_exception',
    p_exception_id::text,
    jsonb_build_object('resolution', v_resolution, 'staging_row_id', v_exception.staging_row_id)
  );

  return v_exception;
end;
$$;

revoke all on function public.approve_import_row(bigint) from public;
revoke all on function public.reject_import_row(bigint, text) from public;
revoke all on function public.resolve_import_exception(bigint, text) from public;
revoke all on function public.promote_import_row(bigint) from public;
revoke all on function public.decide(uuid, text, text) from public;
revoke all on function public.advance_opportunity_stage(uuid, integer, public.opportunity_stage, text, timestamptz) from public;

grant execute on function public.approve_import_row(bigint) to authenticated;
grant execute on function public.reject_import_row(bigint, text) to authenticated;
grant execute on function public.resolve_import_exception(bigint, text) to authenticated;
grant execute on function public.promote_import_row(bigint) to authenticated;
grant execute on function public.decide(uuid, text, text) to authenticated;
grant execute on function public.advance_opportunity_stage(uuid, integer, public.opportunity_stage, text, timestamptz) to authenticated;
