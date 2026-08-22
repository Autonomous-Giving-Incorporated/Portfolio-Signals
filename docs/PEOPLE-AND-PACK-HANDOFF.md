# People MFA + Onboarding Pack handoff

**Updated:** 2026-08-22  
**Workspace:** https://autogive.app/portfolio-signals/workspace  
**Platform:** Supabase `utdioxwiskzatwoejgiu`

Evidence SoT: [CURRENT-STATE.md](CURRENT-STATE.md). Runbooks: [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) · [CLIENT-ONBOARDING-PACK.md](CLIENT-ONBOARDING-PACK.md).

## People status (probe)

| Email | Role | MFA | Sign-in |
| --- | --- | --- | --- |
| Restricted operator registry | master_admin + reference-tenant director | Restricted | Restricted |
| Restricted operator registry | second master_admin | Restricted | Restricted |
| Restricted operator registry | reference-tenant director only | Restricted | Restricted |

Ed is **not** platform admin and has **no** other client memberships.

## Magic links (operator-local only)

```text
scripts/platform/.onboarding-invite-links.md   # gitignored; never commit
```

Regenerate:

```bash
# uses service role from gitignored bootstrap.env
# or re-run agent path: generate_link via Auth Admin API
```

Auth **email OTP is often rate-limited** — use `action_link` from that file, not “resend email”.

## Path A — Pack dry-run **now** (primary; does not wait on Qi/Ed)

Primary already has `mfa_enforced=true`. Pack RPCs check that flag (not Auth factor count).

1. Open **primary** `action_link` in `.onboarding-invite-links.md` (or workspace magic link you already use).  
2. Workspace → select **Hacker Dojo** (`org_hacker_dojo`).  
3. **Onboarding pack** → ensure pack row → upload **5 required** document types → confirm each.  
4. Park one **xlsx/csv** (list quarantine).  
5. Confirm pack may show `ready` while `production_import` stays **BLOCKED**.  
6. Notify operator/agent to mark CURRENT-STATE pack dry-run **OBSERVED**.

Probe anytime:

```bash
./scripts/platform/verify-pack-and-people.sh
```

## Path B — Finish Qi + Ed (parallel)

1. Open their `action_link`s (private browser).  
2. Complete first login; **enroll TOTP**.  
3. Operator: for each UUID, `scripts/platform/set-mfa-enforced.sql` with `desired_mfa_enforced := true`.  
4. `./scripts/platform/verify-pack-and-people.sh` → expect `totp_verified≥1` and `mfa_enforced=true`.

### Ed access check

After login, workspace context must show:

- `is_master_admin=false`  
- membership only `org_hacker_dojo` / role `director`

## After pack dry-run

| Next | Owner |
| --- | --- |
| MFA onboarding-pack dry-run [#18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18) | Operator |
| Hosted isolated restore [#19](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/19) | Operator |
| Durable host + live every.org webhook + director allocate [#20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20) | HD nonprofit admin + director. Historical #73/#74 do not exist. Do not invent a `workers.dev` URL. |
| Optional SMTP | Platform Supabase Dashboard |

## Non-goals

- Do not paste action links or PATs into chat/git.  
- Do not set `mfa_enforced` before TOTP enroll for Qi/Ed.  
- Pack `ready` ≠ import / outreach / client activate.
