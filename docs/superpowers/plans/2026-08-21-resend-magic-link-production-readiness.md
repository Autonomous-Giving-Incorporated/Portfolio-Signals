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
| P1 | Deploy `auth-email` + set `RESEND_API_KEY` / `AUTH_EMAIL_FROM` / `AUTH_EMAIL_REPLY_TO` / `AUTH_ALLOWED_ORIGINS`; reconcile `CURRENT-STATE` | operator | **PARTIAL** 2026-08-22 — `auth-email` v3 + migrations OBSERVED on `utdioxwiskzatwoejgiu`; live origins reject localhost; branded Mailosaur sends prove Resend send secrets work. Webhook secret still unset. |
| P2 | Verify `auth.autogive.app` in Resend (DKIM/SPF/return-path); DMARC p=none→reject | operator | PENDING (operator) |
| P8 | Synthetic acceptance drill; record OBSERVED (provider + date only) | operator + eng | **PARTIAL** 2026-08-22 — tenant-member + isolation-director templates delivered; director magic-link click reached workspace. MFA, platform-admin template, and webhook secret still PENDING |

## Sequencing

1. Land eng PRs (brand templates → P5/P4/P7 hardening). **Done** (PS #41–#46).
2. Operator P1 remainder + P2 (confirm/set Resend send secrets + domain auth). Start DMARC reporting window. Function deploy is done; send secrets still not listable from this agent.
3. P8 synthetic acceptance against `utdioxwiskzatwoejgiu`.
4. Set `RESEND_WEBHOOK_SECRET` and point Resend at the already-deployed `auth-email-webhook` (v1 OBSERVED; secret OBSERVED unset via 503 `function_not_configured`).
5. Tighten DMARC to quarantine/reject after a clean reporting window; do not mark READY from this plan.

### 2026-08-22 agent attempt (updated after org user grant)

CLI `supabase functions list` still has no `SUPABASE_ACCESS_TOKEN`. After the operator added this agent user to the AGI org, Supabase MCP reached `utdioxwiskzatwoejgiu` (not Noema).

```text
apply_migration: auth_email_ip_budget, auth_email_delivery_status, auth_email_alerts  # success
deploy_edge_function auth-email v3 SHA 3a9bd980… verify_jwt=false  # success
deploy_edge_function auth-email-webhook v1 SHA 6f3883ff… verify_jwt=false  # success
HTTP probes (no send): invalid_json 400; GET 405; localhost origin 403; unassigned 202 accepted:true
webhook unsigned POST: 503 function_not_configured  # RESEND_WEBHOOK_SECRET unset
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
