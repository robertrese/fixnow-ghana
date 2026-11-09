#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/fixnow-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$BACKUP_DIR/fixnow-$STAMP.dump.age"

mkdir -p "$BACKUP_DIR"
umask 077
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$OUTPUT"
sha256sum "$OUTPUT" > "$OUTPUT.sha256"
find "$BACKUP_DIR" -name 'fixnow-*.dump.age' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'fixnow-*.dump.age.sha256' -mtime +"$RETENTION_DAYS" -delete

echo "Encrypted backup created: $OUTPUT"
