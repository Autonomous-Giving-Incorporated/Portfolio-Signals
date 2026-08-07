-- scripts/platform/verify-second-tenant-isolation.sql
-- Read-only: confirm two FI clients exist and second is not the reference tenant.
-- Replace target_client_id (second tenant). Reference is always org_hacker_dojo.
-- No secrets. No mutations.

do $$
declare
  -- >>> REPLACE with second tenant org_* id <<<
  target_client_id text := '';
  v_ref public.clients%rowtype;
  v_second public.clients%rowtype;
  v_ref_pub jsonb;
  v_second_pub jsonb;
begin
  if target_client_id is null or length(trim(target_client_id)) = 0 then
    raise exception 'replace target_client_id with second org_* id before verify-second-tenant-isolation';
  end if;

  if target_client_id = 'org_hacker_dojo' then
    raise exception 'target_client_id must be the SECOND tenant, not org_hacker_dojo';
  end if;

  if target_client_id !~ '^org_[a-z0-9_]+$' then
    raise exception 'target_client_id must match org_[a-z0-9_]+';
  end if;

  select * into v_ref from public.clients where id = 'org_hacker_dojo';
  if not found then
    raise exception 'reference tenant org_hacker_dojo missing';
  end if;
  if v_ref.reference_tenant is not true then
    raise exception 'org_hacker_dojo must have reference_tenant = true';
  end if;

  select * into v_second from public.clients where id = target_client_id;
  if not found then
    raise exception 'second client % not found', target_client_id;
  end if;
  if v_second.reference_tenant is true then
    raise exception 'second client % must not be reference_tenant', target_client_id;
  end if;

  raise notice 'reference: id=%, state=%, slug=%', v_ref.id, v_ref.state, v_ref.slug;
  raise notice 'second: id=%, state=%, slug=%', v_second.id, v_second.state, v_second.slug;

  begin
    v_ref_pub := public.get_public_client_config(v_ref.slug);
  exception when others then
    raise notice 'reference public config: unavailable (%)', sqlerrm;
    v_ref_pub := null;
  end;

  begin
    v_second_pub := public.get_public_client_config(v_second.slug);
  exception when others then
    raise notice 'second public config: unavailable (%)', sqlerrm;
    v_second_pub := null;
  end;

  if v_ref_pub is not null and v_second_pub is not null then
    if (v_ref_pub #>> '{config,organization_name}')
         = (v_second_pub #>> '{config,organization_name}') then
      raise notice 'WARNING: organization_name identical on both public projections — confirm intentional';
    else
      raise notice 'public projections: organization_name differs (good)';
    end if;
  end if;

  raise notice 'verify-second-tenant-isolation complete';
end
$$;
