# Production Environment Hardening (HD-OI-019)

## Purpose

Define the engineering controls required before any production Supabase project receives real campaign data. This document is an operator checklist, not authority to import or contact people.

## Boundary

```yaml
repository_may_contain: public aggregates, schemas, synthetic fixtures, runbooks
repository_must_not_contain: credentials, service-role values, personal data, workbooks
production_import: BLOCKED until HD-OI-020 leadership gates pass
outreach: BLOCKED
```

## Pinned local/runtime baseline

| Component | Pinned / required value |
|---|---|
| Supabase CLI (CI) | 2.31.8 |
| Postgres major | 15 |
| Node (parser CI) | 22.18.0 |
| Signed URL TTL | 60 seconds |
| Private bucket | `campaign-private` (non-public) |

Upgrade only through an explicit, tested PR. Do not drift production ahead of CI pins without re-running the disposable policy suite.

## Environment separation

Create **two** managed projects before any real data:

1. **Staging** — synthetic fixtures only; full migration and RLS suite.
2. **Production** — empty until a governed pilot import is approved.

Both projects require:

- separate service-role secrets;
- separate anon keys;
- separate storage buckets;
- separate auth configuration;
- no shared database URLs in client config.

## Secret management

| Secret | Location | Clients |
|---|---|---|
| `SUPABASE_ANON_KEY` | public runtime config | browser workspace |
| `SUPABASE_URL` | public runtime config | browser workspace |
| `SUPABASE_SERVICE_ROLE_KEY` | secret manager / function env only | import API, signed-document function |
| `FIELD_ENCRYPTION_KEY` | secret manager only | server-side note/document helpers |

Never commit service-role values, JWTs, private keys, or encryption material. Rotate service-role keys after any suspected exposure and after staff offboarding.

## MFA and identity

Privileged application roles:

- director
- campaign lead
- development
- data steward
- auditor

Requirements:

1. Enable MFA at the Supabase Auth project level for production.
2. Set `profiles.mfa_enforced = true` for each privileged account before workspace access.
3. Keep `profiles.active = false` until identity is verified.
4. Use `deactivate_profile(profile_id, reason)` for emergency revocation; only directors may call it.
5. Board viewers may remain MFA-optional for aggregate read surfaces, but production operators should still prefer MFA.

## Backup and recovery

Before production cutover:

1. Enable managed automated backups for the production project.
2. Document restore owner and RTO/RPO targets with leadership.
3. Perform a restore drill into an isolated disposable project.
4. Verify migrations re-apply cleanly after restore.
5. Verify private storage objects restore or are rehydratable from provenance receipts.

## Private storage

Production bucket checklist:

- bucket id `campaign-private`
- `public = false`
- MIME allow-list and 25 MiB size limit retained unless leadership revises policy
- upload paths scoped by authenticated owner folder
- signed URLs issued only through the edge function
- every signed URL creates an `audit_log` event
- retention, deletion, and legal-hold procedure approved outside this repository

## Observability without personal data

Allowed:

- request counts, latency, error rates;
- role names and aggregate queue depths;
- migration and backup job status;
- synthetic fixture test results.

Prohibited in logs:

- email addresses, phone numbers, street addresses;
- donation amounts tied to a person in free-text logs;
- signed URL query tokens;
- service-role secrets;
- raw import row payloads.

## Deployment gates

```yaml
staging_migrations: REQUIRED
staging_rls_suite: REQUIRED
staging_import_gates: REQUIRED
production_project_created: REQUIRED
mfa_enabled_in_auth_provider: REQUIRED
privileged_profiles_mfa_enforced: REQUIRED
service_role_not_in_git: REQUIRED
backup_restore_drill: REQUIRED
private_bucket_verified: REQUIRED
signed_url_audit_verified: REQUIRED
leadership_import_authority: NOT_THIS_PHASE
```

## Exit criteria for HD-OI-019

HD-OI-019 is complete only when both of the following are true:

1. Repository controls and executable tests for identity, MFA flags, revocation, and schema-aligned clients are green in CI.
2. Operators have completed the staging/production project checklist above in live managed environments (evidence recorded outside GitHub if it includes private project identifiers).

Until both are true, production import remains blocked.
