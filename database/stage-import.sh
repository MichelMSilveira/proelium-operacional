#!/usr/bin/env bash
set -euo pipefail

cd /tmp/proelium-db-migration
npm ci --omit=dev --no-audit --no-fund

set -a
. /etc/proelium/database.env
set +a

npm run db:migrate
cp -a /var/lib/proelium-operacional/shared-data.json \
  /var/lib/proelium-operacional/shared-data.before-postgresql.json
PROELIUM_DATA_DIR=/var/lib/proelium-operacional npm run db:import
PROELIUM_DATA_DIR=/var/lib/proelium-operacional npm run db:verify

state_count=$(sudo -u postgres psql -d proelium -tAc 'select count(*) from app_state')
user_count=$(sudo -u postgres psql -d proelium -tAc 'select count(*) from app_users')
printf 'PostgreSQL validado: %s estado(s), %s usuário(s).\n' "$state_count" "$user_count"
