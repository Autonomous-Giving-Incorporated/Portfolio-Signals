# Data Placement Policy

**Authority:** Engineering placement only. This document does **not** authorize production import or outreach.

## Placement decision (2026-08-01)

Private campaign CRM and development-list data use **local operator storage + Supabase**.

| Surface | Role | Personal / donor data |
|---|---|---|
| Operator machine (local) | Canonical source workbook until quarantine upload | Allowed while import is blocked; never commit |
| Supabase Postgres + RLS | System of record for quarantine, constituents, consent, pipelines | Allowed only after governed import |
| Supabase Storage `campaign-private` | Encrypted source objects and private documents | Allowed with private bucket policies |
| GitHub / this repository | Code, schemas, synthetic fixtures, aggregate public JSON | **Prohibited** |
| GitHub Pages (director portal) | Public campaign aggregates | **Prohibited** for person-level data |
| Impact Relay Pages | Aggregate raised / UOF / digests / public evidence | **Prohibited** for person-level data |
| Notion | Strategy kits, public evidence aggregates, org research notes | **Not** the CRM system of record; no bulk donor roster |

## Flow (authorized import only)

```text
local native .xlsx
  → private channel + SHA-256 receipt
  → Supabase Storage campaign-private
  → workbook-parser → import_batches / import_staging_rows
  → steward review (approve / reject)
  → promote eligible rows → constituents
  → retention / purge per policy
```

See [IMPORT-RUNBOOK.md](IMPORT-RUNBOOK.md) and [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md).

## Supabase projects (suite-wide)

**Do not fragment.** New multi-tenant / AGI admin work uses **platform** only.  
**Default:** platform ref `utdioxwiskzatwoejgiu`. **Legacy frozen:** `ecxkhihlbrcwpavfoaoq`.

| Role | Project ref | Host | Classification |
|---|---|---|---|
| **Platform (canonical)** | `utdioxwiskzatwoejgiu` | `https://utdioxwiskzatwoejgiu.supabase.co` | AGI multi-tenant data plane; GitHub-linked |
| **Dashboard** | — | https://supabase.com/dashboard/project/utdioxwiskzatwoejgiu | OBSERVED |
| **Legacy HD staging** | `ecxkhihlbrcwpavfoaoq` | `https://ecxkhihlbrcwpavfoaoq.supabase.co` | **Freeze** for new tenancy; migrate then retire |

Schema source of truth remains this repo’s `supabase/migrations`. **Operator applies migrations** to platform (not assumed applied by docs alone):

```bash
supabase link --project-ref utdioxwiskzatwoejgiu
PLATFORM_CONFIRM_PROJECT_REF=utdioxwiskzatwoejgiu \
  ./scripts/staging/apply-migrations.sh remote-linked
```

Authenticated workspace production URL: https://autogive.app/portfolio-signals/workspace  
Primary `master_admin`: `scrimshawlife@gmail.com`. Second admin (Qi Diaz) deferred — `platform_administrators` insert with rationale ≥ 12 chars.

Never commit service-role keys, database passwords, or anon keys if they are rotated/sensitive in your threat model. Browser runtime may hold the **anon** key in a **gitignored** `runtime-config.js` only (or Vercel build from `PLATFORM_SUPABASE_*` env).

Suite hosting canon: [AGI PLATFORM.md](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Incorporated/blob/main/docs/PLATFORM.md).

## Master Development List (source inventory only)

A native development workbook was inventoried **offline** for structure. No workbook bytes, names, emails, or phones are stored in this repository.

| Field | Aggregate-only fact |
|---|---|
| Filename pattern | `Master Development List 1.2 Hacker Dojo 2025.xlsx` |
| SHA-256 | `53239b7ed197f59bc4219b7053aef3fd0471a9dbcab4f40b67e6fff04b48f97f` |
| Approx. size | ~3.0 MiB |
| Sheets | 11 |
| High-PII sheet classes | Individual donor lists, active member donor list, whole list, attendees, founding/previous donors |
| Org-pipeline sheets | Foundations grantors, corporate sponsors, top innovators |
| Duplicate signal | Two large donor sheets share the same non-empty row count (~12,591 data rows + header) |
| Import authority | **Not granted** — leadership must authorize this SHA-256 (or a successor export) |

Outreach from historical membership, attendance, or this list alone remains **not authorized**.

## Operator continue path (outside this PR)

1. `supabase link --project-ref utdioxwiskzatwoejgiu` (platform — not legacy HD staging)
2. **Operator applies migrations** (`apply-migrations.sh remote-linked` or `supabase db push`)
3. Wire gitignored / deploy-generated `runtime-config.js` with platform URL + anon key only
4. Invite `scrimshawlife@gmail.com`; run `scripts/platform/bootstrap-master-admin.sql`; enable MFA as required
5. Verify import gates / RLS / storage matrix (prefer disposable local, then platform)
6. Smoke magic-link on https://autogive.app/portfolio-signals/workspace
7. Only then consider HD-OI-020 quarantine import of the authorized workbook
8. Keep `ecxkhihlbrcwpavfoaoq` frozen; retire after data confirmation
