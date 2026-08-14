-- Fail closed against Supabase public-schema default grants. Security-definer
-- delegate and email RPCs are callable only by their intended runtime roles.

revoke all on table public.client_delegate_invitations
  from anon, authenticated, service_role;
revoke all on table public.infrastructure_delegations
  from anon, authenticated, service_role;
revoke all on table public.auth_email_dispatches
  from anon, authenticated, service_role;

grant select on table public.client_delegate_invitations to authenticated;
grant select on table public.infrastructure_delegations to authenticated;
grant all on table public.client_delegate_invitations to service_role;
grant all on table public.infrastructure_delegations to service_role;
grant all on table public.auth_email_dispatches to service_role;

revoke all on function public.request_delegate_invitation(text, text, text[], text)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_delegate_sign_in(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_delegate_invitation(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_delegate_invitation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_infrastructure_delegate(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_auth_email_context(text)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_auth_email_dispatch(uuid, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.request_delegate_invitation(text, text, text[], text)
  to authenticated;
grant execute on function public.authorize_delegate_sign_in(text, uuid, text)
  to authenticated;
grant execute on function public.revoke_delegate_invitation(uuid, text)
  to authenticated;
grant execute on function public.accept_delegate_invitation(uuid)
  to authenticated;
grant execute on function public.revoke_infrastructure_delegate(text, uuid, text)
  to authenticated;
grant execute on function public.resolve_auth_email_context(text)
  to service_role;
grant execute on function public.begin_auth_email_dispatch(text, public.auth_email_kind, text, uuid, uuid)
  to service_role;
grant execute on function public.complete_auth_email_dispatch(uuid, text, text, text)
  to service_role;

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 622346cc565b1d6c7ebfc75eb7590b8dd03af601
