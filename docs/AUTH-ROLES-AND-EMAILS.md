# Auth roles, infrastructure delegation, and email templates

## BOUNDARY

This specification defines authentication and tenant-scoped infrastructure access. It does not govern or activate outreach, campaign, donor, allocation, payment, publication, or production-data authority.

## EVIDENCE PACKET

| State | Evidence |
| --- | --- |
| OBSERVED | `app_role` already contains six tenant operating roles and membership is tenant-scoped. |
| OBSERVED | Platform administrators are held separately in `platform_administrators`; that status does not imply tenant-private membership. |
| OBSERVED | Delegate migrations add invitation, scoped delegation, and email-dispatch records with RLS and audited security-definer functions. |
| OBSERVED | `auth-email` generates one-time Supabase Auth links server-side and sends role-aware content through Resend. |
| OBSERVED | 2026-08-22 — `auth-email` v3 and `auth-email-webhook` v1 ACTIVE on `utdioxwiskzatwoejgiu` (`verify_jwt=false`). Live templates include `tenant_admin` and AGI gold/carbon chrome. Migrations `auth_email_ip_budget`, `auth_email_delivery_status`, `auth_email_alerts` applied. |
| OBSERVED | 2026-08-22 — live `auth-email` rejects `http://127.0.0.1:8080` and unlisted origins (`origin_not_allowed`). Unsigned webhook POST returned `function_not_configured` (secret unset at that time). |
| OBSERVED | 2026-08-23 — `auth-email-webhook` v2 ACTIVE (`verify_jwt=false`). `RESEND_WEBHOOK_SECRET` set on `utdioxwiskzatwoejgiu`. Unsigned POST → `401 invalid_signature`. Signed Svix POST → `200`. One P8 `tenant_member_magic_link` row `delivery_status=delivered`. Six `platform_admin_magic_link` and three other `tenant_member_magic_link` rows still null. |
| OBSERVED | 2026-08-22 — Mailosaur inbox `Autogive Tests` (`qpbqeifu`) accepts injected messages (inject → wait → delete). Unassigned `auth-email` self_sign_in returns HTTP 202 and delivers nothing. |
| OBSERVED | 2026-08-22 — After Dashboard invite + isolation `board_viewer` membership, `auth-email` delivered the tenant-member template to Mailosaur (gold/carbon chrome, no legacy palette). Dispatch `tenant_member_magic_link` status `sent` with a provider id. Built-in Auth invite used `noreply@mail.app.supabase.io` / "You've been invited" (not AGI brand). |
| OBSERVED | 2026-08-22 — Isolation-only promotion to `director` on `org_platform_isolation` (not Hacker Dojo, not platform admin). `auth-email` delivered the tenant-administrator template. Probe consumed the magic link (303 then 200 on `autogive.app/portfolio-signals/workspace`). `mfa_enforced` stayed false, so MFA was not exercised. |
| PENDING | MFA-enforced synthetic drill; remaining dispatch `delivery_status` until live Resend events land; optional `ALERT_WEBHOOK_URL`. Platform-admin template **send** OBSERVED (`6` `sent` rows); receive/MFA not exercised. |
| INFERRED | Production readiness still requires an MFA-enforced synthetic drill on platform project `utdioxwiskzatwoejgiu`. |

## Role contract

| Audience / role | Scope | May issue sign-ins | Email template | Explicit exclusions |
| --- | --- | --- | --- | --- |
| Platform administrator | Platform shell administration | Own eligible sign-in only | `platform_admin_magic_link` | No tenant-private access without a tenant membership |
| Tenant director | One client through `client_memberships` | Invite delegates, resend active delegate sign-ins, revoke delegate access | `tenant_member_magic_link` | No cross-tenant authority |
| Campaign lead | One client | Own eligible sign-in only | `tenant_member_magic_link` | Cannot administer delegates |
| Development | One client | Own eligible sign-in only | `tenant_member_magic_link` | Cannot administer delegates |
| Board viewer | One client, read-only | Own eligible sign-in only | `tenant_member_magic_link` | No mutation or delegate administration |
| Data steward | One client | Own eligible sign-in only | `tenant_member_magic_link` | Cannot administer delegates |
| Auditor | One client, control verification | Own eligible sign-in only | `tenant_member_magic_link` | Cannot administer delegates |
| Infrastructure delegate | One client and approved infrastructure scopes | Own eligible sign-in; a tenant director may resend | `delegate_invite`, then `delegate_magic_link` | No campaign, donor, outreach, import, allocation, payment, or publication authority |

