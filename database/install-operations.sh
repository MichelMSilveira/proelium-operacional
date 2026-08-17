#!/usr/bin/env bash
set -euo pipefail

cd /opt/proelium-operacional/database
install -o root -g root -m 644 proelium-backup.service /etc/systemd/system/proelium-backup.service
install -o root -g root -m 644 proelium-backup.timer /etc/systemd/system/proelium-backup.timer
install -o root -g root -m 644 proelium-restore-check.service /etc/systemd/system/proelium-restore-check.service
install -o root -g root -m 644 proelium-restore-check.timer /etc/systemd/system/proelium-restore-check.timer
systemctl daemon-reload
systemctl enable --now proelium-backup.timer proelium-restore-check.timer
systemctl start proelium-backup.service
systemctl start proelium-restore-check.service
systemctl is-active --quiet proelium-backup.timer
systemctl is-active --quiet proelium-restore-check.timer
