# Operator secret hygiene

Checklist for rotating and containing secrets used by the AGI suite (Portfolio Signals, allocation middleware, Impact Relay). **Do not** put rotated values, old values, or service-role JWTs in git, issues, or PR bodies.

## Classification

| Secret | Where it lives | Who may hold it |
| --- | --- | --- |
| Platform Supabase **service_role** | Secret manager / local gitignored only | Platform operators |
| Platform Supabase **anon** | Workers / Vercel env + gitignored `runtime-config.js` | Public-capable (RLS-bound) |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets | Workers deploy only |
| Allocation `WEBHOOK_TOKEN` | Host dashboard / `.env.pilot` | Pilot host ops |
| Allocation `OPERATOR_TOKEN` | Host dashboard / `.env.pilot` | Emergency only; prefer director JWT |
| `gh` / `vercel` / Cloudflare tokens | Local credential store / GitHub secrets | Individual operator |
| every.org nonprofit admin | every.org account | Nonprofit admin (external) |

## Never

- Commit service_role, `sb_secret_…`, webhook/operator tokens, or PATs.
- Put service_role on Workers or Vercel (anon only for runtime-config).
- Paste secrets into GitHub issues, Project comments, or chat logs.
- Share a single long-lived operator token across multiple people without rotation plan.

## Rotation triggers

Rotate when any of the following is true:

1. Secret was pasted outside a secret manager (email, chat, screenshot, ticket).
2. Operator with secret-manager access is offboarded ([OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) revoke flow).
3. Suspected leak or unexpected auth/API use.
4. Scheduled hygiene (recommended: service_role and host tokens at least when staff changes).

## Rotation steps (by system)

### Platform Supabase service_role

1. Dashboard → Project Settings → API → reset service_role (or rotate via management API).
2. Update **only** secret-manager entries and local gitignored files (e.g. `scripts/staging/bootstrap.env`, allocation `.env.pilot` if it holds service_role for `grant:director`).
3. Re-run any operator scripts that need service_role; confirm workspace login still works with **anon**.
4. Invalidate old copies (password managers, shell history if exported).

### Platform Supabase anon

1. Rotate only if the key was treated as confidential or embedded in a non-RLS client incorrectly.
2. Update Workers/Vercel `PLATFORM_SUPABASE_ANON_KEY` (or project env) → redeploy Portfolio Signals as needed.
3. Regenerate gitignored `runtime-config.js` via staging scripts if used locally.

### Allocation middleware (`WEBHOOK_TOKEN` / `OPERATOR_TOKEN`)

1. Generate new values (`openssl rand -hex 24` minimum 16 chars; prefer 32+).
2. Set on the **Worker** (`wrangler secret put`) or local `.env.pilot`. Do not use Render/Fly/Railway as the production webhook host.
3. Restart process; `SEED_ON_BOOT` should stay `0` on a stable pilot volume.
4. If every.org webhook URL embeds `?token=`, update every.org Advanced settings with the new URL from `/setup.html`.
5. Prefer `ALLOW_OPERATOR_TOKEN_FALLBACK=0` and director JWT after rotation.

### Vercel / GitHub / Fly tokens

1. Revoke token in provider UI.
2. Create new token with least scope; store in password manager.
3. Update local CLI login (`vercel login`, `gh auth login`, `fly auth login`).

## Local file hygiene

| Path | Rule |
| --- | --- |
| `services/allocation-middleware/.env.pilot` | gitignored; never stage |
| `scripts/staging/bootstrap.env` | gitignored |
| `runtime-config.js` | gitignored; anon only |
| `supabase/.temp/` | local stack residue; do not commit |

Verify before commit:

```bash
git status -sb
git check-ignore -v services/allocation-middleware/.env.pilot || echo "WARNING: .env.pilot not ignored"
```

## After rotation

- [ ] Old secret invalidated at source  
- [ ] New secret only in secret manager / gitignored local / host dashboard  
- [ ] Smoke: workspace login (anon) and/or allocation `pilot:smoke` / `verify:director`  
- [ ] every.org webhook updated if `WEBHOOK_TOKEN` changed  
- [ ] Note rotation date in operator log (no secret values)

## Related

- [SECURITY.md](../SECURITY.md)
- [CURRENT-STATE.md](CURRENT-STATE.md)
- [ALLOCATION-MIDDLEWARE-PRODUCTION.md](ALLOCATION-MIDDLEWARE-PRODUCTION.md)
- [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md)
