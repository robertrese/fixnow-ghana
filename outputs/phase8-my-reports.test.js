"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");

for (const id of ["myReportSearch", "myReportCategoryFilter", "myReportStatusFilter", "trackAnotherBtn", "refreshAccountReportsBtn", "myReportSourceStatus"]) {
  assert(html.includes(`id="${id}"`), `advanced My Reports control ${id} should exist`);
}
for (const action of ["data-refresh-local", "data-notify-local", "data-copy-local", "data-whatsapp-local", "data-sms-local", "data-confirm-local", "data-reopen-local", "data-remove-contact-local"]) {
  assert(html.includes(action), `My Reports action ${action} should exist`);
}
assert(html.includes("loadCitizenAccountReports") && html.includes("accountLinked: true"), "account reports should merge with locally stored anonymous reports");
assert(html.includes("reportHistoryHtml(report, true)"), "My Reports should display the immutable public timeline");
assert(html.includes("responsibleInstitution") && html.includes("No public evidence has been approved"), "My Reports should show responsible institution and honest resolution evidence state");
assert(html.includes("openMyReportNotifications") && html.includes("Channel: in-app only"), "per-report notification preferences must not claim unconfigured delivery channels");
assert(html.includes("openReporterReopen") && html.includes("compressEvidenceImage(evidenceFile)"), "reopening should require a reason and support privacy-safe evidence where tracking proof is available");

const briefStart = html.indexOf("function brief(report)");
const briefEnd = html.indexOf("function safeExportReport", briefStart);
const briefSource = html.slice(briefStart, briefEnd);
for (const forbidden of ["report.coordinates", "report.digitalAddress", "report.contact", "report.trustedContact", "trackingSecret", "routeFor(", "scoreReport("]) {
  assert(!briefSource.includes(forbidden), `safe brief must exclude ${forbidden}`);
}
const exportStart = html.indexOf("function safeExportReport(report)");
const exportEnd = html.indexOf("function csvEscape", exportStart);
const exportSource = html.slice(exportStart, exportEnd);
for (const forbidden of ["coordinates", "digitalAddress", "contact", "trackingSecret", "privateNote", "assignedTo"]) {
  assert(!exportSource.includes(forbidden), `safe export allowlist must exclude ${forbidden}`);
}
assert(html.includes("reports.map(safeExportReport)") && html.includes("header.map((field) => csvEscape(safe[field]))"), "JSON and CSV must both use the safe export allowlist");
assert(html.includes("Exact GPS, GhanaPostGPS, contact information, tracking secrets, private notes, and internal routing are excluded"), "sharing confirmation must explain its safe defaults");

assert(backend.includes("20260810_06_advanced_citizen_reports"), "advanced citizen reports need a versioned migration");
assert(backend.includes("citizen_report_preferences") && backend.includes("citizen_reporter_actions"), "preferences and reporter actions need durable tables");
assert(backend.includes("function recordCitizenReporterAction") && backend.includes("function removeCitizenReportContact"), "reporter confirmation, reopening, and contact controls need backend enforcement");
assert(backend.includes("Only a resolved report can be reopened") && backend.includes("A reason is required to reopen a report"), "reopening must enforce state and reason");
assert(backend.includes("Reporter requested that this resolved report be reopened") && backend.includes("Reporter confirmed the reported resolution"), "reporter actions should create public timeline events");
assert(/fixnow-ghana-static-v(?:1[89]|2\d)/.test(worker), "Phase 8 or later should retain the advanced My Reports offline cache invalidation");

console.log("Phase 8 advanced My Reports and safe sharing test passed");
