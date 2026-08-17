#!/usr/bin/env bash
set -euo pipefail

set -a
. /etc/proelium/database.env
set +a

backup_dir=${PROELIUM_BACKUP_DIR:-/var/backups/proelium}
latest=$(find "$backup_dir" -maxdepth 1 -type f -name 'proelium-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
test -n "$latest"
sha256sum --check "$latest.sha256"

sudo -u postgres dropdb --if-exists proelium_restore_check
sudo -u postgres createdb -O proelium_app proelium_restore_check
trap 'sudo -u postgres dropdb --if-exists proelium_restore_check' EXIT
restore_url="${DATABASE_URL%/*}/proelium_restore_check"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$restore_url" "$latest"

state_count=$(sudo -u postgres psql -d proelium_restore_check -tAc 'select count(*) from app_state')
user_count=$(sudo -u postgres psql -d proelium_restore_check -tAc 'select count(*) from app_users')
test "$state_count" -ge 1
test "$user_count" -ge 1
printf 'Restauração validada: %s estado(s), %s usuário(s).\n' "$state_count" "$user_count"
