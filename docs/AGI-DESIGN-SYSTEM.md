# Zero State shared interface contract

AGI, Fund Intel, and Impact Relay are one Zero State suite. Their information density differs, but their identity, visual grammar, status language, and cross-product navigation remain consistent.

## Shared primitives

- Paper `#fbf9f4`, white surface `#ffffff`, stone `#f4f0e8`.
- Carbon `#1d2321`, muted copy `#626b67`, rule `#b9b2a7`.
- Signal yellow `#f2c200`; deep teal `#486f6a`.
- Success/verified uses deep teal, warning uses `#6a5200`, and danger uses `#a83232`.
- Georgia display, Inter body, IBM Plex Mono metadata.
- Controls use 2px corners; structural surfaces use 4px corners; shadows are omitted.

Canonical CSS custom properties use the `--agi-` prefix. Repository-local tokens alias these properties instead of defining unrelated palettes.

## Identity hierarchy

1. Zero State mark and wordmark
2. Fund Intel product name and “Decision Workspace” role
3. Tenant or campaign context, such as Hacker Dojo

The masthead includes reciprocal links to AGI and Impact Relay. Tenant branding can add an accent or mark, but cannot replace Zero State, product identity, semantic colors, or interaction behavior.

## Interaction rules

- Every keyboard action has a visible focus state.
- Primary actions use carbon; signal yellow is reserved for attention and focus.
- Deep teal indicates verified state and suite navigation.
- Status color is never the only signal; labels remain explicit.
- Loading, empty, error, blocked, waiting, and verified states use shared language.
- Operational tables may scroll horizontally on small screens while primary actions remain reachable.
- Public evidence and authenticated operations share typography while authority boundaries remain visually explicit.
