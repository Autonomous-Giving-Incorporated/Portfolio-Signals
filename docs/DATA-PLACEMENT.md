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

## Staging Supabase project (observed)

| Field | Value | Label |
|---|---|---|
| Dashboard | https://supabase.com/dashboard/project/ecxkhihlbrcwpavfoaoq | OBSERVED (operator-provided) |
| Project ref | `ecxkhihlbrcwpavfoaoq` | OBSERVED |
| API host | `https://ecxkhihlbrcwpavfoaoq.supabase.co` | OBSERVED |
| GitHub link | Project associated with this repository | OBSERVED (operator-reported) |
| Classification | Treat as **staging** until leadership names production | OPERATOR DEFAULT |
| Migrations applied | 10 repository migrations verified on hosted staging | OBSERVED |
| Pages runtime | Deploy-generated public URL + anon key; no service-role material | OBSERVED |
| Production import | **BLOCKED** | POLICY |
| Real workbook load | **BLOCKED** until HD-OI-020 gates | POLICY |

Never commit service-role keys or database passwords. The browser-public anon key is stored as a
masked Actions secret and emitted only into the deployed Pages artifact; local `runtime-config.js`
copies remain gitignored. Supabase RLS, not key secrecy, is the browser data-access boundary.

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

1. Preserve the verified staging migrations, MFA controls, Pages runtime, and private bucket.
2. Supply trusted CIDRs and close the backup/restore gate.
3. Keep all tests synthetic until HD-OI-020 leadership authorization.
4. Only then consider quarantine import of an explicitly authorized workbook hash.

Provenance: Notion Sprint 001 Hub + Loop 805 Slice HD-OI-019 + Hash: b573fe078296bcc02e9d4e21140cf777d9d050d2
