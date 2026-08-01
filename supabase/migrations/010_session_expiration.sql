-- HD-OI-019: fail closed when an authenticated JWT is expired or lacks expiry.

create or replace function public.require_unexpired_session()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exp_text text;
  v_exp bigint;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  v_exp_text := coalesce(
    nullif(auth.jwt()->>'exp', ''),
    nullif(current_setting('request.jwt.claim.exp', true), '')
  );

  if v_exp_text is null then
    raise exception 'session_expired';
  end if;

  begin
    v_exp := v_exp_text::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'session_expired';
  end;

  if v_exp <= extract(epoch from now())::bigint then
    raise exception 'session_expired';
  end if;
end;
$$;

revoke all on function public.require_unexpired_session() from public;
grant execute on function public.require_unexpired_session() to authenticated;

create or replace function public.current_role()
returns public.app_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then
    return null;
  end if;

  perform public.require_unexpired_session();
  select role into v_role
  from public.profiles
  where id = auth.uid() and active = true;
  return v_role;
end;
$$;

create or replace function public.require_active_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  perform public.require_unexpired_session();

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true;

  if not found then
    raise exception 'inactive_or_missing_profile';
  end if;

  return v_profile;
end;
$$;
