# Hacker Dojo allocation pilot

Use **Hacker Dojo** as the reference tenant until live every.org gift data is integrated.

| Item | Value |
| --- | --- |
| Org id | `org_hacker_dojo` |
| Public campaign | `data/public-campaign.json` ($420K / $2M) |
| every.org page | https://www.every.org/hacker-dojo |
| Suite allocation | `alloc_community_hardware` / Community Hardware Fund |
| Impact outcome | Beginner Electronics Class (Impact Relay public) |

## Quick start (local)

```bash
cd services/allocation-middleware
npm test
npm run seed:hacker-dojo          # writes ./data/hacker-dojo.json
npm run start:hacker-dojo         # http://127.0.0.1:8787
```

Open:

- `/` — Available / Allocate / Packet  
- `/setup.html` — every.org connect wizard (for later live webhook)

## What the seed loads

| Gift total | Split |
| --- | --- |
| $19,000 synthetic credits | $17,500 Community Hardware Fund + $1,500 undesignated |

Plus:

- Labels for campaign/program keys  
- Suggested allocation **$2,500** to Community Hardware Fund (workshop equipment)  
- Proof URI pointing at public Impact Relay surface  

Re-run seed is **idempotent** on gift `chargeId`s. Set `SEED_ALLOCATE=0` to skip auto-allocation.

## Later: live every.org

1. Deploy with `ORG_ID=org_hacker_dojo` and durable `DATA_FILE`  
2. `/setup.html` → paste webhook into every.org Hacker Dojo admin  
3. Live gifts credit the same pots; fixture gifts remain historical  

## Privacy

Fixture gifts are **synthetic** (no donor PII). Public campaign/impact JSON remain aggregate-only.
