# Client Onboarding Pack (document phase) — design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning (pending user review of this file)  
**Suite project:** [AGI GitHub Project #3](https://github.com/users/scrimshawlife-ctrl/projects/3)  
**Primary repo:** Fund-Intel / Portfolio Signals (`scrimshawlife-ctrl/Portofolio-Signals` / Fund-Intel checkout)  
**Related:** commercial shell lifecycle (slice B), governed import (HD-OI-015), DATA-PLACEMENT

## 1. Context

Commercial onboarding today is split:

| Path | State |
| --- | --- |
| People (C) + client shell (B) + second tenant (D) | Runbooks OBSERVED; provision → publish → activate works |
| Governed CRM import | Pipeline exists (`import-api`, workbook-parser, quarantine); **production import BLOCKED** |
| Private documents / assets | Storage `campaign-private`, edge upload/signed-url patterns exist |
| Client-facing “bring your docs” wizard | **Missing** |

Operators and client directors need a **low-friction pack**: upload what they have, get it into private tenant storage with receipts, and complete a small required checklist—without silently loading CRM lists or authorizing outreach.

### Decisions from brainstorming (locked)

| Topic | Decision |
| --- | --- |
| Phasing | Phase 1 document room → phase 2 list quarantine handoff → phase 3 shell wizard glue |
| Users | Role-aware: **director** (own client) + **master_admin** (any client) |
| Checklist | Hybrid: required org-proof + optional ops docs + uncategorized tray |
| Automation | **Suggest** type only; human must **confirm**; no auto-bind in phase 1 |
| Pack complete | All **required** slots have a **human-confirmed** document |
| Intake | **Upload only** (no Drive/Salesforce connectors in phase 1) |
| CRM workbooks | **Park** (`parked_crm`); never complete org-proof slots; CTA for phase 2 |
| Architecture | Workspace **Onboarding pack** module (Approach 1), not import mega-wizard |

## 2. Goal

Ship a client-scoped **Onboarding Pack** in the authenticated Portfolio Signals workspace so a director or master_admin can:

1. Upload org and fundraising documents into private storage with integrity receipts.  
2. See suggested document types and **confirm** them onto a versioned checklist.  
3. Reach pack status **ready** when all required slots are confirmed.  
4. Park CRM-looking spreadsheets without promoting constituents or implying import authority.

### Success definition (phase 1)

1. Director completes required pack for a membership client without operator SQL.  
2. master_admin can run the same flow for any client.  
3. No UI/API path from the pack to constituent promote or outreach.  
4. Parked workbook is visible and clearly not “CRM onboarded.”  
5. Automated tests cover authz, park rules, and ready transition (fixtures only).  
6. Pilot evidence recordable in `docs/CURRENT-STATE.md` as OBSERVED on synthetic docs.

## 3. Approach

**Selected: Workspace Onboarding Pack module (Approach 1).**

| Alternative | Why not phase 1 |
| --- | --- |
| Funnel all files through import-api | Wrong abstraction for PDFs; couples to production-import politics |
| Operator-only zip scripts | Not client self-serve; fails product goal (keep as emergency fallback only) |

## 4. Scope

### In scope (phase 1 / 1a–1b)

- Pack data model (packs, documents, slot bind rules, template version).  
- Upload to Supabase Storage `campaign-private` under tenant onboarding prefix.  
- Heuristic classifier → `suggested_type` only.  
- Confirm / unconfirm / supersede slot binding.  
- Workspace UI: checklist, drop zone, recent uploads, progress, ready badge.  
- Signed short-lived preview URLs.  
- Audit events for upload, confirm, unconfirm, supersede, pack ready / demote.  
- AuthZ: director membership **or** master_admin; privileged MFA aligned with import/workspace.  
- Docs: runbook pointer from SUITE-ONBOARDING / COMMERCIAL-CLIENT-LIFECYCLE; CURRENT-STATE block.  
- Explicit non-link of pack `ready` to `activate_client` gates in phase 1 (soft “what’s next” copy only).

### Out of scope (phase 1)

- Google Drive / Dropbox / Salesforce / every.org connectors.  
- Auto-confirm on high confidence (phase 1b+ optional).  
- PDF/OCR extraction of EIN or legal name into `clients` profile fields.  
- Creating `import_batches` or staging rows (phase 2).  
- Changing production import authority or outreach grants.  
- Self-serve nonprofit marketplace signup.  
- data_steward as first-class pack role (may read later; not required for MVP).  
- Hard gate: pack ready required before `activate_client` (phase 3 discussion only).

### Later phases (explicit)

| Phase | Deliverable |
| --- | --- |
| **1b** | Bulk upload polish, better suggestions, preview UX |
| **2** | Parked CRM object → import quarantine handoff (still no auto-promote) |
| **3** | Shell onboarding wizard links pack status (soft checklist or optional gate) |

## 5. Authority rules (must hold)

```yaml
production_import: BLOCKED
outreach: NOT_GRANTED
service_role_on_vercel: PROHIBITED
secrets_in_git: PROHIBITED
pack_complete_≠_import_authorized: true
pack_complete_≠_client_activated: true   # phase 1: no hard couple to activate_client
```

- Platform Supabase only: `utdioxwiskzatwoejgiu`.  
- No person-level CRM promotion from this feature.  
- No real donor/member rosters in git or CI fixtures.  
- Storage objects never public; Pages/portal must not list onboarding paths.

## 6. Architecture

```text
Workspace (selected client)
  → Onboarding Pack UI
      → Upload
          → AuthZ (director membership | master_admin) + privileged MFA
          → Object → campaign-private storage
          → Receipt (sha256, size, mime, uploader, path)
          → Classifier (heuristics) → suggested_type
          → Inventory row
      → Human confirm type → bind checklist slot (or uncategorized)
      → Required slots all confirmed → pack status = ready
  → xlsx/csv person-list shaped → parked_crm + phase-2 CTA
  → No connectors, no promote
```

### Building blocks to reuse

- Workspace session + MFA/profile patterns (`workspace.js` / session helpers).  
- Storage `campaign-private` policies; tenant path conventions under `assets/tenants/<slug>/`.  
- Edge patterns: `upload-client-asset`, `signed-document-url` (extend or mirror; browser never holds service_role).  
- Audit trail patterns from import/onboarding RPCs.  
- **Do not** route phase-1 PDFs through `create_import_batch` / import-api.

### Implementation preference (for planning)

Prefer **Postgres RLS + RPCs or Edge Functions** under user JWT for pack mutations, consistent with platform multi-tenant model. A small Node service is acceptable only if upload constraints match import-api necessity; default plan should try platform-native first.

## 7. Checklist template

**Template version:** `onboarding_pack_v1` (code/config constant; stored on pack row).

### Required (block `ready` until each has human-confirmed document)

| Slot key | UI label | Typical files |
| --- | --- | --- |
| `org_legal_name_proof` | Legal name / formation | Articles, SOS filing |
| `tax_exempt_or_ein` | Tax-exempt / EIN | IRS determination, EIN letter |
| `governance` | Governance | Bylaws or equivalent |
| `brand_logo` | Logo | PNG / SVG / JPG / WEBP |
| `primary_contact` | Primary contact card | Short PDF/doc with ops contact (not a donor list) |

### Optional (do not block `ready`)

| Slot key | UI label |
| --- | --- |
| `w9` | W-9 |
| `board_list` | Board list (org roster, not CRM dump) |
| `brand_kit` | Brand kit / style |
| `campaign_brief` | Campaign / program brief |
| `impact_sample` | Sample impact / annual PDF |
| `other` | Other |

### System trays (not completion targets)

| Tray / type | Meaning |
| --- | --- |
| `uncategorized` | Stored; type not confirmed |
| `parked_crm` | Workbook/CSV treated as list-ingest candidate |
| `rejected` | Failed validation (size/MIME/malware if implemented) |

Per-client template overrides are **out of scope** for v1.

## 8. Data model

### `client_onboarding_packs`

| Column | Notes |
| --- | --- |
| `client_id` | PK/FK → `clients.id` |
| `template_version` | e.g. `onboarding_pack_v1` |
| `status` | `in_progress` \| `ready` \| `archived` |
| `ready_at` | null until ready |
| `ready_by` | auth user id |
| `created_at` / `updated_at` | timestamptz |

Ensure pack row exists lazily on first open/upload for the client.

### `client_onboarding_documents`

| Column | Notes |
| --- | --- |
| `id` | uuid PK |
| `client_id` | FK |
| `storage_path` | private object path |
| `original_filename` | display only |
| `mime_type` | detected/declared |
| `byte_size` | int |
| `sha256` | hex; integrity receipt |
| `suggested_type` | slot key or `uncategorized` / `parked_crm` |
| `suggested_confidence` | 0–1 numeric |
| `classifier_version` | string |
| `confirmed_type` | null or slot key (never `parked_crm`) |
| `status` | `stored` \| `confirmed` \| `parked_crm` \| `rejected` \| `superseded` |
| `uploaded_by` / `confirmed_by` | auth user ids |
| `uploaded_at` / `confirmed_at` | timestamptz |

**Active document per slot:** at most one non-superseded document with `status = confirmed` and `confirmed_type = <slot>` per client. New confirm on same slot sets previous to `superseded`.

### Slot state

Implement as **view or query** over documents + template required flags (materialized `client_onboarding_slot_state` optional if performance needs it).

### Storage path

```text
campaign-private/assets/tenants/<url_slug>/onboarding/<document_id>/<safe_filename>
```

`url_slug` from client public config / clients table; never cross-tenant paths.

### Status rules

- Pack `ready` ⇔ every required slot has an active confirmed document.  
- Optional slots ignored for `ready`.  
- `parked_crm` never counts toward any required/optional slot.  
- If required active doc superseded without replacement → pack returns to `in_progress`, clear `ready_at` / `ready_by`.

## 9. Classification (suggest only)

Order:

1. **Extension/MIME gate**  
   - Allowlist for general store: `pdf`, `png`, `jpg`, `jpeg`, `webp`, `svg`, `docx`, `txt` (and docx-compatible as needed).  
   - `xlsx`, `xls`, `csv` → force `suggested_type = parked_crm`, `status = parked_crm` (upload **accepted**).  
   - Other types → reject with clear error.  
2. **Size gate** — max **25 MiB** per file (MVP); reject oversize.  
3. **Filename keywords** → map to slot keys (e.g. `bylaw`, `ein`, `501c3`, `w-9`, `logo`, `letterhead`).  
4. Default suggestion: `uncategorized` with confidence 0.  
5. **Never** set `confirmed_type` automatically in phase 1.

Classifier version string recorded for replay/debug. LLM/OCR enhancement is optional later and must remain suggest-only unless a future spec changes confirm rules.

### Dedupe

Same `client_id` + `sha256`: prefer **single inventory row** (update filename/timestamps if re-upload) rather than duplicate objects when storage allows; if object rewrite is hard, allow second row but UI groups by hash. Planner picks one implementation; behavior must not double-count slots.

## 10. API surface

Names illustrative; plan may use RPC names.

| Operation | Purpose | AuthZ |
| --- | --- | --- |
| `GET pack` | Status, slots, documents | director on client **or** master_admin; MFA for privileged |
| `POST upload` | Create object + document + classify | same |
| `POST documents/:id/confirm` | Body `{ type: <slot_key> }` | same |
| `POST documents/:id/unconfirm` | Clear bind | same |
| `GET documents/:id/url` | Short-lived signed read URL | same |

### Confirm rules

- Reject confirm if document `status = parked_crm`.  
- Reject confirm if `type` not in template slot keys (required or optional).  
- On success: set `confirmed_type`, `status = confirmed`, supersede prior active for that slot; recompute pack status.

## 11. UX

### Entry

- Workspace nav: **Onboarding pack** (client-scoped).  
- master_admin uses existing client context switch / platform selection.

### Layout (MVP single page)

- Header: client name, required progress `n/5`, status badge.  
- Left: checklist (required then optional) with bound filename when confirmed.  
- Right: drop zone + recent uploads with suggested type, confirm control, parked banner.  
- Empty state: private-to-client, not public Pages, not automatic CRM.  
- Ready state: success + “What’s next” (shell steps if still provisioning; list ingest when leadership authorizes)—**no** enablement of blocked import.

### Interactions

1. Multi-file upload supported.  
2. Confirm via dropdown of slots + uncategorized.  
3. Replace slot by confirming another file to same slot.  
4. Preview via signed URL.  
5. Cannot drag parked CRM into required slots (UI + API).

## 12. Errors

| Case | Behavior |
| --- | --- |
| Oversize | Reject; no document row |
| Disallowed type (non-park) | Reject with allowlist message |
| xlsx/csv | Accept as `parked_crm` |
| Confirm parked as org slot | Hard fail |
| Unauthorized / missing MFA | 401/403 |
| Storage failure | No confirmed orphan; fail closed |
| Classifier failure | Upload succeeds; `uncategorized` |

## 13. Security

- Private bucket only; tenant-prefixed paths.  
- List/read via authorized API + signed URLs (short TTL, align with production signed-doc bounds where applicable).  
- No service_role in browser or Vercel static config.  
- Audit: upload, confirm, unconfirm, supersede, pack_ready, pack_demoted.  
- Retention/legal-hold: inherit campaign-private policy docs; no new purge automation required in phase 1.  
- Treat pack contents as restricted campaign data (may include sensitive org/tax info).

## 14. Testing

- Unit: classifier heuristics (logo/EIN/bylaws filenames; xlsx → parked).  
- RLS/API: director A cannot access client B docs; master_admin can; anon denied.  
- Flow: upload → confirm all required → `ready`; supersede required → `in_progress`; parked cannot confirm to EIN.  
- Regression: import promote still gated/BLOCKED; `activate_client` semantics unchanged.  
- CI fixtures only—synthetic PDFs/images, no real PII.

## 15. Rollout & evidence

1. Implement 1a behind normal workspace auth (feature flag optional if risk-averse).  
2. Synthetic client dry-run on platform.  
3. Record in CURRENT-STATE:

```yaml
client_onboarding_pack:
  status: OBSERVED|PENDING
  template: onboarding_pack_v1
  production_import: BLOCKED
```

4. Link from `docs/SUITE-ONBOARDING.md` and commercial lifecycle “after activate / parallel setup.”

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| Users think pack ready = CRM live | Copy + parked tray + authority yaml |
| Sensitive tax docs in wrong tenant | Strict client_id RLS + path prefix tests |
| Classifier wrong | Suggest only; human confirm required |
| Scope creep into import | Phase 2 gate; no import-api in phase 1 |
| 25 MiB too small for brand kits | Raise limit in 1b if pilot evidence shows need |

## 17. Open points for implementation plan (not design blockers)

1. Exact RPC vs Edge vs hybrid upload session protocol.  
2. Whether pack auto-creates on client provision or only on first open.  
3. Dedupe strategy detail (storage rewrite vs multi-row group-by-hash).  
4. Optional feature flag name for gradual enablement.

These are planning choices; they must not change authority or phase-1 scope above.

## 18. Related documents

- [COMMERCIAL-CLIENT-LIFECYCLE.md](../../COMMERCIAL-CLIENT-LIFECYCLE.md)  
- [SUITE-ONBOARDING.md](../../SUITE-ONBOARDING.md)  
- [IMPORT-RUNBOOK.md](../../IMPORT-RUNBOOK.md)  
- [DATA-PLACEMENT.md](../../DATA-PLACEMENT.md)  
- [AUTHENTICATED-WORKSPACE.md](../../AUTHENTICATED-WORKSPACE.md)  
- [2026-08-06-commercial-client-lifecycle-design.md](./2026-08-06-commercial-client-lifecycle-design.md)  
