# Resend magic-link production readiness — plan

**Date:** 2026-08-21
**Design:** [specs/2026-08-21-resend-magic-link-production-readiness-design.md](../specs/2026-08-21-resend-magic-link-production-readiness-design.md)

Status legend: DONE · IN PR · PENDING (eng) · PENDING (operator)

## Tasks

| # | Task | Owner | Status |
| --- | --- | --- | --- |
| P6 | Distinct tenant-admin (director) template | eng | DONE — brand PR |
| — | Rebrand all auth templates to AGI brand kit | eng | DONE — brand PR |
| P5 | Production-safe origins + `safeRedirect` gating (env-driven, localhost opt-in) | eng | IN PR |
| P4 | Coarse per-IP + global `self_sign_in` throttle (in-memory) | eng | IN PR |
| P7 | Extract pure helpers to `lib.ts` + unit tests; wire into `local-security-contract.yml` | eng | IN PR |
| P4b | Durable per-source (hashed IP) send budget migration + SQL dispatch drill (`021`) | eng | IN PR |
| P3 | Signed Resend delivery webhook → `auth_email_dispatches` states + alerting | eng | PENDING (eng, migration) |
| P1 | Deploy `auth-email` + set `RESEND_API_KEY` / `AUTH_EMAIL_FROM` / `AUTH_EMAIL_REPLY_TO` / `AUTH_ALLOWED_ORIGINS`; reconcile `CURRENT-STATE` | operator | PENDING (operator) |
| P2 | Verify `auth.autogive.app` in Resend (DKIM/SPF/return-path); DMARC p=none→reject | operator | PENDING (operator) |
| P8 | Synthetic acceptance drill; record OBSERVED (provider + date only) | operator + eng | PENDING |

## Sequencing

1. Land eng PRs (brand templates → P5/P4/P7 hardening). Non-author review; synthetic-only; no secrets.
2. Operator P1 + P2 (deploy + domain auth). Start DMARC reporting window.
3. P8 synthetic acceptance against `utdioxwiskzatwoejgiu`.
4. Eng P3 (delivery webhook) + P4b (durable budget) once base flow is OBSERVED.
5. Tighten DMARC to quarantine/reject after a clean reporting window; mark READY.

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
