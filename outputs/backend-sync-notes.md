# FixNow Ghana Backend Sync Notes

Generated: June 21, 2026

## What Is Now Built

The responder sync backend is now a production-shaped API at:

`work/fixnow-backend/server.js`

It keeps the app-compatible sync endpoints, but the internals are no longer a plaintext JSON demo.

It now supports:

- SQLite database storage at `work/fixnow-backend/data/fixnow.sqlite`
- Password hashing with per-user salts using Node `crypto.scrypt`
- Session tokens stored as hashes only
- Admin, moderator, and responder roles
- Real responder onboarding requests and approval
- Report upload/sync and shared case pulling
- Report status patching
- Moderation actions: flag, unflag, hide, unhide, approve, reject, escalate
- Audit log endpoint for moderation and admin review
- Rate limiting and API security headers
- Optional direct HTTPS with certificate files
- Production HTTPS reverse proxy deployment through Nginx and Certbot

## Run The Backend Locally

```powershell
node work\fixnow-backend\server.js
```

Default local URL:

`http://localhost:4180`

Health check:

`http://localhost:4180/api/health`

## Local First Accounts

On first database creation:

- `admin` / `ChangeMeAdmin!2026`
- `assembly` / `assembly123`
- `nadmo` / `nadmo123`
- `utility` / `utility123`
- `moderator` / `moderator123`

For real production, set:

- `BOOTSTRAP_ADMIN_PASSWORD` to a long secret
- `PASSWORD_PEPPER` to a secret stored outside the database
- `SEED_DEMO_ACCOUNTS=0`

## App Flow

1. User creates reports offline in the app.
2. Verified responder opens the Responder sync panel.
3. Responder enters the production API URL, username, and password.
4. `Login` creates a server session.
5. `Sync now` pushes local cases and pulls shared cases.
6. Moderators can review, hide, flag, approve, reject, or escalate reports.
7. Admins can approve responder onboarding requests and manage accounts.

## Production Files Added

- `work/fixnow-backend/.env.example`
- `work/fixnow-backend/deploy/nginx/fixnow-backend.conf`
- `work/fixnow-backend/deploy/systemd/fixnow-backend.service`
- `work/fixnow-backend/deploy/docker/Dockerfile`

## Still Needed Before Public Launch

- A real domain, for example `api.fixnowghana.org`
- Real TLS certificate issued by a trusted CA
- Server or cloud hosting
- Database backups and restore testing
- Monitoring and alerting
- Legal/privacy review for Ghana operations
- Human responder verification policy
- App Store and Play Store production signing/release setup
