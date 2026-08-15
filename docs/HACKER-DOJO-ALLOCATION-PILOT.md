# Hacker Dojo allocation pilot

Use **Hacker Dojo** (`org_hacker_dojo`) until live every.org gift data is integrated.

| Item | Value |
| --- | --- |
| Org id | `org_hacker_dojo` |
| Public campaign | `data/public-campaign.json` ($420K / $2M) |
| every.org page | https://www.every.org/hacker-dojo |
| Suite allocation story | `alloc_community_hardware` / Community Hardware Fund |
| Hosting choices | [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md) |
| Specs plan | [hacker-dojo-pilot-hosting](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-hacker-dojo-pilot-hosting.md) |

## A — Local Node (**no Docker** — Phase 3a default)

Does **not** require Docker. Load gitignored `.env.pilot` (platform Supabase + `ALLOW_OPERATOR_TOKEN_FALLBACK=0`) into the shell, then:

```bash
cd services/allocation-middleware
npm test
set -a && source .env.pilot && set +a
npm run start:hacker-dojo:seed    # SEED_ON_BOOT=1 first time; then start:hacker-dojo
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
BASE_URL=http://127.0.0.1:8787 npm run verify:director
```

Director JWT path: [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md).

| Path | Use |
| --- | --- |
| `/` | Available / allocate / proof / packet |
| `/login.html` | Director login (Supabase) |
| `/setup.html` | every.org webhook wizard (later) |

## B — Docker Compose (optional durable host)

**No Fly CLI.** Same production image, durable volume, works with Docker Desktop on macOS or any VPS.

```bash
cd services/allocation-middleware
npm run gen:env                 # writes .env.pilot (not committed)
npm run compose:up              # build + run on :8787
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
```

Open http://127.0.0.1:8787 — seed shows Community Hardware Fund.

**Public VPS:** set `PUBLIC_BASE_URL=https://your.domain` in `.env.pilot`, put TLS (Caddy/nginx) in front of port 8787, same `compose:up`.

Then director: membership on `org_hacker_dojo` → `/login.html` → allocate (or paste operator token from `.env.pilot` as fallback).

After stable seed: set `SEED_ON_BOOT=0` in env and recreate the container.

## C — Public HTTPS (Phase 3b)

Use when every.org or remote directors need a public origin. **Docker not required** for the ephemeral path.

### C1 — Cloudflare quick tunnel (ephemeral, no SaaS account)

Runs against local Node (or Compose) on `:8787`:

```bash
# terminal 1 — allocation host (Node)
cd services/allocation-middleware
set -a && source .env.pilot && set +a
npm run start:hacker-dojo   # or :seed first time

# terminal 2 — public HTTPS
cloudflared tunnel --url http://127.0.0.1:8787
# copy the https://*.trycloudflare.com URL

BASE_URL=https://YOUR-SUBDOMAIN.trycloudflare.com npm run pilot:smoke
BASE_URL=https://YOUR-SUBDOMAIN.trycloudflare.com npm run verify:director
# Optionally set PUBLIC_BASE_URL to the same URL in the host env and restart
```

URL changes each session — fine for local smoke. Production every.org webhooks belong on **Cloudflare Workers**, not Render/Fly/Railway — [CLOUDFLARE.md](CLOUDFLARE.md).

Operator durable checklist: [ALLOCATION-DURABLE-HOST.md](ALLOCATION-DURABLE-HOST.md) (`npm run preflight:durable` for local). Webhook remaining work: live Worker URL + every.org pointing (route is in-repo).

### C2 — Cloudflare Workers (designed durable host)

Public portal + allocation console + every.org webhook are **CODE_SHIPPED** on in-repo Worker `portfolio-signals`. That name is **ABSENT** on the connected account (OBSERVED 2026-08-15). Live HTML is `agi-public` GET/HEAD-proxy to Vercel — not an allocation Worker. Do not invent a live allocation URL. Do not point every.org yet.

After those secrets exist and `wrangler deploy` succeeds:

| Path | Use |
| --- | --- |
| `/allocation-login` | Existing platform JWT (director / campaign_lead on `org_hacker_dojo`) |
| `/allocation` | Seed fixtures (optional) → allocate → proof → packet |
| `/allocation-setup` | Webhook URL (AAL2 writer only). Seed ≠ Connected |
| `POST /webhooks/every-org` | every.org (after operator pointing) |

Operator-token fallback is **off**. Seed fixtures are fine and are not a live gift.

