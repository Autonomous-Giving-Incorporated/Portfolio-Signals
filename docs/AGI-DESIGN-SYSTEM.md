# A.G.I. shared interface contract

Fund-Intel and Impact Relay are one product suite. Their information density may
differ, but their visual and interaction grammar must remain consistent.

## Shared primitives

- Neutral canvas: `#f5f7fb`, white surfaces, `#eef2f8` secondary surfaces.
- Ink: `#152033`; muted copy: `#637083`; rules: `#d8e0eb`.
- Suite blue: `#16325c`; secondary blue: `#255f85`.
- Tenant accent may override `--agi-accent`. Hacker Dojo uses its red brand layer.
- Semantic colors are stable across repos: success `#19734a`, warning `#9a6700`, danger `#a83232`.
- Controls use 10px corners, cards use 18px corners, compact statuses may use pills.
- The system font stack is the default. Mono is reserved for identifiers, receipts, and tabular evidence.

## Interaction rules

- Every keyboard action has a visible focus state.
- Primary actions use the suite or tenant accent. Secondary actions are bordered and neutral.
- Status color is never the only signal. Labels remain explicit.
- Loading, empty, error, blocked, and success states use the same semantic vocabulary.
- Operational tables scroll horizontally on small screens. Primary actions remain reachable without horizontal scrolling.
- Public evidence and authenticated operations share typography and components, while authority boundaries remain visually explicit.

The canonical CSS custom properties use the `--agi-` prefix. Repository-local
tokens should alias these properties rather than define unrelated palettes.
