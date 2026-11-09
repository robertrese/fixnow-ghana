# FixNow Ghana build notes (9 November 2026)

These notes record what the V2 build and the bolder V3 design changed, how they were checked, and what the owner still needs to do. The Figma frames are in `reference/`; the original brief is `FIXNOW-V2-BUILD-BRIEF.md`.

## V3: the bolder design

V3 keeps every V2 screen, rule and test, and replaces the visual layer with a stronger identity built from the brand.

- **Colour:**
  - deep green `#0d2a22` is the dominant surface;
  - Ghana gold `#fcd116` marks the main action;
  - flag red `#ce1126` is reserved for 112;
  - burgundy `#72262e` remains the emergency colour on light screens;
  - the background is an unbleached-cotton cream.
- **Signature:** a woven, kente-style strip in gold, green and red sits under the Home hero, across the top of the welcome screen and at the top of the laptop sidebar. The Home hero also carries a quiet contour drawing of Ghana. This is the one decorative element; everything else is plain.
- **Type:** both typefaces are bundled in `outputs/fonts/` with their SIL Open Font License files, so they work offline and in the Android app.
  - Bricolage Grotesque is used for headings and the large emergency numbers.
  - Atkinson Hyperlegible Next is used for everything else. It was designed for low-vision readers and reads well in sunlight.
- **Home:**
  - "What needs fixing today?" sits on the green hero with the gold report button and the red 112 button.
  - Problem types sit in a three-column grid.
  - Emergency numbers are one panel where the number itself is the biggest thing on each row.
  - "Verified near you" shows the latest moderated reports.
- **Report steps:**
  - On phones, the tab bar is hidden while reporting. An exit button keeps what was entered.
  - One sticky bar holds Back and Continue.
  - Problem types are illustrated tiles.
  - Done returns to Home.
- **Nearby:** one compact row holds map or list, filters and notifications. Report cards lead with the approved photo, or with the category illustration when there is none.
- **My reports:** each report has a labelled tracker (sent, checked, assigned, fixed). The ALL-CAPS labels and dot-joined text from V2 are gone.
- **Laptop:**
  - Home uses two columns.
  - The report form has a step list beside it.
  - Nearby and My reports use card grids.
  - Tablets get two-column lists.
- **Checks:**
  - **Tests:** all 17 suites pass. `v2-design.test.js` now also checks that the fonts are bundled, licensed, cached offline and packaged for Android, and that the report flow always has a way out.
  - **Accessibility:** axe-core found 0 WCAG 2.1 A/AA violations at 320, 390 and 1280 px.
  - **Layout:** there is no sideways scrolling on any step, including with Large text at 320 px.
  - **Page size:** about 109 KB compressed, under the 120 KB budget.
  - **Bugs fixed:** the review step, My reports and Profile used to scroll sideways on small phones (the last two with Large text).
- **Tools:** the readable style source is `work/design/fixnow-v3.css` (`npm run build:css`), and local QA tools are in `work/qa/`. `CLAUDE.md` and `CLAUDE-CODE-HANDOFF.md` carry everything needed to continue in Claude Code.

The V2 versions of changed files are in `design/backup-before-v3/`. V3 screenshots are in `screenshots-v3/`.

## V2 build

## What changed for residents

- **Welcome:** Ghana map artwork, a three-step explanation and three plain consent statements.
- **Home:** "Report a new problem" and "Danger right now? Call 112" first, then common problems with illustrations, then the emergency hotlines. Every call opens a confirmation screen before the dialler, including the Profile button that used to dial directly.
- **Report wizard:** six steps in the Figma order: problem, place, description, photos, contact, review. "People affected" no longer defaults to 25, severity no longer defaults to Critical, and the review step shows a summary with Edit links and a check for similar nearby reports.
- **Results:** "Report submitted" (reference and private secret, each with Copy) is separate from "Saved and waiting to send". The second screen shows no reference or secret until the server confirms the report.
- **My reports:** reports that have not been sent are labelled "Not sent yet" and keep retrying on their own, with a growing delay, while the phone is online. Sharing and timeline actions appear only once a report has a reference.
- **Nearby:** moderator-verified reports with photos (when approved) and a dated public timeline. If the live map is not configured, Nearby opens on the list and says so in plain language.
- **Brand:** deep green `#0d2a22`, green `#0a7a52`, burgundy `#72262e` and the FN mark are restored on top of the August refresh.

