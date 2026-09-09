# Organization-owned recovery setup — preparation only

**R2 enrollment and independent key custody are NOT DONE.** These reusable,
public-safe unapproved request-body templates are not provisioning tools, approval receipts or live
verification evidence. A request to merge, push or open a PR is **not billing
consent**. No account, bucket, token, encryption key, backup or restore is created
by this package. Production export, migrations, hosted tenant acceptance and
activation remain held. Null/false approval fields mean unresolved, never consent.

Continue the [production continuation plan](PRODUCTION-READINESS-AND-CONTINUATION-2026-08-22.md)
and the [targeted release gates](IR-TARGETED-RELEASE.md); this document does not
supersede either. `runtime_ready=false` and `operational=false` remain unchanged.

## Decision and minimal private handoff

Propose an organization-owned recovery-only Cloudflare account, a private R2
Standard bucket, all-object 30-day minimum retention, and no automatic object
deletion. A distinct account ID plus independently recoverable admin identity/MFA
is stronger separation than a second bucket. Shared human logins or admin tokens
retain a shared compromise risk. Do not infer ownership from an account name or
repurpose an accessible unrelated account. Existing production-account storage is
an explicit weaker alternative, not the default.

The operator must separately accept the actual R2 enrollment/payment terms.
Standard pay-as-you-go can exceed free allowances; this is not a guaranteed free
service. Billing alerts are not hard spending caps. Recheck current provider
pricing before consent. This publication does not record any paid approval.

Keep a completed copy of [approval.template.json](templates/recovery-setup/approval.template.json)
in approved private evidence storage, **not in git or a public static directory**.
The handoff requires the literal approved account ID and ownership/admin recovery
attestation, accepted primary custodian, public encryption key and exact full
uppercase fingerprint pinned through an independent channel, and evidence that
key recovery survives producer-host and production-account loss. No person is
implicitly an accepted custodian. Never include private keys, passphrases, recovery
codes, S3 credentials, database credentials, private identities or raw provider
inventories in this repository, chat, logs or the template.

## Human custody checkpoint

Use a separately controlled recovery system with encrypted storage. Prefer an
existing organization encryption key; any new encryption-capable OpenPGP key and
passphrase must be created interactively there, not on the backup producer.
Establish encrypted independent escrow and actually recover the key on the
separate system. Record only private evidence references, not key material here.
A sole device or vault recoverable only through the production login is not
independent custody. Storage credentials are not decryption keys.

With separately reviewed challenge tooling, encrypt an expiring inert nonce to
the pinned public recipient. Retain the original verifier-side hash manifest;
verify the returned response against that original, never a returned manifest.
Reject expiry and tampering. Successful decryption proves response knowledge,
not identity, acceptance, off-host storage or independent escrow. Verify those
separately. Synthetic keys cannot satisfy human custody. Optional additional
custodians must independently accept and repeat these checks; multiple OpenPGP
recipients allow either key to decrypt, not a two-person quorum. No challenge
implementation or production credential helper is shipped here.

## Target-specific provisioning approval — fail closed

Billing consent, R2 enrollment, a generic code-merge request and top-level proposed
settings are **not provisioning authorization**. The separate `provisioning_approval`
record defaults to `authorized=false`, null target/approver/evidence/timestamps,
no allowed actions and no request-body hashes. It grants nothing as published.
Even changing that boolean is insufficient: the authenticated operator must verify
an explicit, unexpired human approval through the referenced evidence before any
provider mutation. These are documentation/data templates, not an approval
validator or an executor; no program consumes them to grant authority.

Require exact literal provider, account ID, bucket name and jurisdiction matching
the independently authenticated destination and the top-level private handoff.
Bind each permitted action to the SHA-256 of its exact final UTF-8 request-body
bytes (after placeholder replacement), approved by the identified authorized
human with evidence, approval time and expiry. The only action identifiers for
these examples are `create_bucket`, `disable_managed_domain` and `set_bucket_lock`.
For the full example sequence, separately approve all three and their respective
bodies; empty action lists permit nothing. No wildcard, inferred account, existing
bucket adoption, token creation, enrollment or deletion authority is included.
A permitted action is valid only for its bound endpoint/target and reviewed body.

Stop before provider writes on absent/false authorization, null or malformed
fields, unverified approver/evidence, expiry, any target mismatch, unlisted action,
missing/mismatched hash or intervening body/configuration changes. Do not reuse
approval for another bucket/account or automatically broaden it after failure.
Obtain a newly reviewed target-specific approval when scope changes. Private
approved copies never belong in git. Production export/migration authorization
remains separate and false regardless of provisioning approval.

## Approved operator destination checkpoint — no executable provisioning

