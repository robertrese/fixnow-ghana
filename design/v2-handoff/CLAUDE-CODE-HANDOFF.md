# FixNow Ghana: handoff to Claude Code (9 November 2026)

This file carries everything from the chat where the V2 build and the V3 redesign were done, so a Claude Code session can continue without that conversation. Read `CLAUDE.md` (project root) first for the rules and commands.

## Kickoff prompt

Paste this as the first message in Claude Code, with this project folder open:

```text
You are taking over FixNow Ghana from an earlier session. Read CLAUDE.md and
design/v2-handoff/CLAUDE-CODE-HANDOFF.md before doing anything.

Then work through the "Task list" in the handoff file in order, starting with P0:
1. Verify the current state: npm run check (expect 17 suites passing), set up the
   QA tools from work/qa/README.md, start the local API and web server, seed demo
   data, run npm run qa and look at the screenshots yourself.
2. Make the first Git commit (the repository has none yet), after checking that
   nothing secret or generated is staged.
3. Rebuild the Android debug app and tell me how to install and smoke-test it.

Rules: never open, print or commit anything in work/fixnow-secrets; do not deploy,
create accounts or change external services without asking me; ask before deleting
files; run npm run check before and after every change and commit after each verified
step. Explain what you did in plain language. When P0 is done, show me the P1 list
and ask which to do first.
```

If you use Claude Code on the web instead of the desktop app, the project must be in a GitHub repository first. Create a private repository and push only after the first commit has been checked for secrets.

## Where things stand

- **Folder:** `C:\Users\tyres\Documents\Codex\2026-06-14\i-want-an-app-that-solves`
- **Version:** V3 ("bolder") design on top of the V2 build. All 17 test suites pass.
- **Accessibility:** axe-core reports 0 WCAG 2.1 A/AA violations at 320, 390 and 1280 px.
- **Layout and errors:** no screen scrolls sideways, including with Large text. The walkthrough shows no page errors.
- **Git:** the repository exists but has **no commits**. Making the first commit is the first real task.
- **Backups:** the previous versions of every file changed in the chat are in `design/backup-before-v2/` and `design/backup-before-v3/`. Both are ignored by Git. They can be deleted once the owner is happy.
- **Not done anywhere:** deployment, the live map (no Google Maps key yet), SMS sign-in (no OTP provider yet), a signed release build, and testing on a real phone.

## What was done in the chat

### 1. Audit (8 November)

The app worked online, offline and when syncing, and its tests passed. The audit still found regressions against the owner's requirements:

- emergency hotlines were hidden on phones;
- Profile had a raw `tel:` link that skipped the confirmation;
- "people affected" defaulted to 25;
- severity defaulted to Critical;
- the brand colours had been overridden by an August refresh;
- some headings were duplicated, and Profile rows showed empty squares.

### 2. V2 build (Figma frames in `reference/`)

- **Welcome:** a Ghana map illustration and three plain consent statements.
- **Home:** report and 112 actions, illustrated problem types, and hotlines on every screen size.
- **Report wizard:** six steps in this order: problem, place, describe, photos, contact, review. Yes/No controls are labelled. There are no fake defaults. The review step shows a summary and checks for similar reports nearby.
- **Results:** "Report submitted" (reference and secret, each with Copy) and "Saved and waiting to send" are separate screens.
- **Unsent reports:** these retry with backoff while the phone is online, and retry again when the app becomes visible.
- **Moderated public photos (backend):**
  - migration `20261108_10_moderated_public_images`;
  - `POST /api/reports/:id/attachments/:attachmentId/public` (approve or withdraw, moderators only, needs `privacyChecked: true`);
  - `GET /api/public/images/:imageId`.
  - Metadata is stripped for JPEG, PNG and WebP. There are at most four photos per report.
  - Every change is audited, and rejecting a photo withdraws it.
  - The integration test covers all of this.
- **Bug found by the new test:** photo approval compared an object with a string, so every approval would have failed. It is fixed.
- **Accessibility work:**
  - focus management;
  - dialogs open at the top;
  - contrast fixes;
  - valid ARIA roles;
  - the map falls back to the list in plain language.
- **Phase 12 page budget:** this now measures compressed size (120 KiB) with a 600 KiB raw cap. The page is one file, and compressed size is what a phone downloads.

### 3. V3 redesign (owner asked for a bolder look)

