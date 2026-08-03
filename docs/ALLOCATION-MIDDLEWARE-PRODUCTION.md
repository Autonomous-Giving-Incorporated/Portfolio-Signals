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
| Hosted deploy recipe | Fly.io example (`fly.toml`) |
| every.org live webhook | **Pilot operator step** |
| Director SSO / Supabase session | **Not yet** (operator token is pilot-grade) |
| Multi-region HA | Not required for pilot |

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
5. Directors paste **operator token** in the UI bar (stored in localStorage) for allocate/proof.

## Deploy (Fly.io)

```bash
cd services/allocation-middleware
fly apps create agi-allocation   # once
fly volumes create am_data --size 1 --region sjc
fly secrets set ORG_ID=org_pilot OPERATOR_TOKEN=... WEBHOOK_TOKEN=...
fly deploy
fly status
curl https://<app>.fly.dev/healthz
```

## Pilot success criteria

1. Gift on every.org increases **Available** within ~1 minute  
2. Director allocates without spreadsheet  
3. Proof attached; packet shows totals  
4. Process restart keeps balances (`DATA_FILE` volume)  
5. Unauthenticated allocate fails when tokens set  

## Residual risks

| Risk | Mitigation |
| --- | --- |
| Operator token shared | Rotate; move to Supabase director auth next |
| Single region file store | Snapshot volume; nightly copy |
| Webhook without header auth | Edge inject token |
| No multi-tenant process yet | One `ORG_ID` per deploy for pilot |


## every.org setup wizard

Open **`/setup.html`** (or `/connect`) on the deployed host.

1. Copy the webhook URL shown (includes `?token=`).
2. every.org → nonprofit admin → Settings → Advanced → paste webhook.
3. Send a $1 test gift; wizard polls until **Connected**.
4. Continue to Allocation UI for pots / allocate / packet.

API: `GET /setup` returns JSON status (`authModel: webhook_url` — not OAuth).

Requires `PUBLIC_BASE_URL` in production so the wizard can display the correct public URL.
