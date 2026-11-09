# FixNow Ghana Master Launch Checklist

Generated: June 21, 2026

## Domain

- [ ] Buy or assign the production domain.
- [ ] Create `api.fixnowghana.org` DNS record pointing to the backend server.
- [ ] Create `app.fixnowghana.org` or landing/support domain if the web app is public.
- [ ] Confirm DNS propagation before requesting certificate.

## HTTPS

- [ ] Install Nginx on the server.
- [ ] Install Certbot.
- [ ] Request a Let's Encrypt certificate for `api.fixnowghana.org`.
- [ ] Enable automatic certificate renewal.
- [ ] Confirm the API only accepts HTTPS in production.

## Server

- [ ] Create a Linux server with firewall enabled.
- [ ] Install Node.js 22 or newer.
- [ ] Create `fixnow` system user.
- [ ] Deploy `work/fixnow-backend`.
- [ ] Install `fixnow-backend.service`.
- [ ] Set production environment variables in `/etc/fixnow-backend.env`.
- [ ] Set `SEED_DEMO_ACCOUNTS=0`.
- [ ] Start and enable the service.

## Secrets

- [ ] Generate a long `BOOTSTRAP_ADMIN_PASSWORD`.
- [ ] Generate a long `PASSWORD_PEPPER`.
- [ ] Store secrets in a password manager or cloud secret manager.
- [ ] Rotate bootstrap password after first admin login.
- [ ] Never publish keystores, passwords, private keys, or `.env` files.

## Database

- [ ] Confirm database path is `/var/lib/fixnow-backend/fixnow.sqlite`.
- [ ] Enable daily backups.
- [ ] Test restore from backup.
- [ ] Define backup retention.
- [ ] Move to managed PostgreSQL when traffic or team size requires it.

## Monitoring

- [ ] Add uptime monitor for `/api/health`.
- [ ] Add disk usage alert.
- [ ] Add service down alert.
- [ ] Add failed login and moderation volume review.
- [ ] Create incident contact list.

## Moderation And Safety

- [ ] Assign moderation lead.
- [ ] Assign first moderator shift coverage.
- [ ] Approve report handling rules.
- [ ] Approve escalation contacts.
- [ ] Train moderators on sensitive reports and identity protection.

## Responder Onboarding

- [ ] Define accepted responder agencies.
- [ ] Define verification documents.
- [ ] Define approval authority.
- [ ] Approve account removal process.
- [ ] Test onboarding request and approval flow.

## Privacy And Legal

- [ ] Complete Ghana data protection review.
- [ ] Confirm lawful basis and consent language.
- [ ] Confirm location data handling.
- [ ] Confirm retention periods.
- [ ] Confirm deletion/export request procedure.
- [ ] Review privacy policy and terms before store submission.

## Google Play

- [ ] Create Google Play Console app record.
- [ ] Enroll in Play App Signing.
- [ ] Generate and protect upload key.
- [ ] Sign final AAB.
- [ ] Complete Data safety form.
- [ ] Upload screenshots, icon, privacy policy URL, and support URL.
- [ ] Submit internal test before production.

## Apple App Store

- [ ] Enroll in Apple Developer Program.
- [ ] Build native iOS wrapper on macOS with Xcode.
- [ ] Create App Store Connect app record.
- [ ] Configure certificates/profiles.
- [ ] Upload build through Xcode or Transporter.
- [ ] Complete privacy, accessibility, age rating, and review information.
- [ ] Submit TestFlight before App Review.
