# Incident Response Runbook

Generated: June 21, 2026

## Severity Levels

| Severity | Meaning | First Response |
| --- | --- | --- |
| SEV1 | App down, data leak, serious safety risk | 15 minutes |
| SEV2 | Sync broken, login broken, moderation blocked | 1 hour |
| SEV3 | Minor bug or non-critical report issue | 1 business day |

## First 15 Minutes

1. Confirm the issue with `/api/health`.
2. Check `systemctl status fixnow-backend`.
3. Check Nginx status and TLS certificate expiry.
4. Pause public launch campaign if safety or privacy is affected.
5. Assign one incident lead and one note taker.

## Data Or Safety Incident

1. Disable affected endpoint or hide affected reports.
2. Preserve logs and audit entries.
3. Rotate secrets if compromise is possible.
4. Notify leadership and legal reviewer.
5. Prepare user notification if legally required.

## Recovery

1. Deploy fix or rollback.
2. Restore database only when corruption is confirmed.
3. Verify healthcheck.
4. Write a short incident report within 48 hours.

## Privacy And Evidence Containment

1. Revoke affected responder and citizen sessions.
2. Disable signed attachment issuance or rotate `ATTACHMENT_SIGNING_SECRET` when evidence access may be compromised.
3. Keep quarantined objects private; do not copy evidence into tickets, chat, or ordinary email.
4. Preserve immutable audit records and provider outcome identifiers without adding report text, phone numbers, coordinates, secrets, or image data to monitoring logs.
5. Ask the Ghana privacy/legal lead to decide regulator and affected-person notification obligations.

## Restore And Return To Service

1. Restore only into an isolated verification database first.
2. Run migration, boundary-count, spatial-validity, report-count, and authentication checks.
3. Compare encrypted-backup checksum and record the restore-test result.
4. Re-enable traffic gradually and watch readiness, error rate, login lockouts, scanner backlog, and delivery failures.
5. Run a tabletop exercise before pilot launch and every six months.

Named incident leads, legal contacts, infrastructure owners, and provider escalation contacts must be filled in by the owner before launch. Placeholders are not operational contacts.
