-- AGI-006: governed client onboarding completion and activation.

create or replace function public.activate_client(
  p_client_id text,
  p_rationale text
) returns public.clients
language plpgsql security definer set search_path = public as $$
declare
  v_client public.clients;
  v_config jsonb;
begin
  perform public.require_active_profile();
  if not public.is_master_admin() then raise exception 'master_admin_required'; end if;
  perform public.require_privileged_mfa();
  if length(trim(coalesce(p_rationale, ''))) < 12 then raise exception 'activation_rationale_required'; end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then raise exception 'client_not_found'; end if;
  if v_client.state is distinct from 'provisioning' then raise exception 'provisioning_client_required'; end if;
  if not exists (
    select 1 from public.client_memberships
    where client_id = p_client_id and role = 'director' and active = true
  ) then raise exception 'active_client_director_required'; end if;

  select config into v_config
  from public.client_config_versions
  where client_id = p_client_id and state = 'published';
  if v_config is null then raise exception 'published_client_configuration_required'; end if;
  perform public.validate_client_config(p_client_id, v_config);
  if not coalesce((v_config#>>'{modules,sponsors}')::boolean, false)
     and not coalesce((v_config#>>'{modules,grants}')::boolean, false) then
    raise exception 'fundraising_module_required';
  end if;

  update public.clients set state = 'active' where id = p_client_id returning * into v_client;
  insert into public.client_audit_log(client_id, actor_id, action, entity_type, entity_id, rationale, after_state)
  values (
    p_client_id, auth.uid(), 'client_onboarding_completed', 'client', p_client_id, p_rationale,
    jsonb_build_object('state', 'active', 'modules', v_config->'modules')
  );
  return v_client;
end $$;

revoke all on function public.activate_client(text, text) from public, anon;
grant execute on function public.activate_client(text, text) to authenticated;
