# Allocation middleware — durable named host

Designed durable host is **Cloudflare Workers** (static site live in this repo; every.org webhook is a Worker port). Platform data and Auth stay on Supabase `utdioxwiskzatwoejgiu`. **Do not** treat Render / Railway / Fly as the production webhook host.

Ephemeral Cloudflare quick tunnel remains valid for **local** Node pilot smoke only.

This page is the **local** operator preflight. Production webhook remaining work: [CLOUDFLARE.md](CLOUDFLARE.md). Historical Compose/VPS recipes below are for local durability, not the named public host.

## Status labels

| State | Meaning |
| --- | --- |
| Designed host | Cloudflare Workers + Supabase — [CLOUDFLARE.md](CLOUDFLARE.md) |
| Public static site | Worker `portfolio-signals` (CI deploy once CF secrets are set) |
| Webhook on Workers | CODE_SHIPPED (`POST /webhooks/every-org` on `portfolio-signals`); live URL + every.org pointing PENDING |
| Allocation API on Workers | CODE_SHIPPED (`/seed` `/allocations` `/proofs` `/packet`); operator-token fallback off; live host PENDING |
| Local durable OBSERVED | Docker Compose volume / local Node smoke |
| Render / Railway / Fly | Not the designed durable host |

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

## Path B — Render (historical only — not recommended)

`services/allocation-middleware/render.yaml` remains in-tree as a **historical** local/managed recipe. Render is **not** the designed public or webhook host. Do not treat a Render URL as `durable_named_host`.

If an operator still needs the old recipe for a disposable experiment: Blueprint → `render.yaml`, disk `/data`, dashboard secrets, then `SEED_ON_BOOT=0`. That path does not replace Workers + platform Supabase.

## Path C — Railway / Fly (historical only)

See [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md). These files are not the production webhook host. Fly: `npm run bootstrap:fly` when flyctl authenticated, for local experiments only.

## After a live Worker URL exists (operator — not claimed here)

1. Set Worker secrets (`WEBHOOK_TOKEN`, platform Supabase URL + service role). Never commit them.  
2. Confirm `POST /webhooks/every-org` rejects a bad token and accepts a fixture token against platform `am_*`.  
3. Point every.org Advanced settings at the Worker HTTPS URL (do not do this until the live URL is operator-verified).  
4. Controlled live gift + director JWT allocate/proof/packet + sign-off ([#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)).  
5. Only then record in [CURRENT-STATE.md](CURRENT-STATE.md):

```yaml
durable_named_host: OBSERVED  # YYYY-MM-DD workers.dev or custom hostname only (no tokens)
```

This change does **not** record `durable_named_host: OBSERVED`.

## Non-goals

- Multi-region HA  
- Multi-tenant process (one `ORG_ID` per deploy for pilot)  
- Replacing ephemeral tunnel for pure local director drills

## Related

- [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md)
- [ALLOCATION-MIDDLEWARE-PRODUCTION.md](ALLOCATION-MIDDLEWARE-PRODUCTION.md)
- [SUITE-ONBOARDING.md](SUITE-ONBOARDING.md)

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 22 + Hash: 645560ecfc722b6d040d9c21562681bbf579ba23
