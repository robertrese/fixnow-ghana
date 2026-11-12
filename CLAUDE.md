# FixNow Ghana: guide for Claude Code

FixNow Ghana is an offline-first civic reporting app for Ghana. Residents report community problems (flooding, roads, waste, water, electricity, safety) and follow what happens. Moderators verify reports before anything is public. Authorised responders see exact locations only for cases in their own area. It is not deployed and not pilot-ready.

The owner is Tyrese Saint-Acquaye (GIMPA BSc Computer Science, Accra). He uses this project in his master's applications, so polish, correctness and honesty about what is real all matter. Explain changes in plain language; he is a student, not a reviewer of diffs.

Read `design/v2-handoff/CLAUDE-CODE-HANDOFF.md` for the full history, decisions and the current task list.

## Repository map

- `outputs/fixnow-ghana.html`: the whole web app. It is a single-page PWA (HTML, CSS and JS in one file, about 0.5 MB) with a `body[data-view]` view system.
- `outputs/staff.html`, `staff.js`, `staff.css`: the staff area (moderator review queue, responder cases and case pages, admin routing, staff accounts and audit log). It is a separate page so resident pages never load staff code. Contact details and exact locations appear only on a case page, from `GET /api/reports/:id/case`.
- `outputs/service-worker.js`: the offline cache. Bump `CACHE_NAME` whenever a cached file changes.
- `outputs/map-foundation.js`, `outputs/emergency-contacts.js`: the map layer, and the emergency numbers (single source of truth).
- `outputs/fonts/`: bundled typefaces with their OFL licences. `outputs/illustrations/`: SVG artwork.
- `outputs/*.test.js`: front-end policy and phase tests (mostly static guards on the HTML).
- `work/fixnow-backend/server.js`: Node 22 API on `node:sqlite`; its integration test is `test-api.js`.
- `work/fixnow-android/`: the Android WebView wrapper (`com.fixnowghana.command`). The `syncWebAssets` include list in `app/build.gradle` decides which web files ship.
- `work/design/fixnow-v3.css`: the readable source of the design layer. **Never edit the minified `<style id="fixnow-v3">` block by hand.** Edit this file, then run `npm run build:css`.
- `work/qa/`: local QA tools (launcher, demo seeding, walkthrough screenshots, accessibility scan, layout check). See `work/qa/README.md`.
- `design/v2-handoff/`: the design brief, Figma reference frames, screenshots and build notes.

## Commands (Windows PowerShell, from the project root)

```powershell
npm run check            # all 17 test suites: syntax, 16 front-end guards, backend integration test
npm run build:css        # compile work/design/fixnow-v3.css into the app
npm run start:api        # local API on http://localhost:4180 with demo accounts (data in work/fixnow-backend/local-data)
npm run start:web        # serves outputs/ on http://localhost:4173
npm run qa:seed          # adds 4 moderated demo reports (2 with drawn demo photos), 3 waiting for review and a demo routing rule, through the real API
npm run qa               # layout check + WCAG scan + walkthrough screenshots, in light and then dark (needs Playwright, see work/qa/README.md)
npm run gallery          # rebuilds design/screens (every resident and staff screen, phone and laptop, light and dark) on fresh seeded data
npm run qa:dark          # the same three checks in dark mode only; screenshots go to work/qa/screenshots/dark
npm run qa:outcomes      # resident outcome checks (part of npm run qa): demo banner, My reports search and badge, demo reports never sent, no raw errors, filters, plain words
```

Open the app at `http://localhost:4173/fixnow-ghana.html?api=http%3A%2F%2Flocalhost%3A4180`.

Demo staff logins on the local server are `assembly/assembly123`, `nadmo/nadmo123`, `utility/utility123` and `moderator/moderator123`. The local admin password is generated into `work/fixnow-backend/local-data/local-dev-settings.json`.

To build the Android debug app, run this from `work\fixnow-android`:

```powershell
$env:ANDROID_HOME="C:\Users\tyres\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\gradlew.bat :app:assembleDebug
```

Android notes:

