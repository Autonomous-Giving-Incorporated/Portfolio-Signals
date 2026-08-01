# Impact Relay — limited live cohort (ops)

**Prerequisites:** shadow mode exit criteria green ([IMPACT-RELAY-SHADOW.md](./IMPACT-RELAY-SHADOW.md)).

Live cohort means **real staff identities** and **optional real donor-facing notifications** with explicit consent. It does **not** authorize outreach from campaign CRM imports.

## Scope (first cohort)

| In scope | Out of scope |
|----------|----------------|
| Staff finance_approver / director approve of fixture or controlled expense batches | Mass CRM export into git |
| Staff viewing donor_alice-style pilot receipts | Live Every.org auto-import without aggregate reduction |
| Optional email to **staff** addresses only | APNs/FCM production until adapter configured |
| Staging Supabase MFA profiles | Production money without board/finance sign-off |

## Gate checklist before go-live

- [ ] Shadow mode complete (seed, approve, SoD, rehydrate)
- [ ] Supabase staging profiles: MFA enforced for director / campaign_lead / development
- [ ] Impact Relay console data-dir is **not** committed; backups documented
- [ ] Notification adapters: fixture only **or** Postmark test stream with staff recipients
- [ ] Privacy Sentinel on any Pages publish path
- [ ] Incident contacts filled (`Impact-Relay/docs/ops/INCIDENT-RESPONSE.md`)
- [ ] Finance + privacy named owners agree in writing (Slack/email link in findings)

## Procedure

### A. Environment

```bash
# Dedicated live-cohort data-dir (not shadow, not git)
python -m impact_relay.console_server \
  --data-dir .impact-relay/hacker-dojo-live-cohort \
  --port 8787
```

### B. Auth

1. Deploy/host `runtime-config.js` (anon key only).
2. Open `finance-impact.html` → OTP as **campaign_lead** or **director** with `mfa_enforced=true`.
3. Confirm data_steward cannot approve (forbidden).

### C. Controlled expenses

1. Prefer fixture `seed` for first session.
2. If using real accounting exports: reduce to normalized expense rows **outside** git; promote only through existing import quarantine authority.
3. Approve one case; record `workflow_id`, `expense_id`, approver email, timestamp.

### D. Donor view

1. Open `donor-impact.html` as auditor/staff.
2. Verify timeline + receipt detail for known fixture donor only unless a consented staff-donor is enrolled.
3. Do not enable live email until consent rows exist for that donor.

### E. Notifications (optional second session)

```python
# deliver=True only after consent + preference enabled
# Prefer staff email addresses in first live cohort
```

## Exit / abort

**Abort if:** wrong tenant data, PII on public Pages, agent-style approver accepted, MFA bypass, or money amount disagrees with accounting SoR.

**Exit when:** N≥3 successful staff-approved cases logged; findings template filled; no open S1/S2 incidents.

## Findings template

Copy to Impact-Relay `docs/pilot/FINDINGS.md` (or append section):

```markdown
## Live cohort session YYYY-MM-DD

- Operators: …
- Approvers used: …
- Cases approved (workflow_id / expense_id): …
- Donor screens exercised: …
- Notifications sent: none | staff-only | …
- Issues: …
- Decision: continue shadow | expand cohort | pause
- Sign-off: finance ___ privacy ___ date ___
```

This document is a gated procedure, not activation authority. No live cohort, notification,
production money movement, CRM import, or outreach is approved by its presence in the repository.

Provenance: Notion Sprint 001 Hub + Loop 805 Slice HD-OI-019 + Hash: b573fe078296bcc02e9d4e21140cf777d9d050d2
