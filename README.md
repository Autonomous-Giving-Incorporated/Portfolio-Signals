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
| Workbook parser contract | Passing; executable quarantine tests cover provenance, input rejection, fail-closed parsing, and overwrite protection |
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
| Native `.xlsx` parser | Implemented; patched SheetJS 0.20.3 and Node 22 ESM execution verified; quarantine-only |
| Synthetic role fixtures | Implemented with MFA flags |
| Production environment checklist | Documented |
| Staging Supabase project | Provisioned (`ecxkhihlbrcwpavfoaoq`); migrations/MFA operator-owned |
| Private data placement | Local workbook + Supabase (not GitHub, not Notion SoR) |
| Impact Relay finance/donor host screens | Implemented (console API + Supabase role/MFA bridge) |
| Impact Relay shadow + live-cohort runbooks | Documented; live cohort execution operator-owned |
| Production data import | Blocked |
| Outreach authority | Not granted |

## Repository map

```text
index.html                               Public director portal
styles.css                              Visual system
app.js                                  Client-side interactions
data/public-campaign.json               Canonical public aggregate state
schemas/public-campaign.schema.json     Public-data contract

finance-impact.html / .js               Impact Relay L3 expense approval UI
donor-impact.html / .js                 Impact Relay donor timeline / UOF detail
import-review.html / .js                Import quarantine review UI
workspace.html / workspace.js           Authenticated campaign workspace shell
workspace/                              Session, decisions, pipelines, IR bridge
  impact-relay-bridge.js                Supabase → Impact Relay console headers

supabase/migrations/                    Governed database schema and controls
supabase/functions/signed-document-url  Authenticated private-document access
supabase/tests/                         Synthetic fixtures and policy checks
services/workbook-parser/               Native XLSX quarantine parser
services/import-api/                    Parser-to-import-batch service boundary

docs/AUTHENTICATED-WORKSPACE.md         Private application architecture
docs/DATA-PLACEMENT.md                  Local + Supabase placement; source inventory
docs/IMPORT-RUNBOOK.md                  Import and reconciliation procedure
docs/PRODUCTION-HARDENING.md            Staging/production operator checklist
docs/STAGING-BOOTSTRAP.md               Staging bootstrap and verification
docs/IMPACT-RELAY.md                    Impact Relay host bridge runbook
docs/IMPACT-RELAY-SHADOW.md             Finance shadow mode
docs/IMPACT-RELAY-LIVE-COHORT.md        Limited live cohort
docs/HD-OI-019.md                       Current hardening phase notes
scripts/staging/                        Local/staging bootstrap helpers (no secrets)
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

## Public impact surface and Impact Relay host

Live public donation progress, use-of-funds receipts, and event digests are published on **Impact Relay** (aggregate-only, no CRM data):

https://scrimshawlife-ctrl.github.io/Impact-Relay/

Repository: https://github.com/scrimshawlife-ctrl/Impact-Relay

This repo is the **canonical host app** for Impact Relay (campaign UX + Supabase auth). The library owns ledger, durable workflows, and console APIs; this app owns screens and identity.

| Surface | Purpose |
|---------|---------|
| `finance-impact.html` | L3 expense approval queue |
| `donor-impact.html` | Donor timeline / UOF receipt detail |
| `workspace/impact-relay-bridge.js` | Supabase session → IR request headers |
| `docs/IMPACT-RELAY.md` | Bridge runbook (roles, MFA, auth modes) |
| `docs/IMPACT-RELAY-SHADOW.md` | Finance shadow mode (no live notify) |
| `docs/IMPACT-RELAY-LIVE-COHORT.md` | Limited live cohort procedure |

```bash
# from Impact-Relay checkout
python -m impact_relay.console_server --data-dir .impact-relay/hacker-dojo --port 8787
# then open finance-impact.html / donor-impact.html from this repo
# (fixture auth without runtime-config.js; Supabase OTP when configured)
```

Privileged campaign roles must have MFA enforced before Impact Relay screens accept the session (same rule as director workspace).

## Privacy and authority boundary

The repository must never contain:

- raw member or attendee registries;
- personal email addresses, phone numbers, or street addresses;
- donation histories or private donor notes;
- relationship scores or contact recommendations;
- consent, suppression, or outreach state tied to real people;
- private campaign documents;
- production credentials or service-role values;
- native development workbooks (`.xlsx` / `.csv` exports with campaign records).

GitHub Pages is a public publishing surface, not a CRM access-control layer. Restricted records belong only in **local operator custody** until upload, then in **Supabase** (Postgres RLS + `campaign-private` storage). Notion may hold strategy and aggregate public evidence; it is **not** the CRM system of record.

The source development list is evidence, not outreach authorization. A historical relationship, attendance record, or Meetup export does not establish consent to fundraising contact.

See [docs/DATA-PLACEMENT.md](docs/DATA-PLACEMENT.md) for the placement matrix, staging project ref, and offline source inventory (hashes and counts only).

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

## Staging Supabase project

| Field | Value |
|---|---|
| Project ref | `ecxkhihlbrcwpavfoaoq` |
| Dashboard | https://supabase.com/dashboard/project/ecxkhihlbrcwpavfoaoq |
| API host | `https://ecxkhihlbrcwpavfoaoq.supabase.co` |
| Role | Staging (default) until leadership names production |
| Schema push | Operator: `supabase link --project-ref ecxkhihlbrcwpavfoaoq` then `supabase db push` |
| Browser config | Gitignored `runtime-config.js` from `scripts/staging/runtime-config.staging.example.js` |

CI continues to use a **disposable** local Supabase stack. Linking the hosted project does not apply migrations or load data by itself.

## Required before any real record is imported

- apply and verify migrations on staging (then production when approved);
- enforce MFA for privileged roles;
- configure deployment secrets and key rotation (never commit service-role keys);
- deploy and verify private object-storage policies (`campaign-private`);
- verify signed-URL expiration and audit events;
- execute positive and negative tests for every role (synthetic fixtures only first);
- approve privacy, consent, retention, suppression, and export rules;
- approve the $420K use-of-funds schedule and sponsor benefits;
- name accountable campaign and data owners;
- authorize a specific native workbook (SHA-256) through the quarantine workflow.

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
impact_relay_host_screens: PASS
impact_relay_supabase_bridge: PASS
impact_relay_live_cohort: RUNBOOK_READY  # execution operator-owned
staging_supabase_project: PROVISIONED  # ref ecxkhihlbrcwpavfoaoq; migrations operator-owned
private_data_placement: LOCAL_PLUS_SUPABASE
notion_crm_sor: REJECTED
production_supabase: NOT_SEPARATED_YET  # treat current project as staging until named
production_import: BLOCKED
outreach: BLOCKED
sensitive_data_in_repo: PROHIBITED
master_development_list: LOCAL_ONLY_INVENTORIED  # SHA-256 in docs/DATA-PLACEMENT.md
```

See [ROADMAP.md](ROADMAP.md), [SECURITY.md](SECURITY.md), [docs/DATA-PLACEMENT.md](docs/DATA-PLACEMENT.md), and [docs/AUTHENTICATED-WORKSPACE.md](docs/AUTHENTICATED-WORKSPACE.md).

Supported toolchain pins and upgrade requirements are documented in [docs/RUNTIME-VERSIONS.md](docs/RUNTIME-VERSIONS.md).
