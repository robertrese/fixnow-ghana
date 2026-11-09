# FixNow Ghana

FixNow Ghana is an offline-first civic reporting app. Residents report flooding, damaged roads, waste, water, electricity and safety problems. Moderators check each report before it appears publicly, and authorised responders see exact locations only for cases in their own area.

It is **not pilot-ready yet**. It has not been deployed, and the live map, SMS sign-in codes and production hosting still need the owner's accounts (see "Before a pilot").

## Source of truth

- `outputs/` contains the web app (`fixnow-ghana.html`), its service worker, illustrations, public policy and support pages, and the front-end tests.
- `work/fixnow-backend/` contains the Node.js API (SQLite) and its integration test.
- `work/fixnow-android/` contains the Android WebView wrapper source. Its generated web assets and build outputs are excluded.
- `work/fixnow-ops/` contains deployment and operational documentation.
- `outputs/fonts/` contains the two bundled typefaces, Bricolage Grotesque and Atkinson Hyperlegible Next, with their SIL Open Font License files.
- `design/v2-handoff/` contains the redesign brief, artwork, reference frames, screenshots and build notes.

Generated Android builds, runtime databases, WAL/SHM files, test data, logs, release artifacts, and all signing material are intentionally ignored. Do not place secrets in this repository. The existing signing material under `work/fixnow-secrets/` is retained locally until the owner confirms a secure backup; it must never be committed or packaged into source archives.

## How it behaves today

- Emergency numbers (112; Police 191; Fire 192; Ambulance 112 or 193) are one tap from Home, and every call asks for confirmation before the phone dialler opens.
- A report takes six steps: problem, place, description, photos, contact, review. Contact details, photos and exact GPS are optional.
- Without a connection, a report is saved on the phone and sent automatically once the phone is back online with the app open. The app says "Saved and waiting to send" until the server confirms the report, and only then shows a reference number and private tracking secret.
- The public feed shows only moderator-verified reports, at an approximate location. A photo appears publicly only after a moderator marks it clean and confirms that no faces, number plates or house numbers are visible. The server re-writes each published photo without its metadata.
- Demo mode is explicitly enabled with `?demo=1`; it uses separate browser storage and disables server sync.

## Local checks

```powershell
npm run check
```

This runs the syntax checks, the front-end policy and phase tests, and the backend integration test. The local API, demo data, screenshots and accessibility checks are described in `work/qa/README.md`. `CLAUDE.md` is the working guide for contributors and AI coding assistants.

## Before a pilot

- Deploy the API behind HTTPS, with production values in a secret manager rather than a checked-in `.env` file. See `work/fixnow-backend/.env.example` for the variable names.
- Add a restricted Google Maps browser key and Map ID for the live map. Without them, Nearby shows the list of verified reports.
- Connect an SMS (OTP) provider for optional citizen accounts.
- Rebuild and sign the Android app after web changes (see `work/fixnow-android/README.md`).