Platform status and tenant membership remain separate. A platform administrator needs an explicit active tenant membership to read that tenant's private records.

## Delegate scopes

The database accepts only these values:

- `workspace_access`
- `identity_support`
- `integration_operations`
- `delivery_observability`
- `configuration_support`

Scopes are descriptive infrastructure support boundaries. They do not broaden existing table policies. The `infrastructure_delegate` role is deliberately absent from campaign, opportunity, decision, claim, import, audit, finance, and donor policy allowlists.

## Governed flows

### Eligible user self sign-in

1. The browser invokes `auth-email` with `self_sign_in`.
2. The service resolves the account audience without returning account existence to the browser.
3. Unknown and unassigned addresses receive the same generic HTTP 202 response.
4. The browser locks the submit control while a request is in flight.
5. The database serializes decisions by recipient hash and permits only one pending or sent message per 10-minute cooldown. Failed provider attempts remain immediately retryable.
6. The service generates a one-time Auth link and sends the role-aware template.

### Tenant director invites a delegate

1. An authenticated, MFA-enforced director selects at least one approved scope and supplies a rationale of at least 12 characters.
2. `request_delegate_invitation` creates or refreshes a 72-hour pending invitation and writes a tenant audit event.
3. `auth-email` generates an invite or magic link, renders `delegate_invite`, and sends it without exposing the service-role key to the browser.
4. The recipient authenticates with the same email and explicitly accepts the invitation.
5. Acceptance creates an active `infrastructure_delegate` membership and matching scoped delegation.
6. MFA must be enrolled/enforced before privileged workspace use.

### Resend and revoke

- A tenant director may request `delegate_magic_link` only for an active delegate in the selected tenant and must provide a rationale.
- A tenant director may revoke a pending invitation before acceptance.
- A tenant director may revoke active delegate access. Revocation disables both the tenant membership and infrastructure delegation in one transaction.
- Each request, acceptance, sign-in issuance, and revocation writes an audit event. Delivery records store a SHA-256 recipient hash, not the raw recipient address.

## Email transport and secrets

Required Edge Function secrets:

```text
RESEND_API_KEY
AUTH_EMAIL_FROM
```

Optional secrets:

```text
AUTH_EMAIL_REPLY_TO
AUTH_ALLOWED_ORIGINS=https://autogive.app,http://127.0.0.1:8080
RESEND_WEBHOOK_SECRET   # required only for the auth-email-webhook delivery feedback function
ALERT_WEBHOOK_URL       # optional; incoming-webhook URL (Slack/Buzz/Discord/Teams) for hard-failure alerts
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function. Never place any provider or service-role secret in browser runtime config, Vercel public environment variables, logs, email HTML, or git.

Supabase custom SMTP remains required for Auth emails that bypass this Edge Function, including provider-managed security messages. Keep those dashboard templates generic and use this function for the role-aware magic-link flows.

## Deployment runbook

Production publication is operator-gated. From an exact approved commit:

OBSERVED on 2026-08-14: production project `utdioxwiskzatwoejgiu` has reconciled migration history and all three delegate-auth migrations applied. A post-deployment schema dump verified the tables, RLS, policies, and least-privilege RPC grants. The ordinary linked dry run reports the database is up to date.

The history-only repair was executed under a separate explicit operator gate. Do not repeat it and never use `supabase db push --include-all`; the exact repaired versions and production verification evidence are recorded in `out/audit/auth-delegate-validation.latest.json`.

- `20260814214657_delegate_access_and_auth_invites.sql`
- `20260814214716_delegate_invitation_workflow.sql`
- `20260814214800_delegate_auth_privilege_hardening.sql`

```bash
supabase link --project-ref utdioxwiskzatwoejgiu
supabase migration list --linked
supabase db push --linked --dry-run
```

Abort if a future dry run proposes an unexpected migration. Database publication is complete; the remaining mail-transport deployment requires provider secrets:

```bash
supabase secrets set RESEND_API_KEY=... AUTH_EMAIL_FROM='A.G.I. <auth@autogive.app>'
supabase secrets set AUTH_EMAIL_REPLY_TO=... AUTH_ALLOWED_ORIGINS='https://autogive.app'
supabase functions deploy auth-email --project-ref utdioxwiskzatwoejgiu --no-verify-jwt
```

Optional delivery feedback loop — deploy the webhook and point Resend at it:

```bash
supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
supabase functions deploy auth-email-webhook --project-ref utdioxwiskzatwoejgiu --no-verify-jwt
# Resend → Webhooks → Endpoint URL:
#   https://utdioxwiskzatwoejgiu.supabase.co/functions/v1/auth-email-webhook
# Events: email.delivered, email.bounced, email.complained, email.delivery_delayed
# Keep Resend open/click tracking OFF for auth mail. Rotate the signing secret if it
# was ever shared outside the secret manager. The webhook records only the provider
# message id; recipient addresses are never persisted or logged.
```

OBSERVED 2026-08-23: Resend webhook endpoint already enabled at that URL; Edge `RESEND_WEBHOOK_SECRET` set; signed feedback loop writes `delivery_status`. Do not create a second webhook.

Configure the Auth redirect allowlist for both production workspace routes before delivery testing:

- `https://autogive.app/portfolio-signals/workspace`
- `https://autogive.app/portfolio-signals/workspace.html`

