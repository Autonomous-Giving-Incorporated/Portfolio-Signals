-- Close inherited and hosted-default execution grants on public-schema
-- functions. Supported RPCs remain explicitly granted by their owning
-- migrations; anonymous access is re-granted only for the documented public
-- configuration endpoint and fail-closed RLS helpers.

-- Future postgres-owned functions fail closed until a migration explicitly
-- grants the exact runtime role. PostgreSQL's built-in PUBLIC function grant
-- is global, while Supabase also seeds schema-specific public defaults, so
-- both layers must be revoked.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- PUBLIC is a PostgreSQL pseudo-role inherited by every login role. Hosted
-- projects may also carry explicit anon grants from legacy Supabase defaults.
revoke execute on all functions in schema public from public, anon;

-- Intentional anonymous API and RLS-evaluation surface.
grant execute on function public.get_public_client_config(text) to anon;
grant execute on function public.is_master_admin() to anon;
grant execute on function public.is_client_member(text) to anon;
grant execute on function public.current_client_role(text) to anon;
grant execute on function public.current_session_aal() to anon;

-- current_role() was originally available through PUBLIC and is required by
-- authenticated RLS policies. Make that contract explicit after revocation.
grant execute on function public.current_role() to authenticated;

-- These helpers are reached only by their owner-side RPCs or database trigger
-- machinery. Direct Data API execution would bypass their intended call path.
revoke execute on function public.can_user_manage_onboarding_pack(uuid, text)
  from anon, authenticated, service_role;
revoke execute on function public.recompute_onboarding_pack_status(text, uuid)
  from anon, authenticated, service_role;
revoke execute on function public.capture_audit_event()
  from anon, authenticated, service_role;
revoke execute on function public.enforce_constituent_suppression()
  from anon, authenticated, service_role;
revoke execute on function public.record_decision_transition()
  from anon, authenticated, service_role;
-- Hosted projects may contain the platform-installed RLS event-trigger helper;
-- disposable local projects do not. Revoke it when present without making the
-- portable migration depend on that optional object.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, service_role';
  end if;
end
$$;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice 20 + Hash: 36ade3ded86a48abc3b6ba52b25fc34c867caf0a
