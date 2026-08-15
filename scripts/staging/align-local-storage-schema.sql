-- Align a raw supabase/postgres image with the storage columns the CLI
-- would apply during `supabase start`. Used only for local-synthetic
-- restore drills when Docker bridge networking cannot start the full stack.
-- Does not touch hosted projects.

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
