# Status bar, logo and dark mode: brief for Claude Code (10 November 2026)

This brief comes from the chat. It covers three jobs, done in this order and committed one at a time:

1. Fix the status bar overlap on Android 15 and newer.
2. Use the correct logo everywhere.
3. Add dark mode.

`CLAUDE.md` still applies in full: tests, QA, commits, secrets and offline.

## 1. Status bar on Android 15 and newer

**What is wrong.** The app targets Android 16 (`targetSdk 36`). On Android 15 and newer, such apps are drawn edge to edge. Two things follow:

- `android:statusBarColor` and `android:navigationBarColor` in `styles.xml` no longer have any effect.
- The WebView sits under the status bar (see `work/qa/screenshots/android/02-home.png`).

**What to do:**

- **Insets.** Apply the system-bar and display-cutout insets (`WindowInsetsCompat`) to the view that holds the WebView. Nothing may sit under the status bar, the gesture bar or the 3-button bar.
- **Status bar.** Paint the strip behind the status bar deep green `#0d2a22`, with light icons (`WindowInsetsControllerCompat`). This works in both light and dark mode.
- **Bottom area.** Make the area below the tab bar match the tab bar. Build it so that it can follow the theme once dark mode exists.
- **Keyboard.** Edge to edge also changes how the window reacts to the keyboard. The keyboard must never cover the field being typed in. Check:
  - the description (step 3);
  - the contact fields (step 5);
  - staff sign-in.
- **Test** on an Android 16 emulator and an Android 11 (API 30) emulator, each with gesture navigation and with 3-button navigation. There must be no overlap on new phones and no extra gap on older ones. Save before and after screenshots.
- **Guard.** Add a check to `phase12-accessibility-android.test.js` that `MainActivity` applies window insets.

## 2. The correct logo

The owner confirmed which logo is correct: the one in the Figma report frames (`v2-welcome`, `v2-home`, `v2-report-step-1` to `6`). It is a rounded square in three equal vertical bands (red, gold, green), with a white "FN" on the gold band. See `reference/dark/figma-correct-logo-report-steps.png`.

**Today the app uses other logos:**

- `outputs/icon.svg` (the logo in the app and the web app icon) is a Ghana flag card with a black star and "FN" on a dark tile.
- The Android launcher icon is a third version: the flag and star, with no "FN".

**Files ready in `design/v2-handoff/logo/`:**

| File | Use |
| --- | --- |
| `fixnow-logo.svg` | The master. It is rebuilt from the Figma export and matches it to within anti-aliasing (about 2% average pixel difference at 68 px). The letters are paths, so no font is needed. |
| `fixnow-logo-maskable.svg` | The web app manifest icon with `"purpose": "maskable"`. It has no corners or margin. The bands are equal thirds of the central 80% safe zone and run out to the edges. |
| `android/drawable/ic_launcher_background.xml` | The bands of the adaptive launcher icon, sized so that each is a third of the 72 dp area that launchers show. |
| `android/drawable/ic_launcher_foreground.xml` | The "FN" letters, mapped into that 72 dp area. This file is also the monochrome (themed icon) layer. |
| `android/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` | The adaptive icon definitions. |
| `android/mipmap-*/ic_launcher.png` and `ic_launcher_round.png` | PNG icons for Android 6 to 7.1. The app has none today, so those phones show a generic icon. |
| `logo-check.png` | Shows the Figma and rebuilt logos side by side, the logo on light and dark backgrounds, and the launcher masks. |

**Measurements:**

- **Colours:** red `#BE3935`, gold `#E3B944`, green `#2A5037`, white letters. These were measured from the Figma export. If Figma's fill panel shows different values, use Figma's in every file.
- **Corner radius:** 11% of the width.
- **"FN":** cap height 15.4% and width 25.7% of the tile, centred.

**What to do:**

- **Web files:**
  - Replace `outputs/icon.svg` with `fixnow-logo.svg`.
  - Add `outputs/icon-maskable.svg`, copied from `fixnow-logo-maskable.svg`.
  - In the manifest, list `icon.svg` with `"purpose": "any"` and `icon-maskable.svg` with `"purpose": "maskable"`.
  - Add the new file to the service worker `ASSETS` list and the Gradle include list, then bump the cache.
