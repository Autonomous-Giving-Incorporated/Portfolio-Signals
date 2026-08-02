# Client Configuration and Brand Publication

## Purpose

A.G.I. clients receive a tenant-specific Fund-Intel experience while continuing to share the same GitHub Pages application and Supabase infrastructure. Hacker Dojo (`org_hacker_dojo`) is the canonical reference configuration, not a hard-coded product default.

## Authority and lifecycle

Only a tenant `director` with enforced MFA can create, publish, or roll back configuration and upload governed public assets. A `master_admin` provisions clients and initial directors but does not automatically receive tenant-private access.

Configuration versions follow an explicit lifecycle:

1. **Draft**: a new immutable snapshot created with a rationale.
2. **Published**: the single version exposed by the privacy-safe public RPC.
3. **Archived**: a previously published version retained for audit and rollback.
4. **Rollback**: creates and publishes a new version copied from the selected historical snapshot. It never rewrites history.

Public pages never read draft or archived configuration. Publication and rollback write tenant-scoped audit events.

## Configurable fields

The published projection supports:

- organization and product names;
- campaign title and tagline;
- primary, accent, and background theme colors;
- governed logo, icon, and hero asset paths.

Free-form HTML, script, remote asset URLs, secrets, donor data, member records, and other private operational data are not accepted as client configuration.

## Asset governance

Assets use the `agi-public-assets` Supabase Storage bucket and are registered in `client_assets` with tenant, uploader, kind, MIME type, byte size, and alt text. The upload Edge Function authenticates the caller, enforces director/MFA authority and tenant quota, stores the object under the tenant and user prefix, and compensates by deleting the object if metadata registration fails.

Allowed content types are PNG, JPEG, WebP, SVG, and PDF, with a 10 MiB per-file limit. Configuration publication accepts only undeleted assets registered to the same client. Directors should provide meaningful alt text for informative images. Decorative assets may use empty alt text.

## Public runtime

`public-client-config.js` chooses the client slug from `?client=<slug>` or the deployment `defaultClientSlug`, requests `get_public_client_config`, and applies the returned privacy-safe values using text properties and CSS custom properties. If runtime Supabase values are absent or the requested client has no active published configuration, the static Hacker Dojo reference experience remains intact.

GitHub Pages receives only the public Supabase URL and anonymous key in generated `runtime-config.js`. Service-role credentials remain restricted to Supabase server runtimes.

## Director workflow

1. Sign in to the authenticated workspace with MFA.
2. Select the client.
3. Open **Brand & content**.
4. Edit safe fields and inspect the live preview.
5. Upload and select governed assets when needed.
6. Enter a substantive rationale and save a new draft.
7. Review the version history, then publish the intended draft.
8. If required, roll back from a historical version. The system creates a new published version and preserves the complete audit trail.

## Acceptance boundary

Completion requires:

- fresh migration application;
- SQL tests for cross-tenant denial, public projection, draft isolation, publication uniqueness, asset validation, and rollback immutability;
- static route and JavaScript syntax validation;
- authenticated browser acceptance for save, preview, upload, publish, and rollback before production authority is granted.
