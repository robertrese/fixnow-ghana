"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const config = require("./emergency-contacts.js");
const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const android = fs.readFileSync(path.join(root, "work", "fixnow-android", "app", "src", "main", "java", "com", "fixnowghana", "command", "MainActivity.java"), "utf8");

const contacts = Object.fromEntries(config.contacts.map((contact) => [contact.serviceId, contact]));
assert.strictEqual(contacts["general-emergency"].primaryNumber, "112");
assert.strictEqual(contacts.police.primaryNumber, "191");
assert.strictEqual(contacts.fire.primaryNumber, "192");
assert.notStrictEqual(contacts.fire.primaryNumber, "193");
assert.strictEqual(contacts.ambulance.primaryNumber, "112");
assert.notStrictEqual(contacts.ambulance.primaryNumber, "192");
assert.deepStrictEqual(contacts.ambulance.alternativeNumbers, ["193"]);

for (const contact of config.contacts) {
  assert.strictEqual(contact.active, true, `${contact.serviceId} must be active`);
  assert.strictEqual(contact.verificationStatus, "verified", `${contact.serviceId} must be verified`);
  assert.match(contact.primaryNumber, /^\d{3}$/);
  assert.match(contact.officialSourceUrl, /^https:\/\//);
}

assert(html.includes('src="emergency-contacts.js"'), "the offline contact config must load before the app script");
assert(html.includes("function validEmergencyNumber"), "web calls must validate selected numbers");
assert(html.includes("function startEmergencyDial"), "web calls must be explicitly confirmed");
assert(html.includes("emergencyDiallerOpening"), "repeated dialler launches must be blocked");
assert(html.includes("window.fixNowDismissEmergencyDialog"), "Android Back must safely dismiss emergency confirmation");
assert(!html.includes('href="tel:112"'), "emergency calls must not be scattered as raw links");
assert(html.includes("--brand-emergency: #72262e"), "the burgundy emergency colour must be preserved");
assert(html.includes("--brand-nav: #0d2a22"), "the deep green navigation colour must be preserved");
assert(html.includes("--brand-primary: #0a7a52"), "the green primary action colour must be preserved");
assert(worker.includes('"./emergency-contacts.js"'), "verified contact fallback must be cached offline");
assert(worker.includes('url.pathname.startsWith("/api/")'), "API responses must remain excluded from service-worker caching");
assert(android.includes("Intent.ACTION_DIAL"), "Android must open the dialler without calling directly");
assert(!android.includes("Intent.ACTION_CALL"), "Android must not place calls directly");
assert(!android.includes("CALL_PHONE"), "Android must not request calling permission");
assert(android.includes('"112".equals(number)') && android.includes('"191".equals(number)') && android.includes('"192".equals(number)') && android.includes('"193".equals(number)'), "Android must whitelist only approved emergency numbers");
assert(android.includes("fixNowDismissEmergencyDialog"), "Android Back must query the web confirmation dialog");

console.log("Emergency contact and design-preservation policy test passed");
