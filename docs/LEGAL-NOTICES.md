# Portfolio Signals — legal notices (operator map)

Canonical public legal pages ship on the AGI site:

| Page | URL |
| --- | --- |
| Legal hub | https://autogive.app/legal |
| Privacy notice | https://autogive.app/legal/privacy |
| Terms of use | https://autogive.app/legal/terms |

This document maps product surfaces to compliance expectations. It does **not** replace counsel review or a signed enterprise DPA.

## Product classification

| Is | Is not |
| --- | --- |
| Multi-tenant decision-support SaaS for nonprofit operators | Bank, money transmitter, escrow, or payment processor |
| Privacy-safe public aggregates + authenticated workspace | Public CRM or donor registry |
| Human-gated import quarantine / document pack (when enabled) | Automatic authorization to import or outreach |
| Advisory allocation / campaign tooling | Legal, tax, accounting, or investment advice |

## Authority gates (product policy)

```yaml
production_import: BLOCKED   # until leadership + technical gates
outreach_authority: NOT_GRANTED
production_money_movement: BLOCKED  # funds via third parties only
service_role_on_vercel: PROHIBITED
private_data_in_github: PROHIBITED
```

## Surface checklist

| Surface | Required disclosures |
| --- | --- |
| Public director portal (`index.html`) | Product disclaimer banner; footer Legal / Privacy / Terms |
| Authenticated workspace | Footer Legal / Privacy / Terms; MFA/role gates; no false “authorized outreach” |
| Onboarding pack | Pack ready ≠ import / outreach / activate |
| Import review | Quarantine only; consent ≠ outreach |
| Member / sponsor / grant public modules | Aggregate-only; no consent from history alone |
| Allocation middleware | Pilot labels; every.org is third party |
| AGI marketing site | Legal hub; no payments; no private data |

## Data placement

See [DATA-PLACEMENT.md](DATA-PLACEMENT.md). Public Pages/git: aggregates only. Person-level data: authenticated Supabase + private storage only.

## Retention / legal hold

See [RETENTION-LEGAL-HOLD.md](RETENTION-LEGAL-HOLD.md).

## Security

See [SECURITY.md](../SECURITY.md) and [OPERATOR-SECRET-HYGIENE.md](OPERATOR-SECRET-HYGIENE.md). Privileged roles require MFA enforcement before elevated actions.

## Contact

- Legal / privacy: legal@autogive.app  
- Product / demos: hello@autogive.app  

**Effective alignment date:** 2026-08-08 (matches AGI legal page effective dates).
