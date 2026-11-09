# FixNow Ghana Deployment Runbook

Generated: June 21, 2026

## Target Architecture

Public users and responder apps connect to:

`https://api.fixnowghana.org`

Nginx terminates HTTPS and proxies to:

`http://127.0.0.1:4180`

The Node API stores data at:

`/var/lib/fixnow-backend/fixnow.sqlite`

## Server Setup

1. Create a Linux server.
2. Open firewall ports `80` and `443`.
3. Keep the backend port `4180` private to localhost.
4. Install Node.js 22 or newer.
5. Create a service user:

```bash
sudo useradd --system --home /opt/fixnow-backend --shell /usr/sbin/nologin fixnow
sudo mkdir -p /opt/fixnow-backend /var/lib/fixnow-backend
sudo chown -R fixnow:fixnow /opt/fixnow-backend /var/lib/fixnow-backend
```

## Deploy Backend

Copy these files to `/opt/fixnow-backend`:

- `server.js`
- `README.md`
- `.env.example`

Create `/etc/fixnow-backend.env` from `templates/production.env.example`.

Required production values:

```text
HOST=127.0.0.1
PORT=4180
PUBLIC_ORIGIN=https://app.fixnowghana.org
REQUIRE_HTTPS=1
SEED_DEMO_ACCOUNTS=0
DATA_DIR=/var/lib/fixnow-backend
DB_FILE=/var/lib/fixnow-backend/fixnow.sqlite
BOOTSTRAP_ADMIN_PASSWORD=<long secret>
PASSWORD_PEPPER=<long secret>
```

Install service:

```bash
sudo cp deploy/systemd/fixnow-backend.service /etc/systemd/system/fixnow-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now fixnow-backend
sudo systemctl status fixnow-backend
```

## HTTPS

Install the Nginx config:

```bash
sudo cp deploy/nginx/fixnow-backend.conf /etc/nginx/sites-available/fixnow-backend
sudo ln -s /etc/nginx/sites-available/fixnow-backend /etc/nginx/sites-enabled/fixnow-backend
sudo nginx -t
sudo systemctl reload nginx
```

Request certificate after DNS points to the server:

```bash
sudo certbot --nginx -d api.fixnowghana.org
```

Confirm renewal:

```bash
sudo certbot renew --dry-run
```

## Smoke Test

```bash
curl -fsS https://api.fixnowghana.org/api/health
```

Expected result includes:

```json
{"ok":true,"service":"FixNow Ghana API","database":"sqlite"}
```

## Rollback

1. Keep previous backend release in `/opt/fixnow-backend/releases`.
2. Stop service.
3. Restore previous `server.js`.
4. Restore database from backup only if the new release changed data incorrectly.
5. Start service.
6. Confirm `/api/health`.
