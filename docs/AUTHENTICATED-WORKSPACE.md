# Authenticated Director Workspace

## Objective

Move Hacker Dojo campaign operations from a read-only aggregate dashboard to an authenticated control system without exposing member, donor, attendance, consent, or relationship data in the static repository.

## Production workspace URL

https://autogive.app/portfolio-signals/workspace

(Also reachable as `workspace.html` depending on rewrite configuration.)

Identity and data plane use **platform** Supabase ref `utdioxwiskzatwoejgiu`. Legacy HD staging `ecxkhihlbrcwpavfoaoq` is **frozen** for new tenancy.

### Operator status (2026-08-07)

| Item | State |
| --- | --- |
| Migrations on platform | Applied |
| Vercel `PLATFORM_SUPABASE_URL` + `ANON_KEY` | Set; `runtime-config.js` generated with platform host |
| Primary master_admin | `scrimshawlife@gmail.com` bootstrapped |
| Reference tenant HD director membership | Active |
| Magic-link login (implicit hash + session persist) | **Verified** on production |
| Built-in Auth email rate limit | Still low without custom SMTP — use admin `generate_link` or configure SMTP |

Live receipt: [CURRENT-STATE.md](CURRENT-STATE.md).

## Deployment boundary

```text
GitHub Pages / Vercel public shell
  public campaign shell
  aggregate evidence
  no private records

Local operator storage
  authorized source workbooks only
  never committed to git

Authenticated application
  identity + MFA
  director decisions
  sponsor and grant pipelines
  constituent consent and suppression
  restricted notes
  audit trail

Supabase (platform ref utdioxwiskzatwoejgiu; legacy ecxkhihlbrcwpavfoaoq frozen)
  Postgres + row-level security
  Storage campaign-private
  encrypted fields / controlled document room
  backups and retention

Notion
  strategy + public evidence aggregates only
  not CRM SoR
```

Placement details: [DATA-PLACEMENT.md](DATA-PLACEMENT.md). Platform bootstrap: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md). Suite hosts: [PLATFORM.md](PLATFORM.md).

## Recommended implementation

- **Frontend:** static workspace shell + gitignored / deploy-generated `runtime-config.js` (URL + **anon** key only).
- **Identity and database:** Supabase Auth + Postgres with row-level security on **platform** `utdioxwiskzatwoejgiu`.
- **MFA:** required for director, campaign lead, development, data steward, and auditor roles.
- **Documents:** private object-storage bucket (`campaign-private`) with time-limited signed URLs.
- **Email:** no bulk-send integration until consent and suppression rules are approved.
- **Payments:** Every.org remains the donation processor; ingest reconciled transaction exports rather than handling card data.
- **Source CRM files:** remain local until quarantine upload to Supabase; do not mirror person-level rosters into Notion.

## Roles

| Role | Access |
|---|---|
| Director | Full operational control and final approvals |
| Campaign lead | Campaign decisions, pipelines, assignments, reporting |
| Development | Qualified opportunities and permitted outreach workflows |
| Board viewer | Read-only aggregate and board-approved records |
| Data steward | Imports, deduplication, consent, suppression, provenance |
| Auditor | Read-only audit log and control verification |

Roles are assigned per A.G.I. client through `client_memberships`. The profile role is retained only for compatibility and MFA policy evaluation. Workspace authorization and navigation use the selected client's live membership role.

## Client and platform administration

- `get_workspace_context()` returns the active profile, master-admin flag, and only the client shells the caller may enumerate.
- The browser stores only the selected public client identifier. Every operational query also filters by that `client_id`; database RLS remains authoritative.
- Client directors manage existing authenticated profiles through `set_client_membership()`. Changes are audited and cannot remove the final active director.
- Master administrators can enumerate and provision client shells, but platform authority does not imply membership or access to client-private operational records.
- Master-admin and privileged client mutations require an active MFA-enforced profile.
- **Primary `master_admin`:** `scrimshawlife@gmail.com` (bootstrap via `scripts/platform/bootstrap-master-admin.sql` after Auth invite; **operator applies** after migrations).
- **Second admin (deferred):** Add Qi Diaz via `platform_administrators` insert with rationale ≥ 12 chars.

## Director workflow

1. Sign in with magic link (or approved Auth path) on https://autogive.app/portfolio-signals/workspace .
2. Review campaign readiness and blocked gates.
3. Approve, reject, or defer decisions with rationale.
4. Assign relationship and execution owners.
5. Review sponsor and grant opportunities promoted from research.
6. Review claims and evidence before publication.
7. Review campaign totals, commitments, restrictions, and stewardship obligations.
8. Export an aggregate board report without personal contact data.

## Hard controls

- No constituent is outreach-ready by default.
- A public association is not a current relationship.
- A historical supporter is not a current sponsor.
- Private relay addresses remain restricted unless confirmed.
- Suppressed records cannot be included in outreach exports.
- Opportunity probability remains unset until a validated scoring model exists.
- Every mutation writes an audit event.
- Every returned private-document signed URL uses a 30-300 second TTL and has an append-only audit event containing the actor, document ID, bucket, TTL, and expiry without recording the object path or URL.
- Board/advisor status cannot be granted automatically as a donor benefit.
- Browser config is **anon-only**; never place service-role keys in `runtime-config.js`, Vercel public env, or git.

## Onboarding pack (document phase)

Workspace nav **Onboarding pack** (director of selected client, or master_admin): private multi-file upload to `campaign-private`, heuristic type suggest, human confirm onto org-proof checklist, pack `ready` when required slots confirmed. CRM xlsx/csv are **parked** (not import).

- Runbook: [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md)  
- Evidence: [CURRENT-STATE.md](CURRENT-STATE.md) (`client_onboarding_pack`)  
- Code on main (#104); platform migration + Edge functions must be applied before production use.  
- Pack `ready` does **not** authorize CRM import, outreach, or client activation.

## Import quarantine

The import API accepts a Supabase user access token in the standard `Authorization: Bearer <token>` header. It verifies the token with Supabase Auth, calls `require_privileged_mfa()` using that same user session, and permits writes only for active, MFA-enforced `director` or `data_steward` profiles. Caller-supplied identity headers are not trusted. Batch metadata and staged rows are written through `create_import_batch()` in one database transaction under the caller's user session, so a rejected row cannot leave an orphaned batch. The service-role credential remains server-only and is used as the Supabase API key, not as the database authorization identity for this operation.

```text
native workbook upload
→ malware and file-type validation
→ column mapping
→ provenance receipt
→ exact and fuzzy duplicate detection
→ consent classification
→ restricted-field encryption
→ steward exception review
→ approved promotion
```

The 517-page PDF is evidence and recovery material, not the canonical import format. Obtain the native spreadsheet before production migration.

## Phase gates

### Gate A — Infrastructure

- Supabase **platform** project in use (`utdioxwiskzatwoejgiu`).
- Legacy HD staging frozen for new tenancy.
- MFA enforced.
- Database migrations applied (**operator applies migrations**).
- Backup and recovery tested.

### Gate B — Data governance

- Privacy and outreach policy approved.
- Retention schedule approved.
- Suppression workflow tested.
- Relationship ownership defined.
- Native spreadsheet obtained.

### Gate C — Director beta

- Director and campaign lead accounts provisioned.
- Decision queue operational.
- Sponsor and grant pipelines editable.
- Audit events verified.
- Board export reviewed.

### Gate D — Outreach activation

- Campaign and use-of-funds cases approved.
- Claims verified.
- Lists authorized.
- Donation tracking reconciled.
- Stewardship owners assigned.
