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

## Current host decision

**Canonical repository:** `Autonomous-Giving-Incorporated/Portfolio-Signals`.  
**Designed public host:** Cloudflare Workers (`portfolio-signals`) — [CLOUDFLARE.md](CLOUDFLARE.md).  
**Fallback until DNS cutover:** Vercel project `fund-intel` at https://autogive.app/portfolio-signals/.  
GitHub Pages (`https://scrimshawlife-ctrl.github.io/Hacker-Dojo/`) is a **historical** pre-migration origin, not the current production host.

GitHub Actions may still generate gitignored `runtime-config.js` from `PLATFORM_SUPABASE_URL` / `PLATFORM_SUPABASE_ANON_KEY` (or the older `STAGING_*` names). Only the browser-public anon key is permitted; the service-role key must never be stored in Pages, Vercel browser env, or `runtime-config.js`.

Supabase Auth must allow the current HTTPS origins:

- site URL: `https://autogive.app/portfolio-signals/`
- workspace: `https://autogive.app/portfolio-signals/workspace` and `/workspace.html`
- plus the `workers.dev` origin once the operator deploys Worker `portfolio-signals`

Impact Relay screens call a local/staging **console API** (not Supabase). See [IMPACT-RELAY.md](./IMPACT-RELAY.md). Privileged roles need `mfa_enforced` on the profile before those pages accept a Supabase session.

This staging-host choice does not authorize production, real-data import, outreach, or Notion
writeback.

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

Provenance: Notion Sprint 001 Hub + Loop 805 Slice HD-OI-019 + Hash: abf1c1daca761b961c9b41978532ce9e904c33ac
