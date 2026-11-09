"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");
const loader = require(path.join(__dirname, "..", "work", "fixnow-backend", "boundary-loader.js"));
const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "boundaries", "boundary-dataset.json"), "utf8"));

assert(html.includes('id="exactLocationConsent"'), "the report form needs explicit exact-location consent");
assert(!html.includes('id="protectLocation"'), "privacy must not be represented as an optional public-location toggle");
assert(html.includes('id="locationVerification"') && html.includes('role="status"'), "boundary verification needs an accessible status");
assert(html.includes('/api/public/location/resolve'), "GPS capture should ask the backend for an official boundary result");
assert(html.includes('locationCaptureSource = "gps"'), "GPS location source must be recorded");
assert(html.includes("accuracyMetres"), "GPS accuracy must be recorded");
assert(backend.includes("report.exactLocationConsent !== true"), "the backend must enforce exact-location consent");
assert(backend.includes("redactPublicLocationText"), "public serializers must redact precise location patterns");
assert(backend.includes('pathname.match(/^\\/api\\/reports\\/([^/]+)\\/location$/)'), "exact location needs a dedicated authenticated endpoint");
assert(backend.includes("reportInActorScope(actor, row)"), "exact location access must enforce responder scope");
assert(metadata.publisher === "Ghana Statistical Service", "boundary source must be authoritative and recorded");
assert(metadata.featureCount === 261, "the active boundary dataset must contain all 261 MMDAs");
assert(metadata.licenceStatus === "production-review-required", "unconfirmed production licensing must remain explicit");

const boundaryPath = path.join(__dirname, "..", "work", "fixnow-backend", "boundaries", metadata.runtimeFile);
const index = loader.createBoundaryIndex(boundaryPath, metadata);
assert.strictEqual(index.metadata.featureCount, 261, "boundary loader should expose all 261 MMDAs");
assert.strictEqual(index.find(5.525, -0.25).district, "Accra Metropolitan Area (AMA)", "an Accra point should resolve to its official MMDA");
assert.strictEqual(index.find(0, 0), null, "a point outside Ghana should not resolve");

console.log("Phase 2 secure location test passed");
