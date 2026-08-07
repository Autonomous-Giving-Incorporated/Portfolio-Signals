# Design QA — Portfolio Signals

- Reference: supplied AGI brand board (`codex-clipboard-7b0a155b-424e-4f90-a4c2-7af6e0bd2174.png`)
- Implementations: `http://127.0.0.1:8081/index.html` and `/workspace.html`
- Viewport: 1280 × 720
- Comparison artifacts: `/private/tmp/fund-qa.png`, `/private/tmp/fund-auth-qa.png`

## Review

- P0: none
- P1: none
- P2: none after correcting the AGI green status-label contrast.
- Identity: AGI remains the persistent master brand; Portfolio Signals is the product; Hacker Dojo is tenant context.
- Authentication: the login gate uses the same AGI/product/tenant hierarchy as the public workspace.
- Tokens and type: shared AGI palette, Space Grotesk display, and Inter interface typography are applied.
- Builder attribution: Zero State appears only in the legal footer beside Tokens, Logo use, and Legal.
- Host pilots: `finance-impact.html`, `donor-impact.html`, and `import-review.html` share the AGI lockup, suite navigation, and footer governance (see `docs/AGI-DESIGN-SYSTEM.md`).
- Public portal static markup uses Portfolio Signals / AGI identity (not Neon Genie) before `app.js` enhancement.

final result: passed
