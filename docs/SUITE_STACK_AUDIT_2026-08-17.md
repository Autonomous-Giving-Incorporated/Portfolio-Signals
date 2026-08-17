# Suite stack audit — 2026-08-17

**Label:** Informative cross-repository audit. **Not READY.** Not a release, freeze SHA, or operator acceptance receipt.  
**Date:** 2026-08-17  
**Auditor:** Cursor cloud agent (read-only inspection of local checkouts + live HTTP probes of public raw URLs)  
**Canon:** [ADR-013](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/adr/ADR-013-cloudflare-workers-public-host.md), [ADR-014](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/adr/ADR-014-agi-control-plane.md), [ADR-015](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/adr/ADR-015-donation-tracking-money-boundary.md), [SPEC-011](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-011-demo-specification.md), [SPEC-016](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-016-security-and-trust-boundaries.md), [SPEC-023](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-023-financial-ledger-invariants.md), [SPEC-027](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-027-impact-loop.md), [SPEC-028](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-028-agi-control-plane.md)

This document is the first **stack-wide** audit of the Autonomously Giving Incorporated (AGI / Autogive) suite. It is checked in here because this repository is the live workspace host and already holds [CURRENT-STATE.md](CURRENT-STATE.md). Per-repo audits already exist; this record joins them. A copy also belongs in Specs `docs/audits/` and AGI `docs/` when those remotes accept the same text.

| Prior audit | Scope |
|-------------|--------|
| [AGI vs Specs audit (2026-08-15)](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/AGI_SPEC_AUDIT_2026-08-15.md) | AGI contamination + conformance (superseded in part by Phase E) |
| [Allocation security audit](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/blob/main/docs/ALLOCATION-SECURITY-AUDIT.md) | Portfolio Signals allocation Worker isolation |
| [Portfolio Signals current state](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/blob/main/docs/CURRENT-STATE.md) | Runtime evidence SoT (recorded 2026-08-15) |

## Revisions inspected

| Repository | HEAD | Latest commit subject |
|------------|------|------------------------|
| `Autonomous-Giving-Specs` | `cda539b` | docs: retarget org repo links and mark CSV Worker CODE_SHIPPED |
| `Autonomous-Giving-Incorporated` | `a3633ef` | Finish Autogive.app Phase E public-site slice |
| `Portfolio-Signals` | `933ea89` | Add Phase C C4 public-safe Community AI Lab fixtures |
| `Impact-Relay` | `0229bff` | docs: retarget suite links to AGI org Portfolio-Signals |
| `agi-cross-repo-harness` | `1cadfa6` | test: add AGI auth and capability handoff harness |

Platform pin in every consumer: **Specs v2.0.0** (`c089739`, 2026-08-15). That pin is a **docs pin**, not product READY. Specs `main` is two commits ahead of the tag and carries **Proposed** SPEC-029 / SPEC-030.

## Executive verdict

The suite is a **disciplined, fail-closed v0.1 / v0.9 stack** with honest conformance language and strong offline CI. It is **not** an end-to-end live Autogive product.

**What is solid**

- Specs v2.0.0 is a coherent accepted cut (SPEC-001–028). Money boundary is clear: AGI never processes donations; every.org is P0; Stripe is billing-only.
- AGI public site (Phase E) is an honest static export: SPEC-011 Community AI Lab demo, no auth, no payments, 84 tests, conformance-check in CI.
- Impact Relay v0.9.1 library hardening is complete offline: 384 tests passed locally, ruff/mypy clean, Privacy Sentinel + L3 gates + agent import boundaries enforced.
- Portfolio Signals has a real Supabase platform (`utdioxwiskzatwoejgiu`), RLS, import quarantine, and extensive CI. Production CRM import and outreach stay **BLOCKED**.

**What is not live**

