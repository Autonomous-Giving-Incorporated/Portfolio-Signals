#!/usr/bin/env bash
# Per-boot startup for Portfolio Signals Cloud Agent environment.
#
# 1. Bring up the Docker daemon (needed by `supabase start`). Best-effort: a
#    dockerd failure must not block the environment from starting.
# 2. Serve the public director portal (the primary product) on :8080, attached.
set -uo pipefail

if command -v dockerd >/dev/null 2>&1; then
  if ! sudo docker info >/dev/null 2>&1; then
    echo "[start] launching dockerd"
    sudo bash -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
    for _ in $(seq 1 30); do
      sudo docker info >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  # /var/run is a fresh tmpfs each boot, so re-grant socket access for non-root use.
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
fi

echo "[start] serving public director portal on :8080"
exec python3 -m http.server 8080
