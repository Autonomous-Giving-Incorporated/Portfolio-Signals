#!/usr/bin/env bash
# Cursor Cloud environment bootstrap for Portfolio Signals.
#
# Idempotent, non-interactive dependency refresh run after checkout. Brings a
# default Cursor base image up to full local development parity:
#   - Deno 2.2.7        (Supabase edge-function type check)
#   - Docker engine     (Supabase local Postgres/RLS policy stack)
#   - Supabase CLI 2.31.8 + postgresql-client (disposable DB + psql suite)
#   - repo JS deps + Playwright Chromium (browser acceptance suite)
#
# System pins mirror docs/RUNTIME-VERSIONS.md and the GitHub Actions workflows.
# Docker daemon startup lives in .cursor/start.sh (per-boot), not here.
set -euo pipefail

log() { printf '\n[install] %s\n' "$*"; }

# --- Deno 2.2.7 (edge-function type check) ---
if ! command -v deno >/dev/null 2>&1 || ! deno --version 2>/dev/null | grep -q '2\.2\.7'; then
  log "Installing Deno 2.2.7"
  curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=/usr/local sh -s v2.2.7
fi

# --- APT-provided system packages (Docker engine + FUSE + iptables + psql) ---
need_apt=0
command -v docker >/dev/null 2>&1 || need_apt=1
command -v fuse-overlayfs >/dev/null 2>&1 || need_apt=1
command -v psql >/dev/null 2>&1 || need_apt=1

if [ "$need_apt" = 1 ]; then
  log "Installing Docker engine, fuse-overlayfs, iptables, postgresql-client"
  sudo install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl --retry 3 --retry-delay 5 -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  # fuse-overlayfs ships an interactive /etc/fuse.conf conffile prompt; keep ours.
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    -o Dpkg::Options::=--force-confold --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    fuse-overlayfs iptables postgresql-client
  sudo DEBIAN_FRONTEND=noninteractive dpkg --force-confold --configure -a || true
fi

# Docker daemon config for the nested Firecracker VM: fuse-overlayfs storage
# driver, and disable the containerd snapshotter (required on Docker >=29 for
# fuse-overlayfs). Legacy iptables is required because the kernel lacks some
# nftables features. Both are idempotent.
sudo mkdir -p /etc/docker
printf '%s\n' '{' '  "storage-driver": "fuse-overlayfs",' '  "features": { "containerd-snapshotter": false }' '}' \
  | sudo tee /etc/docker/daemon.json >/dev/null
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true

# --- Supabase CLI 2.31.8 (docs/RUNTIME-VERSIONS.md) ---
if ! command -v supabase >/dev/null 2>&1 || [ "$(supabase --version 2>/dev/null | head -1)" != "2.31.8" ]; then
  log "Installing Supabase CLI 2.31.8"
  deb="$(mktemp --suffix=.deb)"
  curl -fsSL -o "$deb" \
    https://github.com/supabase/cli/releases/download/v2.31.8/supabase_2.31.8_linux_amd64.deb
  sudo dpkg -i "$deb"
  rm -f "$deb"
fi

# --- Repo JavaScript dependencies ---
log "Installing repo dependencies (root + workbook-parser)"
npm ci
npm --prefix services/workbook-parser ci --ignore-scripts

# --- Playwright Chromium + OS libraries (browser acceptance suite) ---
log "Installing Playwright Chromium"
npx --yes playwright install --with-deps chromium

log "Environment bootstrap complete."
