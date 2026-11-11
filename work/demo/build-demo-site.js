"use strict";

// Builds the public demo site into docs/ (served by GitHub Pages from the main branch's /docs folder).
//   npm run build:demo
// The site is the same web app, permanently in demo mode:
//   - IS_DEMO_MODE is always true, so sample data is used and every request helper refuses to send anything;
//   - a content security policy (connect-src 'self') stops the browser connecting to any other server, so no report,
//     photo or sign-in can leave the page even if a code path were missed;
//   - calls are switched off in the app's demo mode; staff sign-in points to the screen gallery;
//   - the screen gallery (design/screens) is published at /screens/.
// The file list is read from the Android build's syncWebAssets list, so the demo ships exactly the app's web files.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const outputs = path.join(root, "outputs");
const site = path.join(root, "docs");
const gradle = fs.readFileSync(path.join(root, "work", "fixnow-android", "app", "build.gradle"), "utf8");
const includes = [...gradle.matchAll(/^\s*include "([^"]+)"/gm)].map((m) => m[1]);
if (!includes.includes("fixnow-ghana.html")) throw new Error("Could not read the web file list from build.gradle");

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(a, b); else fs.copyFileSync(a, b);
  }
}
function replaceOnce(text, from, to, file) {
  if (text.split(from).length !== 2) throw new Error(`${file}: expected exactly one "${from.slice(0, 60)}"`);
  return text.split(from).join(to);
}

// Start from an empty docs/ folder each time, keeping nothing stale. (docs/ holds only this generated site.)
fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
for (const pattern of includes) {
  if (pattern.endsWith("/**")) copyTree(path.join(outputs, pattern.slice(0, -3)), path.join(site, pattern.slice(0, -3)));
  else fs.copyFileSync(path.join(outputs, pattern), path.join(site, pattern));
}

const DEMO_CSP = `<meta http-equiv="Content-Security-Policy" content="connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'" />`;

// The resident app: always demo mode, and no connections to other servers.
let app = fs.readFileSync(path.join(site, "fixnow-ghana.html"), "utf8");
app = replaceOnce(app, `const IS_DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";`, `const IS_DEMO_MODE = true; // Public demo build: always demo mode, nothing is sent.`, "fixnow-ghana.html");
app = replaceOnce(app, `new URLSearchParams(location.search).get("demo") === "1" ? "fixnow-gh-demo-v1-settings"`, `true ? "fixnow-gh-demo-v1-settings"`, "fixnow-ghana.html");
app = replaceOnce(app, `<meta charset="utf-8" />`, `<meta charset="utf-8" />\n  ${DEMO_CSP}`, "fixnow-ghana.html");
fs.writeFileSync(path.join(site, "fixnow-ghana.html"), app);

// The staff page: demo too (it explains that sign-in needs a real server), and it may connect only to its own site.
let staff = fs.readFileSync(path.join(site, "staff.js"), "utf8");
staff = replaceOnce(staff, `const IS_DEMO = params.get("demo") === "1";`, `const IS_DEMO = true; // Public demo build.`, "staff.js");
fs.writeFileSync(path.join(site, "staff.js"), staff);
let staffHtml = fs.readFileSync(path.join(site, "staff.html"), "utf8");
staffHtml = replaceOnce(staffHtml, `connect-src 'self' https://api.fixnowghana.org http://localhost:4180 http://127.0.0.1:4180;`, `connect-src 'self';`, "staff.html");
fs.writeFileSync(path.join(site, "staff.html"), staffHtml);

// Start page: goes straight to the app, with plain links for people without JavaScript.
fs.writeFileSync(path.join(site, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${DEMO_CSP}
<title>FixNow Ghana demo</title>
<meta http-equiv="refresh" content="0; url=fixnow-ghana.html" />
<link rel="icon" href="icon.svg" type="image/svg+xml" />
<style>body{margin:0;padding:24px 16px;background:#f3eee1;color:#0d2a22;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}a{color:#0a7a52;font-weight:700}</style>
</head>
<body>
<h1>FixNow Ghana demo</h1>
<p>Opening the demo app. Sample data only: nothing you enter leaves the page, and calls are switched off.</p>
<p><a href="fixnow-ghana.html">Open the demo app</a> or <a href="screens/">see every screen</a>.</p>
</body>
</html>
`);

// The screen gallery at /screens/ (index.html and the images; README.md is for GitHub's own view).
copyTree(path.join(root, "design", "screens", "img"), path.join(site, "screens", "img"));
fs.copyFileSync(path.join(root, "design", "screens", "index.html"), path.join(site, "screens", "index.html"));

// Serve files as they are (no Jekyll processing on GitHub Pages).
fs.writeFileSync(path.join(site, ".nojekyll"), "");
fs.writeFileSync(path.join(site, "README.md"), "# Generated public demo site\n\nThis folder is generated by `npm run build:demo` from `outputs/` and `design/screens/`. Do not edit it by hand.\n");

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`Demo site built in docs/: ${count(site)} files (always demo mode, connections limited to the site itself, gallery at screens/).`);
