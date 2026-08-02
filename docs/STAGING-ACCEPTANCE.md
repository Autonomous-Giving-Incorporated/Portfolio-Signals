# HD-OI-041 Staging Acceptance

## Purpose

Verify one exact Hacker Dojo commit against local and hosted staging before any production or real-data decision is considered.

Historical successful runs are evidence for their recorded commits only. They do not prove a later `main` commit.

## Required identity

Record before execution:

```yaml
repository: scrimshawlife-ctrl/Hacker-Dojo
commit: <40-character SHA>
staging_project: ecxkhihlbrcwpavfoaoq
pages_origin: https://scrimshawlife-ctrl.github.io/Hacker-Dojo/
operator: <name or GitHub login>
started_at: <UTC timestamp>
```

Stop immediately when the checked-out commit, deployed Pages commit, migration head, or receipt commit cannot be reconciled.

## Lane A — current-tree contract

Required results:

1. Public campaign JSON validates against its schema.
2. JavaScript entry points parse under the pinned Node runtime.
3. Restricted file and embedded-secret checks pass.
4. Runtime configuration loads before authenticated workspace modules.
5. Brand, navigation, workspace, import-review, finance-impact, and donor-impact assets resolve.
6. The staging-verdict template validates against `schemas/staging-verdict.schema.json`.

A failure in this lane produces `NO_GO`.

## Lane B — disposable Supabase

Execute the existing disposable local stack and record:

- migration chain result;
- six synthetic role fixture result;
- positive and negative RLS result;
- import consent, suppression, duplicate, and promotion result;
- private storage matrix result;
- signed-document issuance and audit result;
- temporary helper cleanup result.

No real constituent, donor, member, attendance, or campaign workbook data may be used.

## Lane C — hosted staging parity

Verify, without using service-role material in the browser:

1. Hosted migration head equals repository migration head.
2. Public signup remains disabled.
3. Email confirmation and privileged-role MFA behavior match policy.
4. `campaign-private` exists and remains private.
5. Signed URLs expire within the configured bound and create an audit event.
6. Current Pages runtime config points only to staging project `ecxkhihlbrcwpavfoaoq`.
7. Current Pages content corresponds to the recorded commit.
8. Supabase Auth site and redirect URLs include the active HTTPS Pages origin.

Platform exceptions such as deferred backups or globally open database CIDRs must be recorded as P0/P1 exceptions; they may not be hidden in narrative text.

## Lane D — browser smoke test

Test desktop and mobile widths with synthetic accounts only.

### Public portal

- page loads without console errors;
- Hacker Dojo mark and Campaign Control Center identity render;
- primary navigation exposes the active section;
- theme control reports the correct state;
- readiness indicators remain explicitly non-financial;
- no personal records or restricted runtime material appear in page source.

### Authenticated workspace

- unauthenticated state displays the restricted sign-in surface;
- invalid or inactive profile fails closed;
- privileged profile without enforced MFA fails closed;
- approved synthetic profile reaches the workspace;
- first authorized module opens;
- arrow, Home, and End navigation works;
- role-inaccessible modules are absent;
- sign-out clears the session.

### Import review

- batch list or approved test entry point loads;
- suppressed and unresolved-duplicate rows cannot promote;
- eligible approved synthetic row can promote;
- action appears in audit history;
- ordinary director operation does not require SQL or developer tools.

### Impact Relay host

- fixture/shadow mode is visibly identified;
- Supabase role and MFA bridge fails closed for unauthorized users;
- finance approval and donor receipt screens do not imply live notifications or real money movement.

## Lane E — director acceptance

A director or designated campaign lead must complete without engineering intervention:

```text
sign in
→ review dashboard
→ open a decision
→ inspect an opportunity and evidence
→ record a governed decision
→ confirm its audit receipt
→ open an import batch
→ reject a duplicate
→ approve an eligible row
→ confirm a suppressed row remains blocked
→ sign out
```

Record friction as defects:

- P0: security bypass, private-data exposure, destructive or unauthorized mutation;
- P1: workflow requires SQL, UUID copying, direct database access, or developer intervention;
- P2: presentation, terminology, or non-blocking accessibility defect.

## Verdict rules

### GO

Allowed only when every technical gate is `PASS`, there are no open P0 exceptions, and the action under consideration is explicitly within the approved environment boundary.

A staging `GO` does **not** authorize production import or outreach.

### CONDITIONAL

Use when application controls pass but documented P1 platform or operational exceptions remain with named owners and dates.

### NO_GO

Required when any security, migration, RLS, suppression, storage, signed-URL, browser, or director-acceptance gate fails or is not run.

## Receipt

Copy `templates/staging-verdict.example.json`, replace placeholders, attach exact evidence sources, and validate it:

```bash
npx --yes \
  --package ajv-cli@5 \
  --package ajv-formats@3 \
  ajv validate \
  --spec=draft2020 \
  -c ajv-formats \
  -s schemas/staging-verdict.schema.json \
  -d path/to/staging-verdict.json
```

Receipts must preserve:

```yaml
productionImportAuthorized: false
outreachAuthorized: false
```

until separate leadership and technical gates are recorded.
