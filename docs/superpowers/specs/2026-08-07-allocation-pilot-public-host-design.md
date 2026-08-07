# Allocation pilot public HTTPS host (Phase 3b) — design

**Date:** 2026-08-07  
**Tracking:** Fund-Intel #71  
**Depends on:** Phase 3a director auth  

## Goal

Expose the allocation middleware over **HTTPS** so pilot smoke and (later) every.org webhooks work against a public origin.

## Paths (no Docker required for ephemeral)

| Rank | Path | Durability | When |
| --- | --- | --- | --- |
| **1** | **Cloudflare quick tunnel** → local Node `:8787` | Ephemeral URL | Prove HTTPS + smoke without SaaS account |
| **2** | **Render** Blueprint (`render.yaml`) | Durable + disk | Named public host for every.org |
| **3** | **Railway** / **Fly** / VPS+Compose | Durable | Operator preference |

Docker is only required for Compose/VPS image path, not for tunnel or (if using Render Docker runtime) dashboard handles build.

## Acceptance (#71)

1. Host reachable over HTTPS  
2. `BASE_URL=https://… npm run pilot:smoke` PASS  
3. `PUBLIC_BASE_URL` set for setup wizard (tunnel: set to tunnel URL while testing)  
4. After stable seed on durable host: `SEED_ON_BOOT=0`  
5. Director auth still enabled when Supabase env present  

## Out of scope

- Live every.org gift (#73)  
- Named custom domain on autogive.app (optional later)  

## Success

CURRENT-STATE records OBSERVED public HTTPS smoke (ephemeral and/or durable). Runbook documents tunnel + Render durable recipe.
