-- Authenticated SECURITY DEFINER architecture regression contract.
begin;

do $$
declare
  v_unexpected text[];
  v_missing text[];
  v_expected constant text[] := array[
    'public.accept_delegate_invitation(p_invitation_id uuid)',
    'public.activate_client(p_client_id text, p_rationale text)',
    'public.approve_import_row(p_row_id bigint)',
    'public.authorize_delegate_sign_in(p_client_id text, p_user_id uuid, p_rationale text)',
    'public.can_manage_onboarding_pack(p_client_id text)',
    'public.confirm_onboarding_document(p_document_id uuid, p_type text)',
    'public.create_import_batch(p_batch jsonb, p_rows jsonb)',
    'public.current_client_role(p_client_id text)',
    'public.current_role()',
    'public.deactivate_profile(p_profile_id uuid, p_reason text)',
    'public.decide(p_decision_id uuid, p_status text, p_rationale text)',
    'public.ensure_onboarding_pack(p_client_id text)',
    'public.get_onboarding_pack(p_client_id text)',
    'public.get_public_client_config(p_slug text)',
    'public.get_workspace_context()',
    'public.is_client_member(p_client_id text)',
    'public.is_master_admin()',
    'public.issue_onboarding_document_access(p_document_id uuid, p_ttl_seconds integer)',
    'public.promote_import_row(p_row_id bigint)',
    'public.provision_client(p_client_id text, p_slug text, p_display_name text, p_initial_director uuid, p_rationale text)',
    'public.publish_client_config(p_version_id uuid, p_rationale text)',
    'public.record_document_access(p_document_id uuid, p_ttl_seconds integer)',
    'public.reject_import_row(p_row_id bigint, p_reason text)',
    'public.request_delegate_invitation(p_client_id text, p_email text, p_scopes text[], p_rationale text)',
    'public.require_privileged_mfa()',
    'public.resolve_import_exception(p_exception_id bigint, p_resolution text)',
    'public.revoke_delegate_invitation(p_invitation_id uuid, p_rationale text)',
    'public.revoke_infrastructure_delegate(p_client_id text, p_user_id uuid, p_rationale text)',
    'public.rollback_client_config(p_client_id text, p_source_version integer, p_rationale text)',
    'public.save_client_config_draft(p_client_id text, p_config jsonb, p_rationale text)',
    'public.set_client_membership(p_client_id text, p_user_id uuid, p_role app_role, p_active boolean, p_rationale text)',
    'public.unconfirm_onboarding_document(p_document_id uuid)'
  ];
begin
  select array_agg(signature order by signature)
  into v_unexpected
  from (
    select format('%s.%s(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname !~ '^test_'
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) exposed
  where signature <> all (v_expected);

  select array_agg(signature order by signature)
  into v_missing
  from unnest(v_expected) signature
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname !~ '^test_'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and format('%s.%s(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) = signature
  );

  if coalesce(array_length(v_unexpected, 1), 0) > 0 then
    raise exception 'unclassified authenticated SECURITY DEFINER functions: %', v_unexpected;
  end if;
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'documented authenticated RPC or RLS helper missing: %', v_missing;
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.require_active_profile()', 'execute')
    or has_function_privilege('authenticated', 'public.require_unexpired_session()', 'execute')
    or has_function_privilege('anon', 'public.require_active_profile()', 'execute')
    or has_function_privilege('anon', 'public.require_unexpired_session()', 'execute') then
    raise exception 'owner-side authentication helper remains directly executable';
  end if;

  if not has_function_privilege('authenticated', 'public.require_privileged_mfa()', 'execute')
    or not has_function_privilege('authenticated', 'public.get_workspace_context()', 'execute')
    or not has_function_privilege('authenticated', 'public.current_role()', 'execute')
    or not has_function_privilege('authenticated', 'public.current_client_role(text)', 'execute') then
    raise exception 'supported authenticated RPC or RLS helper was removed';
  end if;
end $$;

rollback;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice 21 + Hash: da66dae31b4c439371561396852822a0257505e8
