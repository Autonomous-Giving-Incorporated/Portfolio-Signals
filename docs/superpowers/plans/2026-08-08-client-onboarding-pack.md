# Client Onboarding Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship phase-1 Client Onboarding Pack in Portfolio Signals workspace: private multi-file upload, heuristic type suggestions, human confirm onto a hybrid checklist, pack `ready` when all required slots are confirmed, and CRM workbooks parked without promote.

**Architecture:** Postgres tables + RLS/RPCs on platform Supabase; Edge Function mirrors `upload-client-asset` but writes `campaign-private` and registers pack documents; pure JS classifier shared by Edge and Node tests; workspace section `onboarding_pack` mounts client-scoped UI. No import-api, no connectors, no auto-confirm.

**Tech Stack:** PostgreSQL/Supabase (platform `utdioxwiskzatwoejgiu`), Deno Edge Functions, browser ESM workspace modules, Node `--test` for classifier unit tests.

**Spec:** [docs/superpowers/specs/2026-08-08-client-onboarding-pack-design.md](../specs/2026-08-08-client-onboarding-pack-design.md)

## Global Constraints

- Platform Supabase only: `utdioxwiskzatwoejgiu` — never legacy `ecxkhihlbrcwpavfoaoq` for new work.
- `production_import: BLOCKED` — pack never creates import batches or promotes constituents.
- `outreach: NOT_GRANTED` — pack never authorizes outreach.
- `service_role_on_vercel: PROHIBITED` — browser uses anon + user JWT only; service_role only in Edge Functions.
- Pack `ready` does **not** change `clients.state` or `activate_client` gates.
- Storage bucket for pack docs: **`campaign-private`** only (not `agi-public-assets`).
- Max file size: **25 MiB** (`26214400` bytes).
- Template version constant: **`onboarding_pack_v1`**.
- Write auth: active profile with `mfa_enforced = true` AND (`is_master_admin()` OR active **director** membership on `client_id`).
- `parked_crm` documents must never accept `confirm` to org-proof/optional slots.
- No real donor/member PII or real tax docs in git/CI fixtures.
- Secrets never in git, issues, or commit messages.

## File structure

| Path | Responsibility |
| --- | --- |
| `services/onboarding-pack/src/classifier.mjs` | Pure classify(filename, mimeType) → suggestion |
| `services/onboarding-pack/src/template.mjs` | Slot keys, required set, allowlists |
| `services/onboarding-pack/test/classifier.test.mjs` | Node unit tests |
| `services/onboarding-pack/package.json` | `npm test` for classifier package |
| `supabase/migrations/202608080001_client_onboarding_pack.sql` | Tables, RLS, helpers, RPCs, grants |
| `supabase/tests/015_client_onboarding_pack.sql` | Authz + ready + park confirm fail |
| `supabase/functions/upload-onboarding-document/index.ts` | Multipart upload → private storage → register RPC |
| `supabase/functions/onboarding-document-url/index.ts` | Signed read URL for pack docs |
| `workspace/onboarding-pack.js` | UI mount: checklist, dropzone, confirm |
| `workspace.js` | Nav item + `openSection('onboarding_pack')` |
| `workspace/session.js` | `roleCan` capability `onboarding_pack` |
| `docs/CLIENT-ONBOARDING-PACK.md` | Operator/director runbook |
| `docs/SUITE-ONBOARDING.md` | Link pack |
| `docs/COMMERCIAL-CLIENT-LIFECYCLE.md` | Parallel setup pointer |
| `docs/CURRENT-STATE.md` | Evidence block after pilot/dry-run |

---

### Task 1: Classifier + template (pure JS, TDD)

**Files:**
- Create: `services/onboarding-pack/package.json`
- Create: `services/onboarding-pack/src/template.mjs`
- Create: `services/onboarding-pack/src/classifier.mjs`
- Create: `services/onboarding-pack/test/classifier.test.mjs`

**Interfaces:**
- Consumes: none
- Produces:
  - `TEMPLATE_VERSION = 'onboarding_pack_v1'`
  - `REQUIRED_SLOTS: string[]` — five keys from spec
  - `OPTIONAL_SLOTS: string[]`
  - `ALL_SLOTS: string[]` — required + optional
  - `MAX_BYTES = 26214400`
  - `classify({ filename, mimeType }) => { suggested_type, confidence, status, reject_reason? }`
    - `status`: `'stored' | 'parked_crm' | 'rejected'`
    - `suggested_type`: slot key | `'uncategorized'` | `'parked_crm'`

