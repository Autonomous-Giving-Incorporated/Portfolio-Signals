# Resend magic-link production readiness — plan

**Date:** 2026-08-21
**Design:** [specs/2026-08-21-resend-magic-link-production-readiness-design.md](../specs/2026-08-21-resend-magic-link-production-readiness-design.md)

Status legend: DONE · IN PR · PENDING (eng) · PENDING (operator)

## Tasks

| # | Task | Owner | Status |
| --- | --- | --- | --- |
| P6 | Distinct tenant-admin (director) template | eng | DONE — brand PR |
| — | Rebrand all auth templates to AGI brand kit | eng | DONE — brand PR |
| P5 | Production-safe origins + `safeRedirect` gating (env-driven, localhost opt-in) | eng | DONE — merged PS #42 |
| P4 | Coarse per-IP + global `self_sign_in` throttle (in-memory) | eng | DONE — merged PS #42 |
| P7 | Extract pure helpers to `lib.ts` + unit tests; wire into `local-security-contract.yml` | eng | DONE — merged PS #42 |
| P4b | Durable per-source (hashed IP) send budget migration + SQL dispatch drill (`021`) | eng | DONE — merged PS #43 |
| P3 | Signed Resend delivery webhook (`auth-email-webhook`) → dispatch delivery states (`022`) | eng | DONE — merged PS #44 |
| P3b | Hard-failure alerts (`auth_email_alerts`) on bounced/complained magic links (`023`) | eng | DONE — merged PS #45 |
| P3c | Channel-agnostic incoming-webhook notifier (`ALERT_WEBHOOK_URL`; Slack/Buzz/Discord/Teams) | eng | DONE — merged PS #46 |
| P1 | Deploy `auth-email` + set `RESEND_API_KEY` / `AUTH_EMAIL_FROM` / `AUTH_EMAIL_REPLY_TO` / `AUTH_ALLOWED_ORIGINS`; reconcile `CURRENT-STATE` | operator | **NOT_COMPUTABLE** 2026-08-22 — no `SUPABASE_ACCESS_TOKEN`, no Resend secrets; MCP reaches only Noema `dezykkherxlaysxyvgbs`, not `utdioxwiskzatwoejgiu` |
| P2 | Verify `auth.autogive.app` in Resend (DKIM/SPF/return-path); DMARC p=none→reject | operator | PENDING (operator) |
| P8 | Synthetic acceptance drill; record OBSERVED (provider + date only) | operator + eng | PENDING — blocked on P1 |

## Sequencing

1. Land eng PRs (brand templates → P5/P4/P7 hardening). **Done** (PS #41–#46).
2. Operator P1 + P2 (deploy + domain auth). Start DMARC reporting window. **P1 still blocked** without platform CLI token + Resend key.
3. P8 synthetic acceptance against `utdioxwiskzatwoejgiu`.
4. Deploy `auth-email-webhook` with `RESEND_WEBHOOK_SECRET` (code already merged).
5. Tighten DMARC to quarantine/reject after a clean reporting window; do not mark READY from this plan.

### 2026-08-22 agent attempt

```text
supabase functions list --project-ref utdioxwiskzatwoejgiu
# Access token not provided. Supply an access token by running supabase login
# or setting the SUPABASE_ACCESS_TOKEN environment variable.

local unit tests: 21 passed (templates + auth-email/lib + auth-email-webhook/lib)
```

Do not invent `RESEND_API_KEY` or deploy `auth-email` onto the Noema project.

## Confirm current deploy/secret state (P1 precondition)

```bash
supabase functions list --project-ref utdioxwiskzatwoejgiu
supabase secrets list  --project-ref utdioxwiskzatwoejgiu   # names only
```

## Validation (eng, no secrets)

```bash
node --experimental-strip-types --test \
  supabase/functions/_shared/auth-email-templates.test.ts \
  supabase/functions/_shared/auth-assurance.test.ts \
  supabase/functions/auth-email/lib.test.ts
deno check --node-modules-dir=auto supabase/functions/auth-email/index.ts
```
