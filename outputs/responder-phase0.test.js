"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);

assert(scriptMatch, "main application script should exist");
assert.doesNotThrow(() => new Function(scriptMatch[1]), "browser script should parse");
assert(html.includes("RESPONDER_STORE_KEY"), "responder reports need a role-separated cache");
assert(html.includes("fixnow-responder-update-queue"), "responder updates need a durable IndexedDB queue");
assert(html.includes("responder-authenticated"), "responder tools must remain locked before authentication");
assert(html.includes('id="syncInstitution"') && html.includes('id="syncScope"'), "the signed-in institution and scope must be visible");
assert(!html.includes("/api/reports/sync"), "the browser must not bulk-push cached cases");
assert(!html.includes('pending: "Pending sync"'), "citizen tracking must not expose responder queue language");
assert(html.includes("responderReports = serverReports.map"), "a scoped server pull must replace the responder queue");
assert(html.includes("PAGE_LOCAL_HOSTS.has(window.location.hostname)"), "local HTTP overrides must check the page origin");

const queueStart = html.indexOf("async function queueResponderStatusUpdate");
const queueEnd = html.indexOf("function validateSyncServer", queueStart);
const queueSource = html.slice(queueStart, queueEnd);
assert(queueStart >= 0 && queueEnd > queueStart, "responder status queue function should exist");
assert(!queueSource.includes("status: nextStatus"), "queueing must not optimistically change the official status");
assert(queueSource.indexOf("await queueResponderUpdate") < queueSource.indexOf("authorizedResponderReport(report, {"), "the durable queue write must happen before the pending UI marker");
assert(queueSource.includes("Public update (required)"), "status updates must request a public explanation");
assert(queueSource.includes("Private note (optional)"), "private operations notes must be clearly separated");

const renderStart = html.indexOf("function renderQueueV2");
const renderEnd = html.indexOf("function topRoutes", renderStart);
const renderSource = html.slice(renderStart, renderEnd);
assert(renderSource.includes("select.value = report.status"), "the status control must stay on the accepted server status while an update is queued");
assert(renderSource.includes("reportHistoryHtml(report, residentView)"), "citizen and responder history must be rendered through the privacy-aware history view");
assert(renderSource.includes("authorizedResponder"), "responder actions must require an authorized scoped record");

assert(serviceWorker.includes('url.pathname.startsWith("/api/")'), "API responses must bypass the service worker cache");
assert(serviceWorker.includes('event.request.mode === "navigate"'), "page navigations must check the network for current application code");
assert(serviceWorker.indexOf("fetch(event.request)") < serviceWorker.indexOf(".catch(() => caches.match", serviceWorker.indexOf('event.request.mode === "navigate"')), "HTML must use network-first update behavior with an offline fallback");

console.log("Responder Phase 0 browser policy test passed");
