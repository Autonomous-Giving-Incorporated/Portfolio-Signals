# AGI + Hacker Dojo brand system

## Purpose

This document defines how the Hacker Dojo tenant identity sits inside the AGI Fund Intel product shell across the public director portal and authenticated campaign workspace. Zero State is the software builder, not the customer-facing suite brand.

The system must remain operational, legible, privacy-safe, and consistent across desktop, mobile, light mode, and dark mode.

## Identity hierarchy

The persistent masthead order is:

1. AGI mark and wordmark
2. Fund Intel product name and Decision Workspace role
3. Hacker Dojo campaign context

AGI and Impact Relay remain available as reciprocal suite links. Tenant identity never replaces AGI or Fund Intel identity.

## Canonical marks

`assets/brand/agi-wordmark.png` and `assets/brand/agi-mark.png` are the canonical corporate assets. They appear in the masthead, application icon, and shared footer.

`assets/tenants/hacker-dojo/` holds **reference tenant assets only** (not product chrome):

| Path | Role |
|------|------|
| `assets/tenants/hacker-dojo/icon.svg` | Tenant mark (chips, lockups) |
| `assets/tenants/hacker-dojo/theme.css` | Tenant palette, scoped to `html[data-tenant="hacker-dojo"]` |

New clients get `assets/tenants/<slug>/` the same way. Published Supabase `client_assets` may override mark/hero at runtime via `public-client-config.js`.

Use tenant assets for:

- tenant or campaign context;
- tenant mark in chips / workspace lockup;
- mobile tenant context;
- authenticated workspace tenant chip;
- footer identity;
- loading and empty states.

The mark must not be stretched, recolored, cropped, or combined with unapproved decorative effects.

## Wordmark treatment

The portal renders `HACKER DOJO` as accessible HTML text beside the canonical mark. This preserves readability at responsive sizes and prevents raster wordmark degradation.

The full supplied horizontal wordmarks may be used in static campaign exports, presentations, and approved marketing collateral when their original proportions and contrast are preserved.

## Shared and tenant color tokens

The AGI shell uses ink `#0e1116`, graphite `#1f232b`, green `#2e7d6b`, mint `#a5cbb8`, cool gray `#e6e9ec`, paper `#f7f8fa`, and gold `#e6b23c`. Space Grotesk carries display type, Inter body copy, and IBM Plex Mono metadata.

```css
--hd-red: #ed1c24;
--hd-crimson: #c90046;
--hd-charcoal: #303030;
```

Tenant usage:

- `--hd-red`: limited tenant emphasis and approved Hacker Dojo campaign thresholds;
- `--hd-crimson`: secondary campaign emphasis and transformation-path accents;
- `--hd-charcoal`: high-contrast campaign status band and dark neutral surfaces.

Semantic success, warning, and error colors remain separate from tenant colors. AGI interaction and status tokens take precedence in the shared shell.

## Layout hierarchy

1. AGI corporate identity
2. Fund Intel product identity
3. Hacker Dojo tenant context
4. Campaign event and approval-state band
5. Director metrics and decisions
6. Sponsor, grant, member-segment, governance, and resource surfaces

The portal is an operating dashboard, not a promotional landing page. Branding must improve orientation and confidence without displacing evidence, controls, or decisions.

## Status indicators

Campaign progress bars currently represent **readiness**, not dollars raised.

Every readiness visualization must include a nearby text qualifier. Funds-raised indicators may be introduced only when connected to an approved, reconciled donation source.

## Accessibility

- Preserve text alternatives for meaningful marks.
- Decorative repeated marks must use empty alt text.
- Maintain keyboard-visible focus states.
- Theme controls must expose their current state.
- Active navigation must expose `aria-current`.
- Tab controls must expose `aria-selected`.
- Respect reduced-motion preferences.

## Authenticated workspace continuity

The authenticated application must reuse:

- the canonical icon;
- the same brand tokens;
- the same active-navigation behavior;
- the same light/dark theme semantics;
- the same privacy and authority language.

Branding must never imply that a record is authorized for outreach, a sponsor is active, or a campaign threshold is approved.

## Asset governance

New brand assets require:

1. a documented source;
2. intended placement and minimum size;
3. light/dark contrast review;
4. accessibility review;
5. confirmation that the asset contains no private campaign data.

Public navigation uses `autogive.app`, with Fund Intel at `/fund-intel/` and Impact Relay at `/impact-relay/`. Every footer includes Tokens, Logo use, Legal, and the restrained credit “Software by Zero State.”
