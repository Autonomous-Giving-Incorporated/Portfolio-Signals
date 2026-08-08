# Client Onboarding Pack

Director / master_admin path for the **document-phase** Onboarding Pack in Portfolio Signals workspace: private multi-file upload, human-confirmed checklist slots, pack `ready` when required slots are filled. CRM workbooks are **parked**—never promoted to constituents.

**Status (2026-08-08):** **Code shipped** on main ([Portofolio-Signals #104](https://github.com/scrimshawlife-ctrl/Portofolio-Signals/pull/104)). Platform migrate + Edge deploy + MFA dry-run still **PENDING** — see [CURRENT-STATE.md](CURRENT-STATE.md).

**Platform:** Supabase `utdioxwiskzatwoejgiu`  
**Workspace:** https://autogive.app/portfolio-signals/workspace → nav **Onboarding pack**  
**Template:** `onboarding_pack_v1`  
**Design:** [docs/superpowers/specs/2026-08-08-client-onboarding-pack-design.md](superpowers/specs/2026-08-08-client-onboarding-pack-design.md)  
**Plan:** [docs/superpowers/plans/2026-08-08-client-onboarding-pack.md](superpowers/plans/2026-08-08-client-onboarding-pack.md)

## Authority gates

```yaml
production_import: BLOCKED
outreach: NOT_GRANTED
service_role_on_vercel: PROHIBITED
secrets_in_git: PROHIBITED
pack_ready_≠_import_authorized: true
pack_ready_≠_outreach_authorized: true
pack_ready_≠_client_activated: true
```

**Hard rule:** pack status `ready` does **not** authorize production CRM import, outreach, or client activation. It only means required org-proof documents are human-confirmed in private storage.

| Gate | Pack effect |
| --- | --- |
| Pack `ready` | Required slots confirmed |
| Import | Still **BLOCKED** / separate governed path |
| Outreach | Still **NOT_GRANTED** |
| Client `active` | Still requires commercial lifecycle activate (slice B) |

## Who can use it

| Role | Scope |
| --- | --- |
| **director** | Own client(s) with active membership |
| **master_admin** | Any client (platform view / client switcher) |

Write operations require an **active profile** with **`mfa_enforced = true`** and either `is_master_admin()` or active **director** membership on that `client_id`. Anon and other roles are denied.

People path (MFA + membership): [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md).

## MFA prerequisite

1. User enrolls MFA (TOTP) in Supabase Auth.  
2. Operator confirms enrollment; sets `mfa_enforced = true` via `scripts/platform/set-mfa-enforced.sql` (after enroll—never reverse order).  
3. Sign in to workspace with MFA-capable session before opening **Onboarding pack**.  
4. Without enforced MFA, pack APIs/Edge return forbidden.

## Open the Onboarding pack

1. Open workspace: https://autogive.app/portfolio-signals/workspace  
2. Sign in (magic link / Auth) with MFA.  
3. **Select the client** in the workspace client context.  
4. Nav → **Onboarding pack** (visible to director and master_admin).  
5. Pack row is created lazily on first open/upload (`onboarding_pack_v1`).

Empty-state copy: private-to-client document room—not public Pages, not automatic CRM.

## Required slots (`onboarding_pack_v1`)

All five must have a **human-confirmed** document before pack status becomes `ready`:

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

| Type | Meaning |
| --- | --- |
| `uncategorized` | Stored; type not confirmed |
| `parked_crm` | Workbook/CSV list-ingest candidate (phase 2) |
| `rejected` | Failed validation (size/MIME) |

## Upload → confirm flow

1. Select client → open **Onboarding pack**.  
2. Drop or choose files (multi-file supported). Max **25 MiB** per file.  
3. Allowed general types: PDF, PNG, JPEG, WebP, SVG, DOCX, TXT.  
4. Upload goes to private bucket **`campaign-private`** under a tenant onboarding path (never public Pages).  
5. Classifier sets **`suggested_type` only**—never auto-confirms.  
6. For each stored document: choose slot (or uncategorized) → **Confirm**.  
7. Replacing a slot: confirm another file onto the same slot; prior active doc is **superseded**.  
8. Progress shows required `n/5`; when all five required slots are confirmed, pack status → **`ready`**.  
9. If a required active doc is superseded without replacement, pack returns to **`in_progress`**.  
10. Preview uses short-lived signed URLs (`onboarding-document-url`); browser never holds `service_role`.

### Confirm rules

- Confirm rejects documents with status `parked_crm`.  
- Confirm type must be a template slot key (required or optional).  
- UI + API both prevent binding parked CRM into org-proof slots.

## Parked CRM behavior

| Input | Behavior |
| --- | --- |
| `.xlsx` / `.xls` / `.csv` (person-list shaped spreadsheets) | Upload **accepted** as `parked_crm` |
| Confirm to org-proof / optional slot | **Hard fail** |
| Counts toward pack `ready` | **Never** |
| Constituent promote / import batch | **Not created** (phase 1) |

Parked rows stay visible with a clear banner that the org is **not** “CRM onboarded.” Phase 2 may hand off parked objects to import quarantine; production import remains **BLOCKED** until separate authority.

## Operator deploy notes

Apply on platform only (`utdioxwiskzatwoejgiu`). Do not use frozen legacy staging for new tenancy.

### 1. Migration

```text
supabase/migrations/202608080001_client_onboarding_pack.sql
```

Example (linked project; confirm ref):

```bash
supabase link --project-ref utdioxwiskzatwoejgiu
PLATFORM_CONFIRM_PROJECT_REF=utdioxwiskzatwoejgiu \
  ./scripts/staging/apply-migrations.sh remote-linked
```

### 2. Edge functions (both required)

| Function | Role |
| --- | --- |
| `upload-onboarding-document` | Multipart upload → `campaign-private` → register document + classify |
| `onboarding-document-url` | Short-lived signed read URL for pack docs |

Deploy both to the platform project. Edge may use service_role **only inside the function**; Vercel/static runtime stays **anon + user JWT only**.

### 3. Secrets / Vercel

```yaml
service_role_on_vercel: PROHIBITED
```

- No `service_role` in `runtime-config.js`, Vercel env for Pages, or browser.  
- Secrets never in git, issues, or commit messages.

### 4. SQL acceptance (optional local/CI)

`supabase/tests/015_client_onboarding_pack.sql` — authz, park confirm fail, ready/demote.

Classifier unit tests: `cd services/onboarding-pack && npm test`.

## Synthetic dry-run checklist

Prefer a disposable client (or fixture tenant under operator control). Use **synthetic** PDFs/images only—no real donor lists or real tax docs in fixtures/git.

- [ ] MFA director or master_admin session  
- [ ] Open Onboarding pack for selected client  
- [ ] Upload allowed org docs → confirm all five required slots  
- [ ] Pack badge shows **ready**  
- [ ] Upload `.xlsx`/`.csv` → appears **parked**; cannot confirm to EIN/governance  
- [ ] Confirm: no import batch, no outreach grant, client `state` unchanged by pack alone  
- [ ] Record evidence in [CURRENT-STATE.md](CURRENT-STATE.md)

## Failure modes

| Symptom | Fix |
| --- | --- |
| `onboarding_pack_forbidden` / Access denied | Director membership or master_admin + `mfa_enforced` |
| Oversize / disallowed type | Max 25 MiB; allowlist MIME/ext; xlsx/csv park, not reject |
| Confirm parked as org slot | Expected hard fail—leave as parked |
| Pack never `ready` | Confirm all five required slots (optional do not count) |
| Upload 403 after deploy | Migration + both Edge functions on platform; JWT session |

## Related

- [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md) — suite map  
- [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md) — provision → publish → activate (parallel to pack)  
- [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — people / MFA  
- [CLIENT-CONFIGURATION.md](CLIENT-CONFIGURATION.md) — Brand & content publication  
- [IMPORT-RUNBOOK.md](IMPORT-RUNBOOK.md) — governed import (separate; production BLOCKED)  
- [DATA-PLACEMENT.md](DATA-PLACEMENT.md) — private vs public placement  
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — workspace roles  
- [CURRENT-STATE.md](CURRENT-STATE.md) — live evidence  
