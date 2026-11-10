"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");

for (const feed of ["nearby", "recent", "most-confirmed", "worsening", "recently-resolved"]) {
  assert(html.includes(`data-nearby-feed="${feed}"`), `public feed tab ${feed} should exist`);
  assert(backend.includes(`"${feed}"`), `backend should allow feed view ${feed}`);
}
for (const action of ["confirmed", "worsening", "fixed", "incorrect"]) {
  assert(html.includes(`data-public-signal="${action}"`), `structured public action ${action} should exist`);
}
assert(html.includes("Community signals do not set institutional priority"), "the UI must distinguish community observations from priority");
assert(html.includes("No approved public image") && html.includes("No public evidence has been approved"), "missing moderated images and resolution evidence need honest states");
assert(html.includes("responsibleInstitution") && html.includes("latestPublicUpdate") && html.includes("report.confirmations"), "cards should show institution, latest public update, and structured counts");
assert(backend.includes('"no-approved-public-image"') && backend.includes('"moderator-approved-public-image"') && backend.includes("resolutionEvidenceState"), "the public serializer must explicitly allowlist evidence availability");
assert(backend.includes("function stripImageMetadata") && backend.includes("privacyChecked !== true") && backend.includes("reports.public_verified = 1 AND reports.hidden = 0 AND reports.flagged = 0"), "public photos must be moderator-approved, metadata-stripped and served only for verified reports");
assert(backend.includes('feed === "most-confirmed"') && backend.includes('feed === "worsening"') && backend.includes('feed === "recently-resolved"'), "backend feed ordering must use genuine status and signal data");
const serializer = backend.slice(backend.indexOf("function publicFeedReport"), backend.indexOf("function categoryGlyph"));
assert(!serializer.includes("trackingSecret") && !serializer.includes("exactLatitude") && !serializer.includes("contact:"), "feed expansion must not weaken public privacy");
assert(!html.includes("data-public-comment") && !backend.includes("public_comments"), "the public feed must not add unrestricted comments");
assert(Number((worker.match(/fixnow-ghana-static-v(\d+)/) || [])[1]) >= 16, "Phase 7 or later should invalidate the previous offline cache");

console.log("Phase 7 trustworthy public feed test passed");
