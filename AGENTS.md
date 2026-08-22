# Portfolio Signals — agent guidance

This is the AGI suite **decision workspace and host** (historically Fund-Intel). It is not the public AGI marketing site and it does not process donations.

## Start here

- [docs/START_HERE.md](docs/START_HERE.md)
- [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md)
- [SECURITY.md](SECURITY.md)

## Hard stops

- Do not enable production CRM / workbook import or outreach.
- Do not commit service-role keys, donor PII, member registries, or `.csv` / `.xlsx` workbooks.
- Do not mark fixture or synthetic data `OBSERVED` or claim READY.
- Do not un-PARK AGI SPEC-028 login. Auth for this host is Supabase workspace magic-link, not an AGI-issued capability JWT.
- Missing `runtime-config.js` must not send a fixture Impact Relay Bearer. Local fixture mode is explicit `allowFixtureBearer: true` only.
- Operator-owned: Worker `portfolio-signals` secrets, live every.org pointing, MFA dry-run, director acceptance.

## Verification

Follow the repo’s existing CI contracts (`validate-and-deploy.yml`, `local-security-contract.yml`, Playwright, disposable Supabase). Do not add a network or live-service requirement to the default suite. Toolchain pins live in `docs/RUNTIME-VERSIONS.md` (Node 22.18.0, Deno 2.2.7, Supabase CLI 2.31.8, Postgres 15.8); do not upgrade them casually.

## Cursor Cloud specific instructions

The Cloud Agent environment is bootstrapped by `.cursor/install.sh` (deps) and
`.cursor/start.sh` (per-boot). Assume both have already run. `install.sh` sets up
Deno 2.2.7, the Docker engine, Supabase CLI 2.31.8, `postgresql-client`, the root
+ `services/workbook-parser` npm deps, and Playwright Chromium. `start.sh` launches
the Docker daemon and serves the public portal on `:8080`.

Canonical lint/test/build commands are the CI workflows in `.github/workflows/`;
treat those as the source of truth rather than duplicating them here. The main
local flows:

- Public portal: already served at `http://127.0.0.1:8080` by `start.sh`
  (`python3 -m http.server`). Static/route + schema checks:
  `node scripts/validate-static-routes.mjs` and the ajv command in `README.md`.
- Node suites: `npm run test:fixtures` (root), `npm test` in
  `workers/portfolio-signals`, `services/allocation-middleware`,
  `services/workbook-parser`, and `services/import-api`.
- Browser acceptance: `npm run test:browser` — Playwright starts its **own**
  `python3 -m http.server` on `:4173` (separate from the `:8080` portal).
- Deno edge functions: `deno check --node-modules-dir=auto` over the
  `supabase/functions/*/index.ts` set (see `local-security-contract.yml`).
- Allocation middleware app: `cd services/allocation-middleware && npm run
  start:hacker-dojo:seed` runs an open-dev server on `:8787` (auth disabled,
  in-memory seed) — good for exercising `/available`, `/allocations`, `/trail`.
- Synthetic Civic Forge corpus: `npm run synthetic:validate`, `npm run
  public:fixture:synthetic`, `npm run synthetic:test`. Disposable seed:
  `SYNTHETIC_SEED_CONFIRM=1 DB_URL=... npm run seed:synthetic` then
  `supabase/tests/024_autogive_synthetic_v1.sql`. Never seed platform refs.
  See [docs/SYNTHETIC-DATASET.md](docs/SYNTHETIC-DATASET.md).

### Docker + local Supabase (non-obvious)

- The Docker daemon runs as root; `start.sh` re-`chmod 666`s
  `/var/run/docker.sock` each boot because `/var/run` is a fresh tmpfs. If Docker
  is down, start it with `sudo dockerd >/var/log/dockerd.log 2>&1 &` then re-chmod
  the socket. The daemon **must** use `fuse-overlayfs` with the containerd
  snapshotter disabled (`/etc/docker/daemon.json`) and legacy iptables — plain
  overlay2/nftables do not work in this nested Firecracker VM, and Docker >=29
  otherwise ignores fuse-overlayfs.
- The local Supabase policy stack (`local-supabase-tests.yml`,
  `hd-oi-041-local-acceptance.yml`) needs Docker. Workflow: `supabase start`
  (first run pulls ~2.5GB of images — slow but cached afterward), `supabase db
  reset` (applies the migration chain + seed), then run the psql policy files
  listed in `local-supabase-tests.yml` against `$(supabase status -o env)`'s
  `DB_URL`, and `supabase stop --no-backup` when done. Use CLI `2.31.8`; do not
  auto-upgrade.
- If a fresh boot is missing `node_modules` or Supabase images (e.g. a snapshot
  that predates the last `install`), re-run `bash .cursor/install.sh` — it is
  idempotent — before `supabase start`.
