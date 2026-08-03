# A.G.I. shared interface contract

Fund-Intel and Impact Relay are one product suite. Their information density may
differ, but their visual and interaction grammar must remain consistent.

## Shared primitives

The suite identity is **Autonomously Giving Incorporated**. Canonical values live
in `styles.css` `:root`; this document describes them, it does not duplicate them
as a second source of truth.

- Neutral canvas: `#f7f8fa`, white surfaces, `#e6e9ec` secondary surfaces.
- Ink: `#0e1116`; secondary ink `#1f232b`; muted copy: `#566376`; rules: `#d8dde4`.
- Brand green: `#2e7d6b` (trust, stability, growth); secondary green `#a5cbb8` (clarity, balance).
- Accent amber: `#e6b23c` (optimism, action).
- Tenant accent may override `--agi-accent`. Hacker Dojo uses its red brand layer (`brand.css`).
- Semantic colors are stable across repos: success `#19734a`, warning `#755000`, danger `#a83232`.
- Tenant accents must retain WCAG AA contrast in text, controls, focus rings, and status treatments.
- Controls use 10px corners, cards use 18px corners, compact statuses may use pills.
- Type is **Inter** for UI, headings, and body; **Space Grotesk** (`--agi-font-accent`)
  for accents, labels, and supporting elements. Mono stays reserved for identifiers,
  receipts, and tabular evidence.

### Fill-only colors

Two brand colors are **fills, not foregrounds**, and the distinction is load-bearing:

Ratios below are against the **worst** light surface, `--agi-surface-alt`
(`#e6e9ec`) — not white. Checking against white alone is how a palette passes
review and still fails the axe acceptance run.

| Token | Value | On `#e6e9ec` | Use |
|---|---|---|---|
| `--agi-accent` | `#e6b23c` | 1.66:1 | fills and bars only; pair with ink on top (9.7:1) |
| `--agi-brand-2` | `#a5cbb8` | 1.51:1 | tints, bar segments, hover washes |
| `--agi-brand` | `#2e7d6b` | 4.04:1 | fills, large text, white-on-green buttons (4.9:1) |
| `--agi-accent-ink` | `#7f5d10` | 4.96:1 | text, icons, thin strokes needing the amber hue |
| `--agi-brand-ink` | `#296e5e` | 4.94:1 | text needing the brand green |

Note that `--agi-brand` itself is **not** a body-text color: it clears AA on
white (4.93:1) but not on the secondary surface. Use `--brand-ink` for text.
Both ink tokens resolve back to their lighter brand values in dark mode, where
the near-black surfaces give them 7–8:1.

## Verifying a palette change

Any change to these values must be re-checked before merge — foreground pairs
at 4.5:1 against **every** surface they can land on, and UI/large text at 3:1.
A swap that only edits `:root` will silently break every rule that uses a token
as `color:`; `npm run test:browser` runs axe over both tenants and is the gate.

## Interaction rules

- Every keyboard action has a visible focus state.
- Primary actions use the suite or tenant accent. Secondary actions are bordered and neutral.
- Status color is never the only signal. Labels remain explicit.
- Loading, empty, error, blocked, and success states use the same semantic vocabulary.
- Operational tables scroll horizontally on small screens. Primary actions remain reachable without horizontal scrolling.
- Public evidence and authenticated operations share typography and components, while authority boundaries remain visually explicit.

The canonical CSS custom properties use the `--agi-` prefix. Repository-local
tokens should alias these properties rather than define unrelated palettes.