## VALIDATION

```bash
node --check workspace.js
node --experimental-strip-types --test supabase/functions/_shared/auth-email-templates.test.ts
deno check --node-modules-dir=auto supabase/functions/auth-email/index.ts
supabase db reset
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/six_roles.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/016_delegate_auth.sql
```

Optional Mailosaur inbox (synthetic only). Default CI stays offline.

```bash
# Unit tests (mocked; no network)
node --experimental-strip-types --test supabase/functions/_shared/mailosaur-client.test.ts

# Live probe — requires MAILOSAUR_API_KEY. Never commit the key.
# Inbox Autogive Tests: qpbqeifu.mailosaur.net
export MAILOSAUR_SERVER_ID=qpbqeifu
export SUPABASE_ANON_KEY=   # platform anon only; not service_role
# Isolation director (not Hacker Dojo, not platform admin):
# export MAILOSAUR_ASSIGNED_EMAIL=p8-isolation@qpbqeifu.mailosaur.net
node --experimental-strip-types scripts/platform/probe-auth-email-mailosaur.ts
```

A real magic-link receive still needs an assigned Auth user whose email is `@qpbqeifu.mailosaur.net` (isolation-tenant membership only, not a platform admin) plus working `RESEND_API_KEY` / `AUTH_EMAIL_FROM`. Unassigned addresses return HTTP 202 and send nothing. The probe consumes the action URL in-process and never prints tokens.

Production acceptance requires synthetic addresses only:

1. Platform administrator receives the administrator template and signs in.
2. Tenant director receives the tenant template and signs in with MFA.
3. Director invites a synthetic delegate with one scope.
4. Delegate accepts, enrolls MFA, sees only Infrastructure access, and cannot read campaign opportunity data.
5. Director resends a delegate sign-in, then revokes the delegation.
6. The revoked delegate can authenticate but receives no active tenant workspace context.
7. Confirm audit events and redacted dispatch rows; confirm no email address, token, or service secret was logged.

## RESIDUAL RISKS

- Production Resend delivery and required SPF, DKIM, return-path MX, and reporting-only DMARC are OBSERVED; aggregate DMARC reports and longer-term domain reputation remain asynchronous.
- One duplicate platform-administrator message was delivered before the in-flight lock and server cooldown were added. Both observed links remain unconsumed and expire under the provider policy.
- Revoking application membership does not invalidate a Supabase session globally; RLS denies tenant access immediately because membership is inactive.
- Scope-specific infrastructure tools must check `delegate_scopes` when they are added. No such tool should infer authority from authentication alone.
- Platform application and Edge deployment must be the same reviewed commit to keep frontend, schema, and mail behavior aligned.

## RECOMMENDED NEXT ADVISORY ACTION

Run the complete local acceptance workflow, promote the duplicate-dispatch remediation through the existing platform deployment gates, and verify retries inside the cooldown do not create provider messages. Keep DMARC at `p=none` until at least 14 days of aggregate reports prove all legitimate senders align.

Provenance: Notion Sprint 001 Hub + Loop 805 Slice 18 + Hash: b67241f265e5a887b205cd60f6dcfa8912847b72