Details: [CLOUDFLARE.md](CLOUDFLARE.md) · [ALLOCATION-SECURITY-AUDIT.md](ALLOCATION-SECURITY-AUDIT.md). Historical Compose/Render/Fly recipes: [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md) (not production).

## D — Seed-loop acceptance (no live every.org) — #74 partial

Proves **allocate → proof → packet** on seeded Community Hardware Fund without a live gift. Uses a disposable data file and ephemeral port so day-to-day pilot env (token fallback off) is unchanged.

```bash
cd services/allocation-middleware
npm run accept:seed-loop
# expect: SEED_LOOP_ACCEPTANCE_PASS
```

What it checks:

1. Seed pots load (`SEED_ON_BOOT=1`, no auto-allocate).  
2. `POST /allocations` $100 Community Hardware Fund → 201.  
3. `POST /proofs` evidence URI → 201.  
4. `GET /packet` shows allocation with `proofCount ≥ 1` and totals.  

**Not covered here:** live every.org gift (Phase 3c / #73) or director browser JWT allocate (use `/login.html` + 3a path). After webhook works, re-run a director session allocate for full #74 sign-off.

## E — every.org live webhook (Phase 3c / #73)

**Not OAuth.** every.org POSTs each completed donation to your public HTTPS webhook.

**Designed production host:** a **Cloudflare Worker** (`POST /webhooks/every-org`) on the same account as `portfolio-signals`, with platform Supabase as the data plane. See [CLOUDFLARE.md](CLOUDFLARE.md). Do **not** deploy this webhook to Render, Fly, or Railway.

The Worker route is in-repo. Until a live Worker URL exists and every.org is pointed at it, local Node + an ephemeral tunnel is valid **smoke only** (URL is not durable).

### Prerequisites (local smoke)

1. Allocation host running (local Node is fine).  
2. Public HTTPS in front of it for the test session (cloudflared tunnel).  
3. `PUBLIC_BASE_URL` = that https origin (so `/setup` shows the correct URL).  
4. `WEBHOOK_TOKEN` set (min 16 chars; in `.env.pilot`).

```bash
cd services/allocation-middleware
set -a && source .env.pilot && set +a
# After tunnel URL is known:
# export PUBLIC_BASE_URL=https://YOUR-SUBDOMAIN.trycloudflare.com
export SEED_ON_BOOT=0 SEED_ALLOCATE=0 ALLOW_OPERATOR_TOKEN_FALLBACK=0
npm run start:hacker-dojo
# other terminal:
# cloudflared tunnel --url http://127.0.0.1:8787
```

### Wire every.org

1. Open **`https://YOUR_PUBLIC_HOST/setup.html`** (or `GET /setup` JSON).  
2. **Copy the webhook URL** (includes `?token=`).  
3. every.org → **Hacker Dojo** nonprofit admin → **Settings → Advanced** (or donation webhooks).  
4. Paste webhook URL → **Save**.  
5. Send a **$1 test gift** on https://www.every.org/hacker-dojo (or your fundraiser).  
6. Refresh setup page: `lastGift.chargeId` should be the live charge (not `fixture-hd-gift-*`).  
7. `GET /available` should show a **new** credit for that gift (may create pots keyed by every.org fundraiser title).

**Seed vs live:** Fixture chargeIds (`fixture-hd-gift-*`) never mark setup **Connected**. The wizard shows **Seed only — waiting for live gift** until a **non-fixture** `chargeId` is POSTed. Confirm by `lastLiveGift.chargeId` + Available delta after the $1 gift.

Keep the tunnel (or durable host) **up** while every.org delivers the webhook.

## F — Fly.io / Render / Railway (historical only)

Not the designed host. Do not add or prefer these for `org_hacker_dojo`. Leftover `fly.toml` / `render.yaml` stay in-tree as history. Operators should use **C2 Workers**. See [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md).

## Scripts

| npm | Purpose |
| --- | --- |
| `start:hacker-dojo:seed` | Local Node seed + serve |
| `gen:env` | Generate `.env.pilot` tokens |
| `compose:up` / `compose:down` | Docker Compose pilot (**default**) |
| `pilot:smoke` | Health checks (`BASE_URL=…`) |
| `pilot:env` | Env checklist |
| `bootstrap:fly` | **Optional** Fly app + volume + secrets + deploy + smoke |
| `deploy:fly` | **Optional** Fly deploy only (`--yes` / `DEPLOY_YES=1`) |
| `seed:hacker-dojo` | Seed only |

## Seed fixture

$19k synthetic credits; $2.5k sample allocation + proof. Idempotent chargeIds. No donor PII.
