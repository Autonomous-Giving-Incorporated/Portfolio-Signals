# A.G.I. Routed Interface

## Public routes

- `index.html`: campaign overview, funding architecture, governance, and resources.
- `sponsors.html`: sponsor candidates with priority and stage dropdown filters.
- `grants.html`: grant opportunities with decision filtering.
- `members.html`: aggregate-only member evidence and engagement-threshold exploration.
- `workspace.html`: authenticated client operations and administration.

The former sponsor, grant, and member tab panels are now independent GitHub Pages-compatible documents. This gives each product area a stable URL without requiring a server-side router.

## Reusable controls

`ui-controls.js` progressively enhances declarative HTML:

- `data-filter-table` and `data-filter-field` connect dropdowns to table-row data attributes.
- `data-range-output` and `data-range-target` connect sliders to visible output and aggregate bands.
- `data-tooltip` creates keyboard-focusable, ARIA-described tooltips.

Controls must not imply that a research priority, engagement score, or public association grants outreach authority.

## Validation

`node scripts/validate-static-routes.mjs` verifies required routes, local references, landmarks, and control contracts. Full browser, responsive, and assistive-technology acceptance remains part of AGI-009.
