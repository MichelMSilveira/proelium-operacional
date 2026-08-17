#!/usr/bin/env bash
set -euo pipefail

cd /tmp/proelium-db-migration
set -a
. /etc/proelium/database.env
set +a

sudo -u postgres dropdb --if-exists proelium_test
sudo -u postgres createdb -O proelium_app proelium_test
trap 'sudo -u postgres dropdb --if-exists proelium_test' EXIT

export DATABASE_URL="${DATABASE_URL%/*}/proelium_test"
npm run db:migrate
node --test test/storage.test.js
