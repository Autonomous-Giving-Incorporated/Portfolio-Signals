# Hacker Dojo Campaign Portal Brand System

## Purpose

This document defines how the supplied Hacker Dojo identity is used across the public director portal and the future authenticated campaign workspace.

The system must remain operational, legible, privacy-safe, and consistent across desktop, mobile, light mode, and dark mode.

## Canonical mark

`assets/brand/hacker-dojo-icon.svg` is the canonical application mark.

Use it for:

- site header;
- favicon and application icon;
- mobile navigation;
- authenticated workspace shell;
- footer identity;
- loading and empty states.

The mark must not be stretched, recolored, cropped, or combined with unapproved decorative effects.

## Wordmark treatment

The portal renders `HACKER DOJO` as accessible HTML text beside the canonical mark. This preserves readability at responsive sizes and prevents raster wordmark degradation.

The full supplied horizontal wordmarks may be used in static campaign exports, presentations, and approved marketing collateral when their original proportions and contrast are preserved.

## Color tokens

```css
--hd-red: #ed1c24;
--hd-crimson: #c90046;
--hd-charcoal: #303030;
```

Usage:

- `--hd-red`: primary actions, active navigation, priority campaign thresholds;
- `--hd-crimson`: secondary campaign emphasis and transformation-path accents;
- `--hd-charcoal`: high-contrast campaign status band and dark neutral surfaces.

Semantic success, warning, and error colors remain separate from brand colors.

## Layout hierarchy

1. Hacker Dojo identity
2. Campaign Control Center product context
3. Campaign event and approval-state band
4. Director metrics and decisions
5. Sponsor, grant, member-segment, governance, and resource surfaces

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
