# GitHub page, leftover file and browser checks on GitHub: brief for Claude Code (12 November 2026)

The owner asked for three things. Do them in this order. `CLAUDE.md` applies in full.

**The owner's go-ahead.** He approves everything below:

- editing the repository's About box and topics on GitHub;
- deleting `work/qa/debug-cases.tmp.js` (an exception to working rule 6, for this one file);
- pushing these changes and the new workflow.

He has not approved anything else on GitHub: no secrets, other settings, apps or paid services.

## 1. Tidy the GitHub page

The repository page needs three changes:

- The About box says only "Offline-first civic reporting app for Ghana". It has no website and no topics.
- The README opens with text only.
- The README still explains how to switch on GitHub Pages, which is already done.

### About box and topics

Run this, signed in to `gh` as robertrese. Keep it on one line in PowerShell.

```powershell
gh repo edit robertrese/fixnow-ghana --description "Offline-first civic reporting app for Ghana (web app and Android). Residents report local problems, moderators verify them before anything goes public, and responders see only the cases routed to their office. The demo runs on sample data." --homepage "https://robertrese.github.io/fixnow-ghana/" --add-topic "civic-tech,pwa,offline-first,accessibility,ghana,android,nodejs,sqlite"
```

Check the result with `gh repo view robertrese/fixnow-ghana --json description,homepageUrl,repositoryTopics`.

### Top of the README

This is the first thing visitors see, including admissions readers. Change it as follows:

- **Status badge.** Add the badge of the checks workflow, but only once part 3 is green.
- **Links.** Add two: the live demo (`https://robertrese.github.io/fixnow-ghana/`) and the screen gallery (`https://robertrese.github.io/fixnow-ghana/screens/`).
- **Screenshots.** Add one row of four phone screenshots, about 200 px wide each, captioned "Screens shown with demo data". Use these existing files in `design/screens/img/` and make no new images:
  - `light-phone-02-home.webp`
  - `light-phone-04-step-1.webp`
  - `dark-phone-14-nearby.webp`
  - `light-phone-31-staff-review.webp`
- **Keep** the "not pilot-ready yet" sentence.
- **Replace** the five "To switch the demo site on" steps with one line saying that GitHub Pages serves `docs/` from `main`.

### Pinning

There is no command or API for pinning a repository to a profile. The owner does this himself.

## 2. Delete the leftover debug file

- `work/qa/debug-cases.tmp.js` (990 bytes) is a leftover from debugging. It is untracked and was never pushed, so it is not in the GitHub copy.
- Delete it.
- Add `*.tmp.js` to `.gitignore`, next to the existing `*.tmp` line, so scratch files like this can't be committed by accident.
- Check that `git status` is clean afterwards.

## 3. Step 9: browser checks on GitHub

### Goal

On every push and pull request, GitHub runs `npm run check`, then the browser QA in Chromium, WebKit and Firefox, in light and dark. Firefox has never run this project, because it can't start on the owner's PC, so this is where it gets tested.

### What exists

- `.github/workflows/check.yml` has one job, `check`. It uses Node 22 with read-only permissions, runs `npm run check`, and passes.
- `package.json` already has the `qa`, `qa:webkit`, `qa:firefox` and `qa:engines` scripts.

### The `check` job

- Keep it in `check.yml`, the only workflow file, so one badge covers everything.
- After `npm run check`, add `npm run build:demo` and then `git diff --exit-code -- docs`. This fails whenever the app changes but the public demo was not rebuilt.
- The diff is reliable: a rebuild from a clean Linux checkout of `main` on 12 November gave no differences from the committed `docs/`, and the build script uses no dates or random values.
- None of this needs a browser or `npm install`.

### The `qa` job

**Settings:**

- `needs: check`.
- A matrix with `engine: [chromium, webkit, firefox]` and `fail-fast: false`, so every engine reports.
- `runs-on: ubuntu-24.04` rather than `ubuntu-latest`, so a change of runner image can't break WebKit's system libraries overnight.

**Steps:**

1. Check out with `persist-credentials: false`, and set up Node 22.
2. Run `npm install --no-save playwright@1.63.0 axe-core@4.10.2`. These are the same versions as in `work/qa/README.md`.
3. Run `npx playwright install --with-deps <engine>`. On Linux, `--with-deps` adds the browser's system libraries.
4. Start `npm run start:api` and `npm run start:web` in the background.
   - Wait until `http://localhost:4180/api/health` and `http://localhost:4173/fixnow-ghana.html` answer. Use a short curl retry loop, with no new packages.
   - Both servers listen on 127.0.0.1 only. If a browser on Linux can't reach `localhost`, check that first.
5. Run `npm run qa:seed`.
6. Run the checks for the engine:

| Engine | Checks |
| --- | --- |
| Chromium | `npm run qa` (layout, WCAG scan and walkthrough in light and dark, old-browser check, full-screen pages, staff), then `node work/qa/demo-check.js` (the public demo must never contact another server) |
| WebKit | `npm run qa:webkit` |
| Firefox | `npm run qa:firefox`, after adding the staff check to it: `staff-check.js --engine=firefox` and `staff-check.js --engine=firefox --dark`. `qa:webkit` already has both; `qa:firefox` has neither. |

   `qa:old-browsers`, which is part of `npm run qa`, also runs in WebKit. Either install WebKit in the Chromium job too, or move that WebKit run into the WebKit job.
7. If the job fails, upload `work/qa/screenshots/` as an artifact, kept for 7 days. Never upload `work/fixnow-backend/local-data`: it holds the generated local admin password.

### Settings for both jobs

- `timeout-minutes` (for example 45), on top of the scripts' own 10-minute limits.
- A `concurrency` group that cancels older runs on the same branch.
- `permissions: contents: read`.
- `workflow_dispatch`, so the owner can re-run the checks from the Actions tab.

### No secrets

- No `secrets.*`, no tokens and no `pull_request_target`.
- Only official `actions/*` actions.
- `work/qa/common.js` generates a fresh local admin password in each run. Never print it: the Actions logs of a public repository are public.

### Action versions

Use the current major versions of `actions/checkout`, `actions/setup-node` and `actions/upload-artifact`.

- Look each one up instead of guessing, for example `gh api repos/actions/checkout/releases/latest --jq .tag_name`.
- Fix any deprecation warning in the run log.

### Likely first-run problems

- **Firefox has no phone emulation in Playwright.** `common.js` already leaves out `isMobile`, so Firefox's phone runs are a narrow window with touch.
  - Fix real problems in the app.
  - If one assertion truly can't apply in Firefox, skip only that assertion, only in Firefox, with a comment saying why.
  - Never loosen a check for every engine.
- **Linux can differ from Windows.** A check that passes on Windows can fail on Linux because of timing, focus, or fonts for characters the bundled fonts don't cover. Look at the uploaded screenshots before changing anything.

## Finishing

- Commit after each verified part, with clear messages. Keep `npm run check` passing locally.
- Push, follow the run with `gh run watch`, and read failures with `gh run view --log-failed`.
- Fix and push again until all four jobs are green: `check` plus the three engines. Then add the badge to the README.
- Update `work/qa/README.md` and the "QA engines" paragraph in `CLAUDE.md`: Firefox is tested on GitHub, not on this PC.
- Report to the owner in plain language:
  - the run link, and how long a run takes;
  - what Firefox found, and what was fixed;
  - the new About box, topics and README top.
