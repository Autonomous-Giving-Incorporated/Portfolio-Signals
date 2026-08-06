# Hacker Dojo — reference tenant assets

This directory holds **tenant-only** brand assets for the Hacker Dojo client
(`org_hacker_dojo`, slug `hacker-dojo`).

| File | Purpose |
|------|---------|
| `icon.svg` | Tenant mark in chips / lockups |
| `theme.css` | Tenant palette overrides (scoped `html[data-tenant="hacker-dojo"]`) |

**Do not** put AGI product identity here. Suite chrome lives in `styles.css`
(`--agi-*`) and `brand.css` (layout shell). New tenants get
`assets/tenants/<slug>/` the same way.
