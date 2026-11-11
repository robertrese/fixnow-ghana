"use strict";

// Staff browser policy. Staff work in staff.html and staff.js; the resident page carries no staff code or data.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const staffHtml = fs.readFileSync(path.join(__dirname, "staff.html"), "utf8");
const staff = fs.readFileSync(path.join(__dirname, "staff.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);

assert(scriptMatch, "main application script should exist");
assert.doesNotThrow(() => new Function(scriptMatch[1]), "browser script should parse");
assert.doesNotThrow(() => new Function(staff), "staff script should parse");

// The resident page has no staff portal, staff sign-in form or staff case cache.
for (const gone of ['id="responderPortal"', 'id="adminConsole"', 'id="syncPanel"', 'id="syncPassword"', "function openResponderPortalLogin", "responderReports = "]) {
  assert(!html.includes(gone), `the resident page must not contain the old staff portal (${gone})`);
}
assert(html.includes("try { localStorage.removeItem(RESPONDER_STORE_KEY); } catch {}"), "staff cases cached by older versions must be removed from resident devices");
assert(html.includes('window.location.href = `staff.html${window.location.search}`'), "Verified staff access must open the separate staff page");

// Staff sign-in and session.
assert(staffHtml.includes('id="signInForm"') && staffHtml.includes('autocomplete="current-password"'), "staff need a sign-in form");
assert(staffHtml.includes('<script src="staff.js"></script>') && !/<script(?![^>]*src)[^>]*>[\s\S]*fetch\(/.test(staffHtml), "staff code lives in staff.js");
assert(staff.includes('const STAFF_KEY = "fixnow-gh-v3-staff"') && staff.includes('const OUTBOX_KEY = "fixnow-gh-v3-staff-outbox"'), "staff sessions and unsent updates use their own storage keys");
assert(staff.includes("response.status === 401") && staff.includes("endSession("), "an expired staff session must return to sign-in");
assert(staff.includes('await api("/api/logout"') && staff.includes("Signing out deletes"), "sign-out must end the server session and warn about unsent updates");
assert(staff.includes("PAGE_LOCAL_HOSTS.indexOf(window.location.hostname) < 0"), "local HTTP servers must only be used from local pages");
assert(!staff.includes("/api/reports/sync"), "the browser must not bulk-push cached cases");
assert(!staff.includes("crypto.randomUUID()") || staff.includes("typeof window.crypto.randomUUID === \"function\""), "staff IDs must work where crypto.randomUUID is missing");

// Updates: public update required, internal note separate, offline updates kept and labelled.
assert(staff.includes('"Public update", "Residents following this report see this') && staff.includes('"Internal note (optional)", "Staff only."'), "public updates and internal notes must be clearly separated");
assert(staff.includes('need("#updatePublic", "Add a public update.")'), "every status update needs a public explanation");
assert(staff.includes("Saved on this phone. Not sent yet.") && staff.includes('tag-warn">Not sent yet</span>'), "unsent staff updates must be labelled Not sent yet");
assert(staff.includes('window.addEventListener("online", processOutbox)') && staff.includes("updateKey: makeUuid()"), "unsent updates are retried with an idempotency key when back online");
assert(staff.includes("Internal note, staff only: ") && staff.includes("Public update: "), "case history must label internal notes as staff only");

// The Android app ships the staff page.
const gradle = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-android", "app", "build.gradle"), "utf8");
for (const file of ["staff.html", "staff.js", "staff-boot.js", "staff.css"]) assert(gradle.includes(`include "${file}"`), `the Android app must include ${file}`);

// Offline cache: the staff page works offline, API responses are never cached.
for (const file of ["./staff.html", "./staff.js", "./staff.css"]) assert(serviceWorker.includes(`"${file}"`), `${file} must be cached for offline use`);
assert(serviceWorker.includes('url.pathname.startsWith("/api/")'), "API responses must bypass the service worker cache");
assert(serviceWorker.includes('event.request.mode === "navigate"'), "page navigations must check the network for current application code");
assert(serviceWorker.indexOf("fetch(event.request)") < serviceWorker.indexOf(".catch(() => caches.match", serviceWorker.indexOf('event.request.mode === "navigate"')), "HTML must use network-first update behavior with an offline fallback");

console.log("Staff browser policy test passed");
