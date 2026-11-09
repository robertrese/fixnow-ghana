# FixNow Ghana: V2 build brief

Prepared 8 November 2026 for whoever implements the next pass (Codex or Claude).
Project root: `C:\Users\tyres\Documents\Codex\2026-06-14\i-want-an-app-that-solves`

## What this pass is

Bring the working app in `outputs/fixnow-ghana.html` up to the Figma **V2** design that the owner approved. Also fix the regressions found in the 8 November audit. This is a focused redesign of the citizen screens on top of working code. Do **not** restart, rebuild from scratch, or change backend security, privacy or authorisation logic, except where this brief says so.

### Sources, in priority order

1. **This brief.** Where it disagrees with the Figma frames, follow this brief. It corrects known mistakes in the mockups.
2. **Figma file `966c69YLRQkHPznlDQOHfW`**, page `02 Proposed mobile redesign`, frames:
   - `v2-welcome`, `v2-home`
   - `v2-report-step-1` to `v2-report-step-6`, `v2-report-success`
   - `v2-my-reports`, `v2-find-report`, `v2-report-timeline`
   - `v2-nearby`, plus the two frames in the `canvas` group: report detail and similar-report warning
   - `v2-profile-1`, `v2-profile-2`

   Ignore the older `Home/Nearby/Report/My reports/Profile — proposed` frames. They are the 13 August direction that the current build already follows.
3. **Local copies of those frames:** `design/v2-handoff/reference/*.png`. These are screenshots of the same board, saved 14 and 15 August. The board was unchanged on 8 November.
4. **New artwork:** `design/v2-handoff/illustrations/`. You can see it in `illustrations/preview.png`.

### Before you change anything

The project folder has a `.git` directory but **no commits**, so there is nothing to roll back to yet. Make a baseline commit first:

1. Add these lines to `.gitignore`. They are large or local-only folders that the current rules miss:
   ```
   node_modules/
   outputs/oracleJdk-27/
   work/fixnow-android/.gradle-user/
   work/fixnow-backend/data-sources/
   work/fixnow-backend/*-data/
   work/fixnow-backend/test-data-browser/
   ```
   `outputs/oracleJdk-27/` is a full JDK that was unpacked into the web folder on 24 October. The Android build does not use it. Move it out of `outputs/` if the owner agrees.
2. Run `git add -A`. Then check `git status --short`: it must not list `work/fixnow-secrets/`, `*.p12`, `*.sqlite*`, Gradle caches or the JDK.
3. Commit with the message "Baseline before V2 pass".

## Already working (verified 8 Nov 2026, keep it working)

These checks were run on a copy of the project:

- **Test suite:** `npm run check` passes all 12 phase tests, the offline test and the backend API test. The API test is a real integration test with 145 assertions.
- **Online submission:** going through the wizard gives "Report confirmed", with a server reference such as `FN-03116F…` and a long private tracking secret.
- **Offline submission:** gives "Submission queued", with a temporary `LOCAL-…` reference and the line "not an official case until the server confirms it".
- **Reconnection:** the queued report synced once and received its own `FN-` reference. No duplicates were created.
- **Also in place:** tracking from another device, responder scope (403 when out of area), the immutable history, consent, export and delete of local data, the demo/production split (`?demo=1`), the service worker skipping `/api/`, and the Android dialler using `ACTION_DIAL`.

Most phase tests only check that strings exist in the source. After every change, also check that the screens actually behave correctly in a browser at 390×844 and at 320×640.

## 1. Fix these regressions first

1. **Emergency hotlines are hidden on phones.**
   - The mobile media query sets `.emergency-cards, .urgent-panel small { display: none; }`. The cause is around line 2874 of `fixnow-ghana.html`.
   - On a phone, Home shows only small red text, "Call 112 first.", and no way to call Police, Fire or Ambulance.
   - The "Emergency contact details" modal lists only "last verified" text. It shows no numbers and no call buttons.
   - The owner explicitly wants these numbers prominent. See the Home section below.
2. **Profile has a raw `tel:112` link.** It is in `<section class="profile-hotline">` and skips the call-confirmation dialog.
   - Replace it with a `data-emergency-service="general-emergency"` button.
   - `outputs/emergency-contacts.test.js` currently fails for exactly this reason. It is not part of `npm run check`, so add it to that script.
