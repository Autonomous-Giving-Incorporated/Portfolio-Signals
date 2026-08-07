-- scripts/platform/verify-client-lifecycle.sql
-- Read-only readiness check for commercial client lifecycle (slice B).
-- Replace target_client_id before running (Dashboard SQL / postgres).
-- No secrets belong in this file. No mutations.

do $$
declare
  -- >>> REPLACE with org_* client id e.g. org_lifecycle_dry_run <<<
  target_client_id text := '';
  v_client public.clients%rowtype;
  v_director_count integer;
  v_published jsonb;
  v_sponsors boolean;
  v_grants boolean;
  v_audit_count integer;
begin
  if target_client_id is null or length(trim(target_client_id)) = 0 then
    raise exception 'replace target_client_id with org_* id before verify-client-lifecycle';
  end if;

  if target_client_id !~ '^org_[a-z0-9_]+$' then
    raise exception 'target_client_id must match org_[a-z0-9_]+';
  end if;

  select * into v_client from public.clients where id = target_client_id;
  if not found then
    raise exception 'client % not found', target_client_id;
  end if;

  raise notice 'client: id=%, slug=%, state=%, display_name=%',
    v_client.id, v_client.slug, v_client.state, v_client.display_name;

  select count(*) into v_director_count
  from public.client_memberships
  where client_id = target_client_id and role = 'director' and active = true;

  raise notice 'active_directors: %', v_director_count;

  select config into v_published
  from public.client_config_versions
  where client_id = target_client_id and state = 'published'
  limit 1;

  if v_published is null then
    raise notice 'published_config: MISSING';
  else
    v_sponsors := coalesce((v_published#>>'{modules,sponsors}')::boolean, false);
    v_grants := coalesce((v_published#>>'{modules,grants}')::boolean, false);
    raise notice 'published_config: present modules.sponsors=% modules.grants=%',
      v_sponsors, v_grants;
  end if;

  select count(*) into v_audit_count
  from public.client_audit_log
  where client_id = target_client_id and action = 'client_onboarding_completed';

  raise notice 'client_onboarding_completed_audit_rows: %', v_audit_count;

  if v_client.state = 'active'
     and v_director_count > 0
     and v_published is not null
     and (coalesce((v_published#>>'{modules,sponsors}')::boolean, false)
          or coalesce((v_published#>>'{modules,grants}')::boolean, false)) then
    raise notice 'lifecycle_ready: YES (active with director, published config, module)';
  elsif v_client.state = 'provisioning' then
    raise notice 'lifecycle_ready: NO (still provisioning — complete publish + activate)';
  else
    raise notice 'lifecycle_ready: PARTIAL (inspect notices above)';
  end if;

  raise notice 'verify-client-lifecycle complete for %', target_client_id;
end
$$;
