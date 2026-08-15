# AGI Portfolio Signals

Portfolio Signals is the multi-tenant **decision workspace** of **Autonomously Giving Incorporated (AGI)**. AGI is the customer-facing corporate brand; Zero State is credited only as the software builder. Impact Relay is the tenant-isolated financial and impact backend.

**Live:** [autogive.app/portfolio-signals](https://autogive.app/portfolio-signals/) · **Workspace:** [autogive.app/portfolio-signals/workspace](https://autogive.app/portfolio-signals/workspace)  
**Hosting:** **Cloudflare Workers** is the intended production host for the public/static site (Worker `portfolio-signals`, `*.workers.dev` until DNS cutover). **Vercel** (`fund-intel` / [fund-intel-ten.vercel.app](https://fund-intel-ten.vercel.app)) is the **fallback until DNS cutover** — `vercel.json` stays until that cutover is documented as done. Designed stack is **Workers + platform Supabase** (`utdioxwiskzatwoejgiu`); Auth and private data are not moving off Supabase. See [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).  
**Platform Supabase:** `utdioxwiskzatwoejgiu` · **Reference tenant:** Hacker Dojo (`org_hacker_dojo`) — pilot/regression fixture, **not** product identity (tenant assets under `assets/tenants/hacker-dojo/`).

See [docs/AGI-SUITE-ARCHITECTURE.md](docs/AGI-SUITE-ARCHITECTURE.md) for boundaries, and [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md) / [docs/START_HERE.md](docs/START_HERE.md) for live ops status.

## Platform specification status

Portfolio Signals currently declares **Experimental** conformance to [Autonomous Giving Platform Specification v1.0.0](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/tree/v1.0.0). It is not yet a producer of the canonical Signal, Opportunity, or Recommendation contracts. The migration boundary and exit criteria are documented in [docs/PLATFORM-CONFORMANCE.md](docs/PLATFORM-CONFORMANCE.md).

The repository now contains both a privacy-safe public director portal and the controlled foundation for an authenticated campaign workspace. It does **not** contain member, donor, attendee, or relationship-level source data.

## Platform specification

Pinned platform canon: **[Autonomous Giving Specs v1.0.0](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/releases/tag/v1.0.0)**.

Conformance declaration: [`platform-spec/conformance.yml`](platform-spec/conformance.yml). See [`platform-spec/README.md`](platform-spec/README.md).

## Allocation middleware

Transaction-light **middleware** between donation platforms (canonical **every.org**) and human allocation: pots → allocate → proof → exception inbox → board packet. Not a finance ledger.

**Status (2026-08-15):** MVP shipped; **local pilot smoke PASS** against platform Supabase (director auth config on). Production public host is **Cloudflare Workers** (this repo’s Worker, including `POST /webhooks/every-org`). Live every.org pointing and a controlled gift remain operator-owned — [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md). **Local pilot:** Node on `:8787`.

```bash
cd services/allocation-middleware
npm test
# .env.pilot from platform keys (gitignored) — see docs/ALLOCATION-DIRECTOR-LOGIN.md
npm run compose:up   # or: npm run start:hacker-dojo:seed
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
BASE_URL=http://127.0.0.1:8787 npm run verify:director
```

| Doc | Purpose |
| --- | --- |
| [docs/ALLOCATION-MIDDLEWARE.md](docs/ALLOCATION-MIDDLEWARE.md) | Role, status, package map |
| [docs/HACKER-DOJO-ALLOCATION-PILOT.md](docs/HACKER-DOJO-ALLOCATION-PILOT.md) | Pilot runbook |
| [docs/ALLOCATION-HOSTING-OPTIONS.md](docs/ALLOCATION-HOSTING-OPTIONS.md) | Local Node/Compose for pilot; designed durable host is Workers |
| [docs/ALLOCATION-DIRECTOR-LOGIN.md](docs/ALLOCATION-DIRECTOR-LOGIN.md) | Supabase director JWT |
| [docs/ALLOCATION-MIDDLEWARE-PRODUCTION.md](docs/ALLOCATION-MIDDLEWARE-PRODUCTION.md) | Deploy gates |
| [services/allocation-middleware/README.md](services/allocation-middleware/README.md) | npm scripts |

Portfolio Signals’s suite role is **observe/credit** (gift summaries → pot balances). Deep evidence verification remains Impact Relay’s long-term boundary; the MVP co-locates allocate/proof/packet for the modular-monolith pilot.

## Current evidence boundary

**As of 2026-08-07** (suite production on `autogive.app` + platform Supabase). See [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md) for the full live receipt. Older HD-OI-041 staging receipts are **historical** only.

| Capability | State |
|---|---|
| Public director portal | **Live** on https://autogive.app/portfolio-signals/ (Vercel today; **Workers** intended production — [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)) |
| Authenticated workspace login | **Live** — operator magic-link login verified |
| Allocation middleware MVP | Implemented; **local pilot smoke PASS** |
| every.org live webhook (hosted) | Worker route shipped; live URL / every.org pointing / gift operator-owned ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)) |
| Canonical public campaign data | Implemented |
| JSON Schema validation | Passing |
| Static security policy checks | Passing |
| Workbook parser contract | Passing (quarantine-only; production import blocked) |
| Authenticated database schema | **Applied** on platform `utdioxwiskzatwoejgiu` |
| Six application roles + RLS | Implemented |
| MFA / active-profile hardening | Schema + profile flags; real TOTP enrollment optional next |
| Platform Supabase (canonical) | `utdioxwiskzatwoejgiu` |
| Legacy HD staging Supabase | `ecxkhihlbrcwpavfoaoq` — **frozen** for new tenancy |
| Private data placement | Local workbook + platform Supabase (not GitHub, not Notion SoR) |
| Impact Relay host screens / runbooks | Implemented / documented; live cohort operator-owned |
| Client Onboarding Pack (org docs) | **Platform schema + Edge OBSERVED**; MFA workspace dry-run pending ([#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18)) — [docs/CLIENT-ONBOARDING-PACK.md](docs/CLIENT-ONBOARDING-PACK.md) |
| Production data import | **Blocked** |
| Outreach authority | **Not granted** |

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
workspace/                              Session, decisions, pipelines, onboarding-pack, IR bridge
  impact-relay-bridge.js                Supabase → Impact Relay console headers

supabase/migrations/                    Governed database schema and controls
supabase/functions/signed-document-url  Authenticated private-document access
supabase/tests/                         Synthetic fixtures and policy checks
services/workbook-parser/               Native XLSX quarantine parser
services/import-api/                    Parser-to-import-batch service boundary
services/allocation-middleware/         every.org pots → allocate → proof → packet (MVP)

docs/ALLOCATION-MIDDLEWARE.md           Middleware role + status
docs/HACKER-DOJO-ALLOCATION-PILOT.md    Pilot seed, smoke, Docker default
docs/CLOUDFLARE.md                      Workers static host + webhook remaining work
docs/ALLOCATION-HOSTING-OPTIONS.md      Local pilot vs designed Workers host
docs/ALLOCATION-DIRECTOR-LOGIN.md       Supabase director login
docs/ALLOCATION-MIDDLEWARE-PRODUCTION.md Deploy gates
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
.github/workflows/                      Validation, security, Pages, Workers, and Supabase CI
wrangler.toml                           Cloudflare Workers static assets (`portfolio-signals`)
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

https://autogive.app/impact-relay/

Repository: https://github.com/Autonomous-Giving-Incorporated/Impact-Relay

This repo is the **canonical host app** for Impact Relay (campaign UX + Supabase auth). The library owns ledger, durable workflows, and console APIs; this app owns screens and identity.

| Surface | Purpose |
|---------|---------|
| `finance-impact.html` | L3 expense approval queue |
| `donor-impact.html` | Donor timeline / UOF receipt detail |
| `workspace/impact-relay-bridge.js` | Supabase JWT / fixture Bearer → IR console (no X-Impact forge headers) |
| `docs/IMPACT-RELAY.md` | Bridge runbook (roles, MFA, auth modes) |
| `docs/IMPACT-RELAY-SHADOW.md` | Finance shadow mode (no live notify) |
| `docs/IMPACT-RELAY-LIVE-COHORT.md` | Limited live cohort procedure |

```bash
# from Impact-Relay checkout — default-deny; no --trusted-proxy for host UI
python -m impact_relay.console_server --data-dir .impact-relay/hacker-dojo --port 8787
# then open finance-impact.html / donor-impact.html from this repo
# (fixture Bearer without runtime-config.js; Supabase JWT when configured)
# See docs/IMPACT-RELAY.md — --trusted-proxy only behind a stripping gateway
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
main_baseline: 251549f1e2142c35d1807cc9412d596ce82e360d
current_main_verdict: NO_GO  # acceptance evidence incomplete
repository_contract: PASS  # current-tree structural contract
pr_44_local_acceptance: PASS_PREMERGE_ONLY  # e124375bfd60758df9857b03dfc171c9210b78b1
hosted_staging_current_main: NOT_RUN
browser_smoke_current_main: NOT_RUN
director_acceptance_current_main: NOT_RUN
staging_supabase_project: PROVISIONED  # ref ecxkhihlbrcwpavfoaoq
private_data_placement: LOCAL_PLUS_SUPABASE
notion_crm_sor: REJECTED
production_supabase: NOT_SEPARATED_YET
production_import: BLOCKED
outreach: BLOCKED
sensitive_data_in_repo: PROHIBITED
master_development_list: LOCAL_ONLY_INVENTORIED  # SHA-256 in docs/DATA-PLACEMENT.md
```

See [ROADMAP.md](ROADMAP.md), [SECURITY.md](SECURITY.md), [docs/DATA-PLACEMENT.md](docs/DATA-PLACEMENT.md), and [docs/AUTHENTICATED-WORKSPACE.md](docs/AUTHENTICATED-WORKSPACE.md).

Supported toolchain pins and upgrade requirements are documented in [docs/RUNTIME-VERSIONS.md](docs/RUNTIME-VERSIONS.md).

## License

Licensed under the [Apache License 2.0](LICENSE).

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 22 + Hash: 645560ecfc722b6d040d9c21562681bbf579ba23
