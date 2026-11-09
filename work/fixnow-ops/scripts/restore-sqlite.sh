#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: restore-sqlite.sh /path/to/fixnow-backup.sqlite.gz"
  exit 1
fi

BACKUP="$1"
DB_FILE="${DB_FILE:-/var/lib/fixnow-backend/fixnow.sqlite}"
RESTORE_TMP="$DB_FILE.restore"

systemctl stop fixnow-backend

if [[ "$BACKUP" == *.gz ]]; then
  gzip -dc "$BACKUP" > "$RESTORE_TMP"
else
  cp "$BACKUP" "$RESTORE_TMP"
fi

cp "$DB_FILE" "$DB_FILE.before-restore.$(date -u +%Y%m%dT%H%M%SZ)"
mv "$RESTORE_TMP" "$DB_FILE"
chown fixnow:fixnow "$DB_FILE"

systemctl start fixnow-backend
systemctl status fixnow-backend --no-pager