- SPEC-028 control-plane runtime is **PARKED**. Auth lives on the Portfolio Signals workspace, not an AGI-issued capability JWT.
- Designed Cloudflare Worker `portfolio-signals` is **ABSENT**. Live traffic is `agi-public` → Vercel (`fund-intel-ten.vercel.app` / `impact-relay.vercel.app`).
- every.org webhook, ImpactNotice send, MFA dry-run, and director acceptance are operator-pending.
- The private harness is a JWT/route-intent prototype (~5–10% of [secure-cross-repo-harness.md](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/architecture/secure-cross-repo-harness.md)).
- AGI build-time public signals **always fall back**: historical `scrimshawlife-ctrl` raw URLs return **404**; org URLs return **200** but Impact Relay’s committed `public-impact.json` has zero `VERIFIED` outcomes, so live projection would still be rejected.

**One-line posture:** architecture and library quality are ahead of hosted cutover, live connectors, and unified auth.

```text
Specified:  Supabase Auth → AGI control plane → capability JWT → Fund Intel | Impact Relay
            Cloudflare Workers + existing Supabase; harness pins revisions and proves edges

Built:      Static AGI site (login PARKED)
            Portfolio Signals workspace auth on Vercel + platform Supabase
            Impact Relay library + empty public aggregate shell
            Harness: ephemeral RS256 tests only
```

---

## 1. Suite map

### Roles

| Surface | Repo | Designed host | Live today |
|---------|------|---------------|------------|
| Corporate narrative / SPEC-011 demo | Autonomous-Giving-Incorporated | Cloudflare Worker `agi-public` at `autogive.app` | Vercel apex + GH Pages mirror; `agi-public` is a **suite gateway** |
| Decision workspace / Fund Intel / allocation | Portfolio-Signals | Worker `portfolio-signals` + platform Supabase | Proxied to `fund-intel-ten.vercel.app`; named Worker **ABSENT** |
| Evidence library + public aggregates | Impact-Relay | Cloudflare assets + GH Pages | Library mature; public JSON is a gated empty shell |
| Platform canon | Autonomous-Giving-Specs | Docs only | Released v2.0.0; `main` has Proposed 029/030 |
| Cross-repo verifier | agi-cross-repo-harness | Private CI | Scaffold: 15 JWT/fixture tests |

Identity rule: `client_id == tenant_id`. Two vocabularies coexist and must be mapped at every boundary:

| ID | Context |
|----|---------|
| `hacker-dojo` | Control-plane / CONTRACT fixtures, harness, AGI admin fixture, Specs demo |
| `org_hacker_dojo` | Supabase `clients.id`, RLS, allocation `ORG_ID`, production JWT membership |

Canonical public demo is **Community AI Lab** (SPEC-011: 25 laptops, $2500). Hacker Dojo is the **reference tenant / routing fixture**, not product brand.

---

## 2. Per-repository health

### Autonomous-Giving-Specs — v2.0.0 pin, not READY

**Strengths:** Accepted SPEC-001–028, ADR-001–011 and ADR-013–015, CONTRACT-001–013, merge-gated `validation/validate_all.py`. Money and host decisions are explicit (ADR-013/015). SPEC-028 correctly refuses to mark implementation READY.

**Gaps**

| Sev | Finding |
|-----|---------|
| Med | ADR-002 / ADR-003 **filenames are swapped** vs titles (`adr/ADR-002-signals-stack.md` holds platform canon). |
| Med | Conformance examples and [implementation-consumption.md](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/implementation-consumption.md) still say `scrimshawlife-ctrl/Autonomous-Giving-Specs`. |
| Med | [IMPLEMENTATION-PROGRESS.md](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/superpowers/IMPLEMENTATION-PROGRESS.md) is dated 2026-08-08 (pre-v2.0.0). |
| Low | ADR-013 still says “Stripe — payment processing”; ADR-015 refined that to billing-only. |
| Info | SPEC-029/030 are Proposed on `main` only. Portfolio Signals already ships experimental readers against them under the unchanged v2.0.0 pin. |

### Autonomous-Giving-Incorporated — Phase E landed, v0.1.0

**Strengths:** Next.js 16.3 static `output: "export"`. Honest `platform-spec/conformance.yml` (SPEC-011/012/013 only; SPEC-028 tracked). Login/admin are labeled PARKED shells. Worker proxy strips `Authorization` / `Cookie` and rejects non-GET/HEAD with 405. `npm audit --omit=dev` was clean at audit time.

**High findings**