- [ ] **Step 1: Write failing tests**

Create `services/onboarding-pack/test/classifier.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/classifier.mjs';
import { REQUIRED_SLOTS, TEMPLATE_VERSION, MAX_BYTES } from '../src/template.mjs';

test('template version and required slots', () => {
  assert.equal(TEMPLATE_VERSION, 'onboarding_pack_v1');
  assert.deepEqual(REQUIRED_SLOTS, [
    'org_legal_name_proof',
    'tax_exempt_or_ein',
    'governance',
    'brand_logo',
    'primary_contact'
  ]);
  assert.equal(MAX_BYTES, 25 * 1024 * 1024);
});

test('xlsx parks as CRM', () => {
  const r = classify({ filename: 'Master Development List.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(r.status, 'parked_crm');
  assert.equal(r.suggested_type, 'parked_crm');
});

test('csv parks as CRM', () => {
  const r = classify({ filename: 'donors.csv', mimeType: 'text/csv' });
  assert.equal(r.status, 'parked_crm');
  assert.equal(r.suggested_type, 'parked_crm');
});

test('bylaws pdf suggests governance', () => {
  const r = classify({ filename: 'Acme-Bylaws-2024.pdf', mimeType: 'application/pdf' });
  assert.equal(r.status, 'stored');
  assert.equal(r.suggested_type, 'governance');
  assert.ok(r.confidence > 0);
});

test('ein letter suggests tax_exempt_or_ein', () => {
  const r = classify({ filename: 'IRS-EIN-letter.pdf', mimeType: 'application/pdf' });
  assert.equal(r.suggested_type, 'tax_exempt_or_ein');
});

test('logo png suggests brand_logo', () => {
  const r = classify({ filename: 'logo.png', mimeType: 'image/png' });
  assert.equal(r.suggested_type, 'brand_logo');
});

test('unknown pdf is uncategorized stored', () => {
  const r = classify({ filename: 'scan-003.pdf', mimeType: 'application/pdf' });
  assert.equal(r.status, 'stored');
  assert.equal(r.suggested_type, 'uncategorized');
});

test('exe is rejected', () => {
  const r = classify({ filename: 'setup.exe', mimeType: 'application/octet-stream' });
  assert.equal(r.status, 'rejected');
  assert.ok(r.reject_reason);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd services/onboarding-pack
npm init -y
# set "type": "module" and "scripts": { "test": "node --test" } in package.json
npm test
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement template + classifier**

`src/template.mjs`:

```js
export const TEMPLATE_VERSION = 'onboarding_pack_v1';
export const MAX_BYTES = 25 * 1024 * 1024;
export const REQUIRED_SLOTS = [
  'org_legal_name_proof',
  'tax_exempt_or_ein',
  'governance',
  'brand_logo',
  'primary_contact'
];
export const OPTIONAL_SLOTS = [
  'w9',
  'board_list',
  'brand_kit',
  'campaign_brief',
  'impact_sample',
  'other'
];
export const ALL_SLOTS = [...REQUIRED_SLOTS, ...OPTIONAL_SLOTS];

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

export const PARK_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

export const PARK_EXT = new Set(['.csv', '.xls', '.xlsx']);
```

`src/classifier.mjs`:

```js
import { ALLOWED_MIME, PARK_EXT, PARK_MIME } from './template.mjs';

const RULES = [
  { type: 'governance', re: /bylaw|articles\s*of|constitution/i, confidence: 0.85 },
  { type: 'tax_exempt_or_ein', re: /\bein\b|501\s*\(?\s*c\s*\)?\s*3|tax[-_ ]?exempt|determination/i, confidence: 0.85 },
  { type: 'org_legal_name_proof', re: /formation|articles\s*of\s*incorp|certificate\s*of|sos[_-]?filing/i, confidence: 0.8 },
  { type: 'brand_logo', re: /logo|wordmark|icon/i, confidence: 0.8 },
  { type: 'primary_contact', re: /contact|ops[_-]?card|primary[_-]?contact/i, confidence: 0.75 },
  { type: 'w9', re: /\bw[-_]?9\b/i, confidence: 0.9 },
  { type: 'board_list', re: /board[_- ]?(list|roster|members)/i, confidence: 0.8 },
  { type: 'brand_kit', re: /brand[_- ]?kit|style[_- ]?guide|letterhead/i, confidence: 0.8 },
  { type: 'campaign_brief', re: /campaign[_- ]?brief|program[_- ]?brief/i, confidence: 0.75 },
  { type: 'impact_sample', re: /impact|annual[_- ]?report/i, confidence: 0.7 }
];

