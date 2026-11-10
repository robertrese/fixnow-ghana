# FixNow on iPhone and every other device: brief for Claude Code (10 November 2026)

The owner wants FixNow to work on iPhone, Android and every other system. `CLAUDE.md` still applies in full.

## How each kind of device gets FixNow

| Device | How people use FixNow | State today |
| --- | --- | --- |
| Android phones and tablets | The Android app (APK now, Play Store later), or the web app in Chrome | The app is built and tested on emulators |
| iPhone and iPad | The web app in Safari, added to the Home Screen. It looks and works like an app, including offline. | Not yet tested in Safari's engine, and the fixes below are needed |
| Windows, Mac, Linux, Chromebook | The web app in any modern browser. Chrome and Edge can also install it like an app. | Tested in Chromium only |
| Basic phones without a full browser | Not covered. This would need an SMS or USSD channel through a mobile network: a separate project. | |

- **The Android app runs only on Android.** iPhones and computers use the same app as a web app.
- **The web app is not online yet.** Until it is deployed over HTTPS (task P2, which needs the owner's accounts), iPhone and computer users cannot reach it. It runs only from the owner's PC.
- **An App Store app for iPhone is possible later,** by wrapping this same web app. It would need:
  - a Mac (Xcode only runs on macOS);
  - an Apple Developer account (US$99 a year);
  - Apple's approval: Apple can reject apps that are only a website in a wrapper (App Review Guideline 4.2).

  Do not start it without the owner's decision.

## Browser support target

Write this target into `CLAUDE.md`, and use nothing newer without a fallback:

- **iPhone and iPad:** iOS 15 and newer (iPhone 6s and later).
- **Android:** Chrome or WebView 90 and newer.
- **Computers:** current Chrome, Edge and Firefox, and Safari 15 or newer.

## Problems found in the code

Checked in `outputs/fixnow-ghana.html` on 10 November.

1. **The app crashes at startup on older phones.**
   - The main script calls `crypto.randomUUID()` at its top level (`let citizenDeviceKey = crypto.randomUUID();`) and in 8 other places.
   - Browsers without it throw an error, and the whole app fails to start. These include:
     - iPhones on iOS 15.0 to 15.3;
     - Android browsers older than Chrome 92;
     - any page opened over plain `http://` on a network address.
   - **Fix:** add one `makeId()` helper. It uses `crypto.randomUUID` when it exists and otherwise builds a version 4 UUID from `crypto.getRandomValues`. Use it in every place.
   - **Test:** add one that removes `crypto.randomUUID` before the page loads and checks that the app still starts and can save a report.
2. **One call fails before iOS 15.4 and Chrome 92.** `report.updates.at(-1)` appears once; use `[length - 1]` instead.
3. **Some selected states don't show on older browsers.** These styles depend on `:has()`, which only works from iOS 15.4 and Chrome 105:
   - the ticked consent line;
   - the selected Appearance option;
   - the review card without artwork;
   - a single photo.

   On older browsers they do nothing. The consent tick and the Appearance choice must show their state everywhere, so use sibling selectors or a class set in JavaScript.
4. **`100vh` is too tall in Safari.** It appears in `height: 100vh` and `min-height: 100vh`. Safari's moving toolbar makes `100vh` taller than the visible screen, so add a `100dvh` line after each.
5. **The notch and home bar padding doesn't work on iPhone.**
   - The viewport meta has no `viewport-fit=cover`. The app already pads with `env(safe-area-inset-*)` in 8 places, but on iPhone those values stay 0 without it.
   - Add `viewport-fit=cover`. Then check that:
     - the top bar clears the notch or Dynamic Island;
     - the tab bar and the sticky Back/Continue bar clear the home indicator.
   - Check this both in Safari and as a Home Screen app, in portrait and landscape.
   - Make sure the Android app, which pads natively, does not get double padding.
6. **There is no iPhone icon or browser-tab icon.**
   - iPhone ignores SVG icons, so "Add to Home Screen" shows a screenshot. The page also has no favicon link.
   - Ready-made files are in `design/v2-handoff/logo/web/`:

     | File | Where it goes |
     | --- | --- |
     | `apple-touch-icon.png` | 180 × 180, square, no transparency (iOS rounds the corners itself). Add `<link rel="apple-touch-icon" href="apple-touch-icon.png">`. |
     | `icon-192.png`, `icon-512.png` | Manifest icons with `"purpose": "any"`, next to the SVGs. Some browsers need PNGs before they offer "Install". |
     | `icon-maskable-192.png`, `icon-maskable-512.png` | Manifest icons with `"purpose": "maskable"`. |
     | `favicon-32.png` | `<link rel="icon" href="icon.svg" type="image/svg+xml">` plus `<link rel="icon" href="favicon-32.png" sizes="32x32">`. |
     | `fixnow-logo-square.svg` | The source of the iPhone icon. |

   - Add the new files to the service worker `ASSETS` list (they are small) and bump the cache.
7. **Two more iPhone settings:**
   - Add `<meta name="apple-mobile-web-app-title" content="FixNow">`, and check how the status bar looks in the Home Screen app.
   - Add `-webkit-text-size-adjust: 100%` on `html`, so that iPhone doesn't enlarge text in landscape.
8. **iPhone zooms in on small text fields.**
   - It does this when a field's text is smaller than 16 px.
   - The report fields and the search box use 1rem, which is fine.
   - Check every input, select and textarea at phone width, including the My reports filters, staff sign-in and Find report.
9. **Safari can delete saved data.**
   - If a website isn't visited for 7 days, Safari can delete its stored data, unless it was added to the Home Screen.
   - FixNow keeps unsent reports and tracking secrets only on the phone, so on iPhone this could lose them.
   - When FixNow runs in Safari on an iPhone (not from the Home Screen), show a short tip after a report is saved or sent: "On iPhone, add FixNow to your Home Screen so your reports stay saved on this phone." Keep the existing advice to save the reference and secret.
   - Call `navigator.storage.persist()` where the browser supports it.
10. **Calls.**
    - On iPhone, iOS asks "Call 112?" itself after FixNow's confirmation. That is fine.
    - On laptops and iPads without a phone line, the Copy button is how people get the number, so keep it.

## How to test without an iPhone

- **Engines.** Install Playwright's WebKit (Safari's engine) and Firefox engines with `npx playwright install webkit firefox`. Check free disk space first.
- **Runs.** Run the layout check, the axe scan and the walkthrough in Chromium, WebKit and Firefox, in light and dark mode.
  - In WebKit, also use Playwright's iPhone device profiles, such as "iPhone 13" and the small "iPhone SE".
  - Every engine must show no sideways scrolling, 0 WCAG violations and no page errors.
- **Startup test.** Add the "no `crypto.randomUUID`" startup test from item 1.

## What still needs a real iPhone

These can only be checked on a real iPhone:

- notch and home-indicator spacing;
- the keyboard together with the sticky bars;
- Add to Home Screen;
- offline use from the Home Screen;
- the camera;
- location permission;
- handing a call over to the phone.

The app must be online over HTTPS for this. Over a plain local network link, a phone blocks the offline cache, location and secure IDs. HTTPS comes with deployment (P2), or with a temporary secure link that the owner chooses. Do not set up either without the owner.
