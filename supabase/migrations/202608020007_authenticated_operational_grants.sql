-- AGI-009: expose operational tables through their RLS policies.
-- Quarantine, configuration, and membership tables remain function-only.

grant select on table
  public.clients,
  public.client_memberships,
  public.client_assets,
  public.client_audit_log,
  public.client_config_versions,
  public.profiles,
  public.constituents,
  public.opportunities,
  public.opportunity_notes,
  public.document_records,
  public.decisions,
  public.decision_events,
  public.decision_approvals,
  public.claims,
  public.audit_log
to authenticated;

grant insert, update, delete on table
  public.constituents,
  public.opportunities,
  public.opportunity_notes,
  public.document_records,
  public.decisions,
  public.claims
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant select on table public.client_assets to anon;
