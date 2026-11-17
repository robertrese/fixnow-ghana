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
npm run qa:journey       # the public demo's complete journey, end to end, on docs/ (run npm run build:demo first)
```

Open the app at `http://localhost:4173/fixnow-ghana.html?api=http%3A%2F%2Flocalhost%3A4180`.

Demo staff logins on the local server are `assembly/assembly123` (Sample District Assembly), `nadmo/nadmo123` (Sample Flood Response Desk), `utility/utility123` (Sample Water and Power Desk) and `moderator/moderator123`. Demo offices are always clearly samples: no real agency uses FixNow yet. The local admin password is generated into `work/fixnow-backend/local-data/local-dev-settings.json`.

To build the Android debug app, run this from `work\fixnow-android`:

```powershell
$env:ANDROID_HOME="C:\Users\tyres\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\gradlew.bat :app:assembleDebug
```

Android notes:

- **Edge to edge.** `MainActivity` draws edge to edge on every Android version and applies the system-bar, display-cutout and keyboard insets itself: a deep green strip behind the status bar (light icons), a bottom area that matches the page background (cream `#f3eee1`, or `#131914` in dark, because the menu floats over the page) and follows the page's theme, and a page that shrinks above the keyboard. Keep this when changing the activity (guarded in `phase12-accessibility-android.test.js`).
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
2. For UI changes, also run `npm run qa` and look at the screenshots. Check 320 px phones and the Large text setting. For changes to the Android app, layout, dark mode or anything an old browser might lack, also run the Android 11 emulator checks (`work/qa/android-insets-check.js` and `android-theme-check.js`, see `work/qa/README.md`). Before handing out an updated APK, rebuild it and run `work/qa/android-shared-smoke-check.js` on the installed app: browser checks do not test the Android package: Android 11 is the regular worst case, where everything must work and small visual differences are fine.
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
  - The three optional yes/no questions in report step 3 (immediate danger, way blocked, getting worse) start with nothing selected. A skipped question is "Not answered" everywhere (Review step, saved and queued report, server, staff case page) and never "No". The values are `"yes"`, `"no"` or `""`; always read them through `ynAnswer()` / `saidYes()` / `yesNo()`, never as true/false. Reports saved by the older form send true/false: true is Yes, and false (that form's pre-selected default) is not answered.
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
- **Public demo journey** (`work/demo/demo-journey.js` and `.css`, brief: `design/v2-handoff/DEMO-JOURNEY-PLAN.md`):
  - Demo only: `npm run build:demo` copies it into `docs/` and that site's offline cache. The real page, `outputs/service-worker.js` and the Gradle list never mention it; the page reaches it only through `window.fixNowDemo` hooks guarded by `IS_DEMO_MODE`. The real app ignores any update marked `simulated`.
  - Every simulated step says "Simulated" and must be something the real app does today; anything it cannot do yet says "Planned". No invented times, numbers or outcomes.
  - Only sample offices (Sample District Assembly, Sample Water and Power Desk, Sample Safety Desk). Sample reports are labelled "Sample" and name general areas only, never real businesses, schools, clinics or people. Never a real photo of a real place.
  - The real app's office hint is general information ("Usually handled by the District Assembly"): FixNow is not connected to any agency yet, so never say it sends reports to one.
- **Photo rule** (in the app only; the server accepts reports without photos, and that must not change):
  - Each entry in `REPORT_TYPES` (in the page) has a `photoRequired` flag; `photoRequiredFor()` is the only place it is read. Never write the list of required types out again. Today it is true for Flooding or drainage, Road or bridge and Waste or sanitation, and false for the other eight.
  - On a required type, Continue on the photo step (and Submit) is stopped until there is a photo or the person taps "I can't add a photo". The message "Add a photo of the problem, or tell us you can't." sits next to the photo button and takes focus. There is always that way out, and no reason is asked.
  - Nothing about the choice is recorded or sent: the report simply has no photo, and Review says "No photo added".
  - On every type, "Add a photo" is the first and largest control on the photo step, with "A photo helps the moderator check your report." and the photo privacy wording.
  - Photos queue offline with the report as before. A photo never blocks a report: if the server refuses a photo, or fails on it three times, the report is sent without it and the person is told (`photosNotSent`). With no answer from the server at all, the whole report waits and retries.
- **Page size:** the page must stay under 120 KiB gzipped and 600 KiB raw (Phase 12 test).

## Design system (V4 "modern", November 2026)

The V4 restyle is being done on the `design-v4` branch in steps (brief in the owner's message of 16 November 2026). Steps 1 to 3 are done: the font, cards, pill buttons, Home, the glass menu, the laptop side menu, every other resident screen, and the staff area. Step 4 is the full gallery for the owner's review. The V4 rules sit in their own section of `work/design/fixnow-v3.css` ("V4 modern"), before the demo block; V4 dark rules are at the end of the dark section. Do not merge to `main` or rebuild `docs/` until the owner approves.

- **Report wizard header:** a round white 44 px close button with a soft shadow, "New report" centred, the step count in a small deep green pill with gold text (the visually hidden "Step N of 6" in each legend stays), and a segmented progress bar (6 px tall, 6 px gaps). Continue is a 58 px deep green pill that floats 16 px from the sides and bottom over a soft cream fade.
- **Step 1 tiles:** white cards with the illustration on a 46 px rounded plate; the chosen tile gets a 2 px deep green ring (mint in dark) and a small gold badge with a deep green tick.
- **Staff area** (`staff.css`): the same font, cards and pill buttons. On phones the section tabs are a floating solid paper bar (no blur), on laptops the same floating dark green side panel as the resident app. Plain selector lists only, no inline styles (the content security policy).
- **Screens:** content cards on every resident screen use the card style; tinted notices keep their colours with 18 px corners; selects, yes/no, severity and map/list controls are pills. The consent screen's three numbered points always stack.

- **Colour:**
  - deep green `#0d2a22` for dark surfaces and text;
  - canopy green `#0a7a52` for verified states and links;
  - Ghana gold `#fcd116` for the main action on dark surfaces (never gold text on cream);
  - flag red `#ce1126` only for emergency calls (the 112 actions, the hotline call buttons, and the Call button in the call confirmation for 112, 191, 192 and 193);
  - burgundy `#72262e` for emergency on light surfaces;
  - cotton cream `#f3eee1` as the background, with paper `#fffdf8` surfaces; muted text `#4f5d55`.
- **Type:** Inter for everything (`outputs/fonts/inter-latin-wght-normal.woff2`, the latin variable font, with its OFL licence). Headings: weight 800, letter-spacing -0.02em, line-height about 1.05. Body 400; labels 600 to 700. The V3 fonts (Bricolage Grotesque, Atkinson Hyperlegible Next) are kept in `work/design/retired-fonts-v3/` and are not shipped.
- **Cards and tiles:** paper `#fffdf8`, radius 22 px (`--r-card`), no border, shadow `0 1px 2px rgba(13,42,34,.06), 0 6px 18px rgba(13,42,34,.07)` (`--shadow-card`).
- **Buttons:** full pills (radius 999 px); main actions (`.primary`) are 56 px tall, others 50 px. They scale to 0.97 while pressed.
- **Home hero:** a rounded card (10 px from the screen edges on phones, radius 28 px) with `radial-gradient(120% 90% at 100% 0%, #1f4e3b 0%, #0d2a22 62%)`, the Ghana outline at 14% opacity, the logo with "FixNow Ghana" beside it, a 44 px round Notifications button, the heading "What needs fixing today?" at 38 px, then "Report a problem" (gold, takes the remaining width) and "Call 112" (flag red with the light ring) side by side, and the kente strip along the bottom edge. On phones the page title in the top bar stays for screen readers and focus but is visually hidden on Home. Hotlines stay visible on Home at every size.
- **Problem tiles (Home):** white cards in a 2-column grid (3 on tablets and laptops): the illustration on a 46 px rounded plate in the type's tint, the name in bold, a short muted hint.
- **Phone and tablet menu:** a floating glass bar: 16 px from the sides, 14 px above the bottom safe area, 66 px tall, radius 33 px, `rgba(255,253,248,.66)` with `backdrop-filter: blur(22px) saturate(180%)` (and the `-webkit-` prefix) inside `@supports`, a solid `#fffdf8` bar otherwise. Blur is used on this bar only. A capsule (`rgba(13,42,34,.1)`) slides to the current tab (`--tab`, set from `body[data-view]`); the centre Report button is a 54 px deep green circle. On tablets the bar is centred, about 480 px wide. Page content keeps bottom padding so nothing is trapped behind the bar.
- **Laptop side menu:** a floating panel 14 px from the left, top and bottom, 244 px wide, radius 28 px, `linear-gradient(180deg, #123329, #0d2a22 55%)`, kente strip at the top. Rows 44 px tall: Home, Nearby, My reports, Notifications, Profile. The current row is a paper pill with deep green bold text. No Report row: "Report a problem" lives in the hero. At the bottom, the "In danger?" card with the red Call 112 button (it uses the confirmation dialog like every call).
- **Notifications:** the hero bell and the side menu row open the same list as the Nearby button (`[data-open-notifications]`).
- **Motion:** the menu capsule slides in about 200 ms and buttons press in; all of it is off under `prefers-reduced-motion`.
- **Logo:** a rounded square (corner radius 11%) in three equal vertical bands, red `#be3935`, gold `#e3b944` and green `#2a5037`, with a white "FN" on the gold band. The master is `design/v2-handoff/logo/fixnow-logo.svg`.
  - `outputs/icon.svg` is the logo in the app and the web app icon; `outputs/icon-maskable.svg` is the full-bleed manifest icon (`"purpose": "maskable"`).
  - The Android launcher icon is the adaptive pair `ic_launcher_background.xml` (bands) and `ic_launcher_foreground.xml` (letters, also the themed-icon layer), plus PNGs for Android 6 to 7.1.
  - Never frame the tile again (no extra background, padding or radius).
  - On dark surfaces (welcome, Home hero, laptop sidebar, and everywhere in dark mode) give it a 1.5 px cream keyline at about 50% opacity, or the green band disappears.
  - Keep the white "FN" as designed: logos are exempt from contrast rules, and "FixNow Ghana" is always written beside it.
- **Signature:** a woven kente-style strip (the `--kente` token) appears only on the Home hero (along the bottom edge of the card), the welcome screen and the top of the laptop side menu. Do not scatter it elsewhere.
- **Do not use:**
  - ALL-CAPS labels;
  - dot-joined meta text ("A · B");
  - arrows on buttons;
  - hover effects on touch screens (wrap them in `@media (hover: hover)`).
- **Focused flows:** on phones the menu bar is hidden during the report wizard. The `.topbar-exit` button must stay.
- **Dark mode** (brief: `design/v2-handoff/DARK-MODE-AND-LOGO.md`):
  - Profile > Appearance offers Match phone (the default), Light and Dark, saved with the other settings. The `theme-boot` script at the top of `<head>` sets `html[data-theme]` before the first paint, follows the phone, and prints in light.
  - All dark styles live in one section at the end of `work/design/fixnow-v3.css`, starting with `:root[data-theme="dark"]`. Light rules stay untouched.
  - Tokens: page `#131914`, cards `#1f2720`, fields `#1a231c`, raised `#28382d`, text `#eef2ee`, muted `#b3beb6`, lines `#2e3a32`, strong lines `#7d8c82`, focus `#8fb4ff`, emergency text `#f4a7ae`.
  - Main action: Ghana gold with deep green text. Mint `#97d1a6` is the accent for links, verified, selected, progress and switches, and appears only in the dark section (it fails on cream).
  - 112, the hotline call buttons and the confirmation Call button stay flag red `#ce1126` with a 1.5 px `#fffdf8` ring. Selected severity gets a light ring.
  - Problem tiles are dark cards; their illustrations sit on a cream plate. Photos are never dimmed or filtered; they get a thin border.
  - The Home hero and the laptop side menu stay deep green (with a thin border), with the kente strip. No shadows for depth in dark: cards get a 1 px border and lighter surfaces instead.
  - The glass menu is a dark translucent surface (`rgba(31,39,32,.66)`, solid `#1f2720` without blur); the current tab uses the mint accent, and the Report circle is gold with deep green text.
  - Older components with hard-coded light backgrounds are mapped onto the dark surfaces in grouped rules. When a new component appears, check it with `npm run qa:dark`.
  - Never copy from the Figma frames anything listed in section 3.5 of the brief; take colours only.
