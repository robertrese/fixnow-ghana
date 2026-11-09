# FixNow Ghana Store Submission Pack

Generated: June 21, 2026

## App Identity

App name:

`FixNow Ghana`

Package:

`com.fixnowghana.command`

Primary category:

`Productivity` or `Tools`

Secondary positioning:

`Civic reporting, field operations, community safety`

Age target:

`16+` recommended. The app can be used by younger people, but public civic reporting, location, photos, and safety-sensitive reports should not be positioned as child-directed.

## Short Description

Report local issues, save cases offline, and help verified responders coordinate safer action.

## Full Description

FixNow Ghana helps people report practical community problems such as blocked drains, road hazards, sanitation issues, flooding risks, utility faults, and unsafe public spaces.

The app is built for real conditions: low connectivity, shared phones, different literacy levels, older users, field workers, and people with disabilities. Reports can be prepared offline, exported, shared by SMS or WhatsApp, or synced to a verified responder API when an approved responder account is available.

Key features:

- Guided step-by-step reporting
- Simple mode and field mode
- Offline report saving
- SMS and WhatsApp report sharing
- Anonymous public reporting options
- Sensitive location protection
- Larger text, high contrast, and non-color-only severity labels
- Local language help text
- Responder sync for verified official desks
- Moderation and audit-ready backend support

FixNow Ghana is not a replacement for emergency services. For immediate danger, users should contact the appropriate emergency or local authority channels.

## App Review Notes

This app is a civic issue reporting and responder coordination tool for Ghana.

Important review context:

- Users can create reports without an account.
- Reports are saved locally first and can work offline.
- Responder sync requires an approved responder account.
- Public views hide reporter identity by default.
- Sensitive reports should not expose exact location unless responders need it.
- The production backend uses HTTPS, hashed passwords, role-based responder access, moderation actions, and audit logs.
- The app does not contain ads, in-app purchases, or payments.
- Location is only requested after user action.
- Photo/file attachment is user-initiated.

Suggested demo account for review:

Create a temporary responder account in the production backend before submission, then delete it after review.

Reviewer test flow:

1. Open the app.
2. Create a guided report.
3. Save it offline.
4. Open Responder sync.
5. Log in with temporary reviewer responder account.
6. Sync the report.
7. Confirm the report appears in the shared case queue.

## Google Play Data Safety Draft

Final answers must be checked in Play Console against the final app and backend.

Likely collected data:

- Location: optional, only when the user adds GPS/location to a report.
- Photos or files: optional, only when the user attaches evidence.
- Personal info: optional contact details in reports; required responder account details for verified responders.
- User-generated content: report descriptions, categories, severity, community, and case notes.
- App activity: responder sync actions and moderation/audit events on the backend.

Likely not collected:

- Advertising ID
- Contacts
- Calendar
- Health data
- Payment info
- Browsing history

Security practices:

- Data encrypted in transit when using production HTTPS sync.
- Passwords hashed server-side.
- Session tokens stored server-side as hashes.
- Users can request deletion through support process.

Sharing:

- Reports may be shared with verified responders or service providers operating the backend.
- User-initiated SMS/WhatsApp sharing happens only when the user chooses that action.
- No ad network sharing is planned.

## Apple App Privacy Draft

Final answers must be completed in App Store Connect by the Apple account holder.

Likely data categories:

- Contact Info: optional reporter contact details; responder account contact details.
- User Content: report descriptions, photos, notes.
- Location: optional approximate/precise location when added to a report.
- Identifiers: responder account/session identifiers on the backend.

Tracking:

`No`, unless analytics or third-party advertising SDKs are added later.

Linked to user:

- Responder account data is linked to responder accounts.
- Anonymous public reports should not be linked to a user unless optional contact details are provided.

## Screenshot Plan

Required screenshots should show:

1. Main report dashboard with Ghana-focused case types.
2. Guided reporting mode.
3. Accessibility/simple mode or large text mode.
4. Offline queue/report saved state.
5. Responder sync panel with HTTPS server URL.
6. Moderation or case status view if included in final reviewer build.

Avoid screenshots that expose real names, phone numbers, exact sensitive locations, or unverified government affiliation.

## Support And Policy URLs

Before submission, host these publicly:

- Privacy policy
- Terms
- Support page
- Account/data deletion request instructions

Local files already exist:

- `outputs/privacy.html`
- `outputs/terms.html`
- `outputs/support.html`

## Official Submission References

- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Android app signing: https://developer.android.com/studio/publish/app-signing
- Apple App Store Connect build upload: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
