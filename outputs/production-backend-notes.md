# FixNow Ghana Production Backend Notes

Generated: June 21, 2026

## Completed In This Build

The backend has been upgraded from a local demo into a production-shaped API:

- Real SQLite database instead of JSON files
- Hashed passwords with unique salts
- Session token hashes instead of storing raw tokens
- Admin, moderator, and responder roles
- Public responder onboarding request endpoint
- Admin approval flow that creates responder accounts
- Moderation workflow for sensitive or unsafe reports
- Audit log for login, sync, onboarding, user, and moderation actions
- API rate limiting and security headers
- HTTPS support through certificate files
- Nginx HTTPS deployment config
- systemd service file
- Dockerfile for container deployment

## Production Backend Location

Source:

`work/fixnow-backend/`

Main server:

`work/fixnow-backend/server.js`

Deployment examples:

`work/fixnow-backend/deploy/`

Packaged source:

`outputs/fixnow-backend-source.zip`

Launch operations pack:

`outputs/fixnow-launch-ops-pack.zip`

## Recommended Production Setup

1. Host the backend on a Linux server or cloud service.
2. Point a domain such as `api.fixnowghana.org` to the server.
3. Use Certbot/Let's Encrypt to issue a trusted HTTPS certificate.
4. Run Node on `127.0.0.1:4180`.
5. Put Nginx in front of Node and proxy HTTPS traffic to the API.
6. Store `PASSWORD_PEPPER` and admin password in protected environment secrets.
7. Set `SEED_DEMO_ACCOUNTS=0`.
8. Back up `fixnow.sqlite`, or move to managed PostgreSQL when usage grows.

## What Else Is Needed

The backend code is now much stronger, but real launch still needs operational work:

- A live server or cloud account
- Trusted HTTPS certificate on a real domain
- Production secrets and password rotation
- Backups, uptime monitoring, logs, and alerting
- Human moderation staffing
- Official responder verification and removal process
- Abuse reporting and emergency escalation procedure
- Native iOS build/signing on macOS
- Android Play signing and final release track setup
- Full accessibility audit on real devices
- Ghana-specific privacy and data retention review

## Security Notes

Passwords are hashed with Node `crypto.scrypt`, using a unique salt per user. Session tokens are only shown once to the client; the database stores a SHA-256 hash of each token.

For production, Argon2id is still preferred when a vetted dependency and build pipeline are available. This no-dependency build uses scrypt because it is available in Node locally and is an accepted modern password hashing option when configured with a strong work factor.