- Deep green with Ghana gold for the main action, flag red only for 112, and burgundy for emergency on light screens.
- One signature decoration: a woven kente-style strip, plus a contour drawing of Ghana on the Home hero.
- Bundled fonts: Bricolage Grotesque for headings and the big emergency numbers, and Atkinson Hyperlegible Next for everything else. They are cached offline and packaged for Android.
- **Home:** a hero with "What needs fixing today?", an emergency number board with large numerals, and "Verified near you" filled from the public feed.
- **Report flow:** on phones the tab bar is hidden and there is an exit (×) button. One sticky Back/Continue bar. Illustrated problem tiles. Done returns to Home.
- **Nearby and My reports:** Nearby has compact controls and cards that lead with the photo. My reports has a labelled tracker: sent, checked, assigned, fixed.
- **Laptop:** Home has two columns, the report form has a step list beside it, and Nearby and My reports use card grids. Tablets get two-column lists.
- **Layout bugs fixed:** sideways scrolling on the review step (fieldset minimum width), in My reports with Large text (long references), and in Profile with Large text (page sections can now shrink).

### 4. Tooling added for Claude Code

- `work/design/fixnow-v3.css` with `npm run build:css`. It reproduces the shipped style layer byte for byte.
- `work/qa/`:
  - local API launcher (no hard-coded passwords);
  - demo seeding through the real API;
  - layout check;
  - axe-core WCAG scan;
  - walkthrough screenshots.

## Decisions to keep

- **Brand stays:** the FN logo, deep green, canopy green, burgundy emergency colour, cream background and Ghana colours. V3 made them bolder; it did not replace them.
- **No claims the system cannot back up.** Phrases from the mockups were removed:
  - "Your contact details are encrypted";
  - "submitting to municipal authorities";
  - "Anonymous Mode";
  - "Reports stay stored locally on this phone".
- **Moderation before anything is public.** Approximate public locations only.
- **The emergency confirmation dialog stays for every call.** It costs one tap and prevents accidental calls.
- **Offline first:** no runtime network dependency for fonts or styles.
- **Demo data is labelled as demo data.** The screenshots in `screenshots/` and `screenshots-v3/` use four invented reports. The two "photos" are drawings. This matters if screenshots appear in an application.

## Task list

### P0: do first, in order

1. **Verify.**
   - Run `npm run check` and expect 17 passing.
   - Install the QA tools (`work/qa/README.md`) and start the API and web server.
   - Run `npm run qa:seed`, then `npm run qa`.
   - Open several screenshots and check them yourself.
2. **First Git commit.**
   - Run `git status` and confirm nothing from `work/fixnow-secrets/`, no `*.jks`, `*.keystore` or `.env` files, no `node_modules`, no `outputs/oracleJdk-27/` and no local data is listed.
   - Then commit with a message like "FixNow Ghana V3: redesign, moderated photos, QA tooling".
3. **Android.**
   - Rebuild the debug app (`CLAUDE.md`). Confirm `app/build.gradle` packages `illustrations/**` and `fonts/**`.
   - Explain to the owner how to install it with `adb install -r` or by copying the APK.
   - Smoke-test on a real phone: welcome, an offline report that later sends, the 112 confirmation, Nearby, and Large text.

### P1: improvements, ask the owner which first

4. **Responder portal:** bring it into the V3 visual language. It still uses dot-joined meta strings (search for `case-meta` in the responder card renderer). Keep its scope and privacy rules, and add guards.
5. **Notifications:** the Nearby notifications count never changes (`#nearbyUnreadCount` is static). Either make it real or hide the bell until notifications exist.
6. **Report types:** the server accepts any report type string. Add a whitelist that matches the app's list, plus a test in `test-api.js`, and keep the responder sync working.
7. **CSS budget:** dead CSS remains in the older base style layers (the first `<style>` block, including the August "refresh"). Prune it carefully to win back page budget, checking with `npm run check` and `npm run qa` after each batch.
8. **Real-phone pass:** test on a low-end Android phone, a slow connection and airplane mode. Fix what is slow or confusing.

### P2: needs the owner's accounts or decisions

9. **GitHub:** a private repository. The owner creates it; Claude Code adds the remote and pushes after a secrets check.
10. **Live map:** a restricted Google Maps browser key and Map ID (see `work/fixnow-backend/MAPS-SETUP.md`).
11. **SMS sign-in:** an OTP provider for optional citizen accounts (see `work/fixnow-backend/CITIZEN-ACCOUNTS.md`).
12. **Deployment:** hosting over HTTPS with secrets in a secret manager (see `work/fixnow-ops/` and `work/fixnow-backend/PRODUCTION-ARCHITECTURE.md`).
13. **Translations:** some help text exists in Twi, Ga, Ewe, Hausa, Dagbani and Fante, and full translations are labelled as planned. Full translations need human translators. Do not machine-translate safety text.

## Done means

- `npm run check` passes: 17 suites.
- `npm run qa` passes: no sideways scrolling, 0 WCAG violations, no page errors.
- You have looked at the screenshots yourself.
- The service worker `CACHE_NAME` was bumped if any cached file changed.
- New web files are in the service worker `ASSETS` list and the Gradle include list.
- A Git commit describes the change.
- The owner gets a short plain-language summary of what changed and anything he must do himself.
