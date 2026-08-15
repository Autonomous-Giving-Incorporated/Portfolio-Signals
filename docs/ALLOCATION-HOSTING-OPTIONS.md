# Allocation middleware — hosting options

Runtime needs: **HTTPS URL**, **env secrets**, and durable state. Designed production is **Cloudflare Workers + platform Supabase** (`utdioxwiskzatwoejgiu`). See [CLOUDFLARE.md](CLOUDFLARE.md).

Render, Fly, and Railway are **not** the durable public or webhook host. In-repo `render.yaml` / `fly.toml` / `railway.toml` are historical local recipes only.

## Recommendation

| Rank | Host | Role |
| --- | --- | --- |
| **1** | **Cloudflare Workers** | **Designed production** — static public site + `POST /webhooks/every-org` in-repo. Live deploy/pointing remain operator-owned. Data/Auth stay on Supabase. |
| **2** | **Local Node** | **Pilot only** — director auth against platform Supabase; no Docker |
| **3** | **Cloudflare quick tunnel** | Ephemeral public HTTPS for local Node smoke (`*.trycloudflare.com`) |
| **4** | **Docker Compose** | Local durable volume for pilot files; not the named production webhook |

**Production public site:** Workers (`portfolio-signals`).  
**Production webhook:** Workers (`POST /webhooks/every-org` on `portfolio-signals`; do not deploy this service to Render/Fly/Railway). Live every.org pointing is still operator-owned.  
**Day-to-day director-auth pilot:** Local Node.  
**Operator checklist:** [ALLOCATION-DURABLE-HOST.md](ALLOCATION-DURABLE-HOST.md) · `npm run preflight:durable` (local). Webhook production cutover: [CLOUDFLARE.md](CLOUDFLARE.md).

## 0a) Cloudflare quick tunnel (ephemeral public HTTPS)

```bash
# allocation already on :8787 (Node or Compose)
cloudflared tunnel --url http://127.0.0.1:8787
BASE_URL=https://….trycloudflare.com npm run pilot:smoke
```

No Docker. URL is temporary. Not the production webhook host.

## 0) Local Node (no Docker)

```bash
cd services/allocation-middleware
# Edit .env.pilot with platform Supabase keys (never commit)
set -a && source .env.pilot && set +a
npm run start:hacker-dojo:seed    # or start:hacker-dojo after seed
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
BASE_URL=http://127.0.0.1:8787 npm run verify:director
```

Director login details: [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md).

## 1) Docker Compose (optional durable)

```bash
cd services/allocation-middleware
./scripts/gen-pilot-env.sh          # writes .env.pilot (gitignored)
docker compose --env-file .env.pilot up -d --build
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
```

**Public VPS (Hetzner, DigitalOcean, Linode, etc.):**

1. Install Docker Engine on the VM.  
2. Clone repo, set `PUBLIC_BASE_URL=https://allocation.example.com` in `.env.pilot`.  
3. Put Caddy or nginx TLS in front of `:8787`.  
4. `docker compose --env-file .env.pilot up -d --build`.

Files: `docker-compose.yml`, `scripts/gen-pilot-env.sh`.

## 2) Render (historical recipe — not the designed host)

Do not use Render for production webhooks or the public portal. Designed host: [CLOUDFLARE.md](CLOUDFLARE.md).

1. [render.com](https://render.com) → New → Blueprint  
2. Connect `Autonomous-Giving-Incorporated/Portfolio-Signals`, select `services/allocation-middleware/render.yaml`
   **or** New Web Service → Docker → root directory `services/allocation-middleware`  
3. Persistent disk at `/data` (1 GB) if not using blueprint  
4. Set `PUBLIC_BASE_URL=https://<service>.onrender.com` (+ optional `SUPABASE_*`)  
5. `BASE_URL=https://<service>.onrender.com npm run pilot:smoke`

File: `render.yaml`.

## 3) Railway (historical recipe — not the designed host)

Do not use Railway for production webhooks or the public portal.

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub  
2. Root directory: `services/allocation-middleware`  
3. Volume mount path `/data`  
4. Variables from `.env.example`  
5. Smoke against the public URL  

File: `railway.toml`.

## 4) Fly.io (historical recipe — not the designed host)

Do not use Fly for production webhooks or the public portal. Config and scripts that remain in-repo are local/optional only.

### Prerequisites

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/)  
2. `fly auth login` (or set `FLY_API_TOKEN`)  
3. Optional: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### macOS Gatekeeper

If macOS blocks the binary:

```bash
# After install.sh put flyctl in ~/.fly/bin
xattr -d com.apple.quarantine ~/.fly/bin/flyctl 2>/dev/null || true
xattr -d com.apple.quarantine ~/.fly/bin/fly 2>/dev/null || true
export PATH="$HOME/.fly/bin:$PATH"
fly version
```

If still blocked: use local Node / Docker Compose for the pilot. Do not require Fly for suite progress.

### One-command bootstrap

```bash
cd services/allocation-middleware
# optional director auth:
# export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
npm run bootstrap:fly
```

Creates app `agi-allocation` (override `FLY_APP=`), volume `am_data`, secrets (`ORG_ID=org_hacker_dojo`, `SEED_ON_BOOT=1`, tokens), deploys, runs smoke.

### Manual

```bash
cd services/allocation-middleware
fly apps create agi-allocation
fly volumes create am_data --size 1 --region sjc --yes
fly secrets set ORG_ID=org_hacker_dojo DATA_FILE=/data/state.json \
  PUBLIC_BASE_URL=https://agi-allocation.fly.dev \
  WEBHOOK_TOKEN="$(openssl rand -hex 24)" \
  OPERATOR_TOKEN="$(openssl rand -hex 24)" \
  ALLOW_OPERATOR_TOKEN_FALLBACK=1 SEED_ON_BOOT=1
DEPLOY_YES=1 npm run deploy:fly -- --yes
BASE_URL=https://agi-allocation.fly.dev npm run pilot:smoke
```

After stable seed: `fly secrets set SEED_ON_BOOT=0 -a agi-allocation`.

Files: `fly.toml`, `scripts/bootstrap-fly-pilot.sh`, `scripts/deploy-fly.sh`.

## After any host is up

1. Smoke: `BASE_URL=https://… npm run pilot:smoke`  
2. Director login or operator token → allocate  
3. `/setup.html` → every.org webhook  
4. Set `SEED_ON_BOOT=0` after first stable seed  

## Non-goals for pilot host

- Kubernetes / service mesh  
- Multi-tenant process  
- Replacing Supabase or Impact Relay  

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 22 + Hash: 645560ecfc722b6d040d9c21562681bbf579ba23
