#!/usr/bin/env bash
set -euo pipefail

DB_FILE="${DB_FILE:-/var/lib/fixnow-backend/fixnow.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fixnow-backend}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/fixnow-$STAMP.sqlite"

mkdir -p "$BACKUP_DIR"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
else
  cp "$DB_FILE" "$BACKUP_FILE"
fi

gzip -f "$BACKUP_FILE"
find "$BACKUP_DIR" -name "fixnow-*.sqlite.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Created backup: $BACKUP_FILE.gz"
