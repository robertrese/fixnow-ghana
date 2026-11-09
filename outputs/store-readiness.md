# FixNow Ghana Store Readiness

Updated: August 10, 2026

## Product Position

App name: FixNow Ghana

Short description: Report community problems privately, follow verified action, and help Ghanaian responders coordinate a resolution.

The citizen app supports anonymous reporting, optional accounts, guided six-step intake, offline queues, approximate public locations, private exact locations, evidence, duplicate suggestions, trusted sharing, report tracking, and moderator-verified public updates. Separate authenticated workspaces support responder operations and administration.

## Implemented Release Controls

- Privacy, terms, support, consent, export, and deletion surfaces
- Optional exact location, contact details, and photo evidence
- Anonymous use without creating an account
- Hashed passwords, expiring sessions, responder lockout, roles, and server-enforced scope
- User-generated-content moderation, audit history, evidence quarantine, and optional scan integration
- Truthful routing and delivery states that require external outcome evidence
- Signed five-minute private attachment URLs with scope revalidation and no-store responses
- Offline idempotent submission and responder update queues
- Android HTTPS-style bundled origin, no file access, no release cleartext traffic, and no broad storage permission
- Large text, high contrast, reduced motion, keyboard focus, simple mode, one-handed mode, and 44px targets
- English interface with language-help content for Twi, Ga, Ewe, Hausa, Dagbani, and Fante; full human-reviewed translations remain launch work

## Google Play Data Safety Draft

Potentially collected data: user-generated report text, optional contact information, optional precise location, optional photos, report status/activity, account identifier when an account is used, and security/audit events.

Purpose: app functionality, case routing, fraud/abuse prevention, security, moderation, support, and service improvement. Public views receive only moderated content and MMDA-safe approximate locations. Reporter identity is private by default.

No advertising ID or tracking SDK is included. Final Play declarations must be validated against the deployed production integrations and retention policy by the owner and Ghana privacy counsel.

## Apple Privacy Draft

Likely disclosed types are Contact Info, Precise Location, User Content, Identifiers, and Usage/Security Data. Data is linked to an account only when the citizen chooses account-associated reporting. The app does not use data for cross-company tracking.

This is a declaration draft, not a submitted App Store privacy label.

## Submission Gates Outside This Workspace

- Deploy the API on an owner-controlled domain with trusted TLS and production secrets
- Complete a real PostgreSQL/PostGIS adapter cutover; the checked-in runtime still uses SQLite for controlled pilots
- Run and record an encrypted backup restore test and monitoring alert test
- Staff moderation, support, privacy requests, and verified responder onboarding
- Complete Ghana legal/privacy review and responder-agency agreements
- Run TalkBack, font-scale, low-storage, poor-network, and low-end physical Android testing
- Create the Play Console record, complete declarations/content rating, provide screenshots, and upload to internal testing
- Build the iOS wrapper on macOS, run VoiceOver/Dynamic Type testing, sign it, and upload through App Store Connect
- Publish public HTTPS privacy, terms, support, and account-deletion URLs

Store acceptance cannot be guaranteed by source code alone. Release only after the owner-controlled operational and review gates above are complete.
