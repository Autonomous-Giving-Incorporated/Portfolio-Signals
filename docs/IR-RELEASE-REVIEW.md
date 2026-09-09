# IR onboarding release review

## Scope

This branch replaces unsupported clone/CLI/registry-readiness UI with three explicit steps for existing clients: immutable request intent, empty-scaffold reservation, and initialized read-only storage. Initialization persists pinned portable policy bytes/hashes, organization binding and revision-zero empty ledger state, then separately reopens it. Requests remain `requested`; `runtime_ready` and `operational` remain false. No financial command runtime, operational policy approval, tenant activation, document-readiness grant, notifications or legacy tenant adoption is implemented.

The earlier request/scaffold documents contain historical slice-specific results. This document and [initialized workspace contract](IR-INITIALIZED-WORKSPACE.md) describe the accumulated release scope.

## Independent review and local acceptance

Reviewed the accumulated tracked diff and all new onboarding files independently of their implementation, including SQL authorization/grants/search paths, transaction/lock ordering, tenant/request foreign keys, exact policy/hash constraints, immutable storage, bounded Worker input, human-token forwarding, sanitized errors and separate readback. No blocking SQL/Worker defect was found in this review. Corrected stale request-only containment and historical evidence labels; did not relax a gate or add service-role authority.

Executed before the review commit:

| Command | Actual result |
|---|---|
| `npm ci` | Clean install; 0 reported vulnerabilities |
| `node --test workers/portfolio-signals/test/*.test.js services/allocation-middleware/test/*.test.mjs` | 220 passed; 0 failed/skipped |
| `npm run test:fixtures` | 65 passed; 0 failed/skipped |
| `node scripts/validate-static-routes.mjs` | 8 static routes and reusable controls validated |
| `npm run test:browser -- --retries=0 --workers=4` | 54 passed; 2 dedicated-database cases intentionally skipped here and executed below |
| `FI_IR_BROWSER=1 python3 scripts/staging/test-ir-provisioning.py` | Complete migration replay; SQL 028/029/030, privilege 017/018 and MFA 027; independent-connection concurrency/rollback/readback; real signed-JWT PostgREST and both desktop/mobile browser cases passed |
| `FI_IR_BROWSER=1 FI_IR_ORACLE_SOURCE=/home/scrimshawlife/Impact-Relay/src python3 scripts/staging/test-ir-provisioning.py` | Same harness passed plus actual initialized FI HTTP readback → IR strict decoder → independent SQLite repository reopen; sibling source unchanged |
| `npx --yes wrangler@4 deploy --dry-run --outdir=/tmp/fi-review-wrangler` | Wrangler 4.130.0 bundled successfully; no deployment |

All harness containers/networks were removed. The harness allocates isolated synthetic databases and ignores hosted database URLs. Auth `/user` is a fixture: PostgREST verifies the signed JWT, but these results do **not** prove hosted GoTrue enrollment/step-up, deployed workerd behavior, suite gateway routing, production migration state or operational IR readiness.

## CI coverage

- `local-supabase-tests.yml`: migration replay and SQL 028/029/030; existing exact security-definer allowlists; Worker wildcard discovery (including both portable goldens); isolated SQL concurrency and Worker/PostgREST harness with `FI_IR_BROWSER=1`. New migration, harness, fixture, Worker, shared contract and dedicated-browser paths trigger this workflow.
- `validate-and-deploy.yml`: all PRs to main run the full browser suite, fixtures, static routes and synthetic data checks. Dedicated real-database cases run in the separate harness above, not this static-server invocation.
- `cloudflare-workers.yml`: Worker wildcard tests and Wrangler dry-run on PRs. Deployment job is skipped for PRs; missing Cloudflare secrets can also skip deployment on main. A green validation is not a deployment receipt.
- The optional sibling oracle is additional local evidence, not a hidden CI dependency. Standalone CI compares exact pinned IR-produced scaffold and initialized golden bytes.

## Ordered deployment gates — no merge/deploy authorization here

1. Coordinate the operator-owned hosted migration window and verify the existing migration history, privileges and backup/rollback plan. Apply **only reviewed migrations in order**, after all preceding migrations:
   1. `202609080001_ir_provisioning_request.sql`
   2. `202609080002_ir_workspace_scaffold.sql`
   3. `202609080003_ir_initialized_workspace.sql`
   Do not run synthetic fixtures or SQL acceptance files on a hosted tenant database. These migrations are create-only, not a repeatable cleanup procedure. Keep `ir_private` outside exposed PostgREST schemas.
2. Verify hosted schema/RPC grants and PostgREST schema-cache availability before enabling the new browser/Worker build. Missing migrations must remain an unavailable result, never a legacy fallback.
3. Confirm Worker-side `PLATFORM_SUPABASE_URL` and **public** `PLATFORM_SUPABASE_ANON_KEY` bindings (or documented existing aliases). The browser runtime-config generator does not provision Worker bindings. Existing service-role credentials are not a fallback. This local dry-run showed the URL binding but no public-key binding; deployed binding state was not inspected or changed.
4. Operator must confirm Cloudflare deployment credentials and coordinate deployment of matching Worker/static assets. Validate authenticated routing through the actual suite host for both `/api/ir/provisioning/*` and `/api/ir/workspaces/*`; direct local handler tests do not establish gateway forwarding. Static-only Pages hosting cannot serve those Worker routes.
5. Conduct separately authorized hosted human GoTrue/MFA/AAL2 acceptance, negative authorization cases, exact readback and reload/reopen with an approved synthetic test client. Do not enable financial operations or infer readiness from initialization.

**Hold merge until migration coordination is complete.** No hosted migration, production data write, Cloudflare credential change, deployment or merge was performed by this review. PR URL, exact head SHA and hosted check conclusions are recorded in the PR/API rather than predicted here.