Only after verified target-specific provisioning approval, billing consent and
enrollment may a separately
reviewed operator procedure use the unapproved JSON examples below.
JSON bodies are data, not an execution barrier: lock/private-domain bodies can
mutate a real target if passed to an authenticated API client. This package ships
no such client or runnable mutation command. All fixed settings are proposals,
not approved values. Validate literal
account and bucket identifiers before lookup; never normalize a malformed ID.
Authenticate the approved recovery account outside an application workdir; do
not inherit app bindings or deploy a Worker. Successful bucket listing must prove
the chosen name absent. An API failure is not an empty listing. Stop on an
existing name: do not adopt, overwrite, empty or delete another resource.

| Unapproved request-body example | Intended API operation after separate approval |
| --- | --- |
| [bucket-create.json](templates/recovery-setup/bucket-create.json) | POST `/accounts/{account_id}/r2/buckets`; replace the deliberately invalid name placeholder in a private copy |
| [managed-domain-private.json](templates/recovery-setup/managed-domain-private.json) | PUT `/accounts/{account_id}/r2/buckets/{bucket_name}/domains/managed` |
| [bucket-lock.json](templates/recovery-setup/bucket-lock.json) | PUT `/accounts/{account_id}/r2/buckets/{bucket_name}/lock`, only on the newly created empty bucket |

Use the approved jurisdiction consistently (examples propose `default`). The
`enam` placement hint is **not a residency guarantee**; any regulated residency
requirement requires revising and reviewing the proposal before creation.
Validate API success envelopes and GET each exact target after every change.
Require exact name, jurisdiction and Standard storage class; r2.dev disabled;
custom domains empty; no CORS; no object-expiration lifecycle rule; no app Worker
binding or public presigned links. Default incomplete-multipart cleanup is not
object expiry. Unreadable or unexpected configuration is a hold, not success.

Read back exactly one enabled all-object `Age` lock of 2,592,000 seconds (30 days).
Lock expiry does not delete objects. Administrators can edit/remove R2 locks:
**not administrator-proof WORM**. Keep configuration administration independent
of the producer. Partial failure leaves an empty resource for operator review,
not permission to upload, weaken locks or automatically delete it.

Create organization-owned, bucket-scoped credentials only with separate authority:
writer Object Read & Write (not write-only or inherently append-only), independent
reader Object Read only, and configuration admin outside the exporter. Store
credentials directly in approved separate vaults, never these files. Read back
scope and record rotation/recovery ownership privately. No token creation or S3
credential-delivery implementation is included.

## Evidence ladder before production

1. Accepted primary, authenticated identity, fingerprint pin, challenge response,
   independent account/key recovery and approved destination/billing evidence.
2. Private bucket/retention/permission readback, followed by separately authorized
   **inert encrypted object** upload, independent read-only retrieval, exact
   ciphertext hash and full authenticated decryption. Prove reader writes and
   writer policy changes denied, and unauthenticated retrieval denied. Do not
   weaken retention to clean up the inert object.
3. Complete/review production credential delivery and streaming single-snapshot
   exporter with failure handling and isolated synthetic restore. Metadata-only
   connectivity is not an export transport or usable backup.
4. Only after separate production authorization: create an actual encrypted
   recovery point, retrieve it off host and restore **that exact real artifact**
   into the reviewed isolated environment with confidential integrity checks.
   Archive listing is insufficient; never restore into production or log rows.
5. Re-evaluate the exact four-migration release against fresh main/ledger,
   independent review, required human schema approval, writer coordination and
   recovery evidence. Keep migration CLI **2.31.8** separate from recovery CLI
   **2.39.2**; this package changes neither. No hosted apply is authorized here.
6. **STOP before final hosted human tenant acceptance/activation.** No hosted
   tenant tests, payments, notifications, production import or outreach.

Database-only recovery does not establish recovery of Storage object bytes,
provider-managed configuration, Worker/Edge Function code/secrets or post-snapshot
transactions. Auth tables, password hashes, roles and extensions depend on the
exporter and included schemas; explicitly inventory what is included, excluded
and restorable in the chosen target. Treat any included auth data as confidential.
Keep uncovered service state separately gated; never claim complete service
disaster recovery from a database artifact. GitHub history, Releases and
Actions artifacts are not the durable backup vault; do not upload ciphertext here.

## Offline verification and references

From the repository root, run `python3 tests/test_recovery_setup.py`. It validates
public-safe unapproved defaults and document links without network, credentials,
provider actions or database tests. Passing tests or CI proves package integrity,
not enrollment, custody, destination usability, backup/restore or readiness.
Local provider inventories, verification receipts, credential helpers and
administration Wrangler configuration were deliberately excluded from publication.

Operator references (revalidate before any action):
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/)
- [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
