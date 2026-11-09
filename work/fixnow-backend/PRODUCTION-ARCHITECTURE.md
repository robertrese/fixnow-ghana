# Controlled-Pilot Production Architecture

## Implemented In The Pilot API

- Scrypt password hashing with a separate production pepper.
- Short-lived responder and citizen sessions with revocation.
- Account/IP rate limiting and persistent responder lockout state.
- Strict origin checks, restrictive CORS, CSP, request limits, and trusted-proxy opt-in.
- Private quarantine storage with signature validation and random object names.
- Five-minute signed attachment URLs that re-check responder scope at redemption.
- Optional HTTPS scanner and monitoring webhooks without simulated success.
- Health and readiness endpoints, immutable audit/history, retention dry-run/execution, and demo/production fail-fast checks.

## Production Data Plane

Run PostgreSQL with PostGIS and apply `deploy/postgres/000_core.sql`, `001_secure_location.sql`, and `002_operations_security.sql` in order. Geographic matching uses `ST_Covers` against the active, versioned GSS MMDA dataset and GiST indexes. The public API must query a redacted location view rather than the private point table.

Private evidence belongs in a private object-storage bucket with public access blocked, server-side encryption enabled, object versioning, lifecycle rules, and malware scanning. The API stores only an opaque object key. Owner-managed credentials come from a secret manager. Browser clients receive only five-minute application-signed URLs after responder scope checks.

The checked-in Node service remains the SQLite local/controlled-pilot adapter. Do not point `DATABASE_URL` at production and assume the adapter has switched. A production release must complete the PostgreSQL repository adapter and run the contract suite against PostGIS before traffic is enabled.

## Owner Gates

Provisioning DNS, TLS, PostGIS, object storage, scanner, monitoring, encrypted backup keys, and secret-manager values requires owner approval. Run the restore test before pilot launch and quarterly afterward. Keep `SEED_DEMO_ACCOUNTS=0` in production.
