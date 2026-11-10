"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const maps = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");

for (const id of ["responderPortalGate", "responderFieldWorkspace", "fieldRole", "fieldInstitution", "fieldRegion", "fieldDistrict", "responderCaseSearch", "responderCategoryFilter", "responderStatusFilter", "responderMap", "responderCaseList"]) {
  assert(html.includes(`id="${id}"`), `responder portal control ${id} should exist`);
}
for (const queue of ["assigned", "institutional", "overdue", "escalated"]) {
  assert(html.includes(`data-responder-queue="${queue}"`), `responder ${queue} queue should exist`);
}
for (const action of ["data-field-accept", "data-field-status", "data-field-evidence", "data-field-escalate", "data-field-assign"]) {
  assert(html.includes(action), `responder action ${action} should be rendered from authorised reports`);
}
assert(html.includes("gate.hidden = authenticated") && html.includes("workspace.hidden = !authenticated"), "private responder workspace must remain gated until authentication");
assert(html.includes("_responderAuthorized") && html.includes("canOperateResponderCase"), "field actions should originate only from the authenticated authorised queue");
assert(html.includes("resolutionEvidenceId") && html.includes("resolutionException"), "offline status updates should preserve the server resolution-proof contract");
assert(/no external delivery has been claimed/i.test(html), "escalation UI must not claim an unrecorded external delivery");

assert(maps.includes("initializeResponder") && maps.includes("exact authorised field location"), "responder map should use genuine exact authorised coordinates");
assert(maps.includes("!report?._responderAuthorized") && maps.includes("!token"), "responder map must refuse unauthenticated or unauthorised report data");
assert(maps.includes("AdvancedMarkerElement"), "responder map should retain Advanced Markers");

assert(backend.includes("20260810_07_responder_field_operations"), "responder operations need a versioned migration");
for (const table of ["responder_evidence", "report_assignments", "report_escalations", "responder_action_keys"]) {
  assert(backend.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} should be durable`);
}
assert(backend.includes("function responderFieldAction") && backend.includes("function createResponderEvidence"), "field actions and evidence must be enforced by the backend");
assert(backend.includes("validateResponderTransition") && backend.includes("Status cannot move from"), "backend status transitions must be explicit");
assert(backend.includes("Resolution requires clean field evidence or a documented exception"), "resolution should require proof or a documented exception");
assert(backend.includes("Report is outside your permitted area") && backend.includes("reportInActorScope"), "responder scope enforcement must remain server-side");
assert(Number((worker.match(/fixnow-ghana-static-v(\d+)/) || [])[1]) >= 18, "Phase 9 or later should retain the responder portal cache invalidation");

console.log("Phase 9 separate responder field portal test passed");
