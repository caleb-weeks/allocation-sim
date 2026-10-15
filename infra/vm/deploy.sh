#!/usr/bin/env bash
# Deploy the latest main on the VM. Run as the app user (CI runs it over SSH).
set -euo pipefail

APP_DIR=/srv/allocation-sim
cd "$APP_DIR"

git fetch --quiet origin main
git reset --hard origin/main

pnpm install --frozen-lockfile
pnpm --filter @allocation-sim/api build
pnpm --filter @allocation-sim/api exec prisma migrate deploy

# First deploy: create the demo round.
if [ "${SEED_DEMO:-0}" = "1" ]; then
  pnpm --filter @allocation-sim/api demo:reset
fi

sudo systemctl restart allocation-api

# Wait for the health check so CI fails loudly on a bad deploy.
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null; then
    echo "deployed $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done
echo "API did not become healthy" >&2
sudo journalctl -u allocation-api -n 50 --no-pager >&2
exit 1
