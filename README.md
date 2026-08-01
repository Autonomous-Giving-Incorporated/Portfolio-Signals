# Hacker Dojo Campaign Intelligence

A governed campaign-control system for Hacker Dojo's **$420K minimum campaign** and **$2M transformation path**.

The repository now contains both a privacy-safe public director portal and the controlled foundation for an authenticated campaign workspace. It does **not** contain member, donor, attendee, or relationship-level source data.

## Verified implementation state

As of 2026-08-01:

| Capability | State |
|---|---|
| Public director portal | Implemented |
| Canonical public campaign data | Implemented |
| JSON Schema validation | Passing |
| GitHub Pages validation workflow | Passing |
| GitHub Pages deployment | Plan-gated (private free plan unsupported; deploy skips without failing validation) |
| Static security policy checks | Passing |
| Workbook parser contract | Passing |
| Authenticated database schema | Implemented |
| Six application roles | Implemented |
| Row-level-security policies | Implemented; six-role disposable suite green |
| MFA / active-profile hardening | Implemented in schema; provider enablement is operator-owned |
| Append-only audit model | Implemented |
| Sponsor and grant workflow schema | Implemented |
| Decision approval workflow | Implemented |
| Import quarantine and suppression controls | Implemented |
| Import-gate executable corpus | Wired into local Supabase CI |
| Client/schema alignment | Hardened in HD-OI-019 |
| Private storage policies | Implemented |
| Signed-document URL function | Implemented against `document_records` |
| Native `.xlsx` parser | Implemented; quarantine-only |
| Synthetic role fixtures | Implemented with MFA flags |
| Production environment checklist | Documented; live projects not yet configured |
| Production data import | Blocked |
| Outreach authority | Not granted |

## Repository map

```text
index.html                               Public director portal
styles.css                              Visual system
app.js                                  Client-side interactions
data/public-campaign.json               Canonical public aggregate state
schemas/public-campaign.schema.json     Public-data contract

supabase/migrations/                    Governed database schema and controls
supabase/functions/signed-document-url  Authenticated private-document access
supabase/tests/                         Synthetic fixtures and policy checks
services/workbook-parser/               Native XLSX quarantine parser
services/import-api/                    Parser-to-import-batch service boundary

docs/AUTHENTICATED-WORKSPACE.md         Private application architecture
docs/IMPORT-RUNBOOK.md                  Import and reconciliation procedure
docs/PRODUCTION-HARDENING.md            Staging/production operator checklist
docs/STAGING-BOOTSTRAP.md               Staging bootstrap and verification
docs/HD-OI-019.md                       Current hardening phase notes
scripts/staging/                        Local/staging bootstrap helpers (no secrets)
workspace/                              Authenticated decision and pipeline modules
ROADMAP.md                              Current execution roadmap
SECURITY.md                             Data-handling boundary
.github/workflows/                      Validation, security, Pages, and Supabase CI
```

## Campaign architecture

```yaml
minimum_target: 420000
stretch_target: 2000000
campaign_event: SupperHappyFundHouse
campaign_event_date: 2026-08-21
proposition: Keep the room where builders become possible.
call_to_action: Come home. Build something. Fund the next builder.
```

Proposed funding thresholds remain subject to director and board approval:

```yaml
stabilization: 420000
growth: 750000
expansion: 1200000
transformation: 2000000
```

## Public impact surface

Live public donation progress, use-of-funds receipts, and event digests are published on **Impact Relay** (aggregate-only, no CRM data):

https://scrimshawlife-ctrl.github.io/Impact-Relay/

Repository: https://github.com/scrimshawlife-ctrl/Impact-Relay

## Privacy and authority boundary

The repository must never contain:

- raw member or attendee registries;
- personal email addresses, phone numbers, or street addresses;
- donation histories or private donor notes;
- relationship scores or contact recommendations;
- consent, suppression, or outreach state tied to real people;
- private campaign documents;
- production credentials or service-role values.

GitHub Pages is a public publishing surface, not a CRM access-control layer. Restricted records belong only in the authenticated application and private data service.

The source development list is evidence, not outreach authorization. A historical relationship, attendance record, or Meetup export does not establish consent to fundraising contact.

## Local public-portal preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Validate the public campaign contract

The CI workflow loads `ajv-formats` so the schema retains strict standard date validation.

```bash
npx --yes \
  --package ajv-cli@5 \
  --package ajv-formats@3 \
  ajv validate \
  --spec=draft2020 \
  -c ajv-formats \
  -s schemas/public-campaign.schema.json \
  -d data/public-campaign.json
```

## Local Supabase policy validation

The executable workflow performs the following sequence against a disposable local project:

1. Start the pinned Supabase stack.
2. Reset the database and apply the complete migration chain.
3. Resolve and validate the local database URL.
4. Load synthetic profiles for all six roles.
5. Execute RLS and import-policy acceptance tests.
6. Stop and discard the local stack.

PR #14 observed a green disposable run for migrations, six-role fixtures, and RLS acceptance checks. This repository now also executes the synthetic import-gate corpus (confirmed, restricted, duplicate, suppressed, unauthorized promotion, and eligible promotion) in that same workflow.

## Required production configuration

Before any real record is imported:

- provision separate staging and production Supabase projects;
- enforce MFA for privileged roles;
- configure deployment secrets and key rotation;
- deploy and verify private object-storage policies;
- verify signed-URL expiration and audit events;
- execute positive and negative tests for every role;
- approve privacy, consent, retention, suppression, and export rules;
- approve the $420K use-of-funds schedule and sponsor benefits;
- name accountable campaign and data owners;
- supply a native spreadsheet export through the quarantine workflow.

## Current campaign-control state

```yaml
public_portal: PASS
public_schema_validation: PASS
pages_validation: PASS
pages_deploy: PLAN_GATED
static_policy_checks: PASS
local_security_contract: PASS
migration_chain: PASS
synthetic_fixture_loading: PASS
six_role_rls_execution: PASS
import_gate_execution: PASS
identity_mfa_controls: IN_PROGRESS_HD_OI_019
production_supabase: NOT_CONFIGURED
production_import: BLOCKED
outreach: BLOCKED
sensitive_data_in_repo: PROHIBITED
```

See [ROADMAP.md](ROADMAP.md), [SECURITY.md](SECURITY.md), and [docs/AUTHENTICATED-WORKSPACE.md](docs/AUTHENTICATED-WORKSPACE.md).
