"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");
const environment = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", ".env.example"), "utf8");
const setup = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "CITIZEN-ACCOUNTS.md"), "utf8");

for (const id of ["accountAccessBtn", "citizenAccountStatus", "accountAssociatedOption"]) {
  assert(html.includes(`id="${id}"`), `citizen account control ${id} should exist`);
}
assert(html.includes("openCitizenAccountDashboard") && html.includes("openCitizenOtpVerification"), "citizens need real sign-in and account-management surfaces");
assert(html.includes("openCitizenPasswordReset") && html.includes("/api/citizen/auth/password/reset/confirm"), "the UI should support secure OTP password reset");
assert(html.includes('citizenAuth: item.payload.reportMode === "Account-associated"'), "account report association must be an explicit per-report choice");
assert(html.includes("/api/citizen/reports/link") && html.includes("/api/citizen/export") && html.includes("/api/citizen/account"), "link, export, and deletion controls should call genuine account endpoints");
assert(backend.includes("20260810_05_optional_citizen_accounts"), "citizen accounts need a versioned migration");
for (const table of ["citizen_accounts", "citizen_sessions", "citizen_otp_challenges", "citizen_consents", "citizen_report_links", "citizen_password_resets"]) {
  assert(backend.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `backend table ${table} should exist`);
}
assert(backend.includes('/^\\+233[2-5]\\d{8}$/'), "backend must normalize and validate Ghana +233 numbers");
assert(backend.includes("OTP_EXPIRY_MINUTES") && backend.includes("OTP_RESEND_SECONDS") && backend.includes("OTP_MAX_ATTEMPTS"), "OTP expiry, resend cooldown, and attempt limits must be explicit");
assert(backend.includes("timingSafeEqual") && backend.includes("consumed_at"), "OTP and secret verification should be timing-safe and one-time");
assert(backend.includes("otp:phone:") && backend.includes("otp:device:") && backend.includes("otp:ip:"), "OTP requests must be limited by phone, device, and network");
assert(backend.includes("validateOtpProviderUrl") && backend.includes("await deliverCitizenOtp"), "OTP success must depend on a configured genuine delivery provider");
assert(!/console\.log\([^\n]*(?:code|otp)/i.test(backend), "OTP codes must never be logged");
assert(backend.includes('enabled: false') && backend.includes("Server-side Google token verification is not configured") && backend.includes("Server-side Apple token verification is not configured"), "Google and Apple must remain honestly unavailable without server verification");
assert(backend.includes("session_revoked") && backend.includes("account_deleted") && backend.includes("citizenDataExport"), "session invalidation, account deletion, and export need audit-backed implementations");
assert(setup.includes("never logs the code") && setup.includes("identity-detached public-service records"), "owner setup and deletion semantics must be documented");
assert(environment.includes("OTP_PROVIDER_WEBHOOK_URL=") && environment.includes("OTP_HASH_SECRET=") && environment.includes("CITIZEN_SESSION_TTL_HOURS="), "production account configuration should be documented without credentials");
assert(Number((worker.match(/fixnow-ghana-static-v(\d+)/) || [])[1]) >= 15, "Phase 6 or later should invalidate the previous offline cache");

console.log("Phase 6 optional citizen accounts test passed");
