# IR targeted release — code merged; hosted application held

**No hosted write, manual production deploy, tenant activation, allocation, or financial authorization is granted by this artifact.** The compiler is offline; the only executable application harness creates its own disposable database. Independent exact-diff review and verified backup/recovery evidence remain required before any hosted application.

**Code integration:** the user separately authorized PR [#67](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/pull/67), superseding the earlier coordinated code-merge hold. Exact tested head `bb6ecce3965eca347d537f38856948336ea67a4e` was merged normally, without admin bypass, as `8eb7ff5bf3874563b6590cafd6e9d37460956bcc`. Repository rules required a PR and five successful acceptance checks, with zero mandatory approving reviews. This code merge is not a hosted database release.

**Backup/recovery gate: BLOCKED for hosted database application and activation.** No usable production recovery point or restore has been verified. Passing rehearsal and code integration do not authorize hosted apply or manual production deployment. Push-triggered validation uses disposable databases, not hosted migrations. Automatic static publishing and credential-gated Worker deployment must be reported from exact-run logs; a green workflow or Vercel static build does not prove a deployed Worker, schema parity, or runtime readiness. Missing public Worker bindings or missing RPCs fail closed. `runtime_ready=false` and `operational=false` remain unchanged.

## Confirmed hosted finding

Read-only authenticated Supabase MCP discovery identified AGI project `utdioxwiskzatwoejgiu`, PostgreSQL `17.6.1.155`. Catalog reads found RLS enabled on both tables and INSERT grants to authenticated (also anon; RLS still applies):

- `am_allocations_insert`: `is_master_admin() OR current_client_role(client_id) = 'director' OR is_client_member(client_id)`.
- `am_proofs_insert`: `is_client_member(client_id) OR is_master_admin()`.
- No other INSERT or ALL policies on these two tables were returned.

`is_client_member` permits active `board_viewer` membership at AAL1, so the member-wide INSERT predicates are a real authorization defect, not merely stale migration bookkeeping. Development, data steward and auditor members also qualify at AAL2. No hosted test rows were written.

## Exact patch and compatibility

Apply the existing, **byte-unchanged** `20260815120000_am_allocation_write_roles.sql` first. It replaces precisely those two INSERT policies with:

```sql
public.is_master_admin()
or public.current_client_role(client_id) in ('director', 'campaign_lead')
```

It also creates the existing intended `am_org_meta` labels/aliases table and member/admin SELECT policy. Review that small additive effect rather than silently stripping it or forging a replacement historical record. No existing rows, SELECT policy, role definition, platform administrator, or MFA state is changed.

Hosted `current_client_role` requires active membership, active client, active profile, `mfa_enforced=true`, and AAL2 for director/campaign lead. `is_master_admin` requires an active, nonrevoked platform appointment, active profile, enforced MFA, and AAL2. Keep these helpers unchanged. Master-admin cross-tenant authority remains the existing explicit bypass; it does not require an active target client. Service-role writers bypass RLS and retain their existing Worker authorization responsibility. This patch is not proof of Worker MFA enrollment or authorization correctness.

Then apply, in this order and with these **exact version identifiers**:

1. `202609080001_ir_provisioning_request.sql`
2. `202609080002_ir_workspace_scaffold.sql`
3. `202609080003_ir_initialized_workspace.sql`

The scoped local diff removes only top-level BEGIN/COMMIT from these three **unapplied** IR migrations, replacing BEGIN with a transaction-ownership comment. It changes no schema/RPC/security semantics. This is necessary: Supabase CLI 2.31.8 appends its ledger INSERT to an implicit transactional batch, but an explicit COMMIT inside the SQL commits DDL **before** the ledger write. The disposable regression reproduced orphaned request-table DDL after a forced ledger failure on the original PR67 bytes. After the patch, forced ledger-insert failure at each real IR migration rolls back that migration's DDL and record together. All three revised raw-byte checksums are pinned in `scripts/staging/ir-release-manifest.json`; never reuse the old IR hashes.

Do not execute these files through plain autocommit psql in a hosted release. The supported CLI executor must own the transaction. Its transactions are **per migration**, not all four files as one atomic release. Earlier successful migrations remain committed if a later migration fails.

The three IR files depend on existing clients, profiles, client audit, active-profile/session checks, master-admin authority and crypto support, then on their preceding IR files. They do not depend on the two excluded old migrations:

- `20260815180000_am_donation_link_and_impact_notices.sql`
- `20260822120000_am_p1_connector_source.sql`

Those remain explicitly unapplied and require a separate disposition; do not include them to silence the CLI. The allocation tightening is a security release gate, not a SQL prerequisite of IR.

## History reconciliation without repair

The reviewed live baseline contains 37 ledger rows. Its exact version/name/fetched-body SHA-256 fingerprint is pinned in the manifest. This fingerprint includes hosted-only history, not just repository versions. Seven local/hosted timestamp pairs remain deliberately distinct:

| Local version | Hosted version |
|---|---|
| 20260821221500 | 20260822034142 |
| 20260821223000 | 20260822034154 |
| 20260821224500 | 20260822034203 |
| 20260822043000 | 20260822040121 |
| 20260822050000 | 20260822045514 |
| 20260823180000 | 20260823192249 |
| 202608240001 | 20260824234800 |

The compiler does **not** infer SQL equivalence from these names or rename repository history. It uses actual fetched hosted history under actual hosted versions and checks every fetched byte against a freshly read catalog fingerprint. Historical fetched files are present only so the supported CLI sees a complete history; already recorded versions are not reapplied. Hosted-only identity SQL must remain in private temporary storage and must never be committed or pasted into logs.

Use Supabase CLI **2.31.8**, whose `migration fetch` serialization is `join(statements, ';\n') + ';\n'`. `release-history.sql` hashes those exact UTF-8 bytes; no comment removal, whitespace normalization, or timestamp repair occurs. Sources inspected: [fetch.go](https://github.com/supabase/cli/blob/v2.31.8/internal/migration/fetch/fetch.go), [file.go](https://github.com/supabase/cli/blob/v2.31.8/pkg/migration/file.go).

The MCP `apply_migration` schema exposes project/name/query but **no caller-controlled version**. It is not the executor for this exact-version release. Never emulate version support with manual INSERT/UPDATE/DELETE of `supabase_migrations.schema_migrations` or `migration repair`.

## Approved-operator procedure (not executed against hosted)

1. Obtain independent exact-diff review and verified backup/recovery inventory plus usable recovery point and restore plan. Coordinate a single-writer migration maintenance window; the offline snapshot is not a distributed lock. Keep IR Worker deployment and all operational activation held.
2. Independently match the authenticated project discovery, linked reference, and direct database hostname to `utdioxwiskzatwoejgiu`. Acquire a direct PostgreSQL credential through the approved secret manager. The compiler accepts only `postgresql://postgres:<percent-encoded-password>@db.utdioxwiskzatwoejgiu.supabase.co:5432/postgres?sslmode=verify-full`, supplied in secret environment variable `FI_RELEASE_DB_URL`. Install the correct CA; do not weaken TLS or substitute a pooler URL if connectivity fails. No database credential has been discovered or validated by this implementation.
3. Allocate a private temporary workspace (`umask 077`), independent of the repository and any existing Supabase checkout. Run `supabase migration fetch --workdir <private-fetch-project> --db-url "$FI_RELEASE_DB_URL"` there, **not in the repository**. Capture `scripts/staging/release-history.sql` through the same independently bound connection as raw JSON into `<private-snapshot.json>`. This is a metadata SELECT, not DDL. Repeat snapshot read after fetch to rule out intervening drift; the pinned fingerprint must still match. Do not enable shell tracing or CLI debug; CLI connection arguments can be visible to local processes, so use a trusted isolated operator runner.
4. Compile a new bundle; this command itself cannot write to a database:

```sh
python3 scripts/staging/targeted_release.py \
  --manifest scripts/staging/ir-release-manifest.json \
  --snapshot <private-snapshot.json> \
  --fetched <private-fetch-project>/supabase/migrations \
  --source supabase/migrations \
  --output <new-private-bundle> \
  --target-url-env FI_RELEASE_DB_URL
```

The output must contain only the 37 fetched historical files and the four allowlisted release files; the pending set must be exactly the four listed above. The compiler rejects project mismatch, changed/extra/missing/duplicate history, modified fetched or release bytes, wrong order, existing release versions, unrelated files and symlink leaves. It publishes no partial bundle on validation failure. Files are read-only and a checksum receipt accompanies them. This is integrity checking, not a cryptographic approval signature; the reviewed manifest and trusted filesystem remain trust roots.
5. **Only after separate release approval**, immediately recheck the bound target, frozen bundle checksums and live history under the single-writer window. Invoke the supported executor as `supabase migration up --include-all --workdir <private-bundle> --db-url "$FI_RELEASE_DB_URL"`. `--include-all` is safe only because this bundle contains no other pending migrations. Never run it or `db push` from the unrestricted repository. The legacy `apply-migrations.sh remote-linked` path now fails closed even with old confirmation variables.
6. Read back the exact ledger versions, names and statement-body hashes, policy predicates, RLS/grants and IR catalog objects. Confirm baseline history unchanged, exactly four additions, and no inclusion of the excluded versions. Preserve the pre/post receipts in approved private evidence storage; remove private fetched identity-bearing files after the retention decision. No synthetic fixture or allocation test belongs on hosted.
7. On failure, stop deployment. Capture a fresh read-only ledger and catalogs. A successful prefix is expected; the failing migration must have neither DDL nor history. Do not automatically rewrite the baseline manifest to accept a partial release. A reviewer must approve a new recovery manifest/pending suffix after inspecting the committed prefix and immutable SQL. Retry unchanged unapplied files through the supported executor only. If a schema/ledger mismatch exists, stop and use the reviewed recovery process—never an ad-hoc repair or rollback that restores broad INSERT permissions.

## Reproduction and evidence limits

```sh
python3 scripts/staging/test_targeted_release.py
python3 scripts/staging/rehearse_targeted_release.py
python3 scripts/staging/test-ir-provisioning.py
```

The new CI workflow runs the offline tests and CLI rehearsal without hosted credentials. The rehearsal creates a unique loopback-only disposable Supabase PostgreSQL 17.6.1.155 container pinned by image digest, simulates seven timestamp aliases and a synthetic hosted-only marker, omits the two unrelated migrations, fetches real CLI ledger history, compiles and applies the four-file release, checks exact ledger versions and unchanged checksums, and deletes its container and temporary files. The raw PostgreSQL 17 image omits Auth/Storage service schemas, so the harness imports schema-only compatibility DDL from a second, network-isolated PostgreSQL 15.8.1.085 raw image, then applies the existing auth/storage helper fixture. Both containers are removed. The same targeted rehearsal also passed on PostgreSQL 15 before moving the default to 17. This proves the tested SQL/CLI path on the hosted engine version, **not** a production restore, complete hosted-schema parity, or backup usability.

Security acceptance exercises both allocation and proof INSERTs across six tenant roles/AAL1/AAL2, platform admin/MFA/revocation, disabled MFA/profile/membership/client and absent membership/profile. Only SQLSTATE 42501 counts as denial; unrelated SQL errors fail the test. The three IR SQL suites cover the unchanged request/scaffold/initialized contracts. The existing full disposable harness additionally verifies concurrency, independent-connection readback, portable/initialized golden bytes and real Worker→PostgREST JWT authority checks; Auth `/user` remains a fixture, not GoTrue/MFA enrollment evidence.

Remaining independent gates: parent review, backup agent approval, production restore/recovery evidence, authenticated direct database access, fresh pre-execution history/catalog snapshot, post-apply catalog readback, and separately authorized deploy. None is implied by passing local tests.