1. **Dead public-source URLs (confirmed HTTP 404).** `integration/public-sources.ts` still fetches:
   - `https://raw.githubusercontent.com/scrimshawlife-ctrl/Fund-Intel/main/data/public-campaign.json`
   - `https://raw.githubusercontent.com/scrimshawlife-ctrl/Impact-Relay/main/data/public-impact.json`  
   Org replacements return 200:
   - `Autonomous-Giving-Incorporated/Portfolio-Signals/.../public-campaign.json`
   - `Autonomous-Giving-Incorporated/Impact-Relay/.../public-impact.json`  
   Documented as historical in [THREE_REPO_INTEGRATION.md](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/THREE_REPO_INTEGRATION.md) but **not fixed in code**.

2. **Even after URL retarget, live projection stays closed.** Impact Relay `data/public-impact.json` has `"outcomes": []`. AGI `validatePublicImpact` in `integration/validate-public.ts` rejects missing `evidenceState: "VERIFIED"` (`impact.missing_verified_outcome`). Portfolio Signals `data/public-campaign.json` is an authenticated-only shell (`execution.state: "blocked"`). Fail-closed is correct; the public site will not show live suite signals until authorized aggregates exist.

3. **Fallback narrative contradicts SPEC-011.** When fetch fails, `public-sources.ts` hardcodes `organizationName: "Hacker Dojo"`, `programName: "Intro to Robotics"`, `participants: 18`. The canonical demo (`demo/scenario.ts`) is Community AI Lab / 25 laptops. Phase E fixed the **replay demo**; the **signals fallback** still teaches the old story. Tests lock the Hacker Dojo numbers in (`public-sources.test.ts`).

4. **GitHub Pages deploy does not wait for CI** (unlike Cloudflare deploy).

5. **No Content-Security-Policy** on Vercel, Worker, or `public/_headers`. Google Fonts load from an external CDN (`app/globals.css`).

**Medium:** unused `framer-motion`; AGI tokens use `--color-*` while siblings use `--agi-*` (same hexes); `RELEASES.md` last entry 2026-08-04; smoke script not in CI.

2026-08-15 AGI audit items F-01 (overclaimed conformance), F-02 (wrong demo), F-03 (donor name “Jane”) are **addressed** in Phase E. The leftover dual-story is the signals fallback, not the demo.

### Portfolio-Signals — mature host, `current_main_verdict: NO_GO`

**Strengths:** Platform Supabase applied; magic-link workspace OBSERVED; Edge Functions deployed; service role banned from browser/git; IR bridge sends Bearer only (no forgeable `X-Impact-*` headers); production import/outreach BLOCKED; Playwright + disposable Supabase + security-contract CI.

**High / operator**