3. **"People affected" defaults to 25** (`<input id="affected" … value="25">`). Every report that leaves it alone claims 25 people. Make the field empty and optional.
4. **Pages show duplicate headings.** For example: "My reports / My reports", "Nearby reports / Nearby and verified", and "Profile and access / Your FixNow profile". Use one header per page, in the style shown below.

## 2. Visual system (from V2)

- **Colours:** keep the existing `:root` tokens.
  - Primary buttons and the centre Report button use deep green `--brand-nav #0d2a22`.
  - Selected and success states use `--brand-primary #0a7a52`.
  - Red `#ce3840` and burgundy `--brand-emergency #72262e` are **only** for emergency and danger.
  - Gold `#e8aa17` is for attention and the "assigned" state.
  - Use cream page backgrounds and white cards with a 1px `#dbe5df` border.
  - Do not use gradients, glass effects or heavy shadows.
- **Page header** (every screen):
  - White bar with the FN logo (`icon.svg`, 40px).
  - Page title, 18px bold, with a one-line subtitle. Examples: "My reports / Private to this device", "Nearby / Verified community reports".
  - Wizard screens use "New report / Step N of 6".
  - Leave out the avatar circle from the mockups. It does nothing.
- **Bottom navigation is the same on every screen:** Home · Nearby · **Report** (raised deep-green circle) · My reports · Profile.
  - This includes the find-report, timeline, success, report-detail and similar-report screens.
  - Never use the labels "New Report" or "Account".
  - Icons and labels are centred equally, and the active tab uses both icon and text weight.
- **Spacing:**
  - Leave 16px side margins.
  - Each page needs `padding-bottom: calc(nav height + env(safe-area-inset-bottom) + 24px)`, so that no notice, tag, consent box, Submit button, hotline or last card sits under the nav.
- **Type and controls:**
  - Body text is at least 15px, page headings 24–28px.
  - Controls are at least 48px tall, with 12px card corners.
  - Statuses always use words, never colour alone.

## 3. Screens

### Welcome (first run): `v2-welcome`

- Show the FN logo, "FixNow Ghana", and "Report it. Track it. Fix it."
- Use **`illustrations/ghana-map.svg`**, the Ghana silhouette with report pins.
  - Never use a generic location pin.
  - Never use the pixelated map from the 14 August frame.
- Add the red/gold/green strip along the bottom edge.
- Buttons: **Get started** (primary) and **Track a report** (outline).
  - Show "Sign in" only when `/api/public/config` reports `citizenAccounts.phoneOtp.enabled`.
  - Do not show "Continue without account" as if an account were the default. Anonymous reporting **is** the default.
- After the welcome, keep the three required consent checkboxes from the current modal (privacy, truthful reporting, emergencies go to 112 first). Show them on a short "Before you start" screen, then go to Home.

### Home: `v2-home`

1. Greeting, then "How can we help today?"
2. **Report a new problem**: a full-width deep-green card with "Takes about 3 minutes". Replace the blank white circle in the mockup with a `+` icon.
3. **Danger right now? Call 112**: a full-width red card that opens the confirmation for General Emergency 112.
4. **Common problems**: a 2×3 grid of tinted tiles. Each tile shows the illustration at about 52px and a label:
   - Flooding: `category-flooding.svg`, tint `#e4eef8`
   - Broken road: `category-road.svg`, tint `#fbf1d3`
   - Waste: `category-waste.svg`, tint `#e3f1ea`
   - Water outage: `category-water.svg`, tint `#e3f1f1`
   - Electricity: `category-electricity.svg`, tint `#fbf1d3`
   - Unsafe area: `category-unsafe.svg`, tint `#f8e3e4`

   Tapping a tile starts the wizard with that category already selected.
5. **Emergency hotlines** list, with every row visible (no clipping):
   - General Emergency 112
   - Ghana Police Service 191
   - Ghana National Fire Service 192
   - National Ambulance Service 112 (alternative 193)

   Each row has a CALL button that opens the existing confirmation dialog: "Call Ghana National Fire Service at 192?", with Cancel and Call 192. Take the numbers from `emergency-contacts.js`. Do not hard-code them.

   Under the list, add the line: "FixNow helps with follow-up. It does not replace emergency services."
6. **Nearby preview** (two or three verified reports) and **Find your report**.

   With no verified data, show the honest empty state. Never invent sample reports outside `?demo=1`.

### Report wizard: `v2-report-step-1` to `v2-report-step-6`

Reorder the steps to match V2, keeping every existing field ID and the draft, queue and idempotency code:

