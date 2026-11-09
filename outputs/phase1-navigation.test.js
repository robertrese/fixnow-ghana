"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const navMatch = html.match(/<nav class="nav"[\s\S]*?<\/nav>/);

assert(navMatch, "citizen navigation should exist");
const nav = navMatch[0];
for (const view of ["home", "nearby", "report", "my", "profile"]) {
  assert(nav.includes(`data-app-view="${view}"`), `citizen navigation should include ${view}`);
}
assert(!nav.includes('data-app-view="responder"'), "responder tools must not appear in citizen navigation");
assert(nav.includes("nav-report"), "the central report action should have its raised-action treatment");
assert(html.includes("Report without an account"), "anonymous reporting should remain a first-class welcome action");
assert(html.includes("Sign in or create account"), "optional account access should be visible");
assert(html.includes("Track with reference"), "private reference tracking should be visible");
assert(html.includes("Owner setup is required before real security codes can be delivered") || html.includes("otp.reason"), "unconfigured phone identity must be labelled honestly");
assert(html.includes("Server-side Google token verification is not configured") || html.includes("google.reason"), "unconfigured identity providers must be labelled honestly");
assert(html.includes('id="nearbyMapUnavailable"'), "nearby must retain an honest fallback when live maps are unavailable");
assert(!html.includes("synthetic coordinates"), "nearby must not use synthetic report locations");
assert(!html.includes('data-app-view="responder"'), "responder access must not be a citizen route");
assert(html.includes('id="responderAccessBtn"'), "responder access should use a separate authenticated entry point");
assert(html.includes("reports.map(safeExportReport)"), "JSON export must use the privacy-safe allowlist");
assert(html.includes('id="myReportList"'), "My Reports needs a dedicated local-only report list");
assert(html.includes("env(safe-area-inset-bottom)"), "mobile navigation should respect device safe areas");
assert(html.includes("prefers-reduced-motion: reduce"), "reduced-motion preferences should be supported");
assert(html.includes("focus-visible"), "keyboard focus should remain visible");

console.log("Phase 1 citizen navigation test passed");
