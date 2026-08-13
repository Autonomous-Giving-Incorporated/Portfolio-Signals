# Cloudflare Workers — Portfolio Signals public host

**Designed production stack:** Cloudflare Workers + platform Supabase (`utdioxwiskzatwoejgiu`).  
Workers serve the public/static site (and, next, every.org webhooks). Supabase remains Auth, RLS, and private data. This is **not** a database migration and **not** a replacement for Supabase Auth.

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

Same public-anon values Vercel already uses. **Never** put `service_role` on Workers, Vercel, or in `runtime-config.js`.

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

## Remaining work — every.org webhooks on Workers

`POST /webhooks/every-org` today lives in the Node HTTP server under `services/allocation-middleware`. That process is a **local/pilot** implementation. The **designed durable host** for the webhook is a **Cloudflare Worker**, talking to the same platform Supabase project — not Render, Fly, or Railway.

This PR does **not** rewrite the middleware. Product semantics (pots → allocate → proof → exception inbox, director JWT, webhook token) stay unchanged. Remaining operator/engineering work:

1. Port `POST /webhooks/every-org` (and any setup URL the wizard copies) onto Workers — either `main` on `portfolio-signals` with `assets.run_worker_first = ["/webhooks/*"]`, or a sibling Worker on the same account.
2. Store webhook secrets with `wrangler secret put` (e.g. `WEBHOOK_TOKEN`). Never commit them.
3. Keep durable allocation state in **platform Supabase** (already the suite data plane). Do not introduce a Render/Fly disk as the system of record.
4. Point every.org Advanced webhook settings at the Worker HTTPS URL once the port is live.
5. Leave MFA / onboarding / allocation **behavior** as-is; this is host + runtime only.

Until that port ships, local Node (`npm run start:hacker-dojo:seed`) remains valid for **pilot smoke**. It is not the production webhook host.

## Vercel until cutover

`vercel.json` and `.vercelignore` stay. Vercel build still runs `scripts/vercel-build.sh`. After DNS cutover is observed, a follow-up can retire the Vercel project; do not delete `vercel.json` in this change.

## Related

- [PLATFORM.md](PLATFORM.md) — suite hosts and Supabase ref  
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — login and roles  
- [ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md) — middleware role (semantics unchanged)  
- [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) — token classification  
