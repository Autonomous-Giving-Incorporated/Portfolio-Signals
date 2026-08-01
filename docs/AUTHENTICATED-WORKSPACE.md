# Authenticated Director Workspace

## Objective

Move Hacker Dojo campaign operations from a read-only aggregate dashboard to an authenticated control system without exposing member, donor, attendance, consent, or relationship data in the static repository.

## Deployment boundary

```text
GitHub Pages
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

Supabase (staging ref ecxkhihlbrcwpavfoaoq until production split)
  Postgres + row-level security
  Storage campaign-private
  encrypted fields / controlled document room
  backups and retention

Notion
  strategy + public evidence aggregates only
  not CRM SoR
```

Placement details: [DATA-PLACEMENT.md](DATA-PLACEMENT.md). Staging bootstrap: [STAGING-BOOTSTRAP.md](STAGING-BOOTSTRAP.md).

## Recommended implementation

- **Frontend:** server-rendered TypeScript application deployed separately from GitHub Pages (current shell: static workspace + runtime config).
- **Identity and database:** Supabase Auth + Postgres with row-level security.
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

## Director workflow

1. Sign in with MFA.
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

- Supabase project created.
- Production and staging environments separated.
- MFA enforced.
- Database migration applied.
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