| Item | Evidence |
|------|----------|
| Worker `portfolio-signals` ABSENT | [CURRENT-STATE.md](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/blob/main/docs/CURRENT-STATE.md) |
| Live path is Vercel fallback | `agi-public` proxies GET/HEAD to `fund-intel-ten.vercel.app` |
| Acceptance `NO_GO` | README: hosted staging, browser smoke, director acceptance `NOT_RUN` |
| MFA dry-run | [Issue #18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18) OPEN |
| Durable host + every.org + director acceptance | [Issue #20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20) OPEN |
| Backup/restore drill | [Issue #19](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/19) OPEN |
| JWT hook is Dashboard-owned | Migration `202608020006_agi_impact_relay_jwt.sql` is not sufficient alone |
| Fixture Bearer fallback | `workspace/impact-relay-bridge.js` uses `finance.approver@hackersdojo.example` when `runtime-config.js` is missing |

**Medium:** pipeline pages still say “A.G.I. Fund-Intel”; dark theme uses a non-canonical palette; `donor-impact.html` has no login gate; no `AGENTS.md`; IR host screens hardcode Hacker Dojo.

Open issues at audit time: #17, #18, #19, #20, #21, #22. AGI site, Impact Relay, and Specs had **no open issues**.

### Impact-Relay — v0.9.1 library complete, public loop open

**Strengths:** Stdlib-only core; single ledger mutation gateway (`agents/executor.py`); L3 human gates; Privacy Sentinel; CI greps PII, bans `.csv`/`.xlsx`, diffs committed `data/*.json`, validates schemas. Public Pages in this repo follow `--agi-*` tokens and suite nav. Local verification this session: **385 collected, 384 passed, 1 skipped** (Postgres env-gated); ruff and mypy clean.

**High / medium**

| Finding | Path |
|---------|------|
| Public impact is an empty gated shell | `data/public-impact.json` — `outcomes: []`, `source: gated:public_shell` |
| README still points host UI at `scrimshawlife-ctrl/Hacker-Dojo` | `README.md` (~line 230). Screens live in **Portfolio-Signals**. CLAUDE.md is correct. |
| Production JWT validation is host-owned | Ports exist (`auth/jwt_oidc.py`); live gateway not complete |
| C3 evidence-access policy unsigned | AGI `PUBLIC_DATA_POLICY.md` PROPOSED; IR `CONTRACT-GOVERNANCE.md` |
| `CLAUDE.md` still says “~260 tests” | Actual ~385 |
| Pilot `console_server` fixture OIDC / `--allow-unauthenticated-pilot` | Safe only behind a trusted gateway |

v0.9.1 Track A–D in ROADMAP is marked complete. Remaining work is v0.9 ops/human and v1.0 (live OBSERVED aggregates, live OIDC, SMS, external assessment).

### agi-cross-repo-harness — scaffold only

Implements: shared `client_id`/`tenant_id`, no donor PII in fixtures, single/dual approval vocabulary, ephemeral RS256 verify, route-intent binding. **15 tests, Node 22 CI.**

Does **not** implement (per its README and Specs architecture doc): pinned multi-repo SHAs, CONTRACT-008–012 schema validation, synthetic Supabase isolation, lifecycle/evidence/public-projection acceptance, redacted harness report, live JWKS.

`refs/versions.example.json` is a placeholder. This is a contract prototype, not an integration harness.

---

## 3. Spec coverage (accepted v2.0.0 vs built)

| Spec | Owner | Implementation status |
|------|-------|------------------------|
| SPEC-011 Demo | AGI | **Shipped** — Community AI Lab replay. Signals fallback still Hacker Dojo. |
| SPEC-012 / 013 | All consumers | **Docs pin** v2.0.0; AGI manifest is honest. |
| SPEC-016 / 017 | All | Strong in IR + PS CI; AGI public site has no CSP. |
| SPEC-018 / 027 | Impact Relay | Library + public export **yes**; live ImpactNotice send / `donation_link` / EVENT-011 **no**. |
| SPEC-019 / 028 | AGI | **Accepted canon, PARKED runtime.** Workspace auth is Portfolio Signals, not capability JWT handoff. |
| SPEC-023 / 026 | PS + IR | `am_*` tables and webhook **CODE_SHIPPED**; live every.org pointing **operator-owned**. |
| SPEC-003 v2.1.0 | PS | In-process intel **CODE_SHIPPED**, not live, not READY. |
| SPEC-029 / 030 | PS | **Proposed** only; experimental readers shipped. Do not treat as accepted. |

CONTRACT-008–012 (auth context, tenant/project, route intent, capability JWT) exist as schemas. The harness tests the *logic*; nothing issues those tokens in production.

---

## 4. Security posture

### What is working

- No committed secrets found in the inspected trees. AGI `.gitignore` covers `.env*`.
- IR Privacy Sentinel + CI PII grep + banned formats.
- PS security-contract workflow, host allowlist, quarantine import, private storage + short-lived signed URLs.
- AGI suite gateway does not forward auth cookies to Vercel origins.
- Money lock is consistent: AGI never checkouts; PS does not allocate without human write roles; IR ledger mutations require L3 approval.

### Residual risk (not a breach claim)

| Risk | Why it matters |
|------|----------------|
| Fixture Bearer on IR host screens | Mis-deploy without `runtime-config.js` authenticates as the pilot email. |
| Pilot console flags | `--allow-unauthenticated-pilot` is a footgun if bound to a public host. |
| JWT hook + MFA incomplete | Privileged IR routes depend on Dashboard hook registration and issue #18. |
| Pages deploy without CI | AGI mirror can ship a red build. |
| No CSP / CDN fonts on AGI | Static marketing risk, not a ledger risk. |
| Branch protection / secret scanning | PS CURRENT-STATE records API 403 — operator must enable. |
| Dual tenant IDs | Easy to authorize the wrong scope without harness integration tests. |

Do not treat this audit as the v1.0 “external security assessment” listed on the Impact Relay ROADMAP.

---

## 5. Design system

| Layer | Owner | Status |
|-------|-------|--------|
| Normative info design | SPEC-009 | Accepted |
| Corporate tokens | AGI `tokens.css` (`--color-*`) | Values match suite hexes; prefix differs |
| Workspace / host shell | PS `docs/AGI-DESIGN-SYSTEM.md`, `brand.css` | Primary surfaces aligned; pipeline pages still “Fund-Intel” |
| Public evidence | IR `tokens.css` (`--agi-*`) | Compliant; one inline `#2a5bd7` on `index.html` |

Shared rule is intact: AGI mark → product name → tenant context; Space Grotesk / Inter / IBM Plex Mono; footer governance. Reciprocal suite navigation under `autogive.app` is **not fully checked off** (AGI THREE_REPO_INTEGRATION §D).

---

## 6. Open operator / human gates

These are not agent-closable without credentials or sign-off:

1. Deploy Worker `portfolio-signals` and set secrets (no secret-set tool on the connected Cloudflare account).
2. Point live every.org webhook ([PS #20](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/20)).
3. Register `agi_custom_access_token_hook` in Supabase Dashboard.
4. MFA workspace dry-run ([PS #18](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/18)).
5. Isolated backup/restore drill ([PS #19](https://github.com/Autonomous-Giving-Incorporated/Portfolio-Signals/issues/19)).
6. Approve C3 `PUBLIC_DATA_POLICY` (PROPOSED).
7. Authorize a live `VERIFIED` public-impact outcome (or keep the empty shell — do not relabel fixture data `OBSERVED`).
8. Director browser acceptance; replace `current_main_verdict: NO_GO`.
9. Enable GitHub secret scanning / branch protection where 403 today.
10. DNS cutover of `autogive.app` off Vercel when Workers are the real origin.

---

## 7. Recommended engineering next (agent-executable)

Ordered by leverage. No calendar estimates.

1. **Retarget AGI public-source URLs** to the org repos. Keep fail-closed. Do not claim `live` until a `VERIFIED` outcome exists.
2. **Align signals fallback with SPEC-011** (Community AI Lab / 25) or stop rendering organization/program/participant fields from the Hacker Dojo leftover.
3. **Gate AGI Pages deploy on CI** the same way Cloudflare deploy is gated.
4. **Fix Impact Relay README** host-UI pointer (Hacker-Dojo → Portfolio-Signals). Update `CLAUDE.md` test count.
5. **Retarget Specs conformance examples** off `scrimshawlife-ctrl`.
6. **Grow the harness** toward layer 1 (ajv on CONTRACT-008–012) and pin consumer SHAs in `refs/versions.json` — still synthetic, still no secrets.
7. **Add CSP + self-hosted fonts** on the AGI public site.
8. **Finish Fund-Intel rename** on `sponsors.html` / `grants.html` / `members.html`.
9. Do **not** un-PARK SPEC-028, add AGI auth, or mark anything READY from this audit.

---

## 8. Evidence notes

- Historical raw URLs: HTTP **404** (probed 2026-08-17).
- Org raw URLs: HTTP **200** (same probe).
- Impact Relay empty outcomes and PS blocked campaign JSON: read from committed files at the SHAs above.
- IR pytest/ruff/mypy: executed in this session on `/agent/repos/Impact-Relay`.
- Cloudflare Worker inventory and `NO_GO` verdict: taken from PS `docs/CURRENT-STATE.md` and `README.md` (recorded 2026-08-15 / current main). This session did not re-list the live Cloudflare account.
- Open GitHub issues: listed via GitHub API on 2026-08-17.

## 9. Change control

This file is informative. It does not amend SPECs, ADRs, contracts, or schemas. Corrections to facts should land as a follow-up commit on this audit or a dated successor (`docs/audits/YYYY-MM-DD-suite-stack-audit.md`).
