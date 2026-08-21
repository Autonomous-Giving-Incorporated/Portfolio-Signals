# Impact Relay bridge (Hacker Dojo host)

Impact Relay is the **reusable money / workflow / donor-receipt library**.  
This repository is the **canonical host app** (campaign ops + public portal).

| Repo | Role |
|------|------|
| [Impact-Relay](https://github.com/Autonomous-Giving-Incorporated/Impact-Relay) | Ledger, L0–L3 agents, durable workflows, donor API, RBAC ports |
| **Portfolio-Signals** (this repo) | Campaign UX, Supabase auth, import quarantine, director portal |

Public impact: https://autogive.app/impact-relay/

## Local finance + donor screens

1. Start Impact Relay console API:

```bash
cd ../Impact-Relay
# Default-deny: no --trusted-proxy needed for the browser bridge.
# Preferred: Bearer Supabase JWT (runtime-config). Fixture Bearer is opt-in only.
python -m impact_relay.console_server --data-dir .impact-relay/hacker-dojo --port 8787
```

2. Open:

| Page | Purpose |
|------|---------|
| `finance-impact.html` | L3 expense approval queue |
| `donor-impact.html` | Donor timeline / UOF detail |

Both screens use the **AGI host shell** (wordmark lockup, suite links, Tokens / Logo / Legal footer, Zero State credit). See [AGI-DESIGN-SYSTEM.md](AGI-DESIGN-SYSTEM.md) § Impact Relay host pilot screens.

3. Auth modes:

| Mode | When | How |
|------|------|-----|
| **Unauthenticated** | No `runtime-config.js`, or config without an explicit fixture opt-in | No `Authorization` header. Host screens stay on the sign-in gate. |
| **Fixture** | Local IR console only: `allowFixtureBearer: true` in `runtime-config.js` | `Authorization: Bearer finance.approver@hackersdojo.example` (fixture OIDC map). Never the default when config is missing. |
| **Supabase** | `runtime-config.js` has `supabaseUrl` + `supabaseAnonKey` | OTP login → short-lived Supabase JWT → Impact Relay JWKS validation |
| **Trusted proxy** | Only behind an auth gateway | Start with `--trusted-proxy` and accept `X-Impact-*` / `X-HD-Campaign-Role` **only if** the gateway strips client-supplied copies |

Shared bridge: `workspace/impact-relay-bridge.js` — **does not** send `X-Impact-*` headers. It sends Bearer JWT (Supabase) or, only when explicitly opted in, Bearer fixture email. Missing config is fail-closed. Issue track: #48.

### When to use `--trusted-proxy`

| Situation | Flag |
| --- | --- |
| Browser host screens via `impact-relay-bridge.js` | **Off** (default) |
| curl/scripts with `Authorization: Bearer <fixture-email>` | **Off** |
| Gateway that authenticates users and injects identity headers | **On** — gateway must strip inbound `X-Impact-*` / `X-HD-Campaign-Role` from clients |

Never expose `--trusted-proxy` on a port clients can reach without the authenticating gateway.

### Authorization sent to Impact Relay (Supabase mode)

The browser sends only `Authorization: Bearer <session.access_token>`. It does not
send role, tenant, subject, or email authority headers. Supabase signs active
tenant memberships into the `client_memberships` claim through
`public.agi_custom_access_token_hook`. Impact Relay validates signature, expiry,
issuer, and audience against Supabase JWKS, then selects the membership matching
its configured `tenant_id`.

Enable the hook in the Supabase dashboard under Authentication → Hooks → Custom
Access Token and select `public.agi_custom_access_token_hook`. Existing sessions
must be refreshed after membership changes before the new claim is present.

## Role mapping (campaign ↔ Impact Relay)

| Hacker-Dojo `profiles.role` | Impact Relay roles | Finance approve? |
|----------------------------|--------------------|------------------|
| `director` | tenant_admin, finance_approver | yes |
| `campaign_lead` | finance_approver, finance_reviewer | yes |
| `development` | finance_approver, finance_reviewer | yes |
| `data_steward` | finance_reviewer | no |
| `auditor` / `board_viewer` | auditor | no |

## Shadow mode

See [IMPACT-RELAY-SHADOW.md](./IMPACT-RELAY-SHADOW.md) — no live notifications, copy data-dir only.

## Live cohort

See [IMPACT-RELAY-LIVE-COHORT.md](./IMPACT-RELAY-LIVE-COHORT.md) — staff MFA, controlled expenses, findings template.

## MFA

Privileged Supabase roles (`director`, `campaign_lead`, `development`, `data_steward`, `auditor`) must have `profiles.mfa_enforced = true` before Impact Relay screens accept the session (same rule as director workspace).

## Privacy boundary

- No raw CRM in git.
- Impact Relay data-dir is local/staging only.
- Public Pages remain aggregate-only.
