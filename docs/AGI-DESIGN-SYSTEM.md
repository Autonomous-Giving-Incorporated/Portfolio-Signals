# AGI shared interface contract

Autonomously Giving Incorporated is the corporate master brand for AGI, Portfolio Signals, and Impact Relay. Their information density differs, but their identity, visual grammar, status language, and cross-product navigation remain consistent. Zero State is a footer-only software-builder credit.

## Shared primitives

- Paper `#f7f8fa`, white surface `#ffffff`, cool gray `#e6e9ec`.
- Ink `#0e1116`, graphite `#1f232b`, muted copy derived from graphite.
- AGI gold `#e6b23c`; AGI green `#2e7d6b`; mint `#a5cbb8`.
- Success/verified uses deep teal, warning uses `#6a5200`, and danger uses `#a83232`.
- Space Grotesk display, Inter body, IBM Plex Mono metadata.
- Controls use 2px corners; structural surfaces use 4px corners; shadows are omitted.

Canonical CSS custom properties use the `--agi-` prefix. Repository-local tokens alias these properties instead of defining unrelated palettes.

## Identity hierarchy

1. AGI mark and wordmark
2. Portfolio Signals product name and “Decision Workspace” role
3. Tenant or campaign context, such as Hacker Dojo

The masthead includes reciprocal links to AGI and Impact Relay. Tenant branding can add an accent or mark, but cannot replace AGI, product identity, semantic colors, or interaction behavior. Canonical navigation uses `autogive.app`; Tokens, Logo use, Legal, and “Software by Zero State” appear in the footer.

## Interaction rules

- Every keyboard action has a visible focus state.
- Primary actions use carbon; signal yellow is reserved for attention and focus.
- Deep teal indicates verified state and suite navigation.
- Status color is never the only signal; labels remain explicit.
- Loading, empty, error, blocked, waiting, and verified states use shared language.
- Operational tables may scroll horizontally on small screens while primary actions remain reachable.
- Public evidence and authenticated operations share typography while authority boundaries remain visually explicit.

## Host pilot and operational screens

Operational host surfaces use the same AGI shell contract as the public portal and workspace:

| Surface | Product role |
|---|---|
| `finance-impact.html` | Impact Relay · Finance review |
| `donor-impact.html` | Impact Relay · Donor receipts |
| `import-review.html` | Portfolio Signals · Import review |
| `services/allocation-middleware/public/*` | Portfolio Signals · Allocation middleware |

Each must show:

1. AGI wordmark → product role → Hacker Dojo campaign context
2. Reciprocal suite links (`autogive.app` family + local workspace)
3. Footer: AGI mark, product name, Tokens / Logo use / Legal, “Software by Zero State”

Implementation: `brand.css` (`.impact-host-shell`, `.impact-host-header`) plus the shared `.brand-identity` / footer patterns. Public pages also load `brand.css` statically so AGI identity does not depend solely on `app.js` injection. Do not ship operational screens with eyebrow-only product labels and no corporate chrome.

Allocation middleware packages a self-contained shell at `services/allocation-middleware/public/css/agi-shell.css` (same `--agi-*` tokens, host header/footer, Space Grotesk / Inter / IBM Plex Mono) with brand assets under `public/assets/brand/`, because the Node pilot is served outside the GitHub Pages tree.
