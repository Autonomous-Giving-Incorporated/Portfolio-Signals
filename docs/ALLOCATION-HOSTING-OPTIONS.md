# Allocation middleware — hosting options

Pilot needs: **Docker image**, **HTTPS URL**, **env secrets**, **durable file** at `DATA_FILE` (volume or disk).  
No payment processing, no multi-region requirement.

## Recommendation (macOS / no Fly)

| Rank | Host | Why | CLI required? |
| --- | --- | --- | --- |
| **1** | **Docker Compose** (local or any VPS) | Already works on this Mac; same image as production | Docker only |
| **2** | **Render** | Closest Fly-like: GitHub deploy, persistent disk, dashboard secrets | No (web UI) |
| **3** | **Railway** | Similar to Fly; volume + Dockerfile | No (web UI) |
| — | Fly.io | Original target | flyctl (Gatekeeper issues reported) |

## 1) Docker Compose (recommended default)

```bash
cd services/allocation-middleware
./scripts/gen-pilot-env.sh          # writes .env.pilot (gitignored pattern)
docker compose --env-file .env.pilot up -d --build
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
```

**Public VPS (Hetzner, DigitalOcean, Linode, etc.):**

1. Install Docker Engine on the VM.  
2. Clone repo, generate env with real `PUBLIC_BASE_URL=https://allocation.example.com`.  
3. Put Caddy or nginx TLS in front of `:8787`, or use a tunnel.  
4. `docker compose --env-file .env.pilot up -d --build`.

Files: `docker-compose.yml`, `scripts/gen-pilot-env.sh`.

## 2) Render

1. [render.com](https://render.com) → New → Blueprint  
2. Connect `scrimshawlife-ctrl/Fund-Intel`, select `services/allocation-middleware/render.yaml`  
   **or** New Web Service → Docker → root directory `services/allocation-middleware`  
3. Add **persistent disk** mount `/data` (1 GB) if not using blueprint  
4. Set dashboard env (blueprint generates `WEBHOOK_TOKEN` / `OPERATOR_TOKEN`):  
   - `PUBLIC_BASE_URL=https://<service>.onrender.com`  
   - optional `SUPABASE_*`  
5. Deploy → `BASE_URL=https://<service>.onrender.com npm run pilot:smoke`

File: `render.yaml`.

## 3) Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub  
2. Root directory: `services/allocation-middleware`  
3. Add **volume** → mount path `/data`  
4. Variables from `.env.example` (`PUBLIC_BASE_URL` = Railway public domain)  
5. Deploy → smoke against the public URL  

File: `railway.toml`.

## 4) Fly.io (optional)

Kept for operators who can run flyctl. See [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) section B-Fly.  
If Gatekeeper blocks the binary: use Render or Compose instead of fighting quarantine.

## After any host is up

1. Smoke: `BASE_URL=https://… npm run pilot:smoke`  
2. Director login or operator token → allocate  
3. `/setup.html` → every.org webhook  
4. Set `SEED_ON_BOOT=0` after first stable seed  

## Non-goals for pilot host

- Kubernetes / service mesh  
- Multi-tenant process  
- Replacing Supabase or Impact Relay  
