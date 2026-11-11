"use strict";

// Staff area (staff.html): moderator review queue, responder cases and case pages, all scoped by the server.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const staffHtml = fs.readFileSync(path.join(__dirname, "staff.html"), "utf8");
const staff = fs.readFileSync(path.join(__dirname, "staff.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "staff.css"), "utf8");
const maps = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");

// Screens and roles.
for (const id of ["signInView", "staffTabs", "staffView", "staffPage", "pageBack", "dialogBackdrop", "dialogTitle"]) assert(staffHtml.includes(`id="${id}"`), `staff control ${id} should exist`);
assert(staff.includes('if (canModerate()) tabs.push({ id: "review"') && staff.includes('if (isAdmin()) tabs.push({ id: "routing"'), "tabs depend on the signed-in role");
for (const queue of ['["institutional", "In my area"]', '["assigned", "Assigned to me"]', '["overdue", "Overdue"]', '["escalated", "Escalated"]']) assert(staff.includes(queue), `case list needs the ${queue} filter`);
assert(staff.includes('id="caseSearch"') && staff.includes('id="caseCategory"') && staff.includes('id="caseStatus"'), "cases need search, type and status filters");

// Moderator review: urgent first, waiting time, verify, reject, escalate, hide, public preview, routing preview.
assert(staff.includes('api("/api/reports?queue=review")') && staff.includes("Reports with immediate danger or Critical severity are at the top"), "the review queue comes from the server, urgent first");
assert(staff.includes("function waited(") && staff.includes('esc(waited(report.createdAt))'), "review items show how long each report has waited");
for (const label of ["Verify and publish", '"Reject report"', '"Hide report"', 'data-act="escalate-review"', "What residents will see", "Where it goes after verification"]) assert(staff.includes(label), `review page needs ${label}`);
assert(staff.includes('if (!$("#verifyPrivacy").checked)') && staff.includes("privacyChecked: true"), "verifying needs the privacy confirmation");
assert(staff.includes('need("#moderationReason", "Add a reason.")'), "reject, hide and escalate need a reason");

// Private details only on the case page, never in lists.
assert(staff.includes('api("/api/reports/" + encodeURIComponent(id) + "/case")') && staff.includes("Private details, staff only"), "contact and exact location come from the case endpoint");
const itemSource = staff.slice(staff.indexOf("function itemHtml"), staff.indexOf("function bindItems"));
assert(!/contact|exactLatitude|coordinates|digitalAddress/.test(itemSource), "list items must never show contact details or exact locations");
assert(staff.includes("Only moderators and the responder assigned to this case can see contact details."), "staff without contact access are told why");
assert(staff.includes("Opening this page is recorded in the audit log."), "case views are audited and staff are told so");

// Field actions.
for (const action of ['data-act="accept"', 'data-act="update"', 'data-act="assign"', 'data-act="escalate"', 'data-act="photo"', 'data-act="routing"']) assert(staff.includes(action), `case page needs ${action}`);
assert(staff.includes("const NEXT_STATUSES") && staff.includes("Choose a checked photo or explain how the fix was confirmed"), "status changes follow the server's allowed transitions and resolution proof");
assert(/no outside office has been contacted by FixNow/i.test(staff) && /does not contact (any office|anyone) by itself/.test(staff), "escalation must not claim an unrecorded delivery");
assert(staff.includes("Back") || staffHtml.includes(">Back</button>"), "case pages have a Back button");
assert(staff.includes('history.pushState({ staffPage: true }, "")') && staff.includes('window.addEventListener("popstate"'), "browser and Android Back close a case page");

// Design rules on staff screens.
assert(!/text-transform:\s*uppercase/.test(css), "no ALL-CAPS labels");
assert(!/ · | &middot; /.test(staff + staffHtml), "no dot-joined meta text");
assert(/@media \(hover:hover\)/.test(css) && !/^[^@]*:hover/m.test(css.split("@media (hover:hover)")[0]), "hover effects only on devices that hover");
assert(css.includes(':root[data-theme="dark"]') && css.includes("--primary-bg:#fcd116; --primary-ink:#0d2a22"), "dark mode uses gold main actions with deep green text");
assert(!/\binset\s*:/.test(css), "spell out top/right/bottom/left for older browsers");
assert(css.split("100vh").length === css.split("100dvh").length, "every 100vh has a 100dvh line after it");

// Strict content security policy: only the page's own scripts and styles, connections only to the FixNow server.
const csp = (staffHtml.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
assert(csp.includes("default-src 'none'") && csp.includes("script-src 'self';") && csp.includes("style-src 'self';"), "staff.html needs a strict content security policy");
assert(!/unsafe-inline|unsafe-eval|\*/.test(csp), "the staff policy must not allow inline code, eval or wildcards");
assert(/connect-src 'self' https:\/\/api\.fixnowghana\.org http:\/\/localhost:4180 http:\/\/127\.0\.0\.1:4180;/.test(csp), "staff pages may connect only to the FixNow server (and the local development server)");
assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(staffHtml), "staff.html must have no inline scripts");
assert(!/style="/.test(staffHtml + staff), "staff screens must not use inline style attributes, which the policy blocks");
assert(staffHtml.indexOf('<script src="staff-boot.js"></script>') < staffHtml.indexOf('<link rel="stylesheet" href="staff.css"'), "the theme is set before the first paint");

// Sign-out leaves nothing private on a shared phone.
const endSession = staff.slice(staff.indexOf("function endSession"), staff.indexOf("function removeLegacyStaffData"));
assert(endSession.includes("session = { server: session.server }") && endSession.includes("localStorage.removeItem(OUTBOX_KEY)"), "sign-out removes the staff session and unsent updates");
assert(endSession.includes('["#staffView", "#pageBody", "#dialogBody", "#tabButtons", "#sideWho"]'), "sign-out removes the last account's screens from the page");
assert(staff.includes('localStorage.removeItem(space + "-responder-reports")') && staff.includes('indexedDB.deleteDatabase("fixnow-responder-update-queue")'), "staff data kept by older versions is removed");
assert(staff.includes("saveJson(OUTBOX_KEY, outbox().filter((item) => item.actorId === Number(data.user.id)))"), "a new account never inherits another account's unsent updates");
for (const file of ["./staff-boot.js"]) assert(worker.includes(`"${file}"`), `${file} must be cached for offline use`);

// Map and server rules that stay from the original responder phase.
assert(maps.includes("initializeResponder") && maps.includes("exact authorised field location"), "responder map should use genuine exact authorised coordinates");
assert(maps.includes("!report?._responderAuthorized") && maps.includes("!token"), "responder map must refuse unauthenticated or unauthorised report data");
assert(backend.includes("20260810_07_responder_field_operations"), "responder operations need a versioned migration");
for (const table of ["responder_evidence", "report_assignments", "report_escalations", "responder_action_keys"]) assert(backend.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} should be durable`);
assert(backend.includes("function responderFieldAction") && backend.includes("function createResponderEvidence"), "field actions and evidence must be enforced by the backend");
assert(backend.includes("validateResponderTransition") && backend.includes("Status cannot move from"), "backend status transitions must be explicit");
assert(backend.includes("Resolution requires clean field evidence or a documented exception"), "resolution should require proof or a documented exception");
assert(backend.includes("Report is outside your permitted area") && backend.includes("reportInActorScope"), "responder scope enforcement must remain server-side");
assert(backend.includes("const PRIVATE_REPORT_KEYS") && backend.includes(".map(responderListReport)"), "staff lists must strip contact details and exact locations on the server");
assert(backend.includes("function canSeeReporterContact") && backend.includes('logAudit(actor, "case_viewed"'), "contact access is limited and case views are audited");
assert(backend.includes('A reason is required to reject a report') && backend.includes('A reason is required to hide a report'), "reject and hide need reasons on the server");
assert(Number((worker.match(/fixnow-ghana-static-v(\d+)/) || [])[1]) >= 44, "the staff page needs the cache version that added it");

console.log("Staff area test passed");
