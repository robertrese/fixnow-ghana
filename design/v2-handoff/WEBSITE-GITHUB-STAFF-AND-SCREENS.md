# Website, GitHub, staff screens and every screen: brief for Claude Code (10 November 2026)

On 10 November the owner asked for five things:

1. **Every device.** FixNow should be a website on computers and an installable web app on iPhone, Android and every other system.
2. **GitHub.** FixNow should be on his GitHub.
3. **The staff side.** The interface used by the people who receive the issues (moderators and responders) should be built and shown to him.
4. **Every resident screen.** He wants to see every screen residents use, like the pages in his Figma file, not just a few screenshots.
5. **Report button.** The Report button in the tab bar should have no plus sign: only the word "Report" in the circle, as in the Figma report pages.

He also wants the earlier follow-ups done: page size and old phones.

**How to work:**

- `CLAUDE.md` applies in full.
- Work in the order below and commit after each step.
- After each step, run `npm run check` and `npm run qa` (Chromium and WebKit, light and dark), and look at the screenshots.

## 1. GitHub

**Ask him first whether the repository should be private or public.**

| | Private | Public |
| --- | --- | --- |
| Who sees the code | Only he and the people he invites | Anyone. It also shows on his GitHub profile, which helps applications. |
| Free GitHub Pages hosting (step 8) | Only with GitHub Pro. Verified students get Pro free through GitHub Education, but verification can take a few days. | Yes, on a free account |

If he chooses public, two more things matter:

- **His email address.** It is in the existing commits, so it would become visible.
  - Offer to use GitHub's private "noreply" address for future commits.
  - Only if he agrees, also rewrite the author email on the existing commits before the first push. Nothing is shared yet, so this is safe at this point.
- **Demo accounts.** Confirm that the demo accounts and their passwords exist only in the local launcher and can never be created in production. The Phase 11 checks cover this today.

**Creating the repository:**

- The project has no remote yet.
- Give him click-by-click steps to create an **empty** repository, with no README, `.gitignore` or licence. Suggest the name `fixnow-ghana`.
- His commits are signed `robertrese`; confirm with him that this is his GitHub username.
- Signing in to GitHub from his PC is his to do.

**Before the first push:**

- **Secrets.** Run `work/fixnow-ops/scripts/secret-scan.ps1`, and check the whole history (not only the latest commit) for keys, keystores, passwords, tokens and `.env` files. If anything secret turns up, stop and tell him. Don't push.
- **Files that must not be tracked.** `.gitignore` already excludes all of these, and 253 files are tracked today. Confirm that none of them are tracked:
  - anything from `work/fixnow-secrets/`;
  - `.apk`, `.aab` or `.zip` files from `outputs/`;
  - `node_modules`;
  - `outputs/oracleJdk-27/`;
  - local data.

Then push and give him the link.

## 2. The Report button without the plus

- **The new button.** The centre Report button in the tab bar becomes a filled circle with only the word "Report" in it.
  - No plus icon.
  - Not raised above the bar.
  - The same size and position as in the Figma pages `v2-report-step-1` to `6`. See `reference/figma-pages/figma-light-report-steps-1-5.png` and `figma-dark-report-steps-1-5.png`.
- **Colours.** Keep the current themes: deep green with white text in light mode, gold with deep green text in dark mode.
- **Fit and accessibility.**
  - "Report" must fit with Large text on and at 320 px.
  - The touch target stays at least 44 px.
  - The accessible name stays "Report".
- **Use it on every screen.** Some Figma pages still show a plus (My reports, Nearby, Profile, Report submitted). The owner wants the version without it.
- **Don't copy one Figma mistake:** the "My reports" tab has no icon in the report-step pages' tab bar.
- **Guard.** Add a test that no plus icon appears inside the Report tab.

## 3. Page size

- The page is at about 116 of 120 KiB (compressed). Remove dead CSS from the older style layers in small batches, checking after each, and report how much space came back.
- Steps 5 and 6 add screens. If they still don't fit, move the staff interface into its own page (for example `staff.html`), so residents don't download staff screens. Explain this choice to the owner before doing it.

## 4. Old phones

- **Logo spacing.** Add a spacing fallback so the logo doesn't touch the title on old WebViews. Flex `gap` only works from Chrome 84.
- **Regular check.** Add the Android 11 emulator (WebView 83) to the QA instructions and `CLAUDE.md` as a regular worst-case check: everything must work there, but small visual differences are fine.

## 5. Every resident screen, matching the Figma pages

The owner's Figma pages, light and dark, are saved in `design/v2-handoff/reference/figma-pages/`. Every page must have a matching screen in the app that people can actually reach, in our V3 style.

| Figma page | Matching screen in the app |
| --- | --- |
| v2-welcome | Welcome and consent |
| v2-home | Home |
| v2-report-step-1 to 6 | The six report steps |
| v2-report-success | Report submitted, plus the separate "Saved and waiting to send" screen |
| v2-my-reports | My reports |
| v2-nearby | Nearby, map and list |
| Report detail (inside the "canvas" frame) | The detail of a verified report, opened from Nearby |
| Similar warning (inside the "canvas" frame) | A full "Similar report found nearby" screen, shown when a similar verified report exists, with "View existing report" and "Continue with new report" |
| v2-find-report | Find your report securely |
| v2-report-timeline | A report's progress timeline |
| v2-profile-1 and 2 | Profile: settings, plus support and critical options |

