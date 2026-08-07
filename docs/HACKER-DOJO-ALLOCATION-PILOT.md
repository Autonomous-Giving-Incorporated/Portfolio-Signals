# Hacker Dojo allocation pilot

Use **Hacker Dojo** (`org_hacker_dojo`) until live every.org gift data is integrated.

| Item | Value |
| --- | --- |
| Org id | `org_hacker_dojo` |
| Public campaign | `data/public-campaign.json` ($420K / $2M) |
| every.org page | https://www.every.org/hacker-dojo |
| Suite allocation story | `alloc_community_hardware` / Community Hardware Fund |
| Hosting choices | [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md) |
| Specs plan | [hacker-dojo-pilot-hosting](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-hacker-dojo-pilot-hosting.md) |

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

URL changes each session — fine for pilot smoke; use C2 for durable every.org webhooks.

### C2 — Render / Railway / Fly (durable)

| Host | Path |
| --- | --- |
| **Render** | Blueprint `services/allocation-middleware/render.yaml` or Docker web service + disk at `/data` |
| **Railway** | GitHub deploy, root `services/allocation-middleware`, volume at `/data` |
| **Fly** | Optional `fly.toml` + `npm run bootstrap:fly` |

Details: [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md).

After deploy:

```bash
BASE_URL=https://YOUR_HOST npm run pilot:smoke
BASE_URL=https://YOUR_HOST npm run verify:director
```

Set dashboard `PUBLIC_BASE_URL` to that https origin. After first stable seed: `SEED_ON_BOOT=0`. Prefer `ALLOW_OPERATOR_TOKEN_FALLBACK=0` with Supabase director login.

## D — every.org later (Phase 3c)

1. `/setup.html` → copy webhook  
2. every.org Hacker Dojo admin → Advanced → paste  
3. $1 test gift → Connected  

## E — Fly.io (optional)

Optional public host when flyctl works. Default remains Docker Compose (section B). Full notes: [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md) §4.

```bash
# once: install flyctl, then if Gatekeeper blocks:
#   xattr -d com.apple.quarantine ~/.fly/bin/flyctl
export PATH="$HOME/.fly/bin:$PATH"
fly auth login

cd services/allocation-middleware
# optional: export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
npm run bootstrap:fly
BASE_URL=https://agi-allocation.fly.dev npm run pilot:smoke
```

After stable seed: `fly secrets set SEED_ON_BOOT=0 -a agi-allocation`.

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
