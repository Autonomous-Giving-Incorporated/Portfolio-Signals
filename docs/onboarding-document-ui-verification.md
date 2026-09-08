# Document collection UI verification

## Boundaries and contract

`workspace/onboarding-pack.js` extends the existing private checklist, document
list, drag/drop zone, and confirm/unconfirm RPCs. It does not implement a second
upload service or a second classifier.

- Uploads use `POST /functions/v1/upload-onboarding-document` with multipart
  `client_id` and `document`, the current session bearer, and public API key.
- Client preflight mirrors the edge contract: nonempty files, at most 26,214,400
  bytes (25 MiB), allowed extension **or** MIME. Server validation, AAL2, RLS,
  hashing, deduplication, and classification remain authoritative.
- Progress counts completed files, **not transferred bytes**. Mixed batches retain
  individual outcomes; failed refreshes do not erase successful-upload receipts.
  Upload controls and confirmation actions are disabled during upload.
- CSV/XLS/XLSX stay parked for separate list ingest. Existing parked-document
  restrictions and explicit slot confirmation are preserved. Pack ready does not
  activate a tenant or authorize import or outreach.
- Preview authorization still requests a 60-second signed URL. Only the configured
  Supabase origin and this client's private onboarding storage prefix are allowed.
  HTTP is permitted only for loopback development. A deliberate expiring link
  opens a separate `noopener noreferrer` tab; untrusted files are not embedded.
- Enter/Space on the drop zone and the native Choose files button are supported.
  Batch status uses an atomic live region; confirmation returns focus to status.

## Localization

The existing workspace has no shared translation framework/catalog. Collection
additions use `workspace/onboarding-messages.js`, with English fallback and optional
`onboardingMessages` on the existing public runtime configuration object. Preserve
named placeholders such as `{uploaded}` and `{failed}`. Messages are plain text and
HTML-escaped when inserted in templates. Existing checklist/workspace English copy
is unchanged; this is not a full workspace localization migration.

## Local verification

Run from the repository root:

```sh
npm ci
npx playwright install chromium
npm run test:browser -- --retries=0
npm run test:fixtures
node --test tests/agi-phase-c-fixtures.test.mjs tests/impact-relay-auth.test.mjs tests/workspace-auth-consume.test.mjs tests/workspace-tenant-chrome.test.mjs
```

The new `tests/browser/onboarding-pack.spec.js` exercises the real browser module
with explicitly mocked Supabase boundaries and blocks external network requests.
It covers mixed file validation, duplicate-drop suppression, multipart fields,
server/network/refresh errors, keyboard selection, safe preview URL handling,
escaped filenames/messages, parked CRM controls, confirmation and focus, localized
collection copy, and axe WCAG A/AA checks. Both desktop Chromium and mobile Chromium
projects run it. The existing CI workflow discovers this file through
`npm run test:browser` without additional wiring.

Observed locally: 36 browser tests passed, 65 fixture tests passed, and the exact
Phase C CI command passed all 52 tests. The restored
MFA/auth-email/chrome browser subset passed 12 tests (the desktop-only baseline
failed all six). Browser tests use fixtures; no live upload, storage/RLS deployment,
production import, or production tenant provisioning is verified by these runs.

## Portal CI regression

Run `34278954827` failed at
`tests/workspace-auth-consume.test.mjs:361`: `workspace.js` no longer called
`completePrivilegedMfaVerify`. The failure was reproduced locally. The diff from
`10a2d65` to `768e0c6` showed the onboarding change deleting existing MFA enrollment
and verification, shared auth-link consumption/auth-email handling, tenant chrome,
initial-director resolution, and delegate-access wiring. These existing paths are
restored from `10a2d65`, retaining the newer tenant-management panel/handlers. The
assertion was not relaxed. Other legacy tenant-management API placeholders remain
outside the document-collection work; do not infer those integrations are complete.

The initial local verification performed no push, merge, deployment, or production
writes. Subsequent release status is recorded in the associated pull request. A
successful Cloudflare workflow alone does not establish portal acceptance; hosted
portal CI and review of the complete diff remain required before merge.
