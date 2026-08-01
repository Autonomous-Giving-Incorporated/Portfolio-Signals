# HD-OI-018 — CI and Policy Closure

## Observed progression

| Observation | Source | Status |
|---|---|---|
| Duplicate migration version `005` blocked startup | Actions logs on PR #8 | Repaired |
| Legacy audit migration recreated quarantine tables | Actions logs on PR #10 | Repaired |
| Secret scanners tripped on shell quoting / env names | Actions logs on PR #11–12 | Repaired |
| Campaign schema date format unknown without `ajv-formats` | Actions logs on PR #13 | Repaired |
| Fixture step received empty `DB_URL` | Actions logs before PR #14 | Repaired |
| Migrations, six-role fixtures, and RLS e2e green | Actions run `30689212832` on PR #14 | Observed |
| Import-gate corpus not executed by workflow | Workflow review | Repaired in this change |
| Import-gate `submitted_by` used non-fixture UUID | Static review vs `six_roles.sql` | Repaired |
| GitHub Pages deploy fails on private free plan | Actions main push; API 422 | Fail-closed skip |

## Repairs in this closure patch

1. Align synthetic import-gate `submitted_by` with the director fixture UUID.
2. Expand import-gate SQL with structural quarantine assertions and promotion gates:
   - restricted consent blocked;
   - suppressed record blocked;
   - board viewer cannot promote;
   - director can promote eligible confirmed row.
3. Execute `supabase/tests/003_import_gate_cases.sql` in the local Supabase workflow after fixtures.
4. Run the local Supabase workflow on pushes to `main` that touch policy paths.
5. Skip GitHub Pages deploy when the repository plan cannot host Pages, without failing portal validation.

## Evidence boundary

- All fixtures remain synthetic.
- No member, donor, attendee, workbook, or private campaign data is committed.
- Production import and outreach remain blocked.
- Full six-role matrix cells beyond the current executable checks remain a hardening backlog under HD-OI-019.

## Acceptance gates

```yaml
all_migrations_apply: true
six_synthetic_roles_load: true
rls_positive_cases_pass: true
rls_negative_cases_pass: true
import_gate_cases_pass: true  # Actions run 30689742284
suppression_bypass: false
unauthorized_promotion: false
production_data_used_in_tests: false
pages_validation: true
pages_deploy: OPTIONAL_PLAN_DEPENDENT
```

## Closure

HD-OI-018 is complete for the executable policy lane as of PR #15. Production environment hardening is the next engineering phase and still requires separate staging/production projects, MFA, secrets, and leadership authority decisions before any real data import.

Historical note: the earlier Pages plan gate was later closed for staging. GitHub Pages is active,
with deploy-generated runtime configuration and authenticated entry-point load order verified under
HD-OI-019. This does not change the historical PR #15 evidence above.

Provenance: Notion Sprint 001 Hub + Loop 805 Slice HD-OI-019 + Hash: b573fe078296bcc02e9d4e21140cf777d9d050d2