- **In the app:** the logo appears as `.brand-mark` (laptop sidebar), `.topbar-logo` and `.welcome-logo`. Remove any background, padding or radius that was there for the old icon, so the new tile is not framed twice.
- **Keyline on dark surfaces.**
  - The problem: the logo's green band has only 1.7:1 contrast against deep green `#0d2a22`, and 2.0:1 against the dark-mode background, so its right third disappears (see `logo-check.png`).
  - The fix: give the logo a thin light keyline, about 1.5 px of cream at roughly 40 to 60% opacity.
  - Where it applies:
    - on the welcome screen;
    - on the Home hero;
    - in the laptop sidebar;
    - everywhere in dark mode.
- **Android.**
  - Copy the two drawables, the two adaptive icon XML files and the PNG icons into `work/fixnow-android/app/src/main/res/`. The `launcher_background` colour in `colors.xml` will then be unused.
  - Check the icon on the emulator home screen, including themed icons on Android 13 and newer.
- **Keep the white "FN" as designed.** On gold its contrast is 1.9:1, but logos are exempt from WCAG contrast rules, and "FixNow Ghana" is always written beside it.
- **Guards in `v2-design.test.js`:**
  - `icon.svg` contains the three band colours and no star or flag;
  - the manifest has a maskable icon;
  - the launcher uses the new layers.
- **Docs.** Add the logo rules to "Design system" in `CLAUDE.md`.

**For the owner, in Figma:** two frames still use other logos, and so do their dark copies.

- `v2-find-report` uses a burgundy "FN" square.
- `v2-report-success` uses three rounded bars: green, burgundy, green.

## 3. Dark mode

### 3.1 What Figma's AI produced

These notes come from an analysis of the owner's screenshot.

- **The frames.** There are 17 dark frames, one under each light frame:
  - welcome and home;
  - report steps 1 to 6;
  - my reports and nearby;
  - profile (two frames);
  - report submitted, report detail and similar report;
  - find report and report timeline.
- **What changed.** The layouts and wording are the same as the light frames; only the colours changed. There is no theme switch.
- **What they are based on.** They copy the **V2 Figma layouts, not the V3 app**. They have no hero, no gold and no kente strip, the tab bar shows during reporting, and mint is used everywhere.
- **How to use them.** Take the palette and the way surfaces stack. Do not re-lay out the app to match the frames, and take all wording from the app, not from the frames.

Palette measured from the frames:

| Role | Colour |
| --- | --- |
| Page background | `#131914` |
| Cards | `#1F2720` |
| Fields | `#1A231C` |
| Raised, selected and tiles | `#28382D` |
| Accent (buttons, selected items), with dark text | `#97D1A6` (mint) |
| Emergency | `#A33C44` |
| Red-tinted panel | `#36252A` |
| Amber-tinted panel | `#363322` |

Each frame is only about 50 px wide in the screenshot. The colours of large areas are reliable, but the small text could not be read.

### 3.2 Decisions

1. **Main action: Ghana gold.**
   - Use `#FCD116` with deep green text `#0D2A22` (10.4:1). V3's rule is "gold for the main action on dark surfaces", and in dark mode every surface is dark.
   - Mint `#97D1A6` becomes the accent for links, verified states, selected items, progress and switches.
   - If the owner prefers the Figma look (mint buttons), only the main-action token changes.
2. **112 stays flag red.**
   - Use `#CE1126` with white text (5.6:1), not Figma's duller `#A33C44`, which has only 2.8:1 contrast against the dark background.
   - In dark mode, give each 112 button a light 1.5 px ring. Without it, red has only 2.7:1 contrast against dark cards and against the deep green hero.
   - 112 must stay the most urgent thing on every screen.
3. **Severity keeps the V3 colours:** green for Low, blue for Medium, amber for High and red for Critical. Do not use the Figma frame's red "High". In dark mode, give the selected option a light ring, because its fill has less than 3:1 contrast against dark cards.
4. **Problem types keep their own colour in dark mode.**
   - Figma turned flooding and water green; keep their own colours.
   - The illustrations have near-black outlines (`#13201B`), with only 1.2:1 contrast on a dark tile. So each illustration sits on a light rounded cream plate (`#F3EEE1`) inside its tile, which gives 14.5:1.
