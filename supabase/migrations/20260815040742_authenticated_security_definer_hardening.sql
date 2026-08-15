-- Two authentication helpers are implementation details of owner-side RPCs.
-- Keeping direct authenticated EXECUTE on them unnecessarily publishes them
-- through PostgREST even though supported user flows reach them only through
-- higher-level functions such as get_workspace_context() and
-- require_privileged_mfa(). SECURITY DEFINER callers continue to execute as
-- the owning role, so removing the Data API entry points preserves the
-- internal call chain.
revoke execute on function public.require_active_profile()
  from anon, authenticated, service_role;
revoke execute on function public.require_unexpired_session()
  from anon, authenticated, service_role;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice 21 + Hash: da66dae31b4c439371561396852822a0257505e8
