## Hacker Dojo pilot (default)

```bash
npm run seed:hacker-dojo
npm run start:hacker-dojo
# open http://127.0.0.1:8787
```

Default dev `ORG_ID` is `org_hacker_dojo`. Live every.org integration comes later via `/setup.html`.

## Connect every.org

Open `/setup.html` for the guided webhook setup (no OAuth).

# Allocation middleware

MVP package for AGI allocation middleware (every.org → pots → allocate → packet).

## Commands

```bash
npm test
ORG_ID=org_demo npm start   # http://127.0.0.1:8787
```

## every.org setup

1. Nonprofit admin → Advanced settings → webhook URL: `https://<host>/webhooks/every-org`
2. Map fundraisers/designations via first gifts (auto keys)
3. Operators use Available / Allocate / Inbox / Packet

## Design

https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/specs/2026-08-03-allocation-middleware-design.md

## Plan

https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/main/docs/superpowers/plans/2026-08-03-allocation-middleware.md


## Persistence & auth

```bash
# File-backed state (survives restarts)
DATA_FILE=./data/org_demo.json ORG_ID=org_demo npm start

# Optional tokens (recommended outside localhost demos)
OPERATOR_TOKEN=secret WEBHOOK_TOKEN=whsec npm start
# Operator routes: Authorization: Bearer secret  or  x-operator-token: secret
# Webhook: x-webhook-token: whsec
```

Supabase DDL: `supabase/migrations/202608030001_allocation_middleware.sql` (RLS select for members; service role for webhook writes).

## Proof

`POST /proofs` with `{ allocationId, uri, note?, attachedBy? }`  
Open `MISSING_PROOF` exceptions appear after `PROOF_SLA_HOURS` (default 72).
