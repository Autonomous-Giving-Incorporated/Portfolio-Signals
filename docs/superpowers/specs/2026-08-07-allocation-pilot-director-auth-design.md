# Allocation pilot director auth (Phase 3a) — design

**Date:** 2026-08-07  
**Status:** Implementation  
**Tracking:** Fund-Intel #72 (primary); #71 public host and #73 every.org deferred to 3b/3c  
**Package:** `services/allocation-middleware/`

## Goal

Close the **director JWT** path for the Hacker Dojo allocation pilot so allocate/proof use Supabase membership, not a shared operator token.

## Non-Docker and Docker paths

| Path | When | How |
| --- | --- | --- |
| **Local Node (no Docker)** | Day-to-day pilot / CI smoke | `npm run start:hacker-dojo` or `start:hacker-dojo:seed` with `.env.pilot` loaded into the process env |
| **Docker Compose** | Durable local/VPS volume | `npm run gen:env` → `compose:up` |
| **Render / Railway / Fly** | Public HTTPS (Phase **3b**, #71) | See ALLOCATION-HOSTING-OPTIONS.md |

**Default for 3a evidence:** Local Node against platform Supabase (`utdioxwiskzatwoejgiu`). Docker is optional, not required.

## Acceptance (#72)

1. `SUPABASE_URL` / `ANON` / `SERVICE_ROLE` on host (gitignored `.env.pilot`).  
2. Active `director` or `campaign_lead` membership on `org_hacker_dojo`.  
3. `GET /auth/config` → `directorLoginEnabled: true`.  
4. `ALLOW_OPERATOR_TOKEN_FALLBACK=0` (or emergency-only).  
5. `BASE_URL=… npm run verify:director` PASS.  
6. Optional: `verify:director --login` with director password, or browser `/login.html` sign-off.

## Out of scope (3b/3c)

- Public HTTPS deploy (#71)  
- Live every.org webhook (#73)  
- Formal director sign-off comment on #74 (depends on host + preferably live gifts)

## Success

Docs make **Node-without-Docker** first-class; CURRENT-STATE records OBSERVED director-auth pilot; issue #72 updated/closed when acceptance met.
