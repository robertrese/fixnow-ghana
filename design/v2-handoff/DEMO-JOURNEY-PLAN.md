# Complete demo journey: plan (13 November 2026)

Status: **built (13 November 2026)**, with the owner's answers and corrections:

- Sample offices in the demo's office hint and in the gallery's staff screens. In the real app the hint is general information ("Usually handled by the District Assembly"), because FixNow is not connected to any agency yet.
- The work-done picture is a simple drawing labelled "Sample photo" and "Planned: the real app doesn't show this yet" (residents never receive resolution evidence today).
- Step 2 says what Verify really asks: the moderator confirms the title and description show no names, phone numbers or exact addresses. Every simulated step is something the real app does today, or says Planned.
- Sample Nearby reports are labelled "Sample" and name general areas only.
- The demo site's offline cache includes the journey files.

The original plan follows; where it differs from the list above, the list wins.

## Goal

A visitor to the public demo can follow one report from start to finish in about two minutes:

**report a problem → moderator check → routed to an office → the office accepts it → a progress update → the office reports the work done, with an approved sample photo → the resident confirms the fix or reopens it.**

The visitor sets the pace with a **Show next step** button and can restart at any time. Nothing leaves the page, no call can start, and every simulated step is labelled **Simulated**.

## Rules the demo keeps

1. **"Simulated" on every simulated step.** Each step in the timeline, each status change and each office message carries a visible "Simulated" label. Screen readers hear it too.
2. **Sample offices only.** The journey uses offices that are clearly not real:
   - Sample District Assembly (waste, roads, drains, flooding);
   - Sample Water and Power Desk (water supply, electricity);
   - Sample Safety Desk (public safety, fire risk).

   No real agency (AMA, NADMO, ECG, the Ghana Police Service and so on) appears as an office that uses FixNow. A short line says: "Sample offices. No real agency uses FixNow yet."
3. **No invented numbers.** There are no statistics, response times, "2 hours later" timestamps, people counts or success rates. Steps are numbered ("Simulated step 3 of 7"), not timed.
4. **Demo mode only.** The simulation lives in its own file that the real app and the Android app never load (see "How it is kept out of the real app").
5. **Existing rules stay.** These keep working as now:
   - 0 WCAG violations; 44 px touch targets; focus on each step's heading;
   - reduced motion respected; light and dark mode; 320 px phones and Large text;
   - demo reports stay `demo-local` and labelled "Demo only", never "not sent yet".

## The journey, step by step

It starts after the visitor sends a report in the demo. The "Demo report saved" page gets a new button, **Follow this report (simulated)**. It opens the report's progress page with a step bar at the bottom: "Simulated step 1 of 7", **Show next step** and **Restart**.

| Step | What the visitor sees | Status shown |
| --- | --- | --- |
| 1. Report sent | Their own report, with "Demo report: kept only in this browser". | Demo only |
| 2. Moderator check (simulated) | What a moderator checks, in plain words: it is a real community problem and not an emergency for 112; personal details (names, phone numbers) are removed from the public text; any photo shows no faces, number plates or house numbers; the public location is an approximate area, never the exact point. Result: "Verified by a moderator (simulated)". | Open, verified |
| 3. Routed to an office (simulated) | "Sent to Sample District Assembly", chosen by problem type, with one line on how routing works (each problem type goes to the office set up for it). | Open |
| 4. The office accepts it (simulated) | "Sample District Assembly accepted this report." | Acknowledged |
| 5. Progress update (simulated) | A short office message, for example "A team is clearing the drain." No dates or durations. | In Progress |
| 6. Work done, with a sample photo (simulated) | "Sample District Assembly reports the work is done." The approved sample photo is a drawing labelled "Sample photo", with "A moderator checked this photo before it was shown." | Resolved |
| 7. Your answer (simulated) | Two buttons: **Confirm it is fixed** (status stays Resolved; "Thank you, the office sees your confirmation") or **Still a problem? Reopen** (status Reopened; "The office sees that it is not fixed"). | Resolved or Reopened |

The last step offers **Restart** and **Report another problem**.

- **Restart** is always one tap away: in the step bar, and on the "Reset demo" button in the banner (which already resets the demo data).
- **Two minutes:** seven short steps, at most about 40 words each, and one tap per step.

