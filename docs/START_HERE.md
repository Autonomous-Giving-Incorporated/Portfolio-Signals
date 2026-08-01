# Hacker Dojo — Start Here

This is the projection-only navigation surface for repository operators. It does not govern,
promote, activate, or authorize production or real-data use.

## Current staging state

- Hosted project: `ecxkhihlbrcwpavfoaoq`
- Verified deployed staging commit: `b573fe078296bcc02e9d4e21140cf777d9d050d2`
- Pages runtime repair: `32087fa65cae90d5ee69f253bbb14befc058708d`
- GitHub Pages host: `https://scrimshawlife-ctrl.github.io/Hacker-Dojo/`
- Application-control verification: `PASS`
- Overall staging readiness: `FAIL`
- Production import and outreach: `BLOCKED`

Read the current evidence receipt first:

- [`out/audit/hd-oi-019-staging-readiness.latest.json`](../out/audit/hd-oi-019-staging-readiness.latest.json)

## Operator navigation

- [Staging bootstrap and verification](STAGING-BOOTSTRAP.md)
- [HD-OI-019 hardening status](HD-OI-019.md)
- [Production hardening gates](PRODUCTION-HARDENING.md)
- [Data placement boundaries](DATA-PLACEMENT.md)
- [Import and reconciliation runbook](IMPORT-RUNBOOK.md)
- [Impact Relay bridge](IMPACT-RELAY.md)
- [Impact Relay shadow procedure](IMPACT-RELAY-SHADOW.md)
- [Impact Relay gated cohort procedure](IMPACT-RELAY-LIVE-COHORT.md)
- [Security policy](../SECURITY.md)
- [Execution roadmap](../ROADMAP.md)

## Current cautions

- Pages HTML may remain cached for up to 600 seconds after deployment.
- Pull-request validation and Pages deployment share one concurrency group; a newer run can cancel an active deployment, so verify the superseding run contains the intended commit.
- Supabase Auth currently allows the Pages root, workspace, and import-review routes. Finance and donor Impact Relay redirects remain pending verification.
- Impact Relay host screens remain shadow/local-console surfaces; no live cohort, notification, money-movement, or outreach activation is authorized.

Provenance: Notion Sprint 001 Hub + Loop 805 Slice HD-OI-019 + Hash: b573fe078296bcc02e9d4e21140cf777d9d050d2
