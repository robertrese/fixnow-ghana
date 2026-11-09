# FixNow Ghana Release Hardening Notes

Generated: June 21, 2026

## Changes Made

The app and Android wrapper were hardened for a production release candidate.

Frontend:

- Default responder API changed to `https://api.fixnowghana.org`.
- Non-local HTTP sync servers are rejected before credentials are sent.
- Local HTTP is still allowed only for localhost-style development hosts.
- Responder sync text no longer points users to demo credentials.
- Service worker cache moved to `fixnow-ghana-v6`.

Android:

- Release builds no longer declare cleartext traffic.
- Main network security config disallows cleartext.
- Debug builds keep localhost cleartext config for local testing.
- Signed release candidate AAB regenerated after hardening.

Store materials:

- Store listing draft created.
- Reviewer notes created.
- Google Play Data safety draft created.
- Apple App Privacy draft created.
- Final production readiness checklist created.

## Important Production Assumption

The production backend URL is currently set to:

`https://api.fixnowghana.org`

If the real domain is different, update `DEFAULT_SYNC_SERVER` in:

`outputs/fixnow-ghana.html`

Then rebuild Android and re-sign the release AAB.
