# Cloudflare static asset tooling exclusions

The Worker serves the repository root (`wrangler.toml` `[assets]`). The browser
build (`scripts/vercel-build.sh`) generates `runtime-config.js`; it does not copy
files to an isolated public directory. `.assetsignore` is therefore a deployment
security boundary, independent of Git's ignore rules and Vercel's exclusions.

## Exposure and scope

The bootstrap release at `b743ad2` was reported to serve internal graph/agent
configuration. A local reconstruction using the tracked release tree, the actual
public-only browser build, and Wrangler 4.130.0 deployment discovery confirmed
these additional publishable paths:

- `.mcp.json`
- `.claude/settings.json`
- `.claude/helpers/graft-hooks.cjs`
- `.claude/helpers/graft-statusline.cjs`
- `.gitattributes`
- `.ignore`

Classification: unintended disclosure of developer tooling/configuration and
repository metadata. No credential candidates were found by a limited local
heuristic scan of these six files; that is not an exhaustive secret audit or
proof that historical releases never contained credentials. Do not publish their
contents or credential values in incident logs.

The patched discovery inventory removes exactly those six tracked paths: 54
baseline assets versus 48 retained assets, including the generated public-only
`runtime-config.js`. No other tracked public asset is removed or added.

The hidden-path rule covers new agent/editor/environment/cache dotfiles at every
depth, not only the names observed in this incident. The root `.well-known`
standards directory is allowed; hidden descendants remain private. Existing
operator/source exclusions still apply. This remains a denylist: newly added
non-hidden tool artifacts require review. This change is Cloudflare-specific and
does not claim to audit or repair other hosts' publishing mechanisms.

## Regression evidence

Run after `npm ci`:

```sh
node --test tests/static-assets.test.mjs
```

The test copies tracked deployment files into disposable directories without
local credentials or dependencies, adds synthetic hidden/public fixtures, and
runs the installed Wrangler CLI with `deploy --dry-run` and a restricted
environment. Pinned Wrangler's actual `buildAssetManifest` logs ignored paths;
the regression asserts every tracked hidden file and the nested tooling fixtures
are ignored. Positive size-validator tripwires independently prove each selected
public HTML/JS/CSS/image/data/runtime-config/standards path enters the manifest.
The tests never upload assets or use Cloudflare/database credentials. CI runs this
regression in the Cloudflare validation job on every main-targeting PR.

The initial regression failed on `.mcp.json` before the exclusion change. The
patched case passes. Debug diagnostics are consumed in memory; failures report
paths and sanitized process status, not full configuration logs.

## Release hold

A passing dry-run does not remove already deployed files. Do not claim production
containment until a separately approved exact-head release and HTTP readback of
the affected paths have completed (and old preview/version origins have been
considered). This PR does not deploy, merge, change credentials, alter a database,
or modify the suite gateway. Keep the manual bootstrap deployment approval gate.
