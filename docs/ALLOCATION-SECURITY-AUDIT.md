# Allocation host — defensive security audit

**Recorded:** 2026-08-15  
**Scope:** Cloudflare Workers allocation host + `org_hacker_dojo` tenant isolation.  
**Method:** repo review + deterministic tests. No exploits, exploit PoCs, or attack scripts.  
**Live director browser session:** not run. **Live every.org gift:** not run.

Designed stack: **Cloudflare Workers + platform Supabase** (`utdioxwiskzatwoejgiu`). Render / Fly / Railway are not the audit target.

## Fixed in this change

| Finding | Fix |
| --- | --- |
| Worker exposed webhook only; directors had no Cloudflare-shaped allocate → proof → packet path | Worker now serves those APIs on `portfolio-signals`. Operator-token fallback stays **off**. |
| `createAuthVerifier` accepted a leftover `profiles.role` when `client_memberships` was empty | Membership on the bound `ORG_ID` is required. Tests cover empty membership and a different-org membership. |
| `am_allocations_insert` / `am_proofs_insert` allowed any `is_client_member` | Policies now allow `director`, `campaign_lead`, or `master_admin` only. SQL test `019_am_tenant_isolation.sql`. |
| Worker bundle pulled `node:fs` via `store.mjs` / `seed.mjs` | Memory/core store and `seedFromObject` are Workers-safe. File store stays Node-only. |
| Worker UI would have inherited the Node operator-token field | Published `/allocation` console is JWT-only. Node UI hides the fallback unless `/auth/config` says it is on. |
| Supabase store could have written another org's in-memory rows | Save filters `client_id === orgId`. Load queries are org-scoped. |
| Compose defaulted `ALLOW_OPERATOR_TOKEN_FALLBACK=1` | Default is `0`. Seed-loop still sets `1` on an ephemeral local port only. |

## Remaining (code / product)

| Item | Why it remains |
| --- | --- |
| Webhook token may appear on the query string | every.org Advanced settings historically paste a URL; header `x-webhook-token` is preferred when a proxy can inject it. |
| `GET /setup` returns the webhook URL to an authorized writer | Required for the director wizard. Unauthenticated callers do not get it. |
| `GET /auth/config` returns the public anon key | Designed for browser login. Service role is never included. |
| Node file store + leftover `render.yaml` / `fly.toml` | Historical local recipes. Not the durable host. |
| Display labels persist on `am_org_meta` only after this migration is applied | Worker 503s if the store binding or migration is missing (fail-closed). |
| AAL2 / `mfa_enforced` dry-run receipts | Not invented. [#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18) stays prep-only. |
| Isolated restore receipts / RTO / RPO | Not invented. [#19](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/19) stays prep-only. |

## Operator-only (not claimed here)

| Item | Exact need |
| --- | --- |
| Live Workers deploy | GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Both were **absent** in this environment; deploy stays **PENDING**. |
| Worker persist + webhook auth | `wrangler secret put WEBHOOK_TOKEN` and `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. Optional: `PLATFORM_SUPABASE_ANON_KEY` (public) and `PUBLIC_BASE_URL`. |
| Platform URL | `PLATFORM_SUPABASE_URL` is already a Worker var (`https://utdioxwiskzatwoejgiu.supabase.co`). |
| every.org pointing | Do **not** paste a webhook URL until a live `workers.dev` (or custom) origin is operator-verified. No live URL is invented here. |
| Director membership | Existing platform JWT with `director` or `campaign_lead` on `org_hacker_dojo`, `profiles.active`, `mfa_enforced`, AAL2. |
| GitHub secret scanning / rulesets | Still `403 Resource not accessible by integration`. |
| Issue #22 leaked-password / Pro plan | Skipped as requested. |

## Auth assumptions (do not weaken)

- Browser runtime-config and Vercel stay **anon-only**.
- Worker **secret** `SUPABASE_SERVICE_ROLE_KEY` is for `am_*` writes and membership lookup. It must never be placed in `runtime-config.js`, HTML, or git.
- Pilot Worker: `operatorTokenFallback: false` always.
- Cross-tenant reads of `am_*` are denied by RLS `client_id` + membership. The Worker store also filters by bound `ORG_ID`.

## Test proof (repo)

- Worker: seed → allocate → proof → packet on `org_hacker_dojo` fixtures; missing JWT; operator token rejected; AAL1 403; missing bindings 503; webhook fail-closed cases unchanged.
- Node auth: `profiles.role` without membership denied; other-org membership denied.
- SQL: `019_am_tenant_isolation.sql` (HD director cannot read/write `org_am_isolation`; development cannot insert allocations).