## What changed on the server

- **Moderated public photos:**
  - New table `public_report_images` (migration `20261108_10_moderated_public_images`).
  - New routes:
    - `POST /api/reports/:id/attachments/:attachmentId/public` (moderators only; approve or withdraw);
    - `GET /api/public/images/:imageId`.
  - A photo can be published only when all of these hold: the report is verified, the photo has been reviewed as clean, and the moderator confirms that no faces, number plates or house numbers are visible.
  - The published copy is re-written without JPEG, PNG or WebP metadata.
  - A report can show at most four photos.
  - Publishing and withdrawal are audited. Rejecting a photo later takes it down automatically.
- **Bug found by the new test and fixed:** the photo approval compared an object with a text value, so every approval would have failed.
- **Reports and feed:** reports now store how long the problem has been happening, and the public feed includes the last five public updates.

## How it was checked

- `npm run check`: all 17 suites pass, including the backend integration test. That test now covers the full photo flow:
  - quarantine and attestation rules;
  - moderator-only access;
  - metadata removal;
  - safe headers;
  - the audit entry;
  - withdrawal, re-approval and rejection.
- `outputs/v2-design.test.js` (new) guards:
  - the emergency rules;
  - brand colours;
  - the wizard order;
  - the no-defaults rule;
  - separate result screens;
  - unsupported claims from the mockups;
  - offline artwork;
  - the photo rules.
- Phase 12 now measures the page by its compressed download size (budget 120 KiB; currently about 105 KiB), with a 600 KiB cap on the uncompressed file. The old 450 KiB uncompressed limit did not reflect what a phone actually downloads.
- **Walkthrough:** a full resident walkthrough in a headless browser, with no console errors. It covers:
  - welcome and consent;
  - all six steps;
  - an online submission;
  - an offline submission that sends when back online;
  - My reports;
  - Nearby with photos;
  - Profile;
  - the Fire Service call confirmation.
- **Layout:** no sideways scrolling at 320 px, 390 px, 1280 px or with Large text on.
- **Accessibility:** axe-core 4.10.2 (WCAG 2.1 A and AA rules) found **0 violations** at 320, 390 and 1280 px. The scan covered:
  - welcome and consent;
  - Home;
  - all six steps;
  - the submitted screen;
  - report details;
  - Nearby and its detail sheet;
  - My reports;
  - Profile;
  - the emergency dialog;
  - staff sign-in;
  - the responder portal.
- **Focus:** moves to the step heading on each step and to the page title when a view changes. Dialogs open at the top with focus on their title.

Screenshots in `screenshots/` come from a local test server. Its four verified reports were created through the real API (submit, moderate, review photo, publish photo, responder update). The two "photos" are drawn stand-ins, not real places.

## Files changed

The changed files are:

- `outputs/fixnow-ghana.html`
- `outputs/map-foundation.js`
- `outputs/service-worker.js` (cache `v23`)
- `outputs/phase7-trustworthy-feed.test.js`
- `outputs/phase12-accessibility-android.test.js`
- `package.json`
- `work/fixnow-android/app/build.gradle` (packages `illustrations/**`)
- `work/fixnow-backend/server.js`
- `work/fixnow-backend/test-api.js`
- `README.md`
- `.gitignore`

Two new things were added: the `outputs/illustrations/` folder (7 SVG files) and `outputs/v2-design.test.js`.

The originals of every changed file are in `design/backup-before-v2/`, in the same folder layout. Delete that folder once you are happy with the new version; Git ignores it.

## Still to do (owner)

1. Rebuild the Android app so it picks up the new web files: run `.\gradlew.bat :app:assembleDebug` in `work\fixnow-android`, as described in its README.
2. Make the first Git commit (`git add -A`, then `git commit`). The new `.gitignore` lines keep `node_modules`, the JDK in `outputs/oracleJdk-27`, Gradle caches and local test databases out of it.
3. Back up the signing key in `work/fixnow-secrets/` somewhere safe outside this folder.
4. Before a pilot:
   - deploy the API over HTTPS;
   - add a restricted Google Maps browser key and Map ID;
   - connect an SMS/OTP provider.
