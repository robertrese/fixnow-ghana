# FixNow local QA tools

These scripts test the app the way a resident uses it, against a local server. They never touch production.

## One-time setup

```powershell
npm install --no-save playwright@1.63.0 axe-core@4.10.2
npx playwright install chromium webkit firefox
```

`--no-save` keeps the test tools out of `package.json`, so the app itself has no new dependencies. WebKit is Safari's engine; Firefox is the third engine people use on computers.

## Each session

Run each command in its own terminal:

```powershell
npm run start:api      # local API with demo accounts; data in work/fixnow-backend/local-data
npm run start:web      # the web app on http://localhost:4173
npm run qa:seed        # once per fresh local-data folder: 4 moderated demo reports, 3 waiting for review, a demo routing rule
npm run qa             # Chromium, light and dark, plus the older-browser check
npm run qa:engines     # the same layout check, WCAG scan and walkthrough in WebKit and Firefox, light and dark
npm run qa:all         # both of the above
```

- `overflow-check.js` fails if any screen scrolls sideways at 320 px, or at 320 or 390 px with Large text, or if a visible text field uses text under 16 px (iPhone zooms in on those).
- `a11y-scan.js` fails on any axe-core WCAG 2.1 A/AA violation at 320, 390 or 1280 px. Automated checks miss some problems, so also try a keyboard and a screen reader (TalkBack on Android, VoiceOver on iPhone).
- `walkthrough.js` screenshots every main screen on a phone and a laptop, and fails if the page logs an error.
- `staff-check.js` signs in as every demo staff role (moderator, assembly, NADMO, utility, admin) on `staff.html` at 390 px, 320 px and laptop size, opens every staff tab, the review page with its Verify, Reject, Escalate and Hide dialogs, a case page, the update dialog and a private photo, and fails on WCAG violations, sideways scrolling, targets under 44 px, page errors, contact details or exact coordinates in a list, or a review queue that is not urgent-first. Screenshots go to `work/qa/screenshots/staff/`.
- `old-browser-check.js` removes `crypto.randomUUID` before the page loads (as on iOS 15.0 to 15.3 and older Android browsers) and checks that the app still starts and saves a report.

Every script takes `--dark` (phone set to dark mode) and `--engine=webkit` or `--engine=firefox` (default Chromium). WebKit phone runs use Playwright's iPhone SE (320 px) and iPhone 13 (390 px) profiles. Screenshots go to `work/qa/screenshots/`, then `dark/`, `webkit/`, `webkit-dark/`, `firefox/` and `firefox-dark/`.

The local launcher allows 500 public reports an hour from this PC, because a full QA run submits many. The server's real default is 5.

To start again with clean data, stop the API, delete `work/fixnow-backend/local-data`, start the API and seed again. A new local admin password is generated into `local-dev-settings.json` in that folder.

The demo reports are invented, and the two photos in `demo-photos/` are drawings. If a screenshot goes anywhere public (an application, a slide), call it demo data.

## Screen gallery

`npm run gallery` (`gallery.js`) rebuilds `design/screens`: compressed WebP images of every resident screen, dialog and state and every staff screen, on a phone and a laptop, in light and dark, plus `index.html` and `README.md`. Run it on fresh seeded data (move `work/fixnow-backend/local-data` aside, start the API, `npm run qa:seed`), because the walk submits reports. Staff screens are taken first so those reports do not clutter the moderator queue. Rebuild it only when screens change.

## Android emulators (regular checks)

Run these after changes to the Android app, the page layout, dark mode or anything an old browser might not support. Android 11 is the worst case: its WebView is version 83, below the support target, and cannot update (no Play Store). Everything must work there; small visual differences are fine.

```powershell
# Start one emulator (cold boot if it will not start); FixNow_Test_API_30 is Android 11, Medium_Phone_API_36.0 is Android 16
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd FixNow_Test_API_30 -no-snapshot-load
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb install -r work\fixnow-android\app\build\outputs\apk\debug\app-debug.apk
& $adb reverse tcp:4180 tcp:4180
node work/qa/android-insets-check.js android11 work/qa/screenshots/android11 gestural,threebutton
node work/qa/android-insets-check.js android11-dark work/qa/screenshots/android11 gestural dark
node work/qa/android-theme-check.js work/qa/screenshots/android11
node work/qa/android-back-check.js
node work/qa/android-dark-check.js
```

- `android-insets-check.js`: nothing under the status or navigation bar, no extra gap, no double padding, and the keyboard never covers the step 3 description, the step 5 contact field or staff sign-in, in gesture and 3-button navigation.
- `android-theme-check.js`: dark mode follows the phone, also when it changes while the app is open; the in-app Light and Dark choices override it; the area below the tab bar matches the page.
- `android-dark-check.js`: dark mode on every main screen, Nearby in map view, a full page, the call dialogs and the staff page, with axe-core's colour-contrast rule run inside the WebView itself; also fails if the page still has `:is()` or `:where()` rules, which WebView 83 drops.
- `android-back-check.js`: the phone's Back button or gesture closes a full-screen page and stays in the app.
- If an emulator will not start (for example after a sudden power-off), start it with `-read-only`.
- The Android 11 emulator needs about 7.5 GB of free disk space to start.

## What still needs a real iPhone

Playwright's WebKit is Safari's engine, not an iPhone. These need a real iPhone with the app online over HTTPS: notch and home-indicator spacing, the keyboard with the sticky bars, Add to Home Screen, offline use from the Home Screen, the camera, location permission and handing a call over to the phone.