- **Edge to edge.** `MainActivity` draws edge to edge on every Android version and applies the system-bar, display-cutout and keyboard insets itself: a deep green strip behind the status bar (light icons), a bottom area that matches the tab bar and follows the page's theme, and a page that shrinks above the keyboard. Keep this when changing the activity (guarded in `phase12-accessibility-android.test.js`).
- **Local server (debug only).** The debug build serves its pages as `http://localhost/assets/…` and talks to `http://localhost:4180` through `adb reverse tcp:4180 tcp:4180` over USB. The code is in `app/src/debug/…/LocalServerAccess.java`; the release copy has no such route, and a guard keeps it that way.
- **Theme.** `values-night/styles.xml` is a dark theme so the WebView reports dark mode; algorithmic darkening is off. The page tells the app its theme through `WebViewCompat.addWebMessageListener` ("fixnowTheme"), limited to the app's own origins. Never use `addJavascriptInterface`.
- **Emulators.** `Medium_Phone_API_36.0` (Android 16) is the main test device. `FixNow_Test_API_30` (Android 11) is kept for tests; it needs about 7.5 GB of free disk space to start. Its WebView is version 83 and cannot update (no Play Store), which makes it a worst case below the support target: real Android 11 phones update WebView through the Play Store.
- **Phone theme for older WebViews.** WebViews older than about version 105 cannot report the phone's dark setting, so the app replies to the page's first theme message with `phone:dark` or `phone:light`, and sends it again from `onConfigurationChanged`. The page uses it only in Match phone mode.

## Devices and browser support

- **Android:** the Android app, or the web app in Chrome. **iPhone and iPad:** the web app in Safari, added to the Home Screen. **Computers:** the web app in any modern browser. Basic phones would need SMS or USSD, a separate project. See `design/v2-handoff/IPHONE-AND-OTHER-DEVICES.md`.
- **Support target** (use nothing newer without a fallback): iOS 15 and newer (iPhone 6s and later); Chrome or WebView 90 and newer; current Chrome, Edge and Firefox; Safari 15 and newer.
  - Random IDs come from `makeUuid()`, never `crypto.randomUUID()` directly (`makeId()` is a different, older function that makes `FN-…` references). No `Array.prototype.at` or `String.replaceAll` (use `replace` with a `/g` pattern). Spell out `top`/`right`/`bottom`/`left` instead of the `inset` shorthand (Chrome 87).
  - A `:has()` selector must stand alone; states people must see (ticked consent, the Appearance choice) use classes set in JavaScript.
  - No `:is()` or `:where()` in shipped CSS (Chrome and WebView 88, Safari 14): an old browser drops the whole rule. Grouped rules in `fixnow-v3.css` may use `:is()`; `npm run build:css` writes them out as plain selector lists (`work/design/expand-selectors.js`), keeping the same specificity. Do not use them in `staff.css`.
  - Every `100vh` has a `100dvh` line after it.
- **iPhone:** `viewport-fit=cover` with `env(safe-area-inset-*)` padding (0 in the Android app, which pads natively), an `apple-touch-icon.png`, and a Home Screen tip in Safari because Safari can clear saved data after 7 days without a visit.
- **QA engines:** `npm run qa:engines` repeats the layout check, axe scan and walkthrough in WebKit (with iPhone profiles) and Firefox, light and dark. On this PC (Windows preview build 10.0.26300) Playwright's Firefox does not start (Windows cannot load its `mozglue` library), so locally `npm run qa:webkit` is the extra engine. Firefox is tested on GitHub: `.github/workflows/check.yml` runs `npm run check` and a demo rebuild check, then `npm run qa` (Chromium, plus the demo check), `npm run qa:webkit` and `npm run qa:firefox` on every push, about 15 minutes. Keep it green; read failures with `gh run view --log-failed`, and the screenshots of a failed run are kept as an artifact for 7 days. Real-iPhone checks (notch spacing, keyboard, Add to Home Screen, offline, camera, location, calls) need the app online over HTTPS.
- **No App Store app** without the owner's decision: it needs a Mac, a US$99 a year Apple Developer account and Apple's approval.

## Working rules

