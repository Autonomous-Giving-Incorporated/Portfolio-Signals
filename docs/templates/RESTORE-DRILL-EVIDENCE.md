# Restore Drill Evidence

Do not include credentials, URLs containing tokens, personal data, raw rows, object paths, or private project identifiers in repository copies of this record.

**Classification:** isolated synthetic (local disposable; engine=host-postgres). Engineering receipt only. Not production. Not accepted RTO/RPO. Production import remains blocked.

| Field | Evidence |
|---|---|
| Drill date | 2026-08-15 |
| Operator and approver roles | engineering operator (cloud agent); leadership approver not claimed |
| Source environment classification | isolated synthetic (local disposable; engine=host-postgres) |
| Backup identifier (non-secret reference) | local-synthetic.dump sha256:951deddfd377 |
| Migration head before restore | 20260815180000_am_donation_link_and_impact_notices |
| Migration head after restore | 20260815180000_am_donation_link_and_impact_notices |
| Restore started / completed | 2026-08-15T20:37:24Z / 2026-08-15T20:37:25Z |
| Observed RTO | 21s empty-target rebuild through suite complete (1s restore+pending-migration); not an accepted RTO |
| Observed RPO | recovered synthetic dump local-synthetic.dump sha256:951deddfd377 at migration head 20260815180000_am_donation_link_and_impact_notices; fixture counts auth_users=6 profiles=6 memberships=6 decisions=5 ; not an accepted RPO |
| Synthetic fixture counts matched | pass |
| Full SQL policy suite | pass (21 pass / 0 fail of 21) |
| Private bucket verification | pass |
| Signed-access audit verification | pass |
| Old credentials rejected | not applicable |
| Exceptions and remediation owner | none |
| Environment cleanup confirmed | yes |

## Suite rollup (do not invent passing suites)

- Import suites: pass
- RLS / session suites: pass / pass
- Private bucket / storage: pass
- Signed-access audit: pass

- supabase/tests/003_import_gate_cases.sql:pass
- supabase/tests/004_import_review_actions.sql:pass
- supabase/tests/005_atomic_import_creation.sql:pass
- supabase/tests/rls_e2e.sql:pass
- supabase/tests/rls_policy_matrix.sql:pass
- supabase/tests/storage_matrix.sql:pass
- supabase/tests/006_document_access_audit.sql:pass
- supabase/tests/007_agi_tenant_foundation.sql:pass
- supabase/tests/008_agi_operational_isolation.sql:pass
- supabase/tests/009_agi_workspace_context.sql:pass
- supabase/tests/010_agi_client_configuration.sql:pass
- supabase/tests/011_agi_client_onboarding.sql:pass
- supabase/tests/012_agi_two_person_approvals.sql:pass
- supabase/tests/013_agi_impact_relay_jwt.sql:pass
- supabase/tests/014_agi_two_tenant_acceptance.sql:pass
- supabase/tests/015_client_onboarding_pack.sql:pass
- supabase/tests/016_delegate_auth.sql:pass
- supabase/tests/017_security_definer_privileges.sql:pass
- supabase/tests/018_authenticated_security_definer_privileges.sql:pass
- supabase/tests/019_am_tenant_isolation.sql:pass
- supabase/tests/020_am_impact_notice.sql:pass

## Method

- Engine: isolated synthetic (local disposable; engine=host-postgres)
- Known backup: synthetic six-role fixtures plus seed `decisions` rows. No production rows.
- Empty target: disposable local supabase/postgres image, then repository migrations, then restore, then pending-migration apply.
- `supabase start` full stack did not come up on this host (Docker bridge dropped container-to-container traffic). This receipt is not a hosted isolated-project drill.
- Destroyed the disposable target after the suite. No backup retained.

## Approval

- Engineering result: pass
- Privacy or data owner review: pending
- Leadership RTO/RPO acceptance: pending
- Production import remains blocked: yes
