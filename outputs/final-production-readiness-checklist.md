# FixNow Ghana Final Production Readiness Checklist

Generated: June 21, 2026

## Current Status

Status:

`Ready for controlled pilot after deployment`

Not yet:

`Ready for full public nationwide launch`

## Completed In Workspace

- [x] Offline-first reporting app
- [x] Accessibility and inclusion controls
- [x] Responder sync panel
- [x] Production-shaped backend API
- [x] SQLite database backend
- [x] Hashed passwords
- [x] Role-based users
- [x] Responder onboarding and admin approval
- [x] Moderation actions
- [x] Audit logs
- [x] Nginx/systemd/Docker deployment files
- [x] Backup/restore scripts
- [x] Healthcheck scripts
- [x] Android wrapper
- [x] Android release AAB candidate
- [x] Android signed AAB candidate
- [x] Store submission copy draft
- [x] Reviewer notes draft
- [x] Data safety and privacy answer draft

## Hardened In This Pass

- [x] App sync default changed from localhost to `https://api.fixnowghana.org`
- [x] App refuses non-local HTTP sync URLs
- [x] Release Android build no longer declares cleartext traffic
- [x] Debug Android build still permits localhost testing
- [x] Service worker cache version updated
- [x] Store submission pack created

## Must Be Done With External Access

- [ ] Buy or assign domain
- [ ] Point DNS for `api.fixnowghana.org`
- [ ] Provision cloud/server hosting
- [ ] Install backend on server
- [ ] Issue trusted TLS certificate
- [ ] Set production secrets on server
- [ ] Confirm production backup restore
- [ ] Add uptime monitoring
- [ ] Create Google Play Console app
- [ ] Upload signed AAB to internal testing
- [ ] Build/upload iOS app from macOS/Xcode
- [ ] Complete Apple Developer/App Store Connect setup
- [ ] Host privacy, terms, support, and deletion pages publicly
- [ ] Staff moderators
- [ ] Verify first responder agencies
- [ ] Complete Ghana legal/privacy review

## Real-Device Testing Needed

- [ ] Low-end Android phone
- [ ] Android TalkBack
- [ ] Android font scaling
- [ ] iPhone VoiceOver
- [ ] iOS Dynamic Type
- [ ] High contrast
- [ ] One-handed use
- [ ] Slow 2G/3G connection
- [ ] Offline report creation
- [ ] Sync retry after reconnect
- [ ] GPS denied flow
- [ ] Photo denied flow
- [ ] SMS/WhatsApp handoff

## Launch Decision

Pilot launch can begin when:

- Backend is deployed behind trusted HTTPS.
- At least one district/responder group is verified.
- Moderation coverage exists.
- Privacy/legal review approves pilot.
- Backup restore test passes.
- Internal Google Play test passes on real devices.

Full launch should wait until:

- Multiple responder groups are trained.
- Escalation procedures are tested.
- Accessibility audit is complete.
- Store review is passed.
- Support and deletion request handling are staffed.