1. Run `npm run check` before and after every change. Do not finish with anything failing. When you add a product rule, add a guard for it, usually in `outputs/v2-design.test.js`.
2. For UI changes, also run `npm run qa` and look at the screenshots. Check 320 px phones and the Large text setting. For changes to the Android app, layout, dark mode or anything an old browser might lack, also run the Android 11 emulator checks (`work/qa/android-insets-check.js` and `android-theme-check.js`, see `work/qa/README.md`): Android 11 is the regular worst case, where everything must work and small visual differences are fine.
3. Make a Git commit after each verified step, with a clear message. Never rewrite history. Before the first push anywhere, confirm that `.gitignore` keeps out secrets, `node_modules`, `outputs/oracleJdk-27/`, build output and local data.
4. **Never read, print, copy, stage or commit anything in `work/fixnow-secrets/`.** It holds the Android signing key. Never put secrets, keys or passwords in code or docs.
5. Do not deploy, create accounts, buy services, or change external systems without the owner's explicit go-ahead.
6. Ask before deleting files. Prefer moving them to a clearly named folder.
7. Keep everything offline-capable. Do not load fonts, scripts or styles from the network at runtime. New web files must be added to the service worker `ASSETS` list and the Gradle `syncWebAssets` include list.

## Product rules (guarded by tests; do not weaken them)

- **Emergency numbers:** general emergency 112; Police 191 (also 112); Fire 192 (also 112); Ambulance 112 (also 193). They come from `emergency-contacts.js`. Every call goes through the confirmation dialog: no raw `tel:` links anywhere. Android uses `ACTION_DIAL`, never `ACTION_CALL`. Hotlines stay visible on Home at every screen size.
- **Honesty:**
  - No invented statistics, response times or authority outcomes.
  - No defaults that fake an answer: "people affected" starts empty, and severity must be chosen.
  - "Report submitted" (shows the reference and private secret) is a different screen from "Saved and waiting to send" (shows no reference or secret until the server confirms).
  - Unsent reports are labelled "Not sent yet".
  - Languages other than English are labelled as planned.
  - Copy that says something is encrypted, anonymous or "sent to authorities" must be true of the system.
- **Privacy:**
  - Exact GPS, GhanaPostGPS, contact details and tracking secrets never appear publicly.
  - The public feed shows only moderator-verified reports, at MMDA-safe approximate points.
  - Public photos appear only after a moderator marks the photo clean and confirms that no faces, number plates or house numbers are visible. The server re-writes each published photo without metadata.
  - Rejecting a photo withdraws it.
  - Never call reports "anonymous": staff can see contact details people choose to give, and the server keeps a hashed network address. Say people don't have to give their name or number. (The internal report-mode value "Anonymous public case" stays, because sync depends on it.)
  - The audit log stores a keyed hash of the IP address (`iphash:…`) for public reports, signals, photo uploads and every other action. Only staff sign-in attempts (`login`, `login_failed`) keep the raw IP, for security review.
- **Staff area** (`staff.html`): responders (Assembly, NADMO, Utility and other offices) see a report only after a moderator verifies or escalates it and it is routed to their own office by the routing rules, or when it is assigned to them; moderators and admins see everything. A released report that no rule matches is visible only to moderators and admins, who see a "No office can see this" warning. Staff lists never show contact details or exact locations; the case page shows the exact location to staff whose area covers the report and contact details only to moderators, admins and the assigned responder, and each opening is audited. Reject and Hide need a reason; Verify needs the privacy confirmation. `staff.html` has a strict content security policy (no inline scripts or style attributes; connections only to the FixNow server). Sign-out removes the session, unsent updates and everything shown. Checked by `npm run qa:staff` and, on Android 11, `work/qa/android-staff-check.js`.
- **Accessibility:**
  - Keep 0 axe WCAG 2.1 A/AA violations.
  - Touch targets are at least 44 px.
  - Focus moves to the step heading on each wizard step and to the page title when a view changes.
  - Dialogs focus their title.
  - Respect reduced motion.