5. **The Home hero stays deep green `#0D2A22`,** with the Ghana outline and the kente strip. The strip separates the hero from the dark page. The welcome screen and the laptop sidebar are already dark and stay as they are.
6. **Photos are never dimmed or filtered,** because they are evidence. Give them a thin border so their edges show.
7. **General rules:**
   - no pure white for long text;
   - no shadows for depth: use borders and lighter surfaces instead.

### 3.3 Dark colour values

Contrast is checked in every row where it matters.

| Token (V3 name) | Light | Dark | Contrast |
| --- | --- | --- | --- |
| `--soft` (page) | `#f3eee1` | `#131914` | |
| `--panel` (cards) | `#fffdf8` | `#1f2720` | |
| Fields | | `#1a231c` | |
| Raised and selected | | `#28382d` | |
| `--ink` (text) | `#0d2a22` | `#eef2ee` | 13.6:1 on cards, 15.8:1 on the page |
| `--muted` | `#4f5c55` | `#b3beb6` | 8.0:1 on cards |
| `--line` | `#ddd5c2` | `#2e3a32` | Decorative only |
| `--line-strong` (fields, switches, outlined buttons) | `#c9bfa6` | `#7d8c82` | 4.3:1 against cards, 5.1:1 against the page |
| Links and verified (`--green-2`) | `#0a6345` | `#97d1a6` | 8.8:1 on cards |
| Main action | `#0d2a22` with `#fdfaf1` text | `#fcd116` with `#0d2a22` text | 10.4:1 |
| 112 | `#ce1126` with white text | Same, plus a 1.5 px `#fffdf8` ring | 5.6:1 |
| Emergency text (burgundy in light) | `#72262e` | `#f4a7ae` | 8.0:1 on cards, 7.6:1 on its panel |
| Emergency panel | `#f6dcdd` | `#36252a` | |
| Warning text and panel | | `#f3c95a` on `#363322` | 8.1:1 |
| `--focus` | `#1747b8` (only 2.2:1 on dark, so it fails) | `#8fb4ff` | 7.4:1 on cards |

Status labels (text on fill), each at least 8:1:

- open: `#f3b3b8` on `#3a2427`;
- review and progress: `#a9c8ec` on `#1d2a38`;
- assigned: `#f0cf7a` on `#352c17`;
- resolved: `#9fdab4` on `#1c3326`;
- waiting: `#f5c27a` on `#3a2a14`.

Problem-type tile colours (labels on them are at least 11.8:1):

- flooding `#1d2a38`;
- road `#352f1a`;
- waste `#1c3326`;
- water `#183232`;
- power `#382d14`;
- safety `#3a2427`.

In the Figma frames, several boundaries are nearly invisible:

- fields (`#1A231C` on `#1F2720`, 1.05:1);
- switches that are off;
- card edges (1.16:1).

The `--line-strong` value above fixes them.

### 3.4 How to build it

- **Clean up first if needed.**
  - The base `<style>` block has about 98 hex colours and 51 `rgb()` values; `fixnow-v3` has 73 and 22.
  - If the old layer makes this messy, or the page budget gets tight, do P1 item 7 (remove dead CSS) first, in its own commit.
- **Tokens.**
  - Replace hard-coded colours in `work/design/fixnow-v3.css` with tokens, and add one dark block, `:root[data-theme="dark"]{…}`.
  - Add a small inline script at the top of `<head>` that sets `data-theme` before the first paint, so there is no white flash. It reads:
    - the saved choice;
    - the phone setting (`matchMedia('(prefers-color-scheme: dark)')`), and listens for changes to it.
- **Setting.**
  - Add Profile → "Appearance" with three choices: Match phone (the default), Light and Dark.
  - Save it with the other settings, with try/catch around storage.
- **Large text and High contrast** must work in both themes. In dark mode, High contrast means white text and brighter borders.
- **Metadata.**
  - Add `<meta name="color-scheme" content="light dark">`.
  - The `theme-color` meta is still `#32734a`, an old colour: change it to `#0d2a22`.
  - The manifest's `background_color` (`#f3f7f4`) is also old: use `#0d2a22`.
