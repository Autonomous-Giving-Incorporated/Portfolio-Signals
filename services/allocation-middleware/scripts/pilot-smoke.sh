#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
BASE_URL="${BASE_URL%/}"
echo "Smoke against $BASE_URL"
code=$(curl -sS -o /tmp/am-healthz.json -w "%{http_code}" "$BASE_URL/healthz")
test "$code" = "200" || { echo "healthz failed: $code"; cat /tmp/am-healthz.json; exit 1; }
echo "OK healthz"
code=$(curl -sS -o /tmp/am-readyz.json -w "%{http_code}" "$BASE_URL/readyz")
test "$code" = "200" || { echo "readyz failed: $code"; cat /tmp/am-readyz.json; exit 1; }
echo "OK readyz"
code=$(curl -sS -o /tmp/am-available.json -w "%{http_code}" "$BASE_URL/available")
test "$code" = "200" || { echo "available failed: $code"; exit 1; }
echo "OK available"
code=$(curl -sS -o /tmp/am-setup.json -w "%{http_code}" "$BASE_URL/setup")
test "$code" = "200" || { echo "setup failed: $code"; exit 1; }
echo "OK setup"
code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/setup.html")
test "$code" = "200" || { echo "setup.html failed: $code"; exit 1; }
echo "OK setup.html"
code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/login.html")
test "$code" = "200" || { echo "login.html failed: $code"; exit 1; }
echo "OK login.html"
echo "SMOKE PASS"
