# FixNow local QA tools

These scripts test the app the way a resident uses it, against a local server. They never touch production.

## One-time setup

```powershell
npm install --no-save playwright@1.63.0 axe-core@4.10.2
npx playwright install chromium
```

`--no-save` keeps the test tools out of `package.json`, so the app itself has no new dependencies.

## Each session

Run each command in its own terminal:

```powershell
npm run start:api      # local API with demo accounts; data in work/fixnow-backend/local-data
npm run start:web      # the web app on http://localhost:4173
npm run qa:seed        # once per fresh local-data folder: 4 moderated demo reports
npm run qa             # layout check, WCAG scan, then walkthrough screenshots into work/qa/screenshots
```

- `overflow-check.js` fails if any screen scrolls sideways at 320 px, or at 320 or 390 px with Large text.
- `a11y-scan.js` fails on any axe-core WCAG 2.1 A/AA violation at 320, 390 or 1280 px. Automated checks miss some problems, so also try a keyboard and a screen reader (TalkBack on Android).
- `walkthrough.js` screenshots every main screen on a phone and a laptop, and fails if the page logs an error.

To start again with clean data, stop the API, delete `work/fixnow-backend/local-data`, start the API and seed again. A new local admin password is generated into `local-dev-settings.json` in that folder.

The demo reports are invented, and the two photos in `demo-photos/` are drawings. If a screenshot goes anywhere public (an application, a slide), call it demo data.
