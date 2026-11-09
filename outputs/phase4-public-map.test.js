"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const maps = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");

for (const id of [
  "nearbyMapModeBtn", "nearbyListModeBtn", "nearbyCategoryFilter", "nearbyStatusFilter",
  "nearbyRegionFilter", "nearbyDistrictFilter", "nearbyDateFilter", "nearbyDistanceFilter",
  "nearbyVerificationFilter", "nearbyResultSummary", "nearbyReportList", "nearbyNotificationsBtn"
]) {
  assert(html.includes(`id="${id}"`), `Phase 4 control ${id} should exist`);
}
assert(html.includes("Moderator verified only"), "public verification filter must not imply unverified reports are shown");
assert(html.includes("Locations shown at MMDA-safe precision"), "result count must explain location precision");
assert(html.includes("latestPublicUpdate"), "public cards should render the latest public responder update");
assert(html.includes("responsibleInstitution"), "public cards should show a genuinely assigned institution when present");
assert(maps.includes("fixnow:map-report-selected") && maps.includes("focusPublicReport"), "map markers and report cards must synchronize");
assert(maps.includes("Cluster of ${count} verified public reports"), "clusters need an accessible count");
assert(maps.includes("categoryGlyph") && maps.includes("statusBorders") && maps.includes("fixnow-map-verified"), "marker visuals must communicate category, status, and verification without color alone");
assert(backend.includes("WHERE public_verified = 1 AND hidden = 0 AND flagged = 0"), "public feed query must require moderation approval and exclude hidden or flagged reports");
assert(backend.includes("function publicFeedReport"), "public feed needs a dedicated allowlist serializer");
const serializer = backend.slice(backend.indexOf("function publicFeedReport"), backend.indexOf("function categoryGlyph"));
assert(!serializer.includes("...payload"), "public feed serializer must not spread private report payloads");
assert(!serializer.includes("exactLatitude") && !serializer.includes("exactLongitude") && !serializer.includes("trackingSecret") && !serializer.includes("contact:"), "public feed must omit exact location, tracking secrets, and contact data");
assert(backend.includes("mmda-representative-point"), "public map markers must use MMDA representative points");

console.log("Phase 4 verified public map/feed test passed");
