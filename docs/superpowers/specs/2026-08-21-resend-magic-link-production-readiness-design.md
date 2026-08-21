# Resend magic-link production readiness — design

**Date:** 2026-08-21
**Status:** Implementation (template + edge hardening landing; transport/domain operator-gated)
**Scope:** Official master-admin and tenant-admin (director) magic links via the `auth-email` Edge Function + Resend
**Components:** `supabase/functions/auth-email/`, `supabase/functions/_shared/auth-email-templates.ts`

## Goal

Make master-admin and tenant-admin sign-in mail production-grade: on-brand, role-distinct, deliverable, observable, and abuse-resistant — without weakening the existing authority boundaries or leaking secrets/PII.

## How the flows resolve

`resolve_auth_email_context` (service-role only) maps a recipient to an audience:

| Recipient | Audience | Template | Subject |
| --- | --- | --- | --- |
| Active `platform_administrators` row | `platform_admin` | Master-admin | "Your A.G.I. platform administrator sign-in link" |
| Tenant `director` membership | `tenant_admin` (new) | Tenant director | "Your <client> tenant administrator sign-in link" |
| Other tenant roles | `tenant_member` | Generic tenant | "Your <client> Portfolio Signals sign-in link" |
| `infrastructure_delegate` | `delegate` / `delegate_invite` | Delegate | — |

The dispatch record `kind` stays `tenant_member_magic_link` for directors (enum unchanged; no migration). Template selection is an edge-function concern.

## Workstreams

- **P1 Deploy + secret reconciliation (operator).** Confirm/deploy `auth-email` on `utdioxwiskzatwoejgiu`; set `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `AUTH_EMAIL_REPLY_TO`, `AUTH_ALLOWED_ORIGINS='https://autogive.app'`; confirm Auth redirect allowlist; update `docs/CURRENT-STATE.md` `edge_functions_deployed`.
- **P2 Sender domain (operator).** Dedicated subdomain `auth.autogive.app` verified in Resend (DKIM + SPF + custom return-path); `AUTH_EMAIL_FROM='A.G.I. Portfolio Signals <no-reply@auth.autogive.app>'`; DMARC `p=none` + `rua` ≥14 days → `quarantine` → `reject`.
- **P3 Delivery feedback loop (eng, needs migration).** Signed Resend webhook → edge function updates `auth_email_dispatches` with `delivered/bounced/complained`; alert on failed `platform_admin_magic_link`.
- **P4 Abuse throttle (eng).** Coarse per-IP + global budget on `self_sign_in` (see below). Durable per-identity budget (DB/KV) is a follow-up.
- **P5 Prod-safe origins/redirect (eng).** Env-driven allow-list; default production-only (no localhost).
- **P6 Distinct tenant-admin template (eng).** Delivered.
- **P7 Tests (eng).** Unit tests for pure helpers + templates; wire into `local-security-contract.yml`; follow-up SQL dispatch drill on the local Supabase stack.
- **P8 Synthetic acceptance (operator + eng).** Run `docs/AUTH-ROLES-AND-EMAILS.md` §VALIDATION with synthetic addresses; record OBSERVED (provider name + date only).

## Edge hardening detail (P4/P5)

Pure helpers live in `supabase/functions/auth-email/lib.ts` (unit-tested):

- `parseAllowedOrigins` defaults to `https://autogive.app` only; localhost is opt-in via `AUTH_ALLOWED_ORIGINS`.
- `safeRedirect` validates against the allow-list + requires a `workspace` path.
- `createRateLimiter` is an in-memory sliding window; `self_sign_in` is limited to 5/IP and 300 global per 10 minutes and returns the generic 202 when throttled (no enumeration signal). This is best-effort per isolate; a durable budget is P4's follow-up.

## Acceptance

1. Master admin receives the administrator template and signs in.
2. Tenant director receives the tenant-administrator template (distinct) and signs in with MFA.
3. Delegate invite/accept/resend/revoke behave per `AUTH-ROLES-AND-EMAILS.md`.
4. Audit events + redacted dispatch rows present; no email address, token, or secret logged.
5. DMARC aligned for the sending domain across the reporting window before tightening policy.

## Out of scope

- Custom Supabase SMTP for built-in Auth security emails (`PLATFORM-AUTH-SMTP.md`) — separate track.
- Durable DB/KV rate limiting and the Resend delivery webhook (P3/P4 follow-ups; own migrations).

## Decisions

- Distinct tenant-admin template: **yes** (delivered).
- Sending domain: **`auth.autogive.app`** (recommended).
- Deploy/DNS/Resend ownership: single accountable platform operator; code via eng PRs under change control.
