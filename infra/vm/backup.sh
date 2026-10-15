#!/usr/bin/env bash
# Nightly compressed Postgres dump, keeping 14 days. Run from cron as the app user.
set -euo pipefail

DIR=/var/backups/allocation-sim
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

pg_dump --format=custom --no-owner allocation_sim > "$DIR/allocation_sim-$STAMP.dump"
find "$DIR" -name 'allocation_sim-*.dump' -mtime +14 -delete

# Prove the dump is readable, not just present.
pg_restore --list "$DIR/allocation_sim-$STAMP.dump" >/dev/null
echo "backup ok: $DIR/allocation_sim-$STAMP.dump"