- **Resident wording and data:**
  - Resident screens never show raw errors ("Failed to fetch", "TypeError"): show messages through `plainError()`. Staff screens may keep precise terms.
  - Resident screens say photos have "hidden location information" removed and that a moderator checks them; never "re-encoded", "EXIF" or "quarantine".
  - Problem types and statuses come from one list (`REPORT_TYPES`, `REPORT_STATUSES` in the page, matching the server); never write the options out by hand.
  - Demo reports have the `demo-local` state, are never queued, and the demo has its own queue name. The demo banner's height is reserved on every view (`--demo-banner-h`).
- **Page size:** the page must stay under 120 KiB gzipped and 600 KiB raw (Phase 12 test).

## Design system (V3, November 2026)

- **Colour:**
  - deep green `#0d2a22` for dark surfaces and text;
  - canopy green `#0a7a52` for verified states and links;
  - Ghana gold `#fcd116` for the main action on dark surfaces (never gold text on cream);
  - flag red `#ce1126` only for emergency calls (the 112 actions, the hotline call buttons, and the Call button in the call confirmation for 112, 191, 192 and 193);
  - burgundy `#72262e` for emergency on light surfaces;
  - cotton cream `#f3eee1` as the background, with paper `#fffdf8` surfaces.
- **Type:** Bricolage Grotesque (bold) for headings and the large emergency numbers; Atkinson Hyperlegible Next for everything else.
- **Logo:** a rounded square (corner radius 11%) in three equal vertical bands, red `#be3935`, gold `#e3b944` and green `#2a5037`, with a white "FN" on the gold band. The master is `design/v2-handoff/logo/fixnow-logo.svg`.
  - `outputs/icon.svg` is the logo in the app and the web app icon; `outputs/icon-maskable.svg` is the full-bleed manifest icon (`"purpose": "maskable"`).
  - The Android launcher icon is the adaptive pair `ic_launcher_background.xml` (bands) and `ic_launcher_foreground.xml` (letters, also the themed-icon layer), plus PNGs for Android 6 to 7.1.
  - Never frame the tile again (no extra background, padding or radius).
  - On dark surfaces (welcome, Home hero, laptop sidebar, and everywhere in dark mode) give it a 1.5 px cream keyline at about 50% opacity, or the green band disappears.
  - Keep the white "FN" as designed: logos are exempt from contrast rules, and "FixNow Ghana" is always written beside it.
- **Signature:** a woven kente-style strip (the `--kente` token) appears only on the Home hero, the welcome screen and the top of the laptop sidebar. Do not scatter it elsewhere.
- **Do not use:**
  - ALL-CAPS labels;
  - dot-joined meta text ("A · B");
  - arrows on buttons;
  - hover effects on touch screens (wrap them in `@media (hover: hover)`).
- **Focused flows:** on phones the tab bar is hidden during the report wizard. The `.topbar-exit` button must stay.
- **Dark mode** (brief: `design/v2-handoff/DARK-MODE-AND-LOGO.md`):
  - Profile > Appearance offers Match phone (the default), Light and Dark, saved with the other settings. The `theme-boot` script at the top of `<head>` sets `html[data-theme]` before the first paint, follows the phone, and prints in light.
  - All dark styles live in one section at the end of `work/design/fixnow-v3.css`, starting with `:root[data-theme="dark"]`. Light rules stay untouched.
  - Tokens: page `#131914`, cards `#1f2720`, fields `#1a231c`, raised `#28382d`, text `#eef2ee`, muted `#b3beb6`, lines `#2e3a32`, strong lines `#7d8c82`, focus `#8fb4ff`, emergency text `#f4a7ae`.
  - Main action: Ghana gold with deep green text. Mint `#97d1a6` is the accent for links, verified, selected, progress and switches, and appears only in the dark section (it fails on cream).
  - 112, the hotline call buttons and the confirmation Call button stay flag red `#ce1126` with a 1.5 px `#fffdf8` ring. Selected severity gets a light ring.
  - Problem types keep their own tile colours; their illustrations sit on a cream plate. Photos are never dimmed or filtered; they get a thin border.
  - The Home hero stays deep green with the kente strip. No shadows for depth in dark: borders and lighter surfaces instead.
  - Older components with hard-coded light backgrounds are mapped onto the dark surfaces in grouped rules. When a new component appears, check it with `npm run qa:dark`.
  - Never copy from the Figma frames anything listed in section 3.5 of the brief; take colours only.
