-- Align a raw supabase/postgres image with storage columns and GoTrue
-- helpers the CLI would apply during `supabase start`. Used only for
-- local-synthetic restore drills when Docker bridge networking cannot
-- start the full stack. Does not touch hosted projects.

alter table storage.buckets add column if not exists public boolean default false;
alter table storage.buckets add column if not exists avif_autodetection boolean default false;
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
alter table storage.buckets add column if not exists owner_id text;

alter table storage.objects add column if not exists version text;
alter table storage.objects add column if not exists owner_id text;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists phone_confirmed_at timestamptz;
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists is_sso_user boolean not null default false;
alter table auth.users add column if not exists deleted_at timestamptz;

-- GoTrue helpers the full `supabase start` stack would install. Tests set
-- request.jwt.claim.* rather than a packed request.jwt.claims JSON object.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
      'role', nullif(current_setting('request.jwt.claim.role', true), ''),
      'aal', nullif(current_setting('request.jwt.claim.aal', true), ''),
      'exp', nullif(current_setting('request.jwt.claim.exp', true), '')
    ))
  )
$$;

grant execute on function auth.uid() to anon, authenticated, postgres, service_role;
grant execute on function auth.role() to anon, authenticated, postgres, service_role;
grant execute on function auth.jwt() to anon, authenticated, postgres, service_role;
