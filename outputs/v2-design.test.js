"use strict";

// Guards for the November 2026 V2 redesign: the owner's emergency, privacy and honesty requirements.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const gradle = fs.readFileSync(path.join(root, "work", "fixnow-android", "app", "build.gradle"), "utf8");
const backend = fs.readFileSync(path.join(root, "work", "fixnow-backend", "server.js"), "utf8");

// Emergency: every call goes through the confirmation dialog, and hotlines stay visible on phones.
assert(!/href="tel:/.test(html), "no raw tel: links; every call must use the confirmation dialog");
assert(html.includes('class="home-danger" type="button" data-emergency-service="general-emergency"'), "Home needs a prominent 112 action that asks for confirmation");
assert(/body\[data-view="home"\] \.home-hotlines\s*\{\s*display:\s*block/.test(html) && /\.home-hotlines \.emergency-cards\s*\{\s*grid-template-columns:\s*1fr/.test(html), "hotlines must be visible on Home at every screen size");
assert(!/\.emergency-cards,\s*\.urgent-panel small\s*\{\s*display:\s*none/.test(html), "the old rule that hid hotlines on phones must stay removed");
assert(html.includes('document.addEventListener("click", (event) => {\n      const trigger = event.target.closest("[data-emergency-service]");'), "emergency buttons must use one delegated confirmation handler");

// Brand colours restored on top of the 13 August refresh.
const v2Css = html.slice(html.indexOf('<style id="fixnow-v3">'), html.indexOf("</style>", html.indexOf('<style id="fixnow-v3">')));
assert(v2Css.length > 1000, "the design layer must be present");
for (const token of ["--brand-nav:#0d2a22", "--brand-primary:#0a7a52", "--brand-emergency:#72262e"]) {
  assert(v2Css.replace(/:\s+/g, ":").includes(token), `V2 layer must restore ${token}`);
}

// Report wizard order: what, where, describe, photos, contact, review.
const steps = {};
for (const match of html.matchAll(/<fieldset class="wizard-step[^"]*" data-wizard-step="(\d)"[\s\S]*?<\/fieldset>/g)) steps[match[1]] = match[0];
assert.deepStrictEqual(Object.keys(steps).sort(), ["1", "2", "3", "4", "5", "6"], "all six wizard steps should exist");
assert(steps[1].includes("data-quick-type") && steps[1].includes('id="type"'), "step 1 chooses the problem type");
assert(steps[2].includes('id="community"') && steps[2].includes('id="exactLocationConsent"') && steps[2].includes('id="reportLocationMap"'), "step 2 is the location step");
assert(steps[3].includes('id="reportTitle"') && steps[3].includes('data-yn-target="immediateDanger"') && steps[3].includes('id="severity"'), "step 3 describes the problem with labelled Yes/No controls");
assert(steps[4].includes('id="evidence"') && steps[4].includes('id="evidenceLibrary"'), "step 4 is photos, from camera or gallery");
assert(steps[5].includes('id="contact"') && steps[5].includes('id="contactConsent"'), "step 5 is optional contact");
assert(steps[6].includes('id="caseConsent"') && steps[6].includes('type="submit"') && steps[6].includes('id="reviewSummary"'), "step 6 reviews and holds the final consent");
assert(html.includes("wizardStep === 2 && document.body.dataset.view === \"report\" && window.FixNowMaps"), "the map picker must open on the location step");
assert(!/id="affected"[^>]*value=/.test(html), "people affected must not default to an invented number");
assert(/<select id="severity" required[^>]*>\s*<option value="">Choose<\/option>/.test(html), "severity must be chosen by the reporter, not defaulted");

// Honest result screens: submitted and queued are separate, and no secret is shown before confirmation.
assert(html.includes('openPage("Report submitted"') && html.includes('openPage("Saved and waiting to send"'), "online and offline results must be separate screens");
const queued = html.slice(html.indexOf("function showQueuedResult"), html.indexOf("form.addEventListener(\"submit\""));
assert(!queued.includes("trackingSecret"), "the queued screen must not show a tracking secret before the server confirms the report");

// Claims from the mockups that the system cannot back up must not appear.
for (const phrase of ["Your contact details are encrypted", "submitting to municipal authorities", "Anonymous Mode", "Reports stay stored locally on this phone"]) {
  assert(!html.includes(phrase), `unsupported claim must not appear: ${phrase}`);
}

// Artwork is shipped, cached offline and packaged into Android.
for (const file of ["ghana-map.svg", "category-flooding.svg", "category-road.svg", "category-waste.svg", "category-water.svg", "category-electricity.svg", "category-unsafe.svg"]) {
  assert(fs.existsSync(path.join(__dirname, "illustrations", file)), `${file} should exist`);
  assert(worker.includes(`"./illustrations/${file}"`), `${file} should be cached for offline use`);
}
assert(html.includes('src="illustrations/ghana-map.svg"'), "the welcome screen shows the Ghana map, not a generic pin");
assert(gradle.includes('include "illustrations/**"'), "Android builds must package the illustrations");

// Unsent reports are labelled honestly and keep retrying on their own.
assert(html.includes('waiting ? "Not sent yet" : escapeHtml(report.id)'), "My reports must not show a local ID as if it were a reference");
assert(html.includes("function scheduleQueueRetry") && html.includes("if (item.retryable) scheduleQueueRetry();"), "failed sends must retry with backoff while the phone is online");
assert(html.includes('document.addEventListener("visibilitychange"'), "returning to the app should retry waiting reports");
assert(!queued.includes("Temporary local reference"), "the queued screen explains what happens next instead of showing a local ID");

// Citizens get plain language when the live map is unavailable, and the list instead.
const mapsJs = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
assert(!mapsJs.includes("The owner must add"), "setup instructions for the owner must not be shown to residents");
assert(mapsJs.includes('"fixnow:map-unavailable"') && html.includes('window.addEventListener("fixnow:map-unavailable"'), "Nearby should switch to the list when the map cannot load");

// Dialogs open at the top with focus on their title.
assert(html.includes('modalTitle.focus({ preventScroll: true })'), "dialogs must focus their title so long sheets open at the top");

// V3 look: bundled, licensed fonts that work offline and in the Android app.
for (const file of ["bricolage-grotesque-latin-wght.woff2", "atkinson-hyperlegible-next-latin-400.woff2", "atkinson-hyperlegible-next-latin-700.woff2"]) {
  assert(fs.existsSync(path.join(__dirname, "fonts", file)), `${file} should be bundled`);
  assert(worker.includes(`"./fonts/${file}"`), `${file} should be cached for offline use`);
}
for (const licence of ["LICENSE-Bricolage-Grotesque-OFL.txt", "LICENSE-Atkinson-Hyperlegible-Next-OFL.txt"]) {
  assert(fs.existsSync(path.join(__dirname, "fonts", licence)), `${licence} must ship with the font`);
}
assert(gradle.includes('include "fonts/**"'), "Android builds must package the fonts");
assert(!/fonts\.googleapis|fonts\.gstatic/.test(html), "fonts must not depend on a network font service");

// The report flow hides the tab bar on phones, so it needs its own way out.
assert(html.includes('class="topbar-exit" type="button" data-app-view="home"'), "the report flow needs an exit button");
assert(/body\[data-view="report"\] \.nav\{display:none\}/.test(v2Css) && /body\[data-view="report"\] \.topbar-exit\{display:grid/.test(v2Css), "the exit button must appear whenever the tab bar is hidden");

// Public photos only after moderation, with metadata stripped.
assert(backend.includes("function stripJpegMetadata") && backend.includes('"Cross-Origin-Resource-Policy": "cross-origin"'), "approved public photos are re-written without metadata and served for the app");
assert(fs.readFileSync(path.join(__dirname, "staff.js"), "utf8").includes("Show photo publicly") && fs.readFileSync(path.join(__dirname, "staff.js"), "utf8").includes("I checked this photo: no faces, number plates, house numbers or other identifying details are visible."), "moderators must attest before a photo is published");

// Old WebViews (before Chrome 88, such as Android 11's WebView 83) drop every rule that contains :is() or :where(),
// which once left dark-mode cards light grey with white text. The shipped CSS must not contain them.
const shippedCss = (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join("\n") + fs.readFileSync(path.join(__dirname, "staff.css"), "utf8");
assert(!/:(is|where)\(/.test(shippedCss), "the built page and staff.css must not contain :is() or :where(); npm run build:css expands them");
assert(fs.readFileSync(path.join(__dirname, "..", "work", "design", "build-style-layer.js"), "utf8").includes("expandCss(minified)"), "the CSS build must expand :is() and :where()");

// Public demo: nothing leaves the page, no real calls, clear labels, staff sign-in points to the gallery.
assert(html.includes("<b>Demo</b> with sample data. Nothing you enter leaves this page, and calls are off."), "the demo banner says plainly that nothing is sent and calls are off");
assert(html.includes("This is a demo. In a real emergency, dial 112 from your phone.") && html.includes("if (IS_DEMO_MODE || emergencyDiallerOpening"), "demo mode never opens the dialler");
assert(html.includes('openModal("Staff sign-in is not in the demo"') && html.includes('window.location.href = "screens/"'), "demo staff access explains and links to the screen gallery");
assert(html.includes('if (IS_DEMO_MODE) throw new Error("This is a demo, so nothing is sent from this page.");') && html.includes('if (IS_DEMO_MODE) throw new Error("Demo data cannot sync to production");'), "every request helper refuses to send in demo mode");
assert(html.includes("if (IS_DEMO_MODE) { showDemoNearby(); return; }") && html.includes('if (safeView === "nearby" && IS_DEMO_MODE) showDemoNearby();'), "Nearby and the map never contact a server in demo mode");
const demoBuild = fs.readFileSync(path.join(__dirname, "..", "work", "demo", "build-demo-site.js"), "utf8");
assert(demoBuild.includes("const IS_DEMO_MODE = true;") && demoBuild.includes(`connect-src 'self'; form-action 'none'`), "the public demo build is always in demo mode and cannot connect to other servers");
if (fs.existsSync(path.join(__dirname, "..", "docs", "fixnow-ghana.html"))) {
  const demoApp = fs.readFileSync(path.join(__dirname, "..", "docs", "fixnow-ghana.html"), "utf8");
  assert(demoApp.includes("const IS_DEMO_MODE = true;") && demoApp.includes(`connect-src 'self'`), "docs/ must be the demo build (run npm run build:demo)");
}

// Errors are shown on the page in plain words, not only in a passing toast or as a browser message.
assert(html.includes('<p class="track-status" id="trackStatus" role="status"></p>') && html.includes("No report matches that reference and secret. Check both and try again."), "Find your report shows a lasting error message");
assert(html.includes("function friendlyRequestError") && html.includes("escapeHtml(friendlyRequestError(error,"), "Nearby explains a connection failure in plain words");

// Screen polish found in the November QA pass.
assert(!html.includes("Citizen reports stay on this device"), "sent reports go to the server, so the sidebar must not say reports stay on the device");
assert(v2Css.includes(".wizard-progress::before{content:none}"), "the old progress track must stay switched off so the wizard shows one progress bar");
assert(/\.wizard-step-count\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\)/.test(v2Css) && html.includes('<span class="wizard-step-count">Step 1 of 6</span>'), "the step count is shown once in the page header and stays in the step heading for screen readers");
assert(/\.secret-line strong\{grid-column:1 \/ -1;/.test(v2Css), "the reference gets the full row so it does not break in the middle on phones");

// The bell shows a real count: official updates on reports saved on this device, honouring each report's preferences.
assert(!html.includes("You have no unread public-report updates"), "the bell must not always claim there is nothing unread");
assert(html.includes("`Notifications, ${count} unread`") && html.includes('document.querySelector("#nearbyUnreadCount").textContent = String(count)'), "the bell's visible and spoken counts must come from real data");
assert(html.includes("report.updatesSeenAt") && html.includes("preference.publicUpdates !== false") && html.includes("preference.resolution !== false"), "unread updates must track what was seen and honour notification preferences");
assert(html.includes("Phone alerts are not set up yet."), "the bell must not imply that push notifications exist");
assert(/Object\.assign\(report, \{ status: result\.report\.status, updates: result\.report\.updates, updatedAt: result\.report\.updatedAt, createdAt: result\.report\.createdAt \}\)/.test(html), "a background update check must not overwrite what the reporter wrote");

// The logo confirmed by the owner: three bands with FN, in the app, the web app icon and the Android launcher.
const icon = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
const webManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.webmanifest"), "utf8"));
const androidRes = path.join(root, "work", "fixnow-android", "app", "src", "main", "res");
const launcher = fs.readFileSync(path.join(androidRes, "mipmap-anydpi-v26", "ic_launcher.xml"), "utf8");
const launcherRound = fs.readFileSync(path.join(androidRes, "mipmap-anydpi-v26", "ic_launcher_round.xml"), "utf8");
assert(["#be3935", "#e3b944", "#2a5037"].every((colour) => icon.toLowerCase().includes(colour)) && !/star|polygon|#ce1126|#006b3f/i.test(icon), "icon.svg must be the three-band FN logo, with no flag or star");
assert(webManifest.icons.some((item) => item.src === "./icon.svg" && item.purpose === "any") && webManifest.icons.some((item) => item.src === "./icon-maskable.svg" && item.purpose === "maskable"), "the manifest needs the logo and a separate maskable icon");
assert(worker.includes('"./icon-maskable.svg"') && gradle.includes('include "icon-maskable.svg"'), "the maskable icon must be cached offline and packaged for Android");
assert([launcher, launcherRound].every((xml) => xml.includes('android:drawable="@drawable/ic_launcher_background"') && xml.includes('<monochrome android:drawable="@drawable/ic_launcher_foreground"')), "the launcher icon must use the new band and letter layers, with a themed-icon layer");
assert(fs.existsSync(path.join(androidRes, "mipmap-mdpi", "ic_launcher.png")) && fs.existsSync(path.join(androidRes, "mipmap-xxxhdpi", "ic_launcher_round.png")), "older Android versions need PNG launcher icons");
assert(/\.welcome-logo, body\[data-view="home"\] \.topbar-logo, \.rail \.brand-mark\{box-shadow:0 0 0 1\.5px rgba\(243, 238, 225, \.5\)\}/.test(v2Css), "the logo needs a cream keyline on dark surfaces");

// Dark mode: one token block, set before the first paint, with an Appearance setting that defaults to Match phone.
const darkStart = v2Css.indexOf(':root[data-theme="dark"]{');
const darkCss = v2Css.slice(darkStart);
assert(darkStart > 0 && ["--soft:#131914", "--panel:#1f2720", "--ink:#eef2ee", "--muted:#b3beb6", "--line-strong:#7d8c82", "--focus:#8fb4ff"].every((token) => darkCss.includes(token)), "the dark tokens must exist");
assert(html.includes('<meta name="color-scheme" content="light dark" />') && html.includes('<meta name="theme-color" content="#0d2a22" />'), "the page must declare both colour schemes and the brand theme colour");
assert(html.indexOf('<script id="theme-boot">') < html.indexOf("<style>") && html.includes('matchMedia("(prefers-color-scheme: dark)")') && html.includes('addEventListener("beforeprint"'), "the theme must be set before the first paint, follow the phone and print in light");
assert(html.includes('appearance: "system"') && html.includes('<input type="radio" name="appearance" value="system" checked />Match phone') && html.includes('choice = "system"'), "Appearance must default to Match phone");
assert(!/--red:/.test(darkCss) && /--red:#ce1126/.test(v2Css) && /\[data-theme="dark"\] \.home-danger, \[data-theme="dark"\] \.emergency-call, \[data-theme="dark"\] \.hotline-call, \[data-theme="dark"\] \.modal-actions \.emergency-dial\{background:var\(--red\);box-shadow:0 0 0 1\.5px #fffdf8\}/.test(darkCss), "112 must stay flag red #ce1126 in dark mode, with a light ring");
assert(html.split(/#97d1a6/i).length > 1 && html.slice(0, html.indexOf(':root[data-theme="dark"]{')).search(/#97d1a6/i) === -1, "mint fails on cream, so it may appear only in the dark block");
assert(v2Css.includes(".appearance-options label{position:relative;width:auto;min-width:0 !important;"), "the three Appearance choices must share the row equally (an older rule sets labels to 180 px)");
assert(/\[data-theme="dark"\] img\[src\^="illustrations\/category-"\]\{[^}]*background:#f3eee1/.test(darkCss) && !/\[data-theme="dark"\][^{]*img[^{]*\{[^}]*filter/.test(darkCss), "illustrations sit on a cream plate in dark mode, and photos are never filtered");

// Emergency calls are flag red in both themes; the number choice ("Use 192 / Use 112") keeps its normal buttons.
assert(html.includes('{ label: `Call ${number}`, className: "emergency-dial", action: () => startEmergencyDial(contact.serviceId, number) }'), "the Call button in the call confirmation must use the emergency style for every number");
assert(/\.modal-actions \.emergency-dial\{[^}]*background:var\(--red\);color:#fff/.test(v2Css), "the emergency Call button must be flag red with white text");
assert(html.includes('label: `Use ${number}`, className: number === contact.primaryNumber ? "primary" : "secondary"'), "the number choice buttons stay as they are");

// "Anonymous" is not true of the system (staff can see contact details people choose to give, and the server keeps
// a hashed network address), so residents are told they don't have to give a name or number instead.
// The only exception is the internal report-mode value "Anonymous public case", which sync depends on.
assert(html.replace(/Anonymous public case/g, "").search(/anonym/i) === -1, "the word anonymous must not appear in the app");
assert(html.includes("You don't have to give your name or number.") && html.includes('<option value="Anonymous public case">No name or number</option>'), "residents are told they don't have to give their name or number");

// iPhone, iPad and older browsers (target: iOS 15+, Chrome/WebView 90+, current desktop browsers, Safari 15+).
assert((html.match(/crypto\.randomUUID\(\)/g) || []).length === 1 && (html.match(/function makeUuid\(/g) || []).length === 1 && html.includes("crypto.getRandomValues(new Uint8Array(16))"), "random IDs must come from makeUuid(), which works without crypto.randomUUID");
assert(!/\.at\(-1\)/.test(html), "Array.prototype.at fails before iOS 15.4 and Chrome 92");
assert(!/(^|[;{\s])inset:/.test(html.slice(0, html.indexOf("<script>"))), "spell out top/right/bottom/left: the inset shorthand fails before Chrome 87, which hid every dialog in WebView 83");
assert(!html.includes(".replaceAll("), "String.replaceAll fails in WebView 83 and older; escapeHtml stopped every dialog there");
for (const rule of v2Css.split("}").map((part) => part.split("{")[0]).filter((selector) => selector.includes(":has("))) {
  assert(!rule.includes(","), `a :has() selector must stand alone, or older browsers drop the whole rule: ${rule.trim().slice(0, 80)}`);
}
assert(v2Css.includes(".consent-line.is-checked{") && v2Css.includes(".appearance-options label.is-checked{") && html.includes("function syncCheckedStyles("), "ticked consent lines and the Appearance choice must show their state without :has()");
assert(html.includes("min-height: 100vh;\n      min-height: 100dvh;") && html.includes("height: 100vh;\n      height: 100dvh;"), "100vh needs a 100dvh line after it for Safari");
assert(html.includes('content="width=device-width, initial-scale=1, viewport-fit=cover"') && v2Css.includes("padding-top:calc(10px + env(safe-area-inset-top))"), "the page must reach the notch area and pad the top bar clear of it");
assert(html.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png" />') && html.includes('<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png" />') && html.includes('<meta name="apple-mobile-web-app-title" content="FixNow" />'), "iPhone and browser-tab icons must be linked");
for (const name of ["apple-touch-icon.png","favicon-32.png","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png"]) {
  assert(fs.existsSync(path.join(__dirname, name)) && worker.includes(`"./${name}"`) && gradle.includes(`include "${name}"`), `${name} must exist, be cached offline and be packaged`);
}
assert(webManifest.icons.some((item) => item.src === "./icon-512.png" && item.purpose === "any") && webManifest.icons.some((item) => item.src === "./icon-maskable-512.png" && item.purpose === "maskable"), "the manifest needs PNG icons too");
assert(v2Css.includes("html body select, html body textarea{font-size:max(16px, 1rem)}"), "text fields on phones must use at least 16 px, or iPhone zooms in");
assert(v2Css.includes("html{-webkit-text-size-adjust:100%"), "iPhone must not enlarge text in landscape");
assert(html.includes("On iPhone, add FixNow to your Home Screen so your reports stay saved on this phone.") && html.includes("navigator.storage.persist()"), "iPhone Safari users get the Home Screen tip, and storage persistence is requested");

// The Report tab is a filled circle with only the word "Report": no plus icon, not raised above the bar.
const reportTab = html.match(/<button class="nav-report"[^>]*>[\s\S]*?<\/button>/)[0];
assert(!/<svg|\+/.test(reportTab) && reportTab.includes("<span>Report</span>"), "the Report tab shows only the word Report, with no plus icon");
assert(/\.nav \.nav-report\{[^}]*margin:0 auto;[^}]*box-shadow:none/.test(v2Css), "the Report tab sits inside the bar, not raised above it");

// Old WebViews ignore flex gap, so the phone top bar spaces the logo and exit button with margins.
assert(v2Css.includes(".topbar, body[data-view=\"home\"] .topbar{column-gap:0}") && v2Css.includes(".topbar-logo, body[data-view=\"report\"] .topbar-exit{margin-right:12px}"), "the top bar must not rely on flex gap for the logo spacing");

// Every Figma page has a screen people can reach; the full-page ones are full screens.
assert(html.includes("function openPage(") && html.includes('id="modalBackBtn"') && v2Css.includes(".modal-backdrop.is-page .modal{width:100%;height:100%"), "full-screen pages need the page mode with a Back button");
for (const call of ["openPage(report.title, `", 'openPage("Report submitted", `', 'openPage("Saved and waiting to send", `', 'openPage("Similar report found nearby", `', 'openPage(waiting ? "Report details" : "Report progress", `']) {
  assert(html.includes(call), `missing full-screen page: ${call.slice(0, 40)}`);
}
assert(html.includes('{ label: "View existing report", className: "primary"') && html.includes('{ label: "Continue with new report", className: "secondary", action: closeModal }') && !/prioriti[sz]/i.test(html), "the similar report page offers both choices and makes no prioritisation claim");
assert(html.includes('<label class="track-field">Reference number<input id="trackCaseInput"') && html.includes("track: [\"Find your report\""), "Find your report is a full screen with visible labels");
assert(html.includes('modalBackdrop.classList.contains("is-page")'), "Android back closes a full-screen page");
assert(html.includes('history.pushState({ fixnowPage: true }, "")') && html.includes('window.addEventListener("popstate", () => {'), "the browser's Back button closes a full-screen page instead of leaving the app");

// Outside review of the public demo (November 2026). The outcome tests are in work/qa/resident-outcomes-check.js
// (npm run qa:outcomes); these guards keep the fixes from being undone.
const mapCode = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
// 1. The demo banner's height is reserved on every view, including the welcome steps, dialogs and full pages.
assert(html.includes("function reserveDemoBannerSpace()") && html.includes("reserveDemoBannerSpace();"), "the demo measures its banner and reserves the space");
for (const rule of ["html.demo-mode body{padding-top:var(--demo-banner-h, 0px)}", "html.demo-mode body .welcome-screen, html.demo-mode body .modal-backdrop{top:var(--demo-banner-h, 0px)}", "html.demo-mode body .topbar, html.demo-mode body[data-view=\"home\"] .topbar{top:var(--demo-banner-h, 0px)", "html.demo-mode{scroll-padding-top:var(--demo-banner-h, 0px)}"]) {
  assert(html.includes(rule), `the demo banner space is reserved: ${rule}`);
}
// 2. My reports search covers the title and the description.
assert(/const summary = \[report\.id, report\.title, report\.details,/.test(html), "My reports search includes the title and description");
// 3. The badge comes from the data, never a hard-coded number.
assert(!html.includes('<code id="openBadge">0</code>') && html.includes("function updateOpenBadge()") && html.includes("updateOpenBadge();"), "the My reports badge counts unsent reports");
// 4 and 5. Demo reports have their own state, are never queued, and the demo has its own queue name.
assert(html.includes('report.syncStatus = IS_DEMO_MODE ? "demo-local" : "queued-offline";') && html.includes('if (report.syncStatus === "demo-local") return "Demo report: kept only in this browser";'), "demo reports have their own state that never says they will be sent");
assert(html.includes('const QUEUE_DB_NAME = IS_DEMO_MODE ? `${storageNamespace}-citizen-queue` : "fixnow-citizen-queue";'), "the demo never shares the real send queue");
assert(/render\(\);\n      if \(!IS_DEMO_MODE\) \{\n      try \{\n        await queueSubmission\(/.test(html), "the demo never queues a report");
assert(html.includes("if (item.payload && item.payload.demo)") && html.includes("if (!reports.some((candidate) => candidate.submissionKey === item.submissionKey)) continue;"), "normal mode never sends a demo item or a queued item with no report on this phone");
assert(!/\["queued-offline", "needs-attention"\]\.includes\(report\.syncStatus\)[^\n]*demo-local/.test(html), "a demo report has no Retry");
// 6. No raw errors on resident screens.
assert(html.includes("function plainError(error, fallback)") && html.includes('if (isRawErrorText(message)) message = "That did not work. Please try again.";'), "resident messages go through plainError and the toast filters raw errors");
const rawUses = (html.match(/error\.message/g) || []).length;
assert(rawUses === 4, `error.message is only read by plainError and the send queue's internal records (found ${rawUses})`);
assert((mapCode.match(/error\.message/g) || []).length === 1 && mapCode.includes("showResponderMapUnavailable(`${String(error.message"), "the resident map and location picker never show a raw error (only the staff map does)");
assert(mapCode.includes('const PICKER_DEMO_MESSAGE = "The map is switched off in the demo. Type the community and a landmark below.";') && html.includes("demo: IS_DEMO_MODE,"), "the demo location step says the map is off, without asking the server");
// 7. One list of types and statuses fills every filter and the wizard.
assert(html.includes('<select id="type" data-option-list="types" required></select>') && !/<option>(Flooding or drainage|Open|Fire risk|Dispatched)<\/option>/.test(html), "type and status lists are not written out by hand");
assert(html.includes("let nearbyReloadPending = false;") && html.includes("if (nearbyLoading) { nearbyReloadPending = true; return; }"), "a Nearby filter changed while loading is applied");
// 8. Plain words about photos on resident screens (staff screens keep the precise terms).
for (const [name, text] of [["fixnow-ghana.html", html], ["map-foundation.js", mapCode]]) {
  assert(!/re-?encod|\bexif\b|quarantin/i.test(text), `${name} uses plain words about photo privacy (no re-encoded, EXIF or quarantine)`);
}

console.log("V2 design and safety guard test passed");
