# IR provisioning request boundary

> Current local follow-up: [initialized read-only workspace](IR-INITIALIZED-WORKSPACE.md). Requests remain immutable intent; reservation and initialization are distinct later records. No operational activation is implemented.

> Follow-up local implementation: [Cloudflare scaffold executor plan/spec and verification](IR-CLOUDFLARE-EXECUTOR.md). The original request boundary below is preserved; explicit execution now persists a separate immutable empty policy scaffold, never an operational IR runtime. Not deployed.

## Implemented increment (not deployed by this change)

The platform records **private provisioning requests for existing clients**, not
IR scaffolds. `clients.id` is the only input identity; generated `tenant_id`
equals it exactly. Eligible client states are `provisioning` and `active`.
Suspended/archived clients cannot create or replay requests. Status reads remain
available to authorized platform administrators for recovery. No client, user,
membership, activation, document status, IR registry or object bucket is created
or modified. No existing activation checks are strengthened or bypassed here.

Both RPCs require the existing `require_active_profile()` and `is_master_admin()`:
unexpired session, active profile, active/unrevoked platform appointment,
`mfa_enforced = true`, current JWT AAL2. Tenant directors, anonymous callers and
service-role callers do not gain this API. These are platform request metadata,
not tenant-private operational data or cross-tenant financial authority.

### API contract

- `request_ir_provisioning(p_client_id text, p_idempotency_key uuid, p_rationale text)`
  returns request metadata plus `replayed: false` on creation, `true` on replay.
- `get_ir_provisioning_request(p_client_id text)` is read-only. Returns the stored
  metadata or JSON null for an existing client without a request. Missing clients
  and malformed literal IDs fail, not normalize into valid clients.
- Metadata: `operation_id`, `client_id`, generated `tenant_id`, `idempotency_key`,
  `requested_by`, exact `rationale`, `created_at`, `state: "requested"`,
  `runtime_ready: false`. There is deliberately no template source, policy
  version/hash, registry ID, scaffold-complete flag or readiness transition.
- The request and existing `client_audit_log` event
  (`ir_provisioning_requested`) commit in one SQL transaction. Audit failure
  rolls the request back. Replays create no additional audit event.
- One request per client; one globally unique UUID request key. Same key, client
  and exact rationale replay the original row (including actor/time). Different
  payload under that key: `idempotency_conflict` (23505). Different key for a
  client with a request: `client_request_conflict` (23505). Neither overwrites.
  Only current authorized admins may replay; possession of the key is no grant.
- Null keys/rationales are rejected (22023). Rationale trimmed length must be
  12–2000 characters, but its stored/replay identity is not trimmed/normalized.
- Key advisory lock then client row lock serialize ordinary READ COMMITTED
  races. Unique constraints are the backstop. Stronger isolation may yield
  serialization failures: retry the complete transaction with the same key.

`public.ir_provisioning_requests` is deny-by-default: RLS enabled, no permissive
policies, all direct table privileges revoked from PUBLIC/anon/authenticated/
service_role. Only the two deliberately granted authenticated SECURITY DEFINER
RPCs expose request metadata, with fixed search paths and owner-side checks.
No Storage bucket is provisioned because no approved durable policy exists yet.

## Browser operation and recovery

Platform admin → **Impact Relay provisioning requests** → select an existing
client → provide a rationale → **Request IR provisioning**. The Supabase SDK
uses the existing authenticated client; the page does not extract tokens or
send them to `impactRelayAdminUrl`. All auth consume/MFA restoration is retained.

The UI reads the exact operation back before reporting that the request was
recorded. It always says runtime readiness is not established and isolation is
not tested. For missing migrations, expired/insufficient authority, failed
network calls or inconsistent responses, it shows unavailable; it never offers
a CLI fallback or interprets an IR registry lookup as readiness.

Unchanged inputs retry with the same key while the panel remains mounted. After
reload/navigation, use **Check request status** first; reading an existing request
restores its key for the matching rationale. A new key cannot overwrite a saved
request even if the first response was lost. No browser-local credentials or
request rationale are persisted. Localization overrides are text-only entries
in runtime config `irProvisioningMessages` (keys in `workspace/ir-provisioning.js`).

## Remaining orchestration

[Phased execution plan and integration requirements](IR-ORCHESTRATION-PLAN.md)
record the executor decision, dependencies, acceptance matrix and local results.
No trusted IR executor is connected: recording a request does not start automatic
provisioning. Existing server service credentials are not a new execution grant.
The UI rejects malformed operation/request UUIDs before reporting stored progress.

## Why durable scaffolding remains blocked

Inspected IR `storage/template.py:clone_tenant_from_hacker_dojo`,
`policy.py:load_tenant_policy`, and IR `docs/TENANT-ADMIN-ONBOARDING.md`.
The helper returns an in-memory `TenantPolicy`, retaining the template's
`source_path`. Serialization retains that path; the parser takes provenance
from a separate caller argument. Registry upsert does not persist effective
policy bytes, and reopening still loads local policy files. Copying those fields
into Supabase would misrepresent durability/provenance.

The IR owner must establish a versioned strict effective-policy format, portable
provenance/hash, create-only publication, fresh-process reopen without template
files, tenant-bound storage/workflow/ledger initialization, and crash recovery.
Signed membership/host activation/document checks and adversarial isolation
remain separate acceptance gates. IR's authenticated clone route remains
intentionally HTTP 503; this increment neither calls nor re-enables it.

## Historical request-only verification (no production mutation)

The commands below now run the expanded disposable bridge-network harness,
including real PostgREST JWT verification and initialized storage acceptance.
The network/SQL-only description that follows records the earlier request-stage
run, not the current harness. See [release gates](IR-RELEASE-REVIEW.md) for current
commands, results and remaining hosted verification.

```bash
python3 scripts/staging/test-ir-provisioning.py
npm run test:fixtures
npx playwright test tests/browser/workspace-tenant-chrome.spec.js \
  tests/browser/workspace-auth-consume.spec.js tests/browser/workspace-auth-email.spec.js \
  tests/browser/onboarding-pack.spec.js --retries=0 --workers=4
```

The SQL runner creates a uniquely named `supabase/postgres:15.8.1.085` container
with `--network none`, no mounts and no published ports. It ignores DB_URL and
linked projects. Existing restore-drill auth/storage compatibility helpers run
as supabase_admin; repository migrations run as postgres (matching the
role-specific default privilege contract). SQL tests exercise actual PostgreSQL
roles, grants, authority, replay/conflicts, audit rollback, independent-connection
concurrency and durable readback. The container is removed in `finally`.

This is SQL-level Supabase verification with locally supplied claim settings,
**not** GoTrue signature/MFA delivery, PostgREST integration, Storage HTTP, hosted
migration/deployment or IR runtime acceptance. Browser tests execute actual UI
with mocked SDK transport, plus keyboard/localization/WCAG checks. CI wires both
the SQL file into the disposable Supabase stack and the isolated runner; no
production migration is authorized by these commands.