function extOf(filename) {
  const m = String(filename || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function classify({ filename, mimeType }) {
  const name = String(filename || '');
  const mime = String(mimeType || '');
  const ext = extOf(name);

  if (PARK_MIME.has(mime) || PARK_EXT.has(ext)) {
    return { suggested_type: 'parked_crm', confidence: 1, status: 'parked_crm', classifier_version: 'v1-heuristics' };
  }

  const mimeOk = ALLOWED_MIME.has(mime) || ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.docx', '.txt'].includes(ext);
  if (!mimeOk) {
    return { suggested_type: 'uncategorized', confidence: 0, status: 'rejected', reject_reason: 'disallowed_type', classifier_version: 'v1-heuristics' };
  }

  for (const rule of RULES) {
    if (rule.re.test(name)) {
      return { suggested_type: rule.type, confidence: rule.confidence, status: 'stored', classifier_version: 'v1-heuristics' };
    }
  }
  return { suggested_type: 'uncategorized', confidence: 0, status: 'stored', classifier_version: 'v1-heuristics' };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd services/onboarding-pack && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/onboarding-pack
git commit -m "feat(onboarding-pack): classifier and template v1"
```

---

### Task 2: Schema, RLS, RPCs

**Files:**
- Create: `supabase/migrations/202608080001_client_onboarding_pack.sql`
- Create: `supabase/tests/015_client_onboarding_pack.sql`

**Interfaces:**
- Consumes: `is_master_admin()`, `is_client_member()`, `profiles.mfa_enforced`, `clients`, `client_audit_log`
- Produces RPCs (SECURITY DEFINER, `search_path = public`):
  - `public.can_manage_onboarding_pack(p_client_id text) returns boolean`
  - `public.ensure_onboarding_pack(p_client_id text) returns public.client_onboarding_packs`
  - `public.get_onboarding_pack(p_client_id text) returns jsonb`
  - `public.register_onboarding_document(p_client_id text, p_storage_path text, p_original_filename text, p_mime_type text, p_byte_size bigint, p_sha256 text, p_suggested_type text, p_suggested_confidence numeric, p_classifier_version text, p_status text) returns public.client_onboarding_documents`
  - `public.confirm_onboarding_document(p_document_id uuid, p_type text) returns jsonb`
  - `public.unconfirm_onboarding_document(p_document_id uuid) returns jsonb`
  - `public.issue_onboarding_document_access(p_document_id uuid, p_ttl_seconds int default 60) returns jsonb`

- [ ] **Step 1: Write SQL test (fail closed expectations)**

Create `supabase/tests/015_client_onboarding_pack.sql` following the pattern of `011_agi_client_onboarding.sql`:

- Use synthetic clients/users inside a transaction that **rolls back**.
- Assert: non-member cannot `get_onboarding_pack`.
- Assert: director with MFA can ensure pack, register doc, confirm required slots, pack status becomes `ready`.
- Assert: confirming `parked_crm` document to `tax_exempt_or_ein` raises.
- Assert: outsider director of other client cannot read pack.

Use the same synthetic UUIDs style as existing tests (`00000000-0000-0000-0000-0000000001xx`) if those profiles exist in the test harness; otherwise insert minimal profiles in the test transaction like other suite tests.

- [ ] **Step 2: Run test against local stack (or note CI path)**

```bash
# Prefer project’s existing local supabase test runner if present, e.g.:
# supabase test db supabase/tests/015_client_onboarding_pack.sql
# or the workflow used for 011_agi_client_onboarding.sql
```

Expected before migration: FAIL (missing relations).

- [ ] **Step 3: Write migration**

`supabase/migrations/202608080001_client_onboarding_pack.sql` must include:

1. **Tables**

```sql
create table public.client_onboarding_packs (
  client_id text primary key references public.clients(id) on delete restrict,
  template_version text not null default 'onboarding_pack_v1',
  status text not null default 'in_progress'
    check (status in ('in_progress', 'ready', 'archived')),
  ready_at timestamptz,
  ready_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete restrict,
  storage_bucket text not null default 'campaign-private'
    check (storage_bucket = 'campaign-private'),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  suggested_type text not null,
  suggested_confidence numeric not null default 0
    check (suggested_confidence >= 0 and suggested_confidence <= 1),
  classifier_version text not null default 'v1-heuristics',
  confirmed_type text,
  status text not null
    check (status in ('stored', 'confirmed', 'parked_crm', 'rejected', 'superseded')),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (client_id, sha256),
  unique (storage_path)
);

create index client_onboarding_documents_client_idx
  on public.client_onboarding_documents (client_id, status);
```

2. **Helper `can_manage_onboarding_pack`**

```sql
create or replace function public.can_manage_onboarding_pack(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active is true
      and p.mfa_enforced is true
  )
  and (
    public.is_master_admin()
    or exists (
      select 1 from public.client_memberships m
      where m.client_id = p_client_id
        and m.user_id = auth.uid()
        and m.active is true
        and m.role = 'director'
    )
  );
$$;
```

3. **RLS** — enable RLS; SELECT for manage-capable users; no direct INSERT/UPDATE/DELETE for `authenticated` (mutations via SECURITY DEFINER RPCs only). Grant SELECT to `authenticated` with policy using `can_manage_onboarding_pack(client_id)`.

4. **`ensure_onboarding_pack`** — require `can_manage_onboarding_pack`; insert pack if missing; return row.

5. **`get_onboarding_pack`** — require manage; ensure pack; return jsonb:

```json
{
  "pack": { "client_id", "template_version", "status", "ready_at", "ready_by" },
  "required_slots": ["org_legal_name_proof", "..."],
  "optional_slots": ["w9", "..."],
  "slots": {
    "org_legal_name_proof": { "required": true, "document": null | {…} },
    ...
  },
  "documents": [ /* non-superseded docs newest first */ ]
}
```

6. **`register_onboarding_document`** — require manage; validate path prefix `assets/tenants/<slug>/onboarding/<uuid>/…` OR simpler `onboarding/<client_id>/<doc_uuid>/<safe_name>` consistent with edge upload; reject if `p_status = 'rejected'`; on `sha256` conflict for same client return existing row (dedupe); insert; audit `onboarding_document_uploaded`; return document.

Path convention (lock this):

```text
onboarding/<client_id>/<document_id>/<safe_filename>
```

(Storage path relative to `campaign-private` bucket.)

7. **`confirm_onboarding_document`** — require manage; reject if status `parked_crm` or `rejected` or `superseded`; reject if `p_type` not in required∪optional slot list; supersede any other confirmed doc with same `confirmed_type` on client; set confirmed fields; recompute pack ready (all five required have active confirmed); audit; return `{ document, pack }`.

8. **`unconfirm_onboarding_document`** — clear confirm; status back to `stored` (or keep `parked_crm` if was parked — parked should not be confirmed); recompute pack; demote ready if needed; audit.

9. **`issue_onboarding_document_access`** — require manage; validate TTL 30–300; return `{ storage_bucket, storage_path, expires_at, audit_id }` after writing audit row (may insert into `client_audit_log` with action `onboarding_document_access`).

10. **Grants:** `grant execute … to authenticated` for get/ensure/confirm/unconfirm/issue; `register_onboarding_document` grant **service_role only** (Edge registers after storage write), same pattern as `register_client_asset`.

11. **Storage policies:** ensure authenticated cannot write arbitrary `campaign-private` paths for onboarding without going through Edge; rely on service_role upload in Edge + existing private bucket posture. If new path prefix needs a policy for signed URL reads via service role only, document that signed URL uses service client after RPC authz (mirror `signed-document-url`).

- [ ] **Step 4: Re-run SQL test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608080001_client_onboarding_pack.sql supabase/tests/015_client_onboarding_pack.sql
git commit -m "feat(onboarding-pack): schema RLS and pack RPCs"
```

---

### Task 3: Edge Function — upload

**Files:**
- Create: `supabase/functions/upload-onboarding-document/index.ts`
- Copy classifier logic inline or import if Deno bundling allows; **preferred:** embed a minimal Deno-compatible classify by reading the same rules (duplicate the small RULES table in TS to avoid cross-runtime packaging pain), OR use `npm:` import if project already supports it. **Plan choice: duplicate classify rules in TS file matching classifier.mjs outputs** (keep in sync comment pointing at `services/onboarding-pack/src/classifier.mjs`).

**Interfaces:**
- Consumes: user Bearer JWT, form fields `client_id`, `document` (File)
- Produces: JSON `{ document, classification }` or `{ error }`

- [ ] **Step 1: Implement function** (mirror `upload-client-asset/index.ts` structure)

Critical differences from brand assets:

| Item | Value |
| --- | --- |
| Bucket | `campaign-private` |
| AuthZ | `can_manage_onboarding_pack` via RPC or `get_workspace_context` + master_admin/director check **and** `mfa_enforced` |
| Path | `onboarding/${clientId}/${docId}/${safeName}` |
| Max bytes | 26214400 |
| Register RPC | `register_onboarding_document` with service role **as API key**, user JWT for auth context if RPC is security definer using `auth.uid()` — **must set** user context. Pattern: call RPC with userClient if granted to authenticated, OR pass `p_uploaded_by` and validate membership inside RPC with `auth.uid()` — register is security definer checking `auth.uid()`; Edge must invoke with **user JWT** as Authorization and service key only if required for storage. |

**Recommended Edge auth flow (lock):**

1. Create `userClient` with anon + Authorization bearer (user JWT).  
2. Verify `getUser()`.  
3. Call `userClient.rpc('can_manage_onboarding_pack', { p_client_id })` — must be true.  
4. Compute sha256 of bytes (Web Crypto).  
5. Classify filename + mime. If `rejected`, return 400 without upload.  
6. Generate `docId = crypto.randomUUID()`, path `onboarding/${clientId}/${docId}/${safeName}`.  
7. Upload with **serviceClient** to `campaign-private`.  
8. Call `userClient.rpc('register_onboarding_document', {…})` — if RPC is security definer and granted to authenticated, user JWT is enough; if grant is service_role only, use serviceClient.rpc after membership already verified, and set `p_uploaded_by` to user id with RPC verifying membership of that user **or** switch register to accept only service_role and re-check membership by `p_uploaded_by` like `register_client_asset`.

**Align with `register_client_asset`:** grant `register_onboarding_document` to **service_role only**; Edge verifies manage rights via userClient RPC `can_manage_onboarding_pack`; then serviceClient.rpc register with `p_uploaded_by = user.id`. Inside register, verify director-or-master for `p_uploaded_by` (not only auth.uid()), because service role has no auth.uid().

Update Task 2 register function accordingly:

```sql
-- Inside register_onboarding_document when called as service_role:
-- require p_uploaded_by is director of client OR master_admin for that user,
-- and that user's profile mfa_enforced = true.
```

- [ ] **Step 2: Manual smoke (local functions)**

```bash
# After supabase functions serve + logged-in token:
# curl -X POST "$FN_URL/upload-onboarding-document" \
#   -H "Authorization: Bearer $USER_JWT" \
#   -H "apikey: $ANON" \
#   -F client_id=org_hacker_dojo \
#   -F document=@/tmp/bylaws.pdf
```

Expected: 200 + document row with `suggested_type` governance-ish.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/upload-onboarding-document
git commit -m "feat(onboarding-pack): upload edge function to campaign-private"
```

---

### Task 4: Edge Function — signed preview URL

**Files:**
- Create: `supabase/functions/onboarding-document-url/index.ts`

**Interfaces:**
- Consumes: POST JSON `{ documentId, expiresIn? }` + user Bearer
- Produces: `{ signedUrl, expiresIn, expiresAt }`

- [ ] **Step 1: Implement** mirroring `signed-document-url/index.ts`:

1. Auth user via userClient.  
2. `userClient.rpc('issue_onboarding_document_access', { p_document_id, p_ttl_seconds })`.  
3. serviceClient.storage.from(bucket).createSignedUrl(path, expiresIn).  
4. Return signed URL. Never return storage path alone without signing.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/onboarding-document-url
git commit -m "feat(onboarding-pack): signed URL edge function"
```

---

### Task 5: Workspace UI

**Files:**
- Create: `workspace/onboarding-pack.js`
- Modify: `workspace/session.js` — add capability
- Modify: `workspace.js` — nav + openSection

**Interfaces:**
- Consumes: `createWorkspaceClient`, `requireWorkspaceSession`, `roleCan`, selected client id from workspace state, Edge function base URL from runtime config or `${supabaseUrl}/functions/v1/...`
- Produces: `mountOnboardingPack(containerEl, { clientId, session, isMasterAdmin })`

- [ ] **Step 1: Extend `roleCan`**

In `workspace/session.js` matrix add:

```js
onboarding_pack: ['director'],
```

Nav visibility: show if `roleCan(role, 'onboarding_pack') || isMasterAdmin`.

- [ ] **Step 2: Wire nav in `workspace.js`**

Where nav items are built (~line 302–316):

```js
if (roleCan(role, 'onboarding_pack') || isMasterAdmin) {
  items.push({ id: 'onboarding_pack', label: 'Onboarding pack' });
}
```

In `openSection`:

```js
} else if (section === 'onboarding_pack') {
  const { mountOnboardingPack } = await import('./workspace/onboarding-pack.js');
  await mountOnboardingPack(content, {
    clientId: selectedClient.id,
    session: await requireWorkspaceSession(),
    isMasterAdmin
  });
}
```

(Use the same session/client variables already in scope in `workspace.js`; adjust names to match file.)

- [ ] **Step 3: Implement `workspace/onboarding-pack.js`**

Required UI behaviors:

1. On mount: `supabase.rpc('get_onboarding_pack', { p_client_id: clientId })` (or fetch REST). Show error if denied.  
2. Render header: progress `requiredConfirmed/requiredTotal`, status badge.  
3. Render checklist from response slots.  
4. File input + drag/drop; for each file POST to `upload-onboarding-document` with Authorization bearer + apikey anon.  
5. After upload, refresh pack.  
6. For each non-parked, non-confirmed doc: select slot + Confirm button → `confirm_onboarding_document`.  
7. Parked docs: amber note “Stored privately. List ingest is a separate step; not enabled from this pack.” No confirm-to-required.  
8. Preview button → `onboarding-document-url` → open signed URL in new tab.  
9. Ready state: green message + “Pack ready does not enable CRM import or outreach.”

Copy authority one-liner in empty state.

- [ ] **Step 4: Manual UI check**

Login as director on synthetic client → upload sample PDF named `bylaws.pdf` → confirm Governance → repeat for five required → badge Ready.

- [ ] **Step 5: Commit**

```bash
git add workspace/onboarding-pack.js workspace/session.js workspace.js
git commit -m "feat(onboarding-pack): workspace checklist and upload UI"
```

---

### Task 6: Runbook + suite pointers + CURRENT-STATE

**Files:**
- Create: `docs/CLIENT-ONBOARDING-PACK.md`
- Modify: `docs/SUITE-ONBOARDING.md`
- Modify: `docs/COMMERCIAL-CLIENT-LIFECYCLE.md`
- Modify: `docs/CURRENT-STATE.md`
- Modify: `docs/superpowers/specs/2026-08-08-client-onboarding-pack-design.md` status line to “Implementation planned / in progress” if desired

- [ ] **Step 1: Write runbook** covering:

- Who (director / master_admin)  
- MFA prerequisite  
- How to open Onboarding pack  
- Required slots list  
- Upload → confirm flow  
- Parked CRM behavior  
- Authority: pack ready ≠ import ≠ outreach ≠ activated  
- Operator: apply migration `202608080001_client_onboarding_pack.sql`; deploy both Edge functions; no service_role on Vercel  

- [ ] **Step 2: Link from SUITE-ONBOARDING map table and “Done without every.org” where accurate after OBSERVED**

- [ ] **Step 3: COMMERCIAL-CLIENT-LIFECYCLE** — short “Parallel: document pack” section after activate (optional, not a gate)

- [ ] **Step 4: CURRENT-STATE** block:

```yaml
client_onboarding_pack:
  status: PENDING  # or OBSERVED after Task 7 dry-run
  template: onboarding_pack_v1
  production_import: BLOCKED
  path: docs/CLIENT-ONBOARDING-PACK.md
```

- [ ] **Step 5: Commit**

```bash
git add docs/CLIENT-ONBOARDING-PACK.md docs/SUITE-ONBOARDING.md docs/COMMERCIAL-CLIENT-LIFECYCLE.md docs/CURRENT-STATE.md
git commit -m "docs: Client Onboarding Pack runbook and hub links"
```

---

### Task 7: Operator dry-run evidence

**Files:**
- Modify: `docs/CURRENT-STATE.md` only (evidence)

- [ ] **Step 1:** Apply migration to platform (operator):

```bash
supabase link --project-ref utdioxwiskzatwoejgiu
PLATFORM_CONFIRM_PROJECT_REF=utdioxwiskzatwoejgiu \
  ./scripts/staging/apply-migrations.sh remote-linked
```

- [ ] **Step 2:** Deploy functions:

```bash
supabase functions deploy upload-onboarding-document --project-ref utdioxwiskzatwoejgiu
supabase functions deploy onboarding-document-url --project-ref utdioxwiskzatwoejgiu
```

- [ ] **Step 3:** Synthetic dry-run on a non-production-sensitive client (or HD with **synthetic PDF only**):

1. Login director or master_admin with MFA.  
2. Upload five small synthetic PDFs/PNGs with clear names.  
3. Confirm required slots → Ready.  
4. Upload a dummy `donors.csv` → parked, cannot complete as EIN.  

- [ ] **Step 4:** Set CURRENT-STATE `client_onboarding_pack.status: OBSERVED` with date; no secrets.

- [ ] **Step 5: Commit**

```bash
git add docs/CURRENT-STATE.md
git commit -m "docs: OBSERVED Client Onboarding Pack dry-run"
```

---

### Task 8: PR + merge readiness

- [ ] **Step 1:** Ensure design spec is on main (merge PR #103 if still open) then open implementation PR(s). Prefer **one PR** for 1a if small enough, or stack: schema → edge → UI → docs.

- [ ] **Step 2:** PR body checklist:

- [ ] Classifier unit tests pass  
- [ ] SQL test `015_client_onboarding_pack.sql` pass  
- [ ] No service_role in browser  
- [ ] production_import still BLOCKED  
- [ ] Parked CRM cannot confirm  
- [ ] Docs linked  

- [ ] **Step 3:** Do not claim complete until Task 7 evidence or honest PENDING remains in CURRENT-STATE.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Hybrid checklist + template v1 | 1, 2 |
| Upload only to private storage | 3 |
| Suggest only / human confirm | 1, 2, 5 |
| Pack ready on required confirmed | 2, 5 |
| Park xlsx/csv | 1, 2, 5 |
| Director + master_admin MFA | 2 (`can_manage_onboarding_pack`) |
| Signed preview | 4 |
| No import promote / no connectors | Global + Tasks 2–5 omit |
| No activate_client coupling | Global + Task 6 copy |
| Audit events | 2 |
| Tests | 1, 2 |
| Runbook + CURRENT-STATE | 6, 7 |
| Phase 2/3 handoff | Documented in runbook only; not built |

## Open plan choices (already locked here)

1. Register RPC: **service_role only** + Edge membership check (matches `register_client_asset`).  
2. Storage path: `onboarding/<client_id>/<document_id>/<safe_filename>`.  
3. Classifier: JS package for tests; rules duplicated in Edge TS with sync comment.  
4. Pack created lazily via `ensure_onboarding_pack` / `get_onboarding_pack`.  
5. Dedupe: unique `(client_id, sha256)` preferred — if unique on sha256, register returns existing; migration should add `unique (client_id, sha256)` **or** handle conflict in RPC (pick **unique (client_id, sha256)** in migration; drop unique on storage_path if redundant).

**Final migration uniqueness:** `unique (client_id, sha256)` for dedupe; `storage_path` unique globally.

---

## Out of scope reminders (do not implement in this plan)

- Connectors, auto-confirm, OCR field extraction  
- import_batch creation from parked files (phase 2)  
- Shell wizard glue / activate hard gate (phase 3)  
- data_steward pack role  
