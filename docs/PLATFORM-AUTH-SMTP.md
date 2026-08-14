# Platform Auth — custom SMTP (operator)

Supabase **built-in** Auth email is rate-limited. For provider-managed Auth messages on platform project `utdioxwiskzatwoejgiu`, configure **custom SMTP**. The repository's `auth-email` Edge Function separately sends role-aware magic links through Resend; see [AUTH-ROLES-AND-EMAILS.md](AUTH-ROLES-AND-EMAILS.md).

**Status:** PENDING operator until dashboard SMTP is saved and a test invite/magic-link succeeds.  
**Fallback while PENDING:** use the reviewed `auth-email` Edge Function after its sender secrets and deployment are verified, or generate an operator-only link and deliver it through an approved channel.

## When you need it

- Multiple operator/director invites in a short window  
- Magic-link “rate limit” or delayed delivery during onboarding drills  
- Production-facing Auth email volume beyond pilot

## Prerequisites

1. Platform Supabase Dashboard access for `utdioxwiskzatwoejgiu`.
2. An SMTP provider account (examples: Resend, Postmark, SendGrid, Amazon SES, or existing nonprofit mail relay).
3. A verified sender domain / From address you control (prefer something like `auth@autogive.app` or the nonprofit’s domain — not a personal Gmail for production).

## Dashboard steps

1. Open Supabase → project **utdioxwiskzatwoejgiu** → **Project Settings** → **Authentication** (or **Auth** → **SMTP** depending on UI).
2. Enable **Custom SMTP**.
3. Fill:

| Field | Guidance |
| --- | --- |
| Sender email | Verified address on your domain |
| Sender name | e.g. `Autonomously Giving` / `Portfolio Signals` |
| Host | Provider SMTP host |
| Port | Usually `587` (STARTTLS) or provider docs |
| Username / Password | Provider SMTP credentials (store in secret manager) |
| Min interval / rate | Match provider and expected invite volume |

4. Save. Send a **test** if the UI offers one.
5. Authentication → URL configuration: confirm redirect allowlist still includes:
   - `https://autogive.app/portfolio-signals/workspace`
   - `https://autogive.app/portfolio-signals/workspace.html`
6. Invite a disposable or staff test user → open magic link → confirm workspace login.

## Evidence to record (no secrets)

When done, add to [CURRENT-STATE.md](CURRENT-STATE.md) under operator hygiene:

```yaml
custom_smtp: OBSERVED  # YYYY-MM-DD — provider name only; test invite PASS
```

Do **not** commit host, username, or password.

## Failure modes

| Symptom | Response |
| --- | --- |
| Still rate-limited | Confirm custom SMTP toggle is on; check provider dashboard for rejects |
| Mail goes to spam | SPF/DKIM/DMARC for sender domain; use verified domain |
| Link opens wrong host | Fix Auth redirect allowlist / Site URL |
| Provider auth errors | Rotate SMTP password; update dashboard only |

## Related

- [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — people path (uses invite / magic link)
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md)
- [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md) — SMTP password is a secret

Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: pending
