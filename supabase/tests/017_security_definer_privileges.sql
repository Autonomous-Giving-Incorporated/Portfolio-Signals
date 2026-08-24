-- SECURITY DEFINER least-privilege regression contract.
begin;

-- Anonymous callers may reach only the documented public configuration RPC
-- and the fail-closed helpers required by anonymous RLS evaluation.
do $$
declare
  v_unexpected text[];
begin
  select array_agg(format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) order by p.proname)
  into v_unexpected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) <> all (array[
      'public.current_client_role(p_client_id text)',
      'public.get_public_client_config(p_slug text)',
      'public.is_client_member(p_client_id text)',
      'public.is_master_admin()'
    ]);

  if coalesce(array_length(v_unexpected, 1), 0) > 0 then
    raise exception 'unexpected anonymous SECURITY DEFINER functions: %', v_unexpected;
  end if;

  if not has_function_privilege('anon', 'public.get_public_client_config(text)', 'execute') then
    raise exception 'anonymous public client configuration access was removed';
  end if;
  if not has_function_privilege('anon', 'public.is_client_member(text)', 'execute')
    or not has_function_privilege('anon', 'public.is_master_admin()', 'execute')
    or not has_function_privilege('anon', 'public.current_client_role(text)', 'execute') then
    raise exception 'anonymous RLS helper execution was removed';
  end if;
end $$;

-- Internal helpers and trigger functions must never be directly exposed.
do $$
declare
  v_signature text;
  v_oid oid;
begin
  foreach v_signature in array array[
    'public.can_user_manage_onboarding_pack(uuid,text)',
    'public.recompute_onboarding_pack_status(text,uuid)',
    'public.capture_audit_event()',
    'public.enforce_constituent_suppression()',
    'public.record_decision_transition()',
    'public.rls_auto_enable()'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is not null and (
      has_function_privilege('anon', v_oid, 'execute')
      or has_function_privilege('authenticated', v_oid, 'execute')
    ) then
      raise exception 'internal function remains externally executable: %', v_signature;
    end if;
  end loop;
end $$;

-- Preserve the supported application and service-role API contracts.
do $$
begin
  if not has_function_privilege('authenticated', 'public.get_workspace_context()', 'execute')
    or not has_function_privilege('authenticated', 'public.approve_import_row(bigint)', 'execute')
    or not has_function_privilege('authenticated', 'public.set_client_membership(text,uuid,public.app_role,boolean,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_onboarding_pack(text)', 'execute')
    or not has_function_privilege('authenticated', 'public.set_mfa_enforced()', 'execute') then
    raise exception 'authenticated application RPC contract was narrowed';
  end if;

  if not has_function_privilege('service_role', 'public.register_client_asset(text,text,text,text,text,bigint,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.register_onboarding_document(text,text,text,text,bigint,text,text,numeric,text,text,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.resolve_auth_email_context(text)', 'execute')
    or not has_function_privilege('service_role', 'public.am_credit_pot(text,text,text,bigint)', 'execute') then
    raise exception 'service-role Edge Function RPC contract was narrowed';
  end if;
end $$;

-- New functions must fail closed unless a migration explicitly grants access.
create function public.test_default_function_privileges()
returns boolean
language sql
as $$ select true $$;

do $$
begin
  if has_function_privilege('anon', 'public.test_default_function_privileges()', 'execute')
    or has_function_privilege('authenticated', 'public.test_default_function_privileges()', 'execute') then
    raise exception 'new public function inherited external execute privileges';
  end if;
end $$;

drop function public.test_default_function_privileges();
rollback;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice 20 + Hash: 36ade3ded86a48abc3b6ba52b25fc34c867caf0a
