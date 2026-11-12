"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const maps = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");

assert.doesNotThrow(() => new Function(maps), "the map foundation should parse");
for (let step = 1; step <= 6; step += 1) {
  assert(html.includes(`data-wizard-step="${step}"`), `wizard step ${step} should exist`);
  assert(html.includes(`data-progress-step="${step}"`), `wizard progress step ${step} should exist`);
}
for (const id of [
  "evidence", "evidenceProgress", "evidenceGallery", "reportLocationMap", "reportPlaceSearch",
  "reportTitle", "subcategory", "problemStarted", "accessBlocked", "worsening", "immediateDanger",
  "contactConsent", "caseConsent", "duplicateCheckBtn", "duplicateSuggestions"
]) assert(html.includes(`id="${id}"`), `Phase 5 control ${id} should exist`);

assert(html.includes('accept="image/jpeg,image/png,image/webp"') && html.includes("multiple"), "evidence selection should accept multiple supported image formats");
assert(html.includes("canvas.toBlob") && html.includes("remove hidden location information from photos"), "evidence must be re-encoded on device with clear metadata-removal language");
assert(html.includes("5 - evidenceItems.filter") && html.includes("files.slice(0, remaining)") && html.includes("750_000"), "evidence count and compressed upload size must be bounded");
assert(html.includes("indexedDB.open(WIZARD_DRAFT_DB_NAME") && html.includes('excluded = new Set(["evidence", "caseConsent", "contactConsent", "exactLocationConsent"])'), "drafts should be resumable without persisting consent checkboxes");
assert(html.includes("/api/public/reports/duplicates") && html.includes("No report will be merged automatically"), "duplicate checking should be advisory and explicit");
assert(html.includes("/api/public/uploads") && html.includes("serverAttachmentId"), "queued attachments should resume through the private upload API");
assert(html.includes("isRetryableSubmissionError") && html.includes("queueSubmission(item)"), "offline submissions should retain an explicit retry path");
assert(maps.includes("initializeLocationPicker") && maps.includes("gmpDraggable: true"), "the report location picker should support search, click, and marker adjustment");
assert(maps.includes('includedRegionCodes = ["gh"]'), "report place search must remain restricted to Ghana");
assert(html.includes('aria-label="Choose a private report location in Ghana"'), "the report map needs an accessible privacy-aware label");
assert(backend.includes('pathname === "/api/public/uploads"') && backend.includes("createQuarantinedAttachment"), "the backend should expose a dedicated private quarantine upload route");
assert(backend.includes("detectImageType") && backend.includes("crypto.randomUUID()"), "the server should inspect image signatures and use random storage names");
assert(backend.includes("claimReportAttachments") && backend.includes("attachmentCount"), "reports should claim bounded uploads and expose only a safe count to citizens");
assert(backend.includes('pathname === "/api/public/reports/duplicates"') && backend.includes("merged: false"), "the backend must never merge duplicate suggestions automatically");
assert(Number((worker.match(/fixnow-ghana-static-v(\d+)/) || [])[1]) >= 14, "Phase 5 or later assets should invalidate the previous offline cache");

console.log("Phase 5 guided reporting and private evidence test passed");