- Some of these may exist in the app only as part of another screen. Where the Figma shows a full page, make it a proper full screen.
- **Keep our honest wording.** Never use the Figma wording listed in section 3.5 of `DARK-MODE-AND-LOGO.md`:
  - "anonymous" and "encrypted";
  - "Step 1 of 2";
  - "prioritization";
  - "8-digit secret";
  - invented updates and counts.

## 6. The staff side (the people who receive the issues)

**Who they are.** They sign in through staff sign-in. On the local server the demo accounts are `moderator`, `assembly`, `nadmo` and `utility`; the admin password is in `local-dev-settings.json`. There is no Figma for these screens, so design them in the V3 style for phone and laptop, in light and dark.

**Inventory first.** Before changing anything, list every staff screen and what each role can do today, with screenshots, and show the owner. The existing sections include:

- "Responder field portal";
- "Administration and routing";
- "Responder sync";
- "Routing engine";
- "Responder playbook";
- "Pressure by route";
- "Community clusters";
- "New case intake".

**What each role needs.** Build what's missing using the server's existing routes. Change the server only where needed, with tests.

- **Moderators:**
  - a queue of new reports to verify or reject, with a reason;
  - photo review (clean or rejected);
  - publishing a photo, with the privacy confirmation;
  - a preview of what the public will see before anything is published.
- **Responders (assembly, NADMO and utility):**
  - the cases in their own area, with filters;
  - a case page with the exact location, contact details if given, private photos and the timeline;
  - actions: accept the case, change its status (checked, assigned, fixed), add a public update that residents will see, add an internal note.
- **Admins:** routing, staff accounts and the audit log, where public IPs now appear as hashes.
- **Everyone:** sign out.

**Rules:**

- **Scope.** Each role sees only what the server allows. The existing scope rules and tests stay.
- **Real numbers only.** Dashboard figures ("Pressure by route", "Community clusters") must come from real reports. Remove anything invented.
- **Text style.** Fix the dot-joined details text and the ALL-CAPS labels (P1 item 4).
- **Accessibility and layout:**
  - 0 axe violations;
  - no sideways scrolling;
  - touch targets of at least 44 px;
  - full keyboard use on a laptop.

## 7. Screen gallery

- **Two versions:**
  - `design/screens/index.html`, a page the owner can open in his browser;
  - `design/screens/README.md`, a Markdown version that GitHub displays.
- **What it shows:**
  - every resident and staff screen, on phone and laptop, in light and dark;
  - each screen labelled with its Figma page name, or "Staff: …";
  - the dialogs: call confirmation and hotline choice;
  - the states: saved and waiting, not sent yet, offline, empty and error.
- **How to make it.** Extend the walkthrough so it visits every screen above, and build the gallery from it.
  - Use compressed images (for example WebP or JPEG at phone width) so the repository stays small.
  - Regenerate it only when screens change.
- **Label it as demo data.**

## 8. Public demo online

**One web app serves every system:**

- **Computers:** the laptop layout in the browser. This is "the website".
- **Phones:** the phone layout, which people can install:
  - on Android and computers, through the browser's Install button;
  - on iPhone, through Share → Add to Home Screen.

### Stage 1, now: a public demo

- **Hosting.**
  - Use GitHub Pages from the repository if it is public, or private with GitHub Pro.
  - Otherwise, list free options and ask the owner.
  - Don't create accounts or enter payment details.
- **Demo mode only.**
  - The hosted copy runs in demo mode: no report leaves the device, and a clear banner says it's a demo.
  - It must never send anything to `api.fixnowghana.org` (not his domain) or to any other server.
- **Front door and sub-folder.**
  - Make the site's front door (`index.html`) open the app.
  - GitHub Pages serves the site from a sub-folder, so check that the service worker, the manifest and the icons all work there.
- **Install help.**
  - Add an Install button where the browser supports it (Chrome and Edge on Android and on computers).
  - Add short "Add to Home Screen" steps for iPhone.
- **Staff screens in the demo.** If it's straightforward, let demo visitors look at the staff screens with labelled demo data, without a real sign-in.
- **Hand-over.** Give the owner the link, and have him test it on his phone and his PC.

### Stage 2, later: the owner's decision, not now

- a real server over HTTPS, on a domain he owns;
- production secrets;
- real data-retention periods on the privacy page;
- registration with Ghana's Data Protection Commission before collecting real personal data;
- the maps key and the SMS provider;
- a Google Play developer account (a one-time US$25 fee) for the Android app.

## 9. Automatic checks on GitHub

- **On every push,** a GitHub Actions workflow runs:
  - `npm run check`;
  - then it starts the local API, seeds the demo data, and runs the QA in Chromium, WebKit and Firefox, in light and dark.
- **Firefox.** These runs also cover Firefox, which can't run on the owner's Windows preview build.
- **No secrets.** The workflow must contain none.

## Done means

Everything in `CLAUDE.md` and the earlier briefs, plus:

- the gallery shows every screen listed above, and the owner has the link to it;
- the public demo link works on a phone and a PC, and sends nothing to any server;
- the GitHub repository has the full history, and the checks pass there;
- the owner gets a short, plain-language summary.
