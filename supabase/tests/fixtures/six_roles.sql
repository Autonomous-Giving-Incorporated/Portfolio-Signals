-- Synthetic local-only role fixtures. Never use these IDs in production.
-- Requires migrations to be applied to a disposable Supabase database.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','director@example.invalid','',now(),now(),now()),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','campaign@example.invalid','',now(),now(),now()),
('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','development@example.invalid','',now(),now(),now()),
('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','board@example.invalid','',now(),now(),now()),
('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000000','authenticated','authenticated','steward@example.invalid','',now(),now(),now()),
('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000000','authenticated','authenticated','auditor@example.invalid','',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name, role, active)
values
('00000000-0000-0000-0000-000000000101','Synthetic Director','director',true),
('00000000-0000-0000-0000-000000000102','Synthetic Campaign Lead','campaign_lead',true),
('00000000-0000-0000-0000-000000000103','Synthetic Development','development',true),
('00000000-0000-0000-0000-000000000104','Synthetic Board Viewer','board_viewer',true),
('00000000-0000-0000-0000-000000000105','Synthetic Data Steward','data_steward',true),
('00000000-0000-0000-0000-000000000106','Synthetic Auditor','auditor',true)
on conflict (id) do update set role = excluded.role, active = true;
