-- READ ONLY. Execute only through a connection independently bound to the project.
-- project_ref below labels expected scope, not server-side identity attestation.
with rows as (
  select version, name,
    encode(extensions.digest(convert_to(
      coalesce(array_to_string(statements, E';\n'), '') || E';\n', 'UTF8'),
      'sha256'), 'hex') as fetch_sha256
  from supabase_migrations.schema_migrations
)
select jsonb_build_object(
  'project_ref', 'utdioxwiskzatwoejgiu',
  'migrations', coalesce(jsonb_agg(to_jsonb(rows) order by version), '[]'::jsonb)
) from rows;
