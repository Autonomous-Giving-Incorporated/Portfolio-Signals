-- HD-OI-016: private campaign document storage boundary

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-private',
  'campaign-private',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "authorized staff read private campaign objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'campaign-private'
  and public.current_role() in ('director','campaign_lead','development','data_steward','auditor')
);

create policy "stewards upload private campaign objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'campaign-private'
  and public.current_role() in ('director','campaign_lead','data_steward')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "stewards update owned private campaign objects"
on storage.objects for update
to authenticated
using (
  bucket_id = 'campaign-private'
  and owner_id = auth.uid()::text
  and public.current_role() in ('director','campaign_lead','data_steward')
)
with check (
  bucket_id = 'campaign-private'
  and owner_id = auth.uid()::text
  and public.current_role() in ('director','campaign_lead','data_steward')
);

create policy "directors delete private campaign objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'campaign-private'
  and public.current_role() = 'director'
);

-- Signed URLs must be issued by an authenticated server function after checking
-- the document metadata row and current role. Browser code must never receive
-- service-role credentials.
