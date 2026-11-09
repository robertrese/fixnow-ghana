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
assert(html.includes('openModal("Report submitted"') && html.includes('openModal("Saved and waiting to send"'), "online and offline results must be separate screens");
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
assert(html.includes("Approve photo for public view") && html.includes("I checked this photo: no faces, number plates, house numbers or other identifying details are visible."), "moderators must attest before a photo is published");

console.log("V2 design and safety guard test passed");
