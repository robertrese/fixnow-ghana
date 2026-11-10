"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "work", "fixnow-backend", "server.js"), "utf8");
const env = fs.readFileSync(path.join(root, "work", "fixnow-backend", ".env.example"), "utf8");
const coreSql = fs.readFileSync(path.join(root, "work", "fixnow-backend", "deploy", "postgres", "000_core.sql"), "utf8");
const geoSql = fs.readFileSync(path.join(root, "work", "fixnow-backend", "deploy", "postgres", "001_secure_location.sql"), "utf8");
const opsSql = fs.readFileSync(path.join(root, "work", "fixnow-backend", "deploy", "postgres", "002_operations_security.sql"), "utf8");
const architecture = fs.readFileSync(path.join(root, "work", "fixnow-backend", "PRODUCTION-ARCHITECTURE.md"), "utf8");
const backup = fs.readFileSync(path.join(root, "work", "fixnow-ops", "scripts", "backup-postgres-encrypted.sh"), "utf8");
const restore = fs.readFileSync(path.join(root, "work", "fixnow-ops", "scripts", "restore-postgres-test.sh"), "utf8");
const secretScan = fs.readFileSync(path.join(root, "work", "fixnow-ops", "scripts", "secret-scan.ps1"), "utf8");

assert(backend.includes("20260810_09_production_security_operations"), "production security operations need a versioned migration");
assert(backend.includes("TRUST_PROXY") && backend.includes("allowedRequestOrigin") && backend.includes("Content-Security-Policy"), "proxy, origin, CORS, and CSP handling should be explicit");
assert(backend.includes("responder_login_security") && backend.includes("temporarily locked after repeated failed attempts"), "responder sign-in should have persistent brute-force protection");
assert(backend.includes("signedAttachmentPath") && backend.includes("verifySignedAttachment") && backend.includes("timingSafeEqual"), "private evidence should use short-lived signed URLs");
assert(backend.includes("queueUploadScan") && backend.includes("scanner-queued"), "quarantine should have a genuine optional scanning hook");
assert(backend.includes("/api/ready") && backend.includes("readinessState"), "health and readiness checks should be separate");
assert(backend.includes("runRetentionJob") && backend.includes("RUN RETENTION"), "retention should support dry-run and confirmed execution");
assert(backend.includes("notifyMonitoring") && backend.includes("accountIdentifierHashed"), "monitoring and authentication logs should avoid raw account identifiers");

for (const variable of ["APP_ENV", "TRUST_PROXY", "ATTACHMENT_SIGNING_SECRET", "UPLOAD_SCAN_WEBHOOK_URL", "MONITORING_WEBHOOK_URL", "OBJECT_STORAGE_BUCKET"]) {
  assert(env.includes(`${variable}=`), `${variable} should be documented without a credential`);
}
assert(coreSql.includes("private_attachments") && coreSql.includes("REVOKE ALL"), "PostgreSQL core should keep evidence private");
assert(geoSql.includes("USING gist") && geoSql.includes("geometry(Point, 4326)"), "PostGIS should use spatial types and indexes");
assert(opsSql.includes("ST_Covers") && opsSql.includes("external_outcome_id"), "production operations should derive MMDA scope spatially and constrain delivery evidence");
assert(architecture.includes("does not") || architecture.includes("Do not"), "production architecture should name the current adapter boundary honestly");
assert(backup.includes("pg_dump") && backup.includes("age --recipient") && backup.includes("sha256sum"), "production backups should be encrypted and checksummed");
assert(restore.includes("pg_restore") && restore.includes("boundary_datasets"), "restore tests should verify restored operational data");
assert(secretScan.includes("PRIVATE KEY") && secretScan.includes("Potential committed secret"), "a repository secret scan should be available");

assert(html.includes("adminReadinessBtn") && html.includes("adminRetentionBtn"), "admins should be able to inspect readiness and retention dry runs");
assert(html.includes("openPrivateResponderEvidence") && html.includes("cache: \"no-store\""), "authorised evidence previews should consume signed URLs without caching");
assert(/fixnow-ghana-static-v(?:2\d|[3-9]\d)/.test(worker) && worker.includes('url.pathname.startsWith("/api/")'), "Phase 11 should invalidate static assets while excluding every API response from service-worker storage");

// The repository is public: demo staff accounts (with published passwords) must never exist in production.
assert(backend.includes("if (SEED_DEMO_ACCOUNTS) throw new Error(\"SEED_DEMO_ACCOUNTS must be disabled in production\")") && backend.includes("const SEED_DEMO_ACCOUNTS = process.env.SEED_DEMO_ACCOUNTS === \"1\";"), "production must refuse to start with demo accounts");

console.log("Phase 11 production geospatial and security foundation test passed");
