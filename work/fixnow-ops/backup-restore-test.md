# Backup And Restore Verification

1. Create an owner-managed age encryption recipient and store the private identity outside the application server.
2. Run `scripts/backup-postgres-encrypted.sh` from a restricted backup worker.
3. Copy the encrypted dump and checksum to versioned storage in a separate failure domain.
4. Point `RESTORE_TEST_DATABASE_URL` only at a disposable isolated database.
5. Run `scripts/restore-postgres-test.sh backup.dump.age`.
6. Record migration count, active boundary count, report count, duration, operator, and date.
7. Run API contract tests against the restored database before declaring the restore successful.

Backups are not considered operational until one restore test has passed. Repeat monthly during the controlled pilot and after schema changes.
