# Cloudflare Workers — Portfolio Signals public host

**Designed production stack:** Cloudflare Workers + platform Supabase (`utdioxwiskzatwoejgiu`).  
Workers serve the public/static site and the every.org webhook route. Supabase remains Auth, RLS, and private data. This is **not** a database migration and **not** a replacement for Supabase Auth.

Vercel (`vercel.json`, project `fund-intel`) stays in-repo as the **fallback until DNS cutover**. Do not treat Render, Fly, or Railway as the durable public or webhook host.

## What this Worker serves

| Path | Asset | Notes |
| --- | --- | --- |
| `/` | `index.html` | Public director portal |
| `/workspace` | `workspace.html` | Authenticated workspace shell (Supabase Auth in the browser) |
| `/workspace.html` | `workspace.html` | 307 → `/workspace` (`html_handling = auto-trailing-slash`) |
| `/workspace/*.js` | `workspace/` modules | Session, decisions, pipelines, onboarding pack, IR bridge |
| `/sponsors`, `/grants`, `/members` | matching `*.html` | Public/aggregate pages |
| `/finance-impact`, `/donor-impact`, `/import-review` | matching `*.html` | Host screens; data stays in Supabase / Impact Relay |
| `/data/public-campaign.json` | public aggregate | Fail-closed public contract; **no donor records** |
| `/allocation` | `allocation.html` | Director allocate → proof → packet for `org_hacker_dojo` (JWT only) |
| `/allocation-login` | `allocation-login.html` | Supabase password login; existing platform JWT |
| `/allocation-setup` | `allocation-setup.html` | every.org webhook wizard (URL hidden until AAL2 writer) |
| `/healthz` `/readyz` `/auth/*` `/available` `/allocations` `/proofs` `/waivers` `/packet` `/seed` `/setup` | Worker script | Allocation API; operator-token fallback **off**. `/setup` also stores tenant `donation_link`. |

This is a **multi-page static site**, not a client-side SPA. `not_found_handling` is left at the default (`none`): unknown paths **404**. `/workspace` works because Wrangler `html_handling = "auto-trailing-slash"` maps `/workspace` → `workspace.html` while `/workspace/session.js` still comes from the `workspace/` directory.

Do **not** set `not_found_handling = "single-page-application"`. That would serve `index.html` for missing URLs and hide 404s.

Publish directory is the **repo root** (same as `vercel.json` `outputDirectory: "."`). `.assetsignore` keeps operator trees off the CDN (`supabase/`, `services/`, `docs/`, `tests/`, `scripts/`, secrets).

## Secrets and env

### GitHub Actions (Workers deploy)

| Name | Where | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | repository **secret** | Wrangler deploy. Use the **Edit Cloudflare Workers** token template (write, not read-only). |
| `CLOUDFLARE_ACCOUNT_ID` | repository **secret** | Account that owns Worker `portfolio-signals`. |

Until both are set, `.github/workflows/cloudflare-workers.yml` **validates** on every PR/`main` push and **skips** the live deploy rather than failing the branch.

### Browser runtime (workspace login)

Same public-anon values Vercel already uses. **Never** put `service_role` in `runtime-config.js`, HTML, or Vercel env. The allocation API uses `SUPABASE_SERVICE_ROLE_KEY` as a **Worker secret only** (membership lookup + `am_*` writes).

| Name | Where | Purpose |
| --- | --- | --- |
| `PLATFORM_SUPABASE_URL` | Actions **variable** | `https://utdioxwiskzatwoejgiu.supabase.co` |
| `PLATFORM_SUPABASE_ANON_KEY` | Actions **secret** | Public anon key only (RLS-bound) |

CI runs `bash scripts/vercel-build.sh` before `wrangler deploy`. With those values set, gitignored `runtime-config.js` includes the platform URL + anon key. Without them, the script writes a **public-only stub** (portal still deploys; workspace magic-link login will not work until anon env is present).

