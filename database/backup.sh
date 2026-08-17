#!/usr/bin/env bash
set -euo pipefail

set -a
. /etc/proelium/database.env
set +a

backup_dir=${PROELIUM_BACKUP_DIR:-/var/backups/proelium}
retention_days=${PROELIUM_BACKUP_RETENTION_DAYS:-30}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary="$backup_dir/proelium-$timestamp.dump.tmp"
destination="$backup_dir/proelium-$timestamp.dump"

install -d -m 700 "$backup_dir"
umask 077
pg_dump --format=custom --no-owner --no-privileges --file="$temporary" "$DATABASE_URL"
mv "$temporary" "$destination"
sha256sum "$destination" > "$destination.sha256"
find "$backup_dir" -type f \( -name 'proelium-*.dump' -o -name 'proelium-*.dump.sha256' \) -mtime "+$retention_days" -delete

printf 'Backup PostgreSQL concluído: %s\n' "$destination"