- **Android.**
  - Why the theme matters: with targetSdk 33 and newer, the WebView reports dark mode only if the app's theme is dark (`isLightTheme`).
  - Add `values-night/styles.xml` with a dark parent theme and window background `#131914`. Keep the light theme in `values/`.
  - Turn off algorithmic darkening explicitly, so Android never inverts the page by itself: `WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)`, after checking `WebViewFeature.ALGORITHMIC_DARKENING`.
  - `configChanges` includes `uiMode`. So test switching the phone's dark mode while the app is open (`adb shell cmd uimode night yes`, then `no`).
  - The owner can choose Dark or Light in the app while the phone is set the other way. The system-bar icons must still be readable then. If the page has to tell Android its theme, use `WebViewCompat.addWebMessageListener`, limited to `https://appassets.androidplatform.net`. Never use `addJavascriptInterface`.
- **Map.** The list fallback follows the tokens. When the Google Maps key is added later, use the map's dark colour scheme in dark mode.
- **Print.** Always print in the light theme.

### 3.5 What in the Figma frames must not reach the app

These apply to both the light and the dark frames.

- **Step 5:** the "Remain anonymous" switch and "Your contact details are encrypted…". Both were removed on purpose, because they are not true of the system.
- **Report submitted:** "If you are offline, your report will be queued…". The app has a separate "Saved and waiting to send" screen.
- **Similar report:**
  - "Step 1 of 2" is wrong: the report has six steps.
  - "This increases local visibility and prioritization" is not true: nothing in the system does this.
- **Find report:**
  - "Enter 8-digit tracking secret" and the sample "7K3M" are wrong: the server requires a secret of at least 43 characters.
  - "Secrets are encrypted" is not accurate: the server stores only a hash. Say something like "FixNow keeps only a scrambled copy, so a lost secret can't be recovered".
- **Report detail and timeline:**
  - These are mockup data:
    - example events ("Accra Metropolitan Assembly: drainage team dispatched", "Scheduled for field inspection");
    - "23 people also affected".
  - Show only real events and real counts.
- **Older styling in frames 13 to 17:**
  - red serif headings;
  - ALL-CAPS labels;
  - a flat 5-tab or 4-tab bar;
  - other logos.

  The app already uses V3.
- **Smaller differences:**
  - The welcome screen's "Continue without account" is "Track a report" in the app.
  - Severity "High" is red in the frames; the app uses amber.

### 3.6 Screens with no dark design yet

Derive these from the tokens, then screenshot each one:

- the consent step;
- the emergency hotlines sheet and the call confirmation;
- "Saved and waiting to send";
- My report detail, with the tracker and "Not sent yet";
- the notifications list (the new bell);
- staff sign-in and the responder portal;
- the laptop and tablet layouts;
- Large text and High contrast in dark mode;
- empty, error and offline states;
- dialogs and toasts.

### 3.7 Done means

These are in addition to the "Done means" list in `CLAUDE-CODE-HANDOFF.md`.

- **Tests.** `npm run check` passes, and the Phase 12 page budget still passes. There is about 10 KB of compressed room left.
- **QA in both themes.**
  - Run the layout check, the axe scan and the walkthrough in light, and again with Playwright's `colorScheme: "dark"`.
  - The dark runs must show 0 WCAG violations at 320, 390 and 1280 px.
  - Save the dark screenshots in `work/qa/screenshots/dark/`.
- **Guards in `v2-design.test.js`:**
  - the dark tokens exist;
  - the Appearance setting defaults to Match phone;
  - the color-scheme meta is present;
  - 112 stays `#ce1126` in dark mode;
  - mint is used only in dark mode, because it fails on cream.
- **Android.** Take emulator screenshots in light and dark on Android 16. The status bar and keyboard checks from part 1 must still pass in dark mode.
- **Offline cache.** Bump the service worker cache. Add any new file to `ASSETS` and to the Gradle include list.
- **Docs.** Update the design system in `CLAUDE.md` with the logo, the dark tokens and the rules. Give the owner a short, plain-language summary.