| Step | V2 title | Contents |
|---|---|---|
| 1 | What happened? | List of the six categories, each with its illustration in a 44px tinted circle and a one-line description. Same artwork as Home. Keep `Other` in a "More types" link. |
| 2 | Where is it? | Map picker, place search, **Use current GPS location**, GhanaPostGPS and region/district/community fields. Add a "Location privacy" note: exact point is seen only by authorised responders, the public sees an approximate area. Keep `exactLocationConsent`. The note must be fully visible above the nav. |
| 3 | Describe the problem | Short title (required) and description. Subcategory chips per category, replacing the mockup's "Useful tags" (flooding chips: Blocked drain, Overflowing gutter, Flooded road, Water in homes). People affected (empty, optional). How long: Today / 2–7 days / 1–4 weeks / Over a month, mapped to `problemStarted`. **Immediate danger: labelled Yes / No buttons**, not unlabelled circles. Choosing Yes shows the 112 card straight away. Access blocked and Getting worse as Yes/No. Severity as a four-way segmented control (Low / Medium / High / Critical). |
| 4 | Add photos | Take photo / Add from gallery, up to **5** (the existing limit; the mockup's "4" is wrong). Thumbnails with remove buttons. Label the empty slot "Add another". Keep the on-device re-encode and EXIF/GPS stripping, with the message saying so. Never show a photo of a different problem. |
| 5 | Your contact (optional) | Name and phone (`contact`), with: "Only authorised responders can see this. It is never shown publicly." Keep `contactConsent` and the account-associated option, shown only when accounts are enabled. |
| 6 | Review & submit | Summary cards for category, location (with the privacy line), description and severity, photos and contact. Then run the duplicate check (similar-report warning, below). **Move `caseConsent` here**, above Submit. The button reads **Submit report**. Both stay visible above the nav. |

Wording rules for the wizard:

- Do **not** say "submitting to municipal authorities". Say "FixNow will review your report and route it to the responsible office."
- Do **not** say "Your contact details are encrypted". The app has no application-level encryption; access control is what protects them.

### Submission result: replaces `v2-report-success`

Build two separate screens. Never use one combined message.

- **Online, server confirmed:**
  - Green tick and "Report submitted".
  - Reference `FN-…` and private tracking secret, each with **Copy**.
  - A **Save both** action that downloads or shares a small text note without exposing the secret anywhere public.
  - Buttons: Track this report, Done.
  - Line: "Keep both private. You need both to track this report on another phone."
- **Offline, queued:**
  - Clock icon and "Saved and waiting to send".
  - The temporary `LOCAL-…` reference, plus "It will send automatically when you're back online. It is not an official report until FixNow confirms it."
  - Buttons: Retry now, View in My reports.
  - No tracking secret until the server confirms.

### My reports: `v2-my-reports`, `v2-find-report`, `v2-report-timeline`

- **List screen:**
  - Search box ("Find my report").
  - Segmented control "On this device · N" / "Account · N". Show the Account side only when accounts are enabled.
  - Cards show the reference, status pill (In progress, Assigned, **Waiting to send** for queued items, Resolved), title, area, a four-segment progress bar (Submitted, Under review, Assigned, Resolved), and "Updated … · Tap to view timeline".
  - Footer note: "Exact locations and contacts stay private."
- **Find report securely:** reference and tracking secret fields, Find report button, and a privacy notice. The secret is long; do not copy the mockup's "8-digit" hint.
- **Timeline:**
  - Report title, approximate area, and a vertical timeline from the real history (status, public message, date).
  - "Refresh timeline" button.
  - Show the "Get progress alerts" toggle only if notifications really work. Otherwise leave it out or mark it "Planned".

### Nearby: `v2-nearby`, plus report detail and similar-report warning from the `canvas` group

- **Main screen:**
  - Search, Map view / List view, and filter chips (All problems, Within 10 km, Open), with no colour-only meaning.
  - "Verified reports" cards: thumbnail, title, distance, last update and status.
  - While Google Maps is not configured, keep the existing honest "Live map is not configured yet" state. Do not draw fake streets or pins.
- **Public photos (needs backend work):** the owner wants photos on verified reports. Today all uploads are private evidence.
  - Add a moderator action, "Approve photo for public view", which re-checks for faces, plates and house numbers and stores a public derivative.
  - Add a public endpoint that serves only approved derivatives.
  - Until a photo is approved, show the category illustration as the thumbnail. **Never show a blank grey placeholder and never show raw uploads.**
- **Report detail:**
  - Category and status pills, title, approximate location ("Approximate location shown to protect reporter privacy"), approved photos (or the category illustration), and "Timeline & public updates" from the real history.
  - **I am also affected** button (record it as the existing `confirmed` community signal), with the real count: "N people also affected".
  - Share, which never includes the secret, and "Report content or abuse".
- **Similar report found nearby:** shown in step 6 when `/api/public/reports/duplicates` returns matches. Buttons: View existing report, **I am also affected**, Continue with new report. Nothing is merged automatically.

### Profile: `v2-profile-1` and `v2-profile-2`

- **Profile 1:**
  - Card with person icon, "Report without an account", and "Your saved reports stay on this device; reports you submit are sent to FixNow." Do not say reports stay only on the phone.
  - "Sign in or create account", or "Accounts: planned" when OTP is disabled.
  - Accessibility toggles: Large text, High contrast, Simple mode, One-handed layout. These already exist; restyle them as switches.
  - "App language: English", with Twi, Ga and Ewe marked **planned**.
- **Profile 2:**
  - Emergency card at the top: "Ghana National Emergency" with **Call 112**, through the confirmation dialog.
  - Rows, each with a real icon (the current rows render **empty squares**): Track with reference, Verified staff access (STAFF badge, goes to responder login), Privacy and consent, Export local data, Delete local data (with confirmation), Terms, privacy and support.

## 4. Do not copy these from the mockups

- Sample names, numbers, dates and outcomes: "Kwame Mensah", "+233 24 123 4567", "23 people also affected", "Accra Metropolitan Assembly dispatched…", "Accra Central · 18 open issues".
  - In the real app, show real data or an empty state.
  - In `?demo=1`, show sample data with a visible "Demo data" banner.
- A pothole photo inside a flooding report, and blank photo placeholders.
- "Anonymous Mode: Reports stay stored locally on this phone." This is wrong.
- Claims about response times, encryption or delivery to authorities that the system cannot back up.
- The header avatar circles, and the mixed "New Report / Account" nav labels.

## 5. Wiring

- **Artwork:** copy `design/v2-handoff/illustrations/*.svg` to `outputs/illustrations/`.
  - Add `illustrations/**` to the `syncWebAssets` includes in `work/fixnow-android/app/build.gradle`.
  - Add the files to the service-worker precache list, and bump the cache version.
- **Accessibility:** decorative copies of the artwork get `alt=""`. Where an illustration is the only label, use the SVG's `aria-label`.
- **Map licence:** the Ghana map is drawn from Natural Earth (public domain) via the `world-atlas` package. It is *not* the GSS boundary data, whose licence is still under review.

## 6. Done means

1. `npm run check` passes, and so does `node outputs/emergency-contacts.test.js`, now part of `check`.
2. Screenshots at 390×844 of every screen listed above, side by side with the matching V2 frame, saved under `design/v2-handoff/after/`.
3. **Browser runs:**
   - Online submit gives "Report submitted" with working Copy.
   - Offline submit gives "Saved and waiting to send".
   - Reconnecting syncs exactly once.
   - Tracking works from a clean browser profile.
   - "I am also affected" increments the real count.
4. **Emergency:** every hotline and every Call 112 button opens the confirmation, and Cancel never opens the dialler. There are no raw `tel:` links in the markup.
5. **Layout:** nothing is clipped or hidden behind the nav at 320×640, 390×844 or 200% text size, and nothing scrolls horizontally.
6. **Android:** `.\gradlew.bat :app:lint`, `:app:assembleDebug` and `:app:bundleRelease` stay green.
7. **Report back:** list the files changed and anything not finished, with the reason.

## 7. Owner decisions outside the code (not for the coding agent)

- **Live map:** this needs a Google Cloud project with billing, a restricted browser key and a Map ID (see `work/fixnow-backend/MAPS-SETUP.md`). Alternatively, switch to a free OpenStreetMap-based map.
- **A live server:** the app points to `https://api.fixnowghana.org`. Until the backend is deployed on a domain with HTTPS, reports from the installed app can only wait in the offline queue.
- **Phone sign-in:** this needs an SMS or OTP provider (`OTP_PROVIDER_WEBHOOK_URL`). Until then, accounts stay "planned".
- **Signing key:** back up `work/fixnow-secrets/` to a password manager before any Play Store upload.
