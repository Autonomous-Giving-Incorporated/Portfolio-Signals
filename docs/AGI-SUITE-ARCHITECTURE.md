# A.G.I. Suite Architecture

**Autonomously Giving Incorporated (A.G.I.)** is the reusable fundraising-management suite.

## Components

| Component | Responsibility | Initial hosting |
|---|---|---|
| Fund-Intel | Public experience, authenticated campaign operations, and client administration | GitHub Pages |
| Supabase | Auth, shared tenant-scoped Postgres, RLS, Storage, and Edge Functions | Supabase |
| Impact Relay | Financial workflows, ledger truth, impact evidence, donor receipts, and notifications | Google Cloud Run target |

`clients.id` in Fund-Intel is the same immutable identifier as Impact Relay `tenant_id`.
Hacker Dojo is the canonical reference tenant: `org_hacker_dojo`. It is a regression fixture and template, not a global product default.

## Authority

- `master_admin` is platform authority for provisioning, suspension, recovery, quotas, and initial-director assignment. It does not inherently grant access to tenant-private fundraising data.
- `director` is the highest authority inside one client and controls configuration, branding, memberships, publication, and rollback.
- Existing campaign roles remain client-scoped and least-privileged.
- Production integration uses short-lived Supabase-derived JWTs validated by Impact Relay. Browser-supplied role headers are not production authority.

## Configuration and publication

Client configuration is versioned as draft, published, or archived. Rollback creates a new immutable published version from a historical snapshot. Public GitHub Pages surfaces consume only a privacy-safe published projection. Private data remains in tenant-scoped Supabase tables and Storage. See [CLIENT-CONFIGURATION.md](CLIENT-CONFIGURATION.md).

## Delivery milestones

1. AGI-001 — suite contracts and shared identifiers.
2. AGI-002 — shared tenancy, memberships, master administration, and isolation tests.
3. AGI-003 — authenticated client context and administration.
4. AGI-004 — shared multi-page frontend shell.
5. AGI-005 — immutable director customization, public runtime configuration, and governed assets.
6. AGI-006 — sponsor/grant productization and onboarding.
7. AGI-007 — onboarding-configurable two-person approvals.
8. AGI-008 — Supabase JWT integration and Cloud Run boundary.
9. AGI-009 — two-tenant acceptance.

Real imports, outreach, money movement, and live notifications remain subject to separate authority gates.

## Allocation middleware

Suite product for **transaction-light allocation middleware** (canonical connector: **every.org**; campaign pot + program slice hierarchy; exception-only ops).

**Status:** MVP implemented in `services/allocation-middleware/` (Hacker Dojo pilot seed; live webhook + named host operator-owned).

- [docs/ALLOCATION-MIDDLEWARE.md](ALLOCATION-MIDDLEWARE.md) — Portfolio Signals’s observe/credit role + status  
- [docs/HACKER-DOJO-ALLOCATION-PILOT.md](HACKER-DOJO-ALLOCATION-PILOT.md) — pilot runbook  
- [Specs design](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/docs/superpowers/specs/2026-08-03-allocation-middleware-design.md)  
- [AGI product brief](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Incorporated/blob/main/docs/PRODUCT-ALLOCATION-MIDDLEWARE.md)  

This track is distinct from Hacker Dojo campaign workspace milestones above; it must not pull Portfolio Signals into full financial transaction processing.

