# Allocation middleware — durable named host (optional)

Ephemeral Cloudflare quick tunnel is **OBSERVED** for pilot smoke. A **named durable** host is optional until every.org needs a stable webhook URL.

This page is the operator preflight + deploy checklist. Runtime recipes: [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md).

## Status labels

| State | Meaning |
| --- | --- |
| Recipe READY | In-repo Dockerfile, `render.yaml`, `railway.toml`, `fly.toml`, Compose |
| Local durable OBSERVED | Docker Compose volume on this machine / VPS smoke |
| Named public PENDING | Render / Railway / Fly (or VPS + TLS) dashboard deploy |

## Preflight (no dashboard)

```bash
cd services/allocation-middleware
npm run pilot:env          # missing required env names
# or full durable checklist:
npm run preflight:durable
```

Required for production-shaped host:

| Env | Notes |
| --- | --- |
| `ORG_ID` | Pilot: `org_hacker_dojo` |
| `DATA_FILE` | e.g. `/data/state.json` on volume |
| `PUBLIC_BASE_URL` | Final `https://…` origin (set after host URL known) |
| `WEBHOOK_TOKEN` | ≥16 random chars; never commit |
| `NODE_ENV=production` | Process guards |
| `ALLOW_OPERATOR_TOKEN_FALLBACK` | Prefer `0` with Supabase director login |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Platform for director JWT |
| `SEED_ON_BOOT` | `1` first empty volume only; then `0` |

## Path A — Docker Compose (local or VPS durable volume)

```bash
cd services/allocation-middleware
# .env.pilot gitignored — from gen:env or copy .env.example
npm run gen:env   # if needed
npm run compose:up
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
BASE_URL=http://127.0.0.1:8787 npm run verify:director   # if Supabase set
```

VPS: put Caddy/nginx TLS in front of `:8787`, set `PUBLIC_BASE_URL=https://allocation.example.com`.

## Path B — Render (recommended managed public)

1. [render.com](https://render.com) → Blueprint → connect `scrimshawlife-ctrl/Fund-Intel` → `services/allocation-middleware/render.yaml`  
   **or** Docker web service, root `services/allocation-middleware`, disk `/data` 1 GB.
2. Dashboard secrets: `PUBLIC_BASE_URL`, `SUPABASE_*` (sync:false in blueprint).
3. Prefer `ALLOW_OPERATOR_TOKEN_FALLBACK=0`.
4. Smoke: `BASE_URL=https://<service>.onrender.com npm run pilot:smoke`
5. After stable seed: set `SEED_ON_BOOT=0` in dashboard.
6. Open `/setup.html` for every.org webhook URL.

## Path C — Railway / Fly

See [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md). Fly: `npm run bootstrap:fly` when flyctl authenticated.

## After host is up

1. `pilot:smoke` + `verify:director` against public `BASE_URL`  
2. `/setup.html` → every.org (#73)  
3. Director allocate in browser (#74 remainder)  
4. Record in [CURRENT-STATE.md](CURRENT-STATE.md):

```yaml
durable_named_host: OBSERVED  # YYYY-MM-DD provider + hostname only (no tokens)
```

## Non-goals

- Multi-region HA  
- Multi-tenant process (one `ORG_ID` per deploy for pilot)  
- Replacing ephemeral tunnel for pure local director drills

## Related

- [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md)
- [ALLOCATION-MIDDLEWARE-PRODUCTION.md](ALLOCATION-MIDDLEWARE-PRODUCTION.md)
- [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md)
