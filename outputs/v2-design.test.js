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
assert(html.includes('report.syncStatus === "demo-local" ? "Demo report" : waiting ? "Not sent yet" : escapeHtml(report.id)'), "My reports must not show a local ID as if it were a reference; demo reports say Demo report, never Not sent yet");
assert(html.includes("const unsent = reports.filter(isPendingSend).length;") && html.includes('isUnsent(report) && report.syncStatus !== "demo-local"'), "the My reports badge counts only reports that will still be sent, never demo reports");
assert(html.includes("function scheduleQueueRetry") && html.includes("if (item.retryable) scheduleQueueRetry();"), "failed sends must retry with backoff while the phone is online");
assert(html.includes('document.addEventListener("visibilitychange"'), "returning to the app should retry waiting reports");
assert(!queued.includes("Temporary local reference"), "the queued screen explains what happens next instead of showing a local ID");

// Citizens get plain language when the live map is unavailable, and the list instead.
const mapsJs = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
assert(!mapsJs.includes("The owner must add"), "setup instructions for the owner must not be shown to residents");
assert(mapsJs.includes('"fixnow:map-unavailable"') && html.includes('window.addEventListener("fixnow:map-unavailable"'), "Nearby should switch to the list when the map cannot load");

// Dialogs open at the top with focus on their title.
assert(html.includes('modalTitle.focus({ preventScroll: true })'), "dialogs must focus their title so long sheets open at the top");