Supabase Auth redirect allowlist must include both the `workers.dev` origin (and later the custom domain) **and** `/workspace` plus `/workspace.html`.

## Deploy

After secrets exist:

```bash
# local preview (static assets on :8787)
npx wrangler@4 dev

# validate without uploading
npx wrangler@4 deploy --dry-run --outdir=/tmp/wrangler-dry-run

# production Worker (requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
npx wrangler@4 deploy
```

On `main`, GitHub Actions runs the same generate + `wrangler deploy` path. First successful deploy publishes:

`https://portfolio-signals.<your-subdomain>.workers.dev`

DNS cutover (`autogive.app/portfolio-signals` → this Worker) is an operator step. Keep Vercel live until that cutover is verified (workspace login, public pages, Auth redirects).

## Public data boundary

The Worker may only serve:

- privacy-safe HTML/JS/CSS/assets;
- `data/public-campaign.json` and other **aggregate** public files already in git.

It must **not** serve donor records, member registries, workbooks, service-role keys, or Supabase migrations. `.assetsignore` is fail-closed on those trees. Authz for private data remains **Supabase RLS + Edge Functions**, not this CDN.

## every.org webhook on this Worker

`POST /webhooks/every-org` and the director allocation API run on Worker `portfolio-signals` via `main` + `assets.run_worker_first`. Product semantics stay the allocation middleware contract. Operator-token fallback is **off**. Durable state is platform Supabase `am_*` (not D1, not Render/Fly disk).

Director path after a live Worker URL exists (not claimed here):

1. Open `https://portfolio-signals.<account>.workers.dev/allocation-login`
2. Sign in with an existing platform JWT (membership on `org_hacker_dojo`)
3. `/allocation` → **Seed fixtures** (optional) → allocate → attach proof → refresh packet

| Item | State |
| --- | --- |
| Worker route + deterministic tests | SHIPPED in this repo (webhook + seed allocate → proof → packet + fail-closed auth) |
| Durable store | platform Supabase `am_*` via service-role **secret**. Not D1, not Render/Fly disk |
| Live `workers.dev` deploy | **PENDING** — this environment does not have `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` |
| `wrangler secret put WEBHOOK_TOKEN` | PENDING operator |
| `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` | PENDING operator — never commit |
| `PLATFORM_SUPABASE_ANON_KEY` Worker var/secret | PENDING operator (public anon only; required for `/allocation-login`) |
| `PUBLIC_BASE_URL` | PENDING until the live origin is known |
| `RESEND_API_KEY` / `RESEND_FROM` | Optional Worker secrets for ImpactNotice email. Unset → email channel skipped. Do not invent values here. |
| every.org Advanced webhook URL | **Do not point yet** — no live webhook point is invented here |
| Controlled live gift + director browser sign-off | PENDING ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)) |
| `durable_named_host: OBSERVED` | **Not recorded** |

Local Node (`npm run start:hacker-dojo:seed` / `npm run accept:seed-loop`) remains valid for **repo/pilot smoke**. It is not the production host.

```bash
# after GitHub CF secrets exist (do not invent a live URL before deploy)
npx wrangler@4 secret put WEBHOOK_TOKEN
npx wrangler@4 secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler@4 secret put PLATFORM_SUPABASE_ANON_KEY
# optional once the workers.dev origin is known:
# npx wrangler@4 secret put PUBLIC_BASE_URL
# optional ImpactNotice email (skip send if unset):
# npx wrangler@4 secret put RESEND_API_KEY
# npx wrangler@4 secret put RESEND_FROM
```

## Vercel until cutover

`vercel.json` and `.vercelignore` stay. Vercel build still runs `scripts/vercel-build.sh`. After DNS cutover is observed, a follow-up can retire the Vercel project; do not delete `vercel.json` in this change.

## Related

- [PLATFORM.md](PLATFORM.md) — suite hosts and Supabase ref  
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — login and roles  
- [ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md) — middleware role (semantics unchanged)  
- [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) — token classification  
