# Allocation middleware — production readiness

## Status (this release)

| Gate | Status |
| --- | --- |
| Domain + every.org + allocate + packet | Ready |
| Automated tests | CI on package path |
| Durable store (file) | Ready (`DATA_FILE`) |
| Supabase DDL | Migration present; Node adapter not required for pilot |
| Secrets for webhook/operator | Ready when `NODE_ENV=production` |
| Health checks | `/healthz`, `/readyz` |
| Mapping UX (label + merge) | API + UI |
| Hosted deploy recipe | Local Node (pilot); production webhook/public host is Cloudflare Workers |
| Hacker Dojo seed + `SEED_ON_BOOT` | Ready (`fixtures/hacker-dojo-pilot.json`) |
| Director SSO / Supabase session | OBSERVED (`/login.html` + membership JWT; #72 closed) |
| every.org live webhook | **PENDING** Worker port (#73) — [CLOUDFLARE.md](CLOUDFLARE.md) |
| Public HTTPS (ephemeral) | OBSERVED (cloudflared; #71 closed) |
| Named durable public host | **Cloudflare Workers** (designed); not Render/Fly/Railway |
| Seed-loop accept (no live gift) | OBSERVED (`npm run accept:seed-loop`) |
| Multi-region HA | Not required for pilot |

Pilot runbook: [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md). Director auth: [ALLOCATION-DIRECTOR-LOGIN.md](ALLOCATION-DIRECTOR-LOGIN.md).

## Production env (required)

```bash
NODE_ENV=production
ORG_ID=org_<client>
DATA_FILE=/data/state.json
OPERATOR_TOKEN=<random 32+ chars>
WEBHOOK_TOKEN=<random 32+ chars>
PORT=8787
PROOF_SLA_HOURS=72
```

Process **exits on boot** if guards fail.

## every.org pilot wiring

1. Deploy with HTTPS (Fly/Railway/VPS).
2. Webhook URL: `https://<host>/webhooks/every-org`
3. Webhook URL (every.org):  
   `https://<host>/webhooks/every-org?token=<WEBHOOK_TOKEN>`  
   Also accepts header `x-webhook-token` (preferred when a proxy can inject it).
4. Map designations via **Merge pots** / **Labels** in UI after first gifts land.
5. Directors sign in at **`/login.html`** (Supabase JWT + membership). Operator token remains an optional emergency fallback only.

## Deploy

### Default — Docker Compose

```bash
cd services/allocation-middleware
npm run gen:env
npm run compose:up
BASE_URL=http://127.0.0.1:8787 npm run pilot:smoke
```

### Optional — Fly.io

```bash
fly auth login   # once; Gatekeeper: xattr -d com.apple.quarantine ~/.fly/bin/flyctl
cd services/allocation-middleware
npm run bootstrap:fly
BASE_URL=https://agi-allocation.fly.dev npm run pilot:smoke
# after stable: fly secrets set SEED_ON_BOOT=0 -a agi-allocation
```

### Optional — Render / Railway

Dashboard deploy; see [ALLOCATION-HOSTING-OPTIONS.md](ALLOCATION-HOSTING-OPTIONS.md) and [ALLOCATION-DURABLE-HOST.md](ALLOCATION-DURABLE-HOST.md) (`npm run preflight:durable`).

Dockerfile includes `fixtures/` so `SEED_ON_BOOT=1` works on any host.

## Pilot success criteria

1. Gift on every.org increases **Available** within ~1 minute  
2. Director allocates without spreadsheet  
3. Proof attached; packet shows totals  
4. Process restart keeps balances (`DATA_FILE` volume)  
5. Unauthenticated allocate fails when tokens set  

## Residual risks

| Risk | Mitigation |
| --- | --- |
| Operator token shared | Prefer director JWT; disable fallback; rotate if used |
| Single region file store | Snapshot volume; nightly copy |
| Webhook without header auth | Edge inject token; URL `?token=` for every.org paste |
| No multi-tenant process yet | One `ORG_ID` per deploy for pilot (`org_hacker_dojo`) |
| Seed data mistaken for live gifts | Turn off `SEED_ON_BOOT` after first host; label synthetic chargeIds |


## every.org setup wizard

Open **`/setup.html`** (or `/connect`) on the deployed host.

1. Copy the webhook URL shown (includes `?token=`).
2. every.org → nonprofit admin → Settings → Advanced → paste webhook.
3. Send a $1 test gift; wizard polls until **Connected**.
4. Continue to Allocation UI for pots / allocate / packet.

API: `GET /setup` returns JSON status (`authModel: webhook_url` — not OAuth).

Requires `PUBLIC_BASE_URL` in production so the wizard can display the correct public URL.


## Seed-on-boot

`SEED_ON_BOOT=1` loads Hacker Dojo fixture on start. Scripts: `npm run pilot:smoke`, `pilot:env`, `deploy:fly`. See [HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md).
