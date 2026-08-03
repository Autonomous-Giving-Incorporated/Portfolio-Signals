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
