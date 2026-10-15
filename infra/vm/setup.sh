#!/usr/bin/env bash
# One-time VM bootstrap (runs as the GCP startup script, as root). Idempotent.
# Installs Node 22 + pnpm, Postgres, and Caddy; creates the app user, database, swap, and cron jobs.
set -euo pipefail

APP_USER=allocation
APP_DIR=/srv/allocation-sim
REPO_URL="${REPO_URL:-https://gitlab.com/REPLACE_ME/allocation-sim.git}"

export DEBIAN_FRONTEND=noninteractive

# e2-micro has 1 GB RAM; a swap file keeps `pnpm install`/`tsc` from being OOM-killed.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y curl git postgresql debian-keyring debian-archive-keyring apt-transport-https gnupg

if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm install -g pnpm@10

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"

# Postgres: local socket only, peer auth for the app user.
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$APP_USER'" | grep -q 1 || sudo -u postgres createuser "$APP_USER"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='allocation_sim'" | grep -q 1 || sudo -u postgres createdb -O "$APP_USER" allocation_sim

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

install -d -o "$APP_USER" -g "$APP_USER" /var/backups/allocation-sim
for log in /var/log/allocation-backup.log /var/log/allocation-demo-reset.log; do
  touch "$log" && chown "$APP_USER:$APP_USER" "$log"
done

# The deploy script may restart the service and read its logs, nothing else.
cat > /etc/sudoers.d/allocation <<SUDO
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart allocation-api, /usr/bin/journalctl -u allocation-api *
SUDO
chmod 440 /etc/sudoers.d/allocation
visudo -cf /etc/sudoers.d/allocation
cp "$APP_DIR/infra/vm/allocation-api.service" /etc/systemd/system/
cp "$APP_DIR/infra/vm/Caddyfile" /etc/caddy/Caddyfile
cp "$APP_DIR/infra/vm/allocation.cron" /etc/cron.d/allocation-sim
systemctl daemon-reload
systemctl enable allocation-api
systemctl reload caddy || systemctl restart caddy

echo "Bootstrap done. Create $APP_DIR/apps/api/.env (see .env.example), then run infra/vm/deploy.sh as $APP_USER."
