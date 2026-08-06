# Platform specification pin

This repository **pins** the Autonomous Giving Platform Specification at:

| Field | Value |
| --- | --- |
| Repository | [scrimshawlife-ctrl/Autonomous-Giving-Specs](https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs) |
| Version | **1.0.0** |
| Release | https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/releases/tag/v1.0.0 |
| Service role | Intelligence (`fund-intel`) |

Do **not** track floating `main` of the specs repository for production behavior. Consume the tagged release package or git tag `v1.0.0`.

## Manifest

[`conformance.yml`](conformance.yml) declares which SPECs, contracts, and events Fund Intel implements (produces/consumes). Schema:

https://github.com/scrimshawlife-ctrl/Autonomous-Giving-Specs/blob/v1.0.0/schemas/meta/conformance-manifest.schema.json

## Boundary (from platform canon)

Fund Intel observes, normalizes, and recommends only. It **must not** allocate funds or grant Approval.

## Updating the pin

1. Review the specs release notes and migration guide.
2. Bump `platform_spec.version` in `conformance.yml`.
3. Update produced/consumed artifact lists if the release changes them.
4. Re-run product validation against the pinned schemas from the release package.
