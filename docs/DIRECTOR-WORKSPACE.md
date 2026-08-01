# Director Workspace Deployment

## Scope

`workspace.html` is the authenticated campaign-control entry point. The public dashboard remains aggregate-only.

## Required services

- Supabase Auth with email-link or enterprise SSO
- MFA required for every active campaign profile
- Postgres migrations applied in order
- Row-level security enabled and tested
- Private object storage for documents
- Deployment environment capable of generating `runtime-config.js`

## Deployment sequence

1. Create a dedicated Supabase project.
2. Apply all files under `supabase/migrations/`.
3. Configure allowed redirect URLs for the production workspace URL.
4. Create director and data-steward accounts manually.
5. Set `mfa_enforced = true` only after MFA enrollment is verified.
6. Generate `runtime-config.js` from `runtime-config.example.js` using only the public URL and anon key.
7. Test every role against RLS before importing records.
8. Run the first import in quarantine; do not promote any rows automatically.
9. Obtain leadership approval for retention, consent, suppression, and outreach rules.
10. Enable production writes only after the launch gate is signed.

## Hard boundaries

- Never expose the Supabase service-role key in the browser.
- Never commit constituent exports, emails, private notes, source workbooks, or database backups.
- Do not infer fundraising consent from Meetup membership or event attendance.
- Do not permit import promotion while critical exceptions remain open.
- Audit events are append-only and must be retained according to the approved policy.

## Acceptance criteria

- Unauthenticated requests cannot read campaign tables.
- Board viewers cannot modify records.
- Development users cannot access import staging data.
- Data stewards cannot approve campaign strategy decisions.
- Suppressed constituents cannot become outreach-authorized.
- Every mutation to controlled entities creates an audit event.
- A source SHA-256 cannot be imported twice without an explicit reviewed override.
