"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");

for (const id of ["adminConsole", "adminAddItemBtn", "adminAddRuleBtn", "adminInviteBtn", "adminItemList", "adminRuleList", "adminInvitationList", "adminBoundaryList"]) {
  assert(html.includes(`id="${id}"`), `administration control ${id} should exist`);
}
for (const kind of ["agency", "region", "mmda", "jurisdiction", "category", "subcategory", "contact-channel", "escalation-path", "response-target", "role-scope", "retention-policy", "emergency-info", "environment-control"]) {
  assert(html.includes(`"${kind}"`), `admin interface should manage ${kind}`);
}
assert(html.includes("openReportRouting") && html.includes("Create recommendation"), "responder cases should expose recommendation-first routing");
assert(html.includes("Delivery state: Not sent") && /do not send, deliver, or acknowledge|does not send, deliver, or acknowledge/i.test(html), "routing UI should not imply delivery");
assert(html.includes("external outcome ID") && html.includes("Record delivery outcome"), "delivery UI should require genuine integration outcomes");
assert(html.includes("The server stores only its hash and expiry"), "responder invitation UI should describe one-time hashed codes");

assert(backend.includes("20260810_08_administration_and_routing"), "administration and routing need a versioned migration");
for (const table of ["admin_directory_items", "routing_rules", "routing_recommendations", "delivery_attempts", "responder_invitations"]) {
  assert(backend.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} should be durable`);
}
assert(backend.includes("Demo data cannot be enabled in a production environment control"), "production configuration should reject demo enablement");
assert(backend.includes("No active routing rule matches this report") && backend.includes("recommendation_state"), "routing should create a recommendation rather than a delivery claim");
assert(backend.includes("Sent, delivered, or acknowledged states require a recorded external integration outcome"), "delivery claims should require a real external outcome");
assert(backend.includes("routing_overridden") && backend.includes("override_reason"), "human routing overrides should remain audited with reasons");
assert(Number((worker.match(/fixnow-ghana-static-v(\d+)/) || [])[1]) >= 19, "Phase 10 or later should retain the administration cache invalidation");

console.log("Phase 10 administration and truthful routing test passed");
