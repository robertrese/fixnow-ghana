# FixNow Ghana Production Backend

This backend is an interim responder API during the FixNow Ghana safety remediation. It is not a pilot-ready public reporting service.

It uses:

- SQLite database storage through Node's built-in `node:sqlite`
- Hashed passwords with per-user salts using `crypto.scrypt`
- Bearer sessions stored as token hashes only
- Responder onboarding requests and admin approval
- Role-based access for admin, moderator, and responder users
- Report sync, report patching, moderation actions, and audit logs
- Optional direct HTTPS, plus Nginx/Certbot deployment files for real public TLS

## Run Locally

```powershell
node work\fixnow-backend\server.js
```

Default local URL:

```text
http://localhost:4180
```

Health check:

```text
http://localhost:4180/api/health
```

On first run the server creates:

```text
work/fixnow-backend/data/fixnow.sqlite
```

## First Accounts

The first startup creates an `admin` user only when `BOOTSTRAP_ADMIN_PASSWORD` is supplied through the deployment environment. It creates no users when that value is absent.

Demo users are created only when `SEED_DEMO_ACCOUNTS=1` is explicitly set in a non-production demo or test environment:
  - `assembly` / `assembly123`
  - `nadmo` / `nadmo123`
  - `utility` / `utility123`
  - `moderator` / `moderator123`

For production, leave `SEED_DEMO_ACCOUNTS` unset and use a long secret `BOOTSTRAP_ADMIN_PASSWORD` from a secret manager.

## Important Environment Variables

Copy `.env.example` to your deployment environment manager.

```text
PORT=4180
HOST=127.0.0.1
PUBLIC_ORIGIN=https://app.fixnowghana.org
REQUIRE_HTTPS=1
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-long-secret
PASSWORD_PEPPER=replace-with-a-secret-not-stored-in-the-database
SEED_DEMO_ACCOUNTS=0
DATA_DIR=/var/lib/fixnow-backend
SESSION_TTL_HOURS=12
```

If you want the Node process itself to serve HTTPS, set both:

```text
TLS_KEY_PATH=/path/to/privkey.pem
TLS_CERT_PATH=/path/to/fullchain.pem
```

For most production deployments, use Nginx to terminate HTTPS and proxy to `http://127.0.0.1:4180`.

## Main Endpoints

Public:

- `GET /api/health`
- `POST /api/onboarding/request`
- `POST /api/login`

Authenticated:

- `POST /api/logout`
- `GET /api/me`
- `POST /api/change-password`
- `GET /api/reports`
- `POST /api/reports/sync` (interim authenticated responder sync only; not citizen submission)
- `PATCH /api/reports/:id`

Moderator or admin:

- `GET /api/onboarding/requests`
- `POST /api/onboarding/:id/reject`
- `POST /api/reports/:id/moderation`
- `GET /api/audit`
- `GET /api/events`

Admin only:

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/onboarding/:id/approve`

## Deployment Files

- `deploy/nginx/fixnow-backend.conf`
- `deploy/systemd/fixnow-backend.service`
- `deploy/docker/Dockerfile`

## Launch Notes

Before real public launch:

- Do not represent `/api/reports/sync` as a citizen-report submission API; Phase 3 must add a separately validated public endpoint.
- Put the API behind a trusted HTTPS domain.
- Change all bootstrap/demo passwords.
- Store `PASSWORD_PEPPER` in a secret manager, not in source code.
- Back up the SQLite database or move to managed PostgreSQL when traffic grows.
- Add uptime monitoring, log retention, incident response, and responder verification policy.
