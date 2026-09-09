# Cloudflare runtime continuation — preparation, not release

Base: `c4944f33bffd5d89b8204808e692f41f5646531c`; PRs 67/68 merged.
Scope: Fund-Intel only; no suite/gateway edits, hosted SQL, credential rotation,
financial writes, activation or recovery-gate bypass.

## Gates and acceptance

1. **Prepare locally (this PR).** Verify Cloudflare OAuth can see account
   `315fb44b61212825452aad0ca566ea42` and target URL
   `https://utdioxwiskzatwoejgiu.supabase.co`. Inspect deployed Worker metadata
   read-only; never log key values. Wire a validated public anon/publishable
   binding into the same version upload as code, using a private temporary
   secrets file, never service-role fallback. Pin Wrangler and workerd tooling.
   Default-only entrypoint must boot in actual workerd. Bootstrap mode strips
   privileged bindings and denies all mutations even if old remote secrets remain.
   Tests must prove absent public key => 503; absent RPC/schema => sanitized 503;
   failed authentication => 401/503; permission/conflict statuses preserved;
   successful read-only null readback => 200; outbound calls use caller token.
   Static routes and existing Worker/middleware/fixture tests must pass, plus CI
   dry-run and real workerd tests with all network intercepted (not hosted auth).
2. **Independent review (parent), exact-head CI and code PR.** Stage the diff and
   evidence for independent review. No manual CF deploy in this task. No merge
   or release approval is inferred from preparation or from green CI. Deployment
   workflow must require explicit manual bootstrap dispatch from main, not a push.
3. **Separately authorized bootstrap deployment/readback — pending.** Existing
   release documents hold manual production deployment. Parent/operator must
   explicitly authorize this narrower read-only exception and review the exact
   revision before dispatch. Recheck account, target, deployed binding *names*,
   current version/rollback target, and public key provenance. Upload only the
   public binding (no service-role creation or deletion), with matching static
   browser config. Read back exact active deployment/version and binding names;
   probe `/healthz`, static workspace/allocation pages, missing auth, invalid auth,
   `/readyz` and blocked mutation routes at the actual Worker origin. Verify
   runtime config URL/key equality without logging keys. Missing schema with an
   approved human session must yield sanitized 503, not success/readiness.
   Suite origin forwarding is a separately owned coordinated readback. A green
   workflow, dry-run or static host is not evidence of deployed Worker behavior.
4. **Hosted database release — BLOCKED, separate.** Obtain human schema review,
   usable backup/recovery point and proven restore, direct authorized DB access,
   fresh history/catalog snapshot, and the exact four-file release procedure in
   `IR-TARGETED-RELEASE.md`. No hosted migration/repair/fixtures here. Bootstrap
   release does not satisfy this gate or remove the known allocation-policy risk.
5. **Human runtime acceptance and activation — pending, separate.** After approved
   schema release, verify hosted GoTrue MFA/AAL2, tenant boundaries, approved
   synthetic client initialization and exact persisted readback/reopen. Removing
   bootstrap containment requires a separate reviewed release. `runtime_ready`
   and `operational` remain false; no money/notification/activation authorization.

## Evidence limits

Local workerd outbound Auth and RPC responses are controlled fixtures. They prove
runtime routing, binding and error containment, not real GoTrue, schema parity,
MFA enrollment or live tenant state. Recovery and human approval remain unresolved.


## Preparation evidence (local, 2026-09-08 PDT)

- Verified main `c4944f33bffd5d89b8204808e692f41f5646531c`, merged PRs
  67 and 68; isolated `ci/fi-public-runtime-preflight` worktree.
- Wrangler 4.130.0 OAuth `whoami` lists the exact target account. Read-only
  Cloudflare script inventory contains no `portfolio-signals`; exact Worker
  settings GET returned 404. Workers subdomain is `zer0state-noema`, so the
  anticipated first-deploy origin is `portfolio-signals.zer0state-noema.workers.dev`
  (not yet a verified deployed endpoint). No existing FI rollback version exists
  in this account inventory; first-release rollback must disable/remove the new
  Worker only under operator approval, not invent a prior version.
- GitHub repository secret and variable name inventories both returned empty.
  Local OAuth access does not provision GitHub Actions credentials. Approved
  workflow dispatch is blocked until legitimate target-matching public Supabase
  configuration and scoped CF credentials are supplied by the operator. Nothing
  was created, rotated or printed. No service-role fallback is implemented.
- Actual workerd found `redirect: 'error'` unsupported before any outbound fetch;
  Node handler tests had not exposed it. The transport now uses `manual` and
  rejects redirects without following or forwarding human credentials.
- Bootstrap is an unconditional deployment entrypoint, not a dashboard-toggle
  flag. It strips all bindings except assets, organization, target URL and public
  key, and blocks non-GET/HEAD methods. This contains Worker authority only:
  existing browser/Supabase authorization and known hosted policies are not
  changed, certified read-only, or repaired by this wrapper.
- `npm ci` and `npm audit --audit-level=high`: pass, zero vulnerabilities.
  Wrangler's transitive sharp advisory required an exact 0.35.4 override; actual
  workerd and dry-run were rerun with that locked dependency. Local npm reported
  blocked optional install scripts, but workerd execution itself succeeded.
- Public binding + actual workerd acceptance: 47 passed, zero failed/skipped,
  including schema/RPC absence, service-role fallback denial, Auth/RPC redirects,
  upstream network failure, sanitized errors and caller-token forwarding.
- Existing Worker + middleware tests: 220 passed, no skips. Fixtures: 65 passed.
  Static route validator: 8 routes passed. Browser suite: 54 passed, 2 dedicated
  database cases skipped (not rerun against any hosted database).
- Pinned Wrangler `deploy --dry-run --secrets-file` with synthetic public value:
  passed, asserted value absent from logs, private artifacts cleaned. No upload.
- Independent Codex reviewer failed authentication (401), not a code/test verdict.
  No retry or credential change. Independent Hermes review by the parent remains
  mandatory before release; this PR must not claim independent approval.

The complete continuation plan is **not done**: bootstrap deployment/readback,
parent review, human/schema/recovery approval and activation gates remain pending.
