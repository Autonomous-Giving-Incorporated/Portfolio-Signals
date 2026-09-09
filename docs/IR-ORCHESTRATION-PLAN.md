# Remaining IR onboarding orchestration

> Historical request-stage plan. The synchronous, single-database reservation and
> initialized read-only storage slices are now implemented; they do not require
> the proposed distributed leases below. See [current initialized scope](IR-INITIALIZED-WORKSPACE.md)
> and [release gates](IR-RELEASE-REVIEW.md). Runtime execution remains absent.

> Follow-up local implementation: [Cloudflare scaffold executor plan/spec and verification](IR-CLOUDFLARE-EXECUTOR.md). The original request boundary below is preserved; explicit execution now persists a separate immutable empty policy scaffold, never an operational IR runtime. Not deployed.

## Scope and decision

Local working-tree increment only; preserve the existing request implementation.
No remote writes, deployment, commits, hosted migrations or additional hosting/database.
The parallel IR owner owns durable policy/workspace code; no speculative IR API calls.

Repository inspection found server-side service credentials in the existing
Cloudflare allocation Worker and Supabase document functions, **not an IR executor
identity or resumable claim/result protocol**. `workers/portfolio-signals/src/index.js`
routes gift webhooks/allocation and static assets only. The document upload function
validates a user and onboarding permission before a narrowly scoped service-role
registration; that is not authority to execute IR provisioning. Existing legacy
operator-token/open-dev allocation fallback must not be reused for IR administration.
Thus this increment takes the review/hardening branch, not a new privileged RPC.

## Phases, dependencies and acceptance gates

| Phase | Work | Dependency | Acceptance gate / status |
|---|---|---|---|
| 0 | Inspect request SQL, authority, infrastructure; preserve dirty branch | Existing request increment | Complete: no reusable IR executor established; keep grants unchanged |
| 1 | Harden fail-closed request UI; extend SQL security/recovery regressions | Phase 0 | Local SQL roles/concurrency/rollback and browser suites must pass; no runtime-ready transition |
| 2 | Agree IR integration contract below | Parallel IR policy/workspace acceptance + operator security owner | Pending: reviewed concrete API, evidence schema, identity and deployment target |
| 3 | Durable resumable execution in existing Supabase/Cloudflare | Phase 2 | Pending: fenced leases, append-only receipts, tenant-bound replay and crash tests; no public result privileges |
| 4 | Independently verify actual IR runtime | Phase 3 + durable IR runtime | Pending: fresh-process reopen, private-storage/ledger isolation, policy hash/provenance, membership and host checks |
| 5 | Website progress + authorized rollout | All preceding gates + explicit deploy approval | Pending: report verified steps, never infer readiness from request/registry; staged rollback drill |

## Proposed integration requirements — NOT implemented APIs

Names below describe concepts, not exported IR methods, routes or SQL RPC names.
The IR owner must supply actual signatures and versioning before implementation.

- **Identity:** canonical `clients.id` is the sole tenant identity. Operation UUID,
  immutable request key, exact tenant, policy version/hash and contract version bind
  all claims, effects and receipts. Never accept a separate unverified tenant alias.
- **Effective policy:** strict serialized effective bytes, portable provenance,
  content hash and immutable version. Define create-only publication and conflict
  behavior; matching retries return the same durable identity, mismatches fail.
- **Workspace:** tenant-bound registry, storage, workflow and ledger initialization;
  durable reopen in a fresh process without template files. Describe transaction
  boundaries and how to reconcile a committed effect whose response was lost.
- **Executor authority:** operator selects an existing trusted server deployment
  and identity mechanism, with least-privilege grants. A service-role secret merely
  being present is insufficient approval. No browser token, tenant director,
  platform request permission, arbitrary callback URL or caller-supplied role
  grants execution/result authority. Secrets stay out of UI, receipts and logs.
- **Claim:** transactionally lock eligible operation, verify current client state,
  acquire bounded lease with monotonically increasing fencing generation and
  server-clock expiry. Competing claims cannot both win. Resumption uses the same
  operation; expired lease takeover fences all previous workers. Do not hold a SQL
  transaction open across IR network calls.
- **Steps:** policy publication → workspace initialization → runtime verification.
  Persist step intent before external effects and append result receipt afterward.
  Each receipt binds operation, tenant, step, contract version, input hash, result
  hash/reference and fencing generation. Do not include policy secrets or private
  documents. Exact replay is a no-op; different content under the same step key
  is a conflict. Failed/blocked attempts retain safe error codes and retry context.
- **Results:** only the current authorized, unexpired claim can advance state;
  reject stale/foreign/out-of-order/mismatched results. Validate evidence against
  actual IR state, not a submitted `success` or `runtime_ready` boolean. Receipts
  and audit transition commit atomically. Recheck client eligibility at effect and
  result boundaries; define suspension/revocation and administrative retry policy.
- **Recovery:** if an effect committed before receipt, query its tenant-bound
  durable identity/hash and reconcile instead of blindly recreating. Retryable,
  blocked and terminal failures need explicit transition rules and bounded retry
  policy. Avoid destructive compensation of durable policy or tenant data.
- **Readiness:** final proof must include fresh-process runtime reopen against
  published policy, workspace binding, private storage and ledger/workflow tenant
  isolation, correct membership/host checks and document/activation prerequisites.
  Verification failure never promotes client state. Provisioning and activation
  remain separate authorized operations. Define proof freshness/invalidation.

## Required acceptance matrix before execution is enabled

Test anonymous, tenant member/director, AAL1, expired/inactive/revoked admin,
service-role misuse, forged executor identity, cross-tenant operation substitution,
old lease result after takeover, simultaneous claims, duplicated/conflicting
receipts, out-of-order steps, missing evidence, effect/receipt crash windows,
audit failure, restart recovery and client suspension during execution.
Use disposable existing-stack services only; then separately authorize hosted
signature/Storage/IR integration checks. SQL claim-setting tests do not verify JWT
signatures; mocked browser SDK tests do not verify actual backend integration.

## Local execution record

Phase 1 completed locally: three new browser cases failed before implementation
(six desktop/mobile executions), then the full browser suite passed **52/52**;
fixtures passed **65/65**. The disposable Supabase runner passed SQL 028, privilege
suites 017/018, MFA suite 027 and independent-connection concurrent replay/conflict
with durable readback. Both disposable containers were removed (the first run
caught a test expectation matching DETAIL rather than SQLERRM; corrected).
`git diff --check` passed. Existing test-server runtime-config 404s and Node module
type warnings remain; test config/SDK transport is supplied by fixtures.

Added owner constraint/service-role mutation and suspended/archived recovery
regressions. Browser status now rejects malformed operation/request UUIDs without
normalization. No request migration or privilege was changed by this follow-up.
Phase 1 does not implement phases 2–5. Current public contract remains
`requested` / `runtime_ready: false`.
The website must explicitly say no executor is connected and no automatic work
will begin from recording a request. No queue, leases or receipts are claimed.
