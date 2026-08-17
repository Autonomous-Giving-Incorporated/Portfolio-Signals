# Portfolio Signals — agent guidance

This is the AGI suite **decision workspace and host** (historically Fund-Intel). It is not the public AGI marketing site and it does not process donations.

## Start here

- [docs/START_HERE.md](docs/START_HERE.md)
- [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md)
- [SECURITY.md](SECURITY.md)

## Hard stops

- Do not enable production CRM / workbook import or outreach.
- Do not commit service-role keys, donor PII, member registries, or `.csv` / `.xlsx` workbooks.
- Do not mark fixture or synthetic data `OBSERVED` or claim READY.
- Do not un-PARK AGI SPEC-028 login. Auth for this host is Supabase workspace magic-link, not an AGI-issued capability JWT.
- Operator-owned: Worker `portfolio-signals` secrets, live every.org pointing, MFA dry-run, director acceptance.

## Verification

Follow the repo’s existing CI contracts (`validate-and-deploy.yml`, `local-security-contract.yml`, Playwright, disposable Supabase). Do not add a network or live-service requirement to the default suite.
