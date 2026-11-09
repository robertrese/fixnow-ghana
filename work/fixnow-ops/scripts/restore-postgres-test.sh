#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_TEST_DATABASE_URL:?RESTORE_TEST_DATABASE_URL is required and must target a disposable database}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY is required}"

if [ "$#" -ne 1 ]; then
  echo "Usage: restore-postgres-test.sh /path/to/fixnow.dump.age"
  exit 1
fi

BACKUP="$1"
sha256sum --check "$BACKUP.sha256"
TEMP_DUMP="$(mktemp)"
trap 'rm -f "$TEMP_DUMP"' EXIT
age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$TEMP_DUMP" "$BACKUP"
pg_restore --dbname="$RESTORE_TEST_DATABASE_URL" --clean --if-exists --no-owner --no-acl "$TEMP_DUMP"
psql "$RESTORE_TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM schema_migrations;"
psql "$RESTORE_TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM boundary_datasets WHERE active;"
psql "$RESTORE_TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM reports;"

echo "Restore verification completed against the disposable test database."