## Nearby with sample reports

- Nearby shows **sample verified reports as a list**: about eight reports covering every problem type and several statuses (Open, Acknowledged, In Progress, Resolved, Reopened). Each is in a real Greater Accra district but at an approximate area only, and each is marked "Sample report".
- **The filters work in the browser:** category, status, region and district. "No verified reports match these filters" appears when nothing matches.
- **Map view:** the map stays switched off in the demo and says so in plain words. The list is the demo's way of browsing.

## "Similar report found nearby"

The sample reports include one at a well-known spot (for example a flooding report in Accra Metropolitan, near the Odaw drain). If a visitor reports the same problem type in the same district, step 6 shows the existing "Similar report found nearby" page, using the same screen the real app uses. It explains that nothing is merged automatically, and the visitor can continue with their own report. The match is worked out in the browser from the sample list.

## How it is kept out of the real app

- **A separate file:** the simulation is a new demo-only file, `work/demo/demo-journey.js` (with a small stylesheet), outside `outputs/`.
  - Only `npm run build:demo` copies it into `docs/` and adds its script tag to the demo copy of the page.
  - `outputs/fixnow-ghana.html` never references it.
  - It is not in the service worker list or the Gradle include list, so it is never cached for the real app or shipped in the APK.
  - The real page keeps its size: today it is 78 KiB of the 120 KiB budget.
- **Small hooks in the real page, active only in demo mode.** Nearby, the similar-report check and the "Demo report saved" page each gain one line of the form `if (IS_DEMO_MODE && window.fixNowDemo) …`. In normal mode they are skipped, and the demo file is never there anyway.
- **Simulated updates live only in the demo's storage.** They are kept under the demo's own storage name. The real page also ignores any timeline entry marked `simulated: true`, as a second safeguard.
- **The test proving normal mode can never show a simulated update:**
  - *static:* the real page, the service worker list and the Gradle list never mention the demo file;
  - *in the browser:* normal mode with a planted report that carries simulated updates must show none of them, never shows the word "Simulated", and never requests the demo file.

## Tests

- **New end-to-end check, `work/qa/demo-journey-check.js`.** It runs on the built demo in `docs/`, on a phone and on a laptop, light and dark. It:
  - sends a report;
  - completes all seven steps, once confirming the fix and once reopening;
  - checks that every simulated step says "Simulated" and that only sample offices appear;
  - checks that no screen names a real agency as a FixNow office;
  - checks Restart and the Nearby filters (every type and status);
  - checks that a matching report gets "Similar report found nearby";
  - checks 0 WCAG violations at each step;
  - checks that no request leaves the site and no call can start.
- **On GitHub** it runs in all three engines: the Chromium, WebKit and Firefox jobs each run it on `docs/`.
- **Normal-mode guard:** added to `npm run qa:outcomes` (in the browser) and `outputs/v2-design.test.js` (static).
- **Everything else stays green:** `npm run check`, `npm run qa`, `npm run qa:webkit`, the demo check. The Android checks are not needed, because the Android app never contains the demo file; a guard proves that.

## Order of work (a commit after each verified step)

1. Sample offices and the demo-only file wired into `build:demo`, with the normal-mode guard and its tests.
2. Nearby sample reports and working filters.
3. The similar-report suggestion in the demo.
4. The seven-step journey with Show next step and Restart.
5. The end-to-end check in three engines, the GitHub workflow, screenshots, the gallery and the README.
6. Rebuild the demo, push (with the owner's go-ahead) and check the live site.

## Questions for the owner

1. **Real agency names elsewhere in the demo.** Two places on the public site name real agencies:
   - The report form's "Likely responsible office" hint (for example "District Assembly + NADMO", "ECG desk") describes who is normally responsible in Ghana, not who uses FixNow. In the demo I would replace it with the sample offices plus the line "Sample offices. No real agency uses FixNow yet." Agreed?
   - The screen gallery's staff screens use demo offices named "NADMO (demo)" and "Accra Metropolitan Assembly (demo)". I suggest renaming them to the sample offices and rebuilding the gallery in step 5. Agreed?
2. **The sample photo.** A simple drawing (like the existing drawn demo photos), clearly labelled "Sample photo". Agreed, or would you prefer a real photo you own?