// V4 look: one bundled, licensed font (Inter) that works offline and in the Android app. The V3 fonts are kept, out of
// the shipped files, in work/design/retired-fonts-v3.
assert(fs.existsSync(path.join(__dirname, "fonts", "inter-latin-wght-normal.woff2")) && fs.existsSync(path.join(__dirname, "fonts", "LICENSE-Inter-OFL.txt")), "Inter and its OFL licence are bundled");
assert(worker.includes('"./fonts/inter-latin-wght-normal.woff2"') && gradle.includes('include "fonts/**"'), "Inter is cached for offline use and ships in the Android app");
assert(fs.readdirSync(path.join(__dirname, "fonts")).sort().join() === "LICENSE-Inter-OFL.txt,inter-latin-wght-normal.woff2", "outputs/fonts holds only Inter and its licence");
for (const file of ["bricolage-grotesque-latin-wght.woff2", "atkinson-hyperlegible-next-latin-400.woff2", "atkinson-hyperlegible-next-latin-700.woff2", "LICENSE-Bricolage-Grotesque-OFL.txt", "LICENSE-Atkinson-Hyperlegible-Next-OFL.txt"]) {
  assert(fs.existsSync(path.join(root, "work", "design", "retired-fonts-v3", file)), `${file} is kept in work/design/retired-fonts-v3`);
}
for (const [name, text] of [["fixnow-ghana.html", html], ["staff.css", fs.readFileSync(path.join(__dirname, "staff.css"), "utf8")], ["service-worker.js", worker]]) {
  assert(!/Bricolage|Atkinson|bricolage-grotesque|atkinson-hyperlegible/.test(text), `${name} no longer uses the V3 fonts`);
  if (name !== "service-worker.js") assert(text.includes('@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;src:url("fonts/inter-latin-wght-normal.woff2") format("woff2")}'), `${name} loads the bundled Inter`);
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
assert(html.includes('<div class="demo-banner" id="demoBanner" role="note" hidden><b>Demo</b> with sample data. Nothing is sent.</div>'), "the demo banner is one slim line (it fits a 320 px phone with Large text) that says plainly it is sample data and nothing is sent");
// Reset demo lives in Profile, shown only in the demo; the banner itself has no button.
assert(/<div class="profile-demo" id="profileDemo" hidden>[\s\S]*?<button class="profile-action" id="demoResetBtn" type="button">[\s\S]*?<strong>Reset demo<\/strong>/.test(html) && html.includes('document.querySelector("#profileDemo").hidden = false;') && html.includes('document.querySelector("#demoResetBtn").addEventListener("click", resetDemoData);'), "Reset demo is a Profile row shown only in the demo");
assert(!/id="demoBanner"[^>]*>[^\n]*<button/.test(html), "the demo banner has no button");
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

// The public demo's simulated journey (work/demo/demo-journey.js) is demo-only: the real app, its offline cache and the
// Android app never contain or load it, and the real app never shows a simulated update.
assert(!/demo-journey/.test(html) && !/demo-journey/.test(worker) && !/demo-journey/.test(gradle), "the real page, its offline cache and the Android build never mention the demo journey file");
assert(html.includes(".filter((entry) => !(entry && entry.simulated))"), "the real app ignores any update marked simulated");
for (const hook of ["if (IS_DEMO_MODE && window.fixNowDemo) { window.fixNowDemo.openSample(reportId); return; }", "IS_DEMO_MODE && window.fixNowDemo ? window.fixNowDemo.duplicates(draft) :", "if (IS_DEMO_MODE && window.fixNowDemo && report.syncStatus === \"demo-local\") { window.fixNowDemo.openJourney(report); return; }", "if (IS_DEMO_MODE && window.fixNowDemo) return window.fixNowDemo.officeHint(report);"]) {
  assert(html.includes(hook), `demo hooks are active only in demo mode: ${hook.slice(0, 60)}`);
}
const demoBuildScript = fs.readFileSync(path.join(root, "work", "demo", "build-demo-site.js"), "utf8");
const journey = fs.readFileSync(path.join(root, "work", "demo", "demo-journey.js"), "utf8");
assert(demoBuildScript.includes('"./demo-journey.js",\\n  "./demo-journey.css",') && demoBuildScript.includes("-demo-${demoHash}"), "the public demo's offline cache keeps the journey files and changes name when they change");
assert(journey.includes('if (typeof IS_DEMO_MODE === "undefined" || !IS_DEMO_MODE) return;'), "the journey file does nothing outside demo mode");
assert(!/\b(AMA|NADMO|ECG|NEDCo|GWCL|Ghana Police Service|Ghana National Fire Service|Metropolitan Assembly|Municipal Assembly)\b/.test(journey), "the demo journey names only sample offices, never a real agency");
assert(journey.includes("Planned: the real app doesn\\'t show this yet") && journey.includes('<span class="tag demo-sim-tag">Simulated</span>'), "simulated steps say Simulated and the work-done photo says Planned");
// The real app's office hint is general information: FixNow is not connected to any agency yet.
assert(!html.includes("Likely responsible office") && !html.includes("route it to the responsible office") && html.includes("FixNow is not yet connected to any agency, so it does not send reports to this office."), "the office hint never says FixNow sends reports to an agency");

// Link previews. The real page has a meta description only (its final address is not known yet); the public demo's
// pages also get Open Graph and Twitter tags, a canonical link and an absolute 1200 x 630 preview image.
assert(/<meta name="description" content="[^"]{60,200}" \/>/.test(html) && !/property="og:|name="twitter:|rel="canonical"/.test(html), "the real page has a meta description and no address-specific preview tags");
const previewPng = fs.readFileSync(path.join(root, "work", "demo", "social-preview.png"));
assert(previewPng.readUInt32BE(16) === 1200 && previewPng.readUInt32BE(20) === 630, "the link-preview image is 1200 x 630");
const demoSiteUrl = "https://robertrese.github.io/fixnow-ghana/";
for (const page of ["index.html", "fixnow-ghana.html"]) {
  const file = path.join(root, "docs", page);
  if (!fs.existsSync(file)) continue; // docs/ is generated by npm run build:demo
  const text = fs.readFileSync(file, "utf8");
  for (const tag of [/<meta name="description" content="[^"]{60,}"/, new RegExp(`<link rel="canonical" href="${demoSiteUrl}"`), /<meta property="og:title" content="[^"]+"/, /<meta property="og:description" content="[^"]+"/, /<meta property="og:type" content="website"/, new RegExp(`<meta property="og:url" content="${demoSiteUrl}"`), new RegExp(`<meta property="og:image" content="${demoSiteUrl}social-preview\\.png"`), /<meta name="twitter:card" content="summary_large_image"/]) {
    assert(tag.test(text), `docs/${page} has the link-preview tag ${tag}`);
  }
  assert((text.match(/<meta name="description"/g) || []).length === 1, `docs/${page} has exactly one meta description`);
}

// The app is called FixNow Ghana. The old name "FixNow Ghana Command" never appears in resident-facing text; the
// manifest id and the Android package keep "command" so installed copies stay the same app.
const manifestText = fs.readFileSync(path.join(__dirname, "manifest.webmanifest"), "utf8");
for (const file of ["fixnow-ghana.html", "privacy.html", "terms.html", "support.html", "map-foundation.js", "emergency-contacts.js"]) {
  assert(!/FixNow Ghana Command/i.test(fs.readFileSync(path.join(__dirname, file), "utf8")), `${file} never says "FixNow Ghana Command"`);
}
assert(!/FixNow Ghana Command/i.test(journey) && JSON.parse(manifestText).name === "FixNow Ghana" && JSON.parse(manifestText).id === "fixnow-ghana-command", "the manifest name is FixNow Ghana and its id is unchanged");
// The retired "Routing engine" panel is gone, and the page names no utility company or agency desk.
assert(!/id="routing"|routePrimary|routeSupport|routeUtility|Routing engine/.test(html), "the old routing panel and its code are removed");
assert(!/\b(NADMO|ECG|NEDCo)\b/.test(html), "the resident page never names NADMO, ECG or NEDCo");

// Honesty: the three optional yes/no questions in step 3 never start pre-answered, and a skipped question is never
// recorded or shown as "No". They hold "yes", "no" or "" (not answered) in the page, the queue, the server and the
// staff page. (Outcome tests: work/qa/resident-outcomes-check.js and work/fixnow-backend/test-api.js.)
const ynQuestions = ["immediateDanger", "accessBlocked", "worsening"];
const ynGroups = [...html.matchAll(/<div class="yn-buttons" role="radiogroup"[^>]*data-yn-target="(\w+)">([\s\S]*?)<\/div>/g)];
assert(ynGroups.length === 3 && ynGroups.map((group) => group[1]).join() === ynQuestions.join(), "step 3 has the three yes/no questions");
for (const [, question, buttons] of ynGroups) {
  assert((buttons.match(/role="radio" aria-checked="false"/g) || []).length === 2 && !/aria-checked="true"|aria-pressed="true"|\bchecked\b(?!=)|\bselected\b/.test(buttons), `the "${question}" question starts with neither Yes nor No selected`);
  assert(html.includes(`<input id="${question}" type="hidden" value="" />`), `the "${question}" answer starts empty (not a tick box, which can only be yes or no)`);
}
assert(steps[3].includes('data-yn-target="worsening"') && !/<input id="(immediateDanger|accessBlocked|worsening)"[^>]*(required|type="checkbox")/.test(html), "the three questions stay optional and are not tick boxes");
assert(html.includes('function ynAnswer(value) { return value === true || value === "yes" ? "yes" : value === "no" ? "no" : ""; }') && html.includes('function ynLabel(value) { return { yes: "Yes", no: "No" }[ynAnswer(value)] || "Not answered"; }'), "the page reads the answers as yes, no or not answered");
assert(html.includes('YN_QUESTIONS.concat("photoChoice").forEach((id) => { document.getElementById(id).value = ""; });') && html.includes("if (YN_QUESTIONS.includes(id)) control.value = ynAnswer(value);"), "answers are cleared after a report is saved, and an older draft's false is restored as not answered");
const staffCode = fs.readFileSync(path.join(__dirname, "staff.js"), "utf8");
assert(staffCode.includes('function yesNo(value) { return { yes: "Yes", no: "No" }[ynAnswer(value)] || "Not answered"; }'), "the staff case page shows Yes, No or Not answered");
assert(backend.includes('return value === true || value === "yes" ? "yes" : value === "no" ? "no" : "";') && !/Boolean\((report|payload)\.(immediateDanger|accessBlocked|worsening)\)/.test(backend), "the server stores yes, no or not answered, never a forced yes/no");
// Every read of the three answers goes through a helper that knows the third state: no plain true/false tests, which
// would treat "not answered" as No (or the word "no" as Yes).
for (const [name, code] of [["fixnow-ghana.html", html], ["staff.js", staffCode], ["server.js", backend]]) {
  const reads = [...code.matchAll(/(.{0,18})\b(?:report|draft|payload|item|existing\w*)\.(?:immediateDanger|accessBlocked|worsening)\b/g)].map((match) => match[0]);
  assert(reads.length >= 3, `${name} reads the three answers`);
  for (const read of reads) assert(/(ynAnswer|ynAnswerForHash|saidYes|ynLabel|yesNo)\((?:report|draft|payload|item|existing\w*)[.[]/.test(read), `${name} reads a yes/no answer without the helper: ${read}`);
}

// The photo rule (in the app only). Flooding, road and waste reports need a photo or the person's "I can't add a
// photo" choice; every other type keeps photos optional. The rule is a flag on REPORT_TYPES, never a second list.
// (Outcome tests: work/qa/resident-outcomes-check.js.)
const typeEntries = JSON.parse(html.match(/const REPORT_TYPES = (\[[^\]]*\]);/)[1]);
assert(typeEntries.length === 11 && typeEntries.every((entry) => typeof entry.name === "string" && typeof entry.photoRequired === "boolean"), "every problem type says whether it needs a photo");
assert(typeEntries.filter((entry) => entry.photoRequired).map((entry) => entry.name).sort().join("|") === "Flooding or drainage|Road or bridge|Waste or sanitation", "a photo is required for flooding, road and waste reports only");
assert((html.match(/\.photoRequired\b/g) || []).length === 1 && html.includes("return Boolean(type && type.photoRequired);"), "the photo rule is read from REPORT_TYPES in one place (photoRequiredFor), not written out again");
assert(html.includes("if (wizardStep === 4 && !photoRuleMet()) {\n        showPhotoNeeded();\n        return false;") && html.includes("if (!photoRuleMet()) {\n        setWizardStep(4);\n        showPhotoNeeded();\n        return;"), "a required type cannot continue past the photo step, or be submitted, without a photo or the choice");
assert(html.includes('return !photoRequiredFor(document.querySelector("#type").value) || readyPhotoCount() > 0 || document.querySelector("#photoChoice").value === "none";'), "the rule is met by a photo, by the I can't add a photo choice, or by an optional type");
const photoStep = steps[4];
assert(photoStep.indexOf("<span>Add a photo</span>") > 0 && photoStep.indexOf("<span>Add a photo</span>") < photoStep.indexOf("A photo helps the moderator check your report.") && photoStep.indexOf('<label class="photo-pick photo-main">') < photoStep.indexOf("<p"), "Add a photo is the first thing on the photo step, followed by why it helps");
assert(photoStep.includes('<p class="photo-needed" id="photoNeeded" tabindex="-1" hidden>Add a photo of the problem, or tell us you can\'t.</p>') && html.includes("message.focus(); // screen reader users hear the message"), "the message is next to the photo button and takes focus");
assert(photoStep.includes('<button class="secondary no-photo-btn" id="noPhotoBtn" type="button" aria-pressed="false" hidden>I can\'t add a photo</button>') && !/reason|why can/i.test(photoStep.replace("A photo helps the moderator check your report.", "")), "there is always a way out, and no reason is asked");
assert(photoStep.includes("We remove hidden location information from photos on this phone before they are sent. A moderator checks photos before anything is shown publicly."), "the photo privacy wording stays on the photo step");
assert(html.includes('"No photo added"') && !/photoChoice\s*:/.test(html) && !/photoChoice|photoRequired|noPhoto/.test(backend), "Review says No photo added, and nothing about the choice is sent to or required by the server");
// A photo the server will not take never blocks the report.
assert(html.includes("if (!error || !error.status) throw error;") && html.includes("attachment.notSent = true;") && html.includes("if (attachment.notSent) continue;") && html.includes("report.photosNotSent = attachments.filter((attachment) => attachment.notSent).length;"), "a refused or repeatedly failing photo is left out so the report still sends, and the person is told");

// ---------- V4 "modern" design, step 1: type, cards, pill buttons, Home, the glass menu and the laptop side menu ----------
const v4Source = fs.readFileSync(path.join(root, "work", "design", "fixnow-v3.css"), "utf8");
assert(html.includes('--font-display:"Inter"') && html.includes('--font-body:"Inter"') && html.includes("--muted:#4f5d55"), "Inter is the only typeface, and muted text is #4f5d55");
assert(html.includes("h1, h2, legend, .modal h2{font-weight:800;letter-spacing:-.02em;line-height:1.05}"), "headings are weight 800, -0.02em, line-height 1.05");
assert(html.includes("--r-card:22px") && html.includes("--shadow-card:0 1px 2px rgba(13, 42, 34, .06), 0 6px 18px rgba(13, 42, 34, .07)"), "cards use 22 px corners and the soft two-layer shadow");
assert(html.includes(".primary, .secondary, .danger, .ghost{min-height:50px;border-radius:999px;font-weight:700}") && html.includes(".primary{min-height:56px}"), "buttons are full pills, and main actions are 56 px tall");
// Home hero: a rounded card with the brand row, Notifications, the heading and the two actions side by side.
const hero = html.match(/<section class="home-panel" id="homePanel"[\s\S]*?<\/section>/)[0];
assert(hero.includes('<img class="home-logo" src="icon.svg" alt="" />') && hero.includes('<b class="home-brand">FixNow Ghana</b>'), "the hero shows the logo with FixNow Ghana written beside it");
assert(/<button class="home-bell" type="button" data-open-notifications aria-label="Notifications, 0 unread">/.test(hero) && html.includes(".home-bell{position:relative;display:grid;place-items:center;flex:0 0 auto;width:44px;height:44px;min-height:44px"), "the hero has a 44 px round Notifications button");
assert(hero.includes('<h2 id="homeHeading">What needs fixing today?</h2>') && hero.indexOf("data-start-report") < hero.indexOf('data-emergency-service="general-emergency"') && hero.includes("<b>Report a problem</b>") && hero.includes("<b>Call&nbsp;112</b>"), "the hero has Report a problem and Call 112, in that order");
assert(html.includes("radial-gradient(120% 90% at 100% 0%, #1f4e3b 0%, #0d2a22 62%)") && /body\[data-view="home"\] \.home-panel::before\{[^}]*opacity:\.14/.test(html) && /body\[data-view="home"\] \.home-panel::after\{[^}]*var\(--kente\)/.test(html), "the hero keeps the deep green gradient, the faint Ghana outline and the kente strip");
assert(/\.home-danger\{[^}]*background:var\(--red\)[^}]*box-shadow:0 0 0 1\.5px #fffdf8/.test(html), "Call 112 in the hero is flag red with the light ring");
// Problem tiles on Home: white cards with the illustration on a tinted plate, a name and a hint.
const tiles = [...html.matchAll(/<button class="home-tile" type="button" data-home-type="([^"]+)"><span class="tile-plate tint-\w+"><img src="illustrations\/category-[\w-]+\.svg" alt="" \/><\/span><b>[^<]+<\/b><small>[^<]+<\/small><\/button>/g)];
assert(tiles.length === 6 && html.includes(".home-shortcuts{grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px}"), "Home has six problem tiles (plate, name, hint) in a two-column grid");
// The phone and tablet menu: a floating glass bar. Blur only on this bar, only inside @supports, with a solid fallback.
assert(/\.nav\{left:max\(16px, env\(safe-area-inset-left\)\);right:max\(16px, env\(safe-area-inset-right\)\);bottom:calc\(14px \+ env\(safe-area-inset-bottom\)\);height:66px;[^}]*border-radius:33px;background:#fffdf8;/.test(html), "the menu floats 16 px from the sides and 14 px above the safe area, 66 px tall, with a solid paper fallback");
const blurUses = [...html.matchAll(/backdrop-filter:blur\(\d/g)].length; // declarations only, not the @supports tests
assert(blurUses === 2 && html.includes("@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))){@media (max-width: 880px){.nav{background:rgba(255, 253, 248, .66);-webkit-backdrop-filter:blur(22px) saturate(180%);backdrop-filter:blur(22px) saturate(180%)}"), "blur is used on the menu bar only, with the -webkit- prefix, inside @supports");
assert(!/backdrop-filter/.test(fs.readFileSync(path.join(__dirname, "staff.css"), "utf8")), "the staff page uses no blur");
// The current-tab capsule sits behind the icon only (56 x 32 px, fully rounded) and slides between tabs. Each tab
// lays out from the top: 7 px, then the 32 px icon box (21 px icon + 5.5 px padding above and below), then the label,
// so the pill (also 7 px from the top) always lines up with the icon, whatever the label length or text size.
assert(html.includes('<nav class="nav" aria-label="Main navigation">\n        <span class="nav-capsule" aria-hidden="true"><i></i></span>'), "the menu has one capsule element, hidden from screen readers");
assert(html.includes(".nav-capsule{display:block;position:absolute;top:7px;left:6px;width:calc((100% - 12px) / 5);height:32px;pointer-events:none;transform:translateX(calc(var(--tab, 0) * 100%));transition:transform .2s ease}") && html.includes('body[data-view="my"] .nav{--tab:3}'), "the menu capsule slides to the current tab");
assert(html.includes(".nav-capsule i{display:block;width:56px;height:32px;margin:0 auto;border-radius:16px;background:rgba(13, 42, 34, .1)}"), "the capsule is a 56 x 32 px pill behind the icon only");
assert(/\.nav button\{position:relative;display:flex;flex-direction:column;align-items:center;align-self:stretch;justify-content:flex-start;min-height:44px;gap:2px;padding:7px 2px 0;/.test(html) && html.includes(".nav button .nav-icon{box-sizing:content-box;flex:0 0 auto;padding:5.5px 17.5px;"), "each tab starts 7 px from the top with a 32 px icon box, so the pill lines up with the icon");
assert(!html.includes(".nav::before{"), "the old full-width capsule is gone");
assert(html.includes('.nav button.active, .nav button[aria-current="page"]{color:var(--deep);font-weight:800;'), "the current tab's label is bold");
assert(html.includes('[data-theme="dark"] .nav-capsule i{background:rgba(151, 209, 166, .16)}'), "in dark mode the capsule uses the mint accent");
assert(html.includes("body.large-text .nav{height:74px}") && html.includes("body.large-text .nav button span{white-space:normal;"), "with Large text a long label wraps instead of running into its neighbour");
assert(html.includes('body[data-view="report"] .nav{display:none}') && html.includes('class="topbar-exit"'), "the menu stays hidden in the report wizard, and the exit button stays");
assert(/\.nav \.nav-report\{align-self:center;justify-content:center;width:54px;height:54px;min-height:54px;padding:0;background:var\(--deep\)/.test(html), "the centre Report button is a 54 px deep green circle");
// The laptop side menu: Home, Nearby, My reports, Notifications, Profile; no Report row; the In danger? card.
const railHtml = html.match(/<aside class="rail">[\s\S]*?<\/aside>/)[0];
assert([...railHtml.matchAll(/<span>(Home|Nearby|Report|My reports|Notifications|Profile)<\/span>/g)].map((m) => m[1]).join() === "Home,Nearby,Report,My reports,Notifications,Profile", "the menu rows are in order (Report shows on phones only, Notifications on laptops only)");
assert(html.includes(".rail .nav .nav-report{display:none}") && html.includes(".nav .nav-notifications{display:none}"), "laptops have no Report row in the side menu, and phones have no Notifications tab");
assert(/<div class="rail-danger">\s*<b>In danger\?<\/b>\s*<button class="rail-call" type="button" data-emergency-service="general-emergency">/.test(railHtml) && /\.rail-call\{[^}]*background:var\(--red\)[^}]*box-shadow:0 0 0 1\.5px #fffdf8/.test(html), "the side menu ends with the In danger? card and a red Call 112 that uses the confirmation dialog");
assert(html.includes("width:244px;height:calc(100vh - 28px);height:calc(100dvh - 28px);margin:14px 0 14px 14px") && html.includes("background:linear-gradient(180deg, #123329, #0d2a22 55%)"), "the side menu is a floating 244 px panel, 14 px from the edges");
// Notifications: every entry point opens the same list.
assert(html.includes('if (event.target.closest("[data-open-notifications]")) openNotifications();'), "the Notifications buttons open the existing notifications list");
// Motion: press feedback and the sliding capsule are off under reduced motion; new hover effects only where hover exists.
assert(/@media \(prefers-reduced-motion: reduce\)\{\.nav-capsule, \.primary,[^}]*\{transition:none\}/.test(html) && /\.nav button:active\{transform:none\}/.test(html), "motion is off under prefers-reduced-motion");
const hoverBlock = v4Source.slice(v4Source.indexOf("@media (hover: hover){\n.home-primary:hover"));
assert(hoverBlock.startsWith("@media (hover: hover){") && (v4Source.match(/\.home-tile:hover|\.rail-call:hover|\.home-bell:hover/g) || []).length === 3, "V4 hover effects sit inside @media (hover: hover)");
// Dark: the glass bar is a dark translucent surface with the mint accent; cards use borders, not shadows.
assert(html.includes('[data-theme="dark"] .nav{background:rgba(31, 39, 32, .66)}') && html.includes('[data-theme="dark"] .nav button.active, [data-theme="dark"] .nav button[aria-current="page"], [data-theme="dark"] .nav button.active:hover{color:#97d1a6}'), "the dark glass bar uses a dark translucent surface and the mint accent");
// The two newest pieces follow the new design too.
assert(html.includes(".no-photo-btn{min-height:50px;border-radius:999px}") && html.includes(".review-answers b.not-answered{") && html.includes("' class=\"not-answered\"'"),"the I can't add a photo button is a pill, and Not answered has its own quiet style");

// V4 Home, owner's changes of 17 November 2026.
const railRows = [...html.match(/<aside class="rail">[\s\S]*?<\/aside>/)[0].matchAll(/<button[^>]*>(<svg class="nav-icon"[^>]*>[\s\S]*?<\/svg>)?<span>(Home|Nearby|My reports|Notifications|Profile)<\/span>/g)];
assert(railRows.length === 5 && railRows.every((row) => row[1]), "every side menu row (Home, Nearby, My reports, Notifications, Profile) has its line icon");
assert(html.includes(".rail .nav button .nav-icon{display:block;flex:0 0 auto;width:20px;height:20px;"), "the side menu icons show at 20 px");
assert(html.includes('body[data-view="home"] .topbar .topbar-titles{position:absolute;width:1px;height:1px;margin:0;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}') && html.includes('<h1 id="viewTitle">'), "on laptop Home the page title is hidden visually but kept for screen readers and focus");
assert(!/body\[data-view="home"\] \.status-strip\{display:none/.test(html), "the Online and Last saved chips stay on laptop Home");
assert(html.includes('body[data-view="home"] .home-shortcuts .v2-section-title{margin-top:-6px}'), "on phone Home the hero card and Common problems are about 20 px apart");

// ---------- V4 step 2: every other resident screen ----------
const step2CardRule = (html.match(/\n(\.consent-line, \.welcome-steps, [^{\n]*)\{border:0;border-radius:var\(--r-card\);background:var\(--panel\);box-shadow:var\(--shadow-card\)\}/) || [])[1] || "";
for (const card of [".consent-line", ".welcome-steps", ".my-report-card", ".public-report-card", ".profile-grid", ".settings-list", ".quick-type", ".track-lookup", ".honest-state", ".map-stage"]) {
  assert(step2CardRule.split(", ").includes(card), card + " uses the V4 card");
}
assert(html.includes(".consent-line.is-checked{background:#fffbe8;box-shadow:inset 0 0 0 2px var(--deep), var(--shadow-card)}"), "a ticked consent line keeps a visible ring (state set in JavaScript)");
assert(html.includes(".welcome-steps{grid-template-columns:1fr !important;gap:0}"), "the consent screen's three numbered points stack on every screen size");
assert(html.includes('body[data-view="report"] .topbar .lead{display:inline-block;width:auto;margin:6px 0 0;padding:3px 12px;border-radius:999px;background:var(--deep);color:var(--gold);') && html.includes(".wizard-step-count{position:absolute;width:1px;height:1px;"), "the wizard step count is a deep green pill with gold text, and the hidden Step N of 6 stays");
assert(html.includes('body[data-view="report"] .topbar{display:grid;grid-template-columns:44px minmax(0, 1fr) 44px;') && /body\[data-view="report"\] \.topbar-exit\{grid-column:1;margin-right:0;border:0;background:var\(--panel\);box-shadow:/.test(html), "the wizard header has a round white close button and the title centred");
assert(html.includes(".wizard-progress{gap:6px}") && html.includes(".wizard-progress span{height:6px}"), "the wizard progress bar has 6 px segments with 6 px gaps");
assert(html.includes(".wizard-actions .primary, .wizard-actions .secondary{min-height:58px;border-radius:999px}") && html.includes("background:linear-gradient(180deg, rgba(243, 238, 225, 0) 0%, #f3eee1 46%)"), "Continue is a 58 px pill over a soft cream fade");
assert(html.includes(".quick-type.active, .quick-type[aria-pressed=\"true\"]{background:var(--panel);box-shadow:inset 0 0 0 2px var(--deep), var(--shadow-card)}") && /\.quick-type\.active span\.qt-radio, \.quick-type\[aria-pressed="true"\] span\.qt-radio\{border:0;background:var\(--gold\) url\("data:image\/svg\+xml,[^"]*0d2a22[^"]*"\)/.test(html) && html.includes(".quick-type span.qt-icon{width:46px;height:46px;border-radius:14px}"), "step 1 tiles: a 46 px plate, and the chosen tile gets a deep green ring and a gold badge with a deep green tick");
assert(html.includes(".nav button:hover{color:#3d4a43;background:transparent}"), "menu tabs do not turn green on hover, which sticks after a tap on touch screens");
assert(html.includes('[data-theme="dark"] .quick-type.active, [data-theme="dark"] .quick-type[aria-pressed="true"]{background:var(--panel);box-shadow:inset 0 0 0 2px #97d1a6}') && html.includes("background:linear-gradient(180deg, rgba(19, 25, 20, 0) 0%, #131914 46%)"), "dark mode: the chosen tile has a mint ring and the Continue fade goes into the dark page");

// ---------- V4 step 3: the staff area (staff.css) ----------
const staffV4 = fs.readFileSync(path.join(__dirname, "staff.css"), "utf8");
assert(!/:is\(|:where\(|backdrop-filter/.test(staffV4) && !/style=/.test(fs.readFileSync(path.join(__dirname, "staff.html"), "utf8")), "staff.css uses plain selector lists and no blur, and staff.html has no inline styles");
assert(staffV4.includes(".s-card, .s-stat, .s-item, .s-row, .s-empty{border:0;border-radius:var(--r-card);background:var(--panel);box-shadow:var(--shadow-card)}") && staffV4.includes("--r-card:22px; --shadow-card:0 1px 2px rgba(13,42,34,.06), 0 6px 18px rgba(13,42,34,.07);"), "staff cards use the V4 card");
assert(staffV4.includes(".btn{min-height:50px;padding:10px 22px;border-radius:999px;") && staffV4.includes(".btn-primary{min-height:56px}"), "staff buttons are pills, main actions 56 px tall");
assert(staffV4.includes("h1,h2,h3{font-family:var(--font-display);font-weight:800;line-height:1.1;margin:0;letter-spacing:-.02em}"), "staff headings are weight 800 with -0.02em");
assert(/\.s-tabs\{left:max\(16px, env\(safe-area-inset-left\)\);right:max\(16px, env\(safe-area-inset-right\)\);bottom:calc\(14px \+ env\(safe-area-inset-bottom\)\);[^}]*border-radius:33px;background:#fffdf8;/.test(staffV4), "on phones the staff menu is a floating solid bar");
assert(staffV4.includes("width:244px;height:calc(100vh - 28px);height:calc(100dvh - 28px);margin:14px 0 14px 14px;") && staffV4.includes('.s-tablist button[aria-current="page"]{background:#fffdf8;color:#0d2a22;font-weight:700}'), "on laptops the staff menu is the floating side panel with a paper pill on the current row");
assert(staffV4.includes(".s-tabs[hidden] ~ .s-main{grid-column:1 / -1;max-width:none}"), "the laptop sign-in uses the full width (the hidden side menu leaves no empty column)");

// Staff, owner's fixes of 18 November 2026: section icons in the laptop side menu; three number boxes fit on phones.
const staffJsV4 = fs.readFileSync(path.join(__dirname, "staff.js"), "utf8");
assert(["review", "cases", "routing", "accounts", "audit"].every((id) => new RegExp("\n    " + id + ": '<").test(staffJsV4)) && staffJsV4.includes('">" + tabIcon(tab.id) + \'<span class="s-tab-label">\''), "every staff section has a line icon before its name");
const staffCssV4 = fs.readFileSync(path.join(__dirname, "staff.css"), "utf8");
assert(staffCssV4.includes(".s-tab-icon{display:none}") && staffCssV4.includes(".s-tab-icon{display:block;flex:0 0 auto;width:20px;height:20px;"), "the staff section icons are 20 px and show on laptops only");
assert(staffCssV4.includes(".s-stat:nth-child(3):last-child{grid-column:1 / -1}"), "on phones a third number box spans the full width");

// V4 polish, motion (owner's brief of 18 November 2026). Views, report steps, list items, the Report submitted tick
// and dialogs animate. Each animation lasts 150 to 250 ms, moves only transform and opacity, holds nothing after it
// ends ("backwards"), never makes anything wait, and is off under prefers-reduced-motion. The browser check is
// section 11 of work/qa/resident-outcomes-check.js.
const motionSource = fs.readFileSync(path.join(root, "work", "design", "fixnow-v3.css"), "utf8");
const motionBlock = motionSource.slice(motionSource.indexOf("/* ==================== V4 polish: motion"), motionSource.indexOf("/* Public demo (demo mode only)."));
assert(motionBlock.length > 500, "the motion section sits in fixnow-v3.css before the demo block");
const keyframes = [...motionBlock.matchAll(/@keyframes (fn-[\w-]+)\{([\s\S]*?\})\}/g)];
assert(keyframes.length === 10, "the motion section defines its ten keyframes");
for (const [, name, body] of keyframes) {
  const props = [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
  assert(props.length && props.every((p) => p === "opacity" || p === "transform"), `${name} animates only transform and opacity`);
}
const animationUses = [...motionBlock.matchAll(/animation:(fn-[\w-]+) \.(\d+)s/g)];
assert(animationUses.length >= 9 && animationUses.every((m) => Number(`0.${m[2]}`) * 1000 >= 150 && Number(`0.${m[2]}`) * 1000 <= 250), "every animation lasts 150 to 250 ms");
assert(!/animation:fn-(view|item|step|tick|sheet-in|fade-in)[^;}]*forwards/.test(motionBlock), "entrances use backwards fill, so nothing is held after they end (press feedback still works)");
assert(/@media \(prefers-reduced-motion: reduce\)\{\n\.view-enter > section:not\(\.topbar\), [^{]*\.wizard-step\.step-next, \.wizard-step\.step-back, \.result-icon\.ok, \.result-icon\.ok svg, \.modal-backdrop\.show, \.modal-backdrop\.show \.modal\{animation:none\}\n\.modal-backdrop\.modal-ghost\{display:none\}/.test(motionBlock), "all motion is off under prefers-reduced-motion");
assert(html.includes('if (document.body.dataset.view && document.body.dataset.view !== safeView) playViewEnter();') && html.includes('viewEnterTimer = window.setTimeout(() => main.classList.remove("view-enter"), 1000);'), "views animate only when the tab changes, and the class goes once the entrance is over");
assert(html.includes("@supports (overflow-x: clip){.content{overflow-x:clip}") && html.includes("@supports not (overflow-x: clip){.wizard-step.step-next, .wizard-step.step-back{animation-name:fn-view-in}"), "a step sliding in never makes the page scroll sideways (clip, or a rise where clip is missing)");
assert(html.includes('if (active && slide) restartAnimation(panel, direction);') && html.includes('const direction = wizardStep > previousStep ? "step-next" : "step-back";'), "report steps slide in the direction of travel");
// Closing: the real dialog closes at once; a copy without ids, hidden from screen readers and unclickable, fades.
assert(/function closeModal\(\) \{\n      playModalExit\(\);/.test(html) && html.includes('[ghost, ...ghost.querySelectorAll("[id]")].forEach((element) => element.removeAttribute("id"));') && html.includes('ghost.setAttribute("aria-hidden", "true");') && html.includes(".modal-backdrop.modal-ghost.show{pointer-events:none;") && html.includes(".modal-backdrop.show.is-page{animation:none;background:var(--soft)}"), "a closing dialog fades as an unclickable copy without ids, hidden from screen readers");
assert(html.includes('document.querySelectorAll(".modal-ghost").forEach((ghost) => ghost.remove());'), "opening a dialog removes any copy still fading");
assert(html.includes('ghost.addEventListener("animationend", (event) => { if (event.target === ghost) ghost.remove(); });') && html.includes("window.setTimeout(() => ghost.remove(), 600);"), "the fading copy goes when its fade ends, and in any case after 600 ms (a slow phone may start it late)");
// Focus still moves at once: nothing in the motion code delays it.
assert(!/setTimeout\([^)]*(focus|focusWizardHeading)/.test(html.slice(html.indexOf("function reducedMotion()"), html.indexOf("function announceView("))), "focus never waits for an animation");

console.log("V2 design and safety guard test passed");
