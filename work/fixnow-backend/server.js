"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { createBoundaryIndex } = require("./boundary-loader");

const emergencyContactFallback = require(path.join(__dirname, "..", "..", "outputs", "emergency-contacts.js"));

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 4180);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DB_FILE = path.resolve(process.env.DB_FILE || path.join(DATA_DIR, "fixnow.sqlite"));
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "*";
const APP_ENV = String(process.env.APP_ENV || "development").trim().toLowerCase();
const TRUST_PROXY = ["1", "true", "yes"].includes(String(process.env.TRUST_PROXY || "").toLowerCase());
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
const BODY_LIMIT_BYTES = Number(process.env.BODY_LIMIT_BYTES || 2_000_000);
const REQUIRE_HTTPS = ["1", "true", "yes"].includes(String(process.env.REQUIRE_HTTPS || "").toLowerCase());
const TLS_KEY_PATH = process.env.TLS_KEY_PATH ? path.resolve(process.env.TLS_KEY_PATH) : "";
const TLS_CERT_PATH = process.env.TLS_CERT_PATH ? path.resolve(process.env.TLS_CERT_PATH) : "";
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || "";
const BOOTSTRAP_ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
const SEED_DEMO_ACCOUNTS = process.env.SEED_DEMO_ACCOUNTS === "1";
const GOOGLE_MAPS_BROWSER_KEY = String(process.env.GOOGLE_MAPS_BROWSER_KEY || "").trim();
const GOOGLE_MAP_ID = String(process.env.GOOGLE_MAP_ID || "").trim();
const OTP_PROVIDER_WEBHOOK_URL = String(process.env.OTP_PROVIDER_WEBHOOK_URL || "").trim();
const OTP_PROVIDER_AUTH_TOKEN = String(process.env.OTP_PROVIDER_AUTH_TOKEN || "").trim();
const OTP_EXPIRY_MINUTES = Math.max(2, Math.min(Number(process.env.OTP_EXPIRY_MINUTES || 5), 15));
const OTP_RESEND_SECONDS = Math.max(30, Math.min(Number(process.env.OTP_RESEND_SECONDS || 60), 600));
const OTP_MAX_ATTEMPTS = Math.max(3, Math.min(Number(process.env.OTP_MAX_ATTEMPTS || 5), 10));
const CITIZEN_SESSION_TTL_HOURS = Math.max(1, Math.min(Number(process.env.CITIZEN_SESSION_TTL_HOURS || 24), 168));
const TERMS_VERSION = sanitizeText(process.env.TERMS_VERSION || "2026-08-10", 40);
const PRIVACY_VERSION = sanitizeText(process.env.PRIVACY_VERSION || "2026-08-10", 40);
const GOOGLE_IDENTITY_CLIENT_ID = String(process.env.GOOGLE_IDENTITY_CLIENT_ID || "").trim();
const APPLE_SERVICE_ID = String(process.env.APPLE_SERVICE_ID || "").trim();
const OTP_RUNTIME_SECRET = process.env.OTP_HASH_SECRET || PASSWORD_PEPPER || crypto.randomBytes(32).toString("base64url");
const ATTACHMENT_SIGNING_SECRET = process.env.ATTACHMENT_SIGNING_SECRET || (APP_ENV === "production" ? "" : OTP_RUNTIME_SECRET);
const UPLOAD_SCAN_WEBHOOK_URL = String(process.env.UPLOAD_SCAN_WEBHOOK_URL || "").trim();
const UPLOAD_SCAN_AUTH_TOKEN = String(process.env.UPLOAD_SCAN_AUTH_TOKEN || "").trim();
const MONITORING_WEBHOOK_URL = String(process.env.MONITORING_WEBHOOK_URL || "").trim();
const MONITORING_AUTH_TOKEN = String(process.env.MONITORING_AUTH_TOKEN || "").trim();

const SCRYPT_N = Number(process.env.SCRYPT_N || 131072);
const SCRYPT_R = Number(process.env.SCRYPT_R || 8);
const SCRYPT_P = Number(process.env.SCRYPT_P || 1);
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = Number(process.env.SCRYPT_MAXMEM || 256 * 1024 * 1024);
const PUBLIC_REPORT_LIMIT_PER_HOUR = Number(process.env.PUBLIC_REPORT_LIMIT_PER_HOUR || 5);
const BOUNDARY_DIR = path.resolve(process.env.BOUNDARY_DIR || path.join(__dirname, "boundaries"));
const BOUNDARY_METADATA = JSON.parse(fs.readFileSync(path.join(BOUNDARY_DIR, "boundary-dataset.json"), "utf8"));
const BOUNDARY_FILE = path.join(BOUNDARY_DIR, BOUNDARY_METADATA.runtimeFile);

if (APP_ENV === "production") {
  if (SEED_DEMO_ACCOUNTS) throw new Error("SEED_DEMO_ACCOUNTS must be disabled in production");
  if (!PASSWORD_PEPPER || PASSWORD_PEPPER.length < 32) throw new Error("A production PASSWORD_PEPPER of at least 32 characters is required");
  if (!ATTACHMENT_SIGNING_SECRET || ATTACHMENT_SIGNING_SECRET.length < 32) throw new Error("A production ATTACHMENT_SIGNING_SECRET of at least 32 characters is required");
  if (PUBLIC_ORIGIN === "*") throw new Error("PUBLIC_ORIGIN must be restricted in production");
}

const boundaryFileHash = crypto.createHash("sha256").update(fs.readFileSync(BOUNDARY_FILE)).digest("hex").toUpperCase();
if (boundaryFileHash !== BOUNDARY_METADATA.runtimeFileSha256) {
  throw new Error("Boundary dataset hash does not match its recorded metadata");
}
const boundaryIndex = createBoundaryIndex(BOUNDARY_FILE, BOUNDARY_METADATA);

const rateBuckets = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
const ATTACHMENT_DIR = path.resolve(process.env.ATTACHMENT_DIR || path.join(DATA_DIR, "attachments"));
const ATTACHMENT_QUARANTINE_DIR = path.join(ATTACHMENT_DIR, "quarantine");
fs.mkdirSync(ATTACHMENT_QUARANTINE_DIR, { recursive: true });
const PUBLIC_IMAGE_DIR = path.join(ATTACHMENT_DIR, "public");
fs.mkdirSync(PUBLIC_IMAGE_DIR, { recursive: true });
const PUBLIC_IMAGES_PER_REPORT = 4;

const db = new DatabaseSync(DB_FILE);

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function canModerate(actor) {
  const role = normalizeRole(actor && actor.role);
  return role === "admin" || role === "moderator";
}

function isAdmin(actor) {
  return normalizeRole(actor && actor.role) === "admin";
}

function isResponder(actor) {
  return Boolean(actor && actor.id && actor.status === "active");
}

function sanitizeText(value, max = 300) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 48);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIntBool(value) {
  return value ? 1 : 0;
}

function cleanDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : "";
}

function slaDueAt(severity, start = nowIso()) {
  const hours = ({ critical: 4, high: 24, medium: 72, low: 120 })[String(severity || "").toLowerCase()] || 120;
  return new Date(new Date(start).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function validateEmergencyContactConfig(input) {
  const config = input && typeof input === "object" ? input : {};
  const expected = {
    "general-emergency": { primaryNumber: "112", alternatives: [] },
    police: { primaryNumber: "191", alternatives: ["112"] },
    fire: { primaryNumber: "192", alternatives: ["112"] },
    ambulance: { primaryNumber: "112", alternatives: ["193"] }
  };
  const contacts = Array.isArray(config.contacts) ? config.contacts : [];
  if (contacts.length !== Object.keys(expected).length) throw Object.assign(new Error("Emergency contact configuration is incomplete"), { statusCode: 400 });
  const normalized = contacts.map((contact) => {
    const serviceId = sanitizeText(contact.serviceId, 40);
    const rule = expected[serviceId];
    const primaryNumber = sanitizeText(contact.primaryNumber, 8);
    const alternatives = Array.isArray(contact.alternativeNumbers) ? contact.alternativeNumbers.map((number) => sanitizeText(number, 8)) : [];
    if (!rule || primaryNumber !== rule.primaryNumber || JSON.stringify(alternatives) !== JSON.stringify(rule.alternatives)) {
      throw Object.assign(new Error("Emergency numbers do not match the approved configuration"), { statusCode: 400 });
    }
    const sourceUrl = String(contact.officialSourceUrl || "").trim();
    if (!/^https:\/\//.test(sourceUrl) || !sanitizeText(contact.serviceName, 120) || !sanitizeText(contact.officialAuthority, 160) || !/^\d{4}-\d{2}-\d{2}$/.test(String(contact.lastVerifiedDate || ""))) {
      throw Object.assign(new Error("Emergency contact verification metadata is invalid"), { statusCode: 400 });
    }
    return {
      serviceId,
      serviceName: sanitizeText(contact.serviceName, 120),
      primaryNumber,
      alternativeNumbers: alternatives,
      officialSourceUrl: sourceUrl,
      officialAuthority: sanitizeText(contact.officialAuthority, 160),
      lastVerifiedDate: String(contact.lastVerifiedDate),
      verificationStatus: contact.verificationStatus === "verified" ? "verified" : "unverified",
      countryCoverage: sanitizeText(contact.countryCoverage, 120),
      active: contact.active === true,
      displayOrder: Number(contact.displayOrder) || 0
    };
  }).sort((left, right) => left.displayOrder - right.displayOrder);
  return { version: sanitizeText(config.version || emergencyContactFallback.version, 40), updatePolicy: "approved-administrator-only", contacts: normalized };
}

function getEmergencyContactConfig() {
  const row = db.prepare("SELECT config_json FROM emergency_contact_config WHERE id = 1").get();
  return validateEmergencyContactConfig(row ? safeJsonParse(row.config_json, emergencyContactFallback) : emergencyContactFallback);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    agency: row.agency || "",
    region: row.region || "",
    district: row.district || "",
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || ""
  };
}

function publicReport(row) {
  const payload = safeJsonParse(row.payload_json, {});
  return {
    ...payload,
    id: row.id,
    status: row.status || payload.status || "Open",
    severity: row.severity || payload.severity || "",
    type: row.type || payload.type || payload.problemType || "",
    region: row.region || payload.region || "",
    district: row.district || payload.district || "",
    community: row.community || payload.community || "",
    assignedTo: row.assigned_to || payload.assignedTo || "",
    flagged: Boolean(row.flagged),
    hidden: Boolean(row.hidden),
    publicVerified: Boolean(row.public_verified),
    verifiedAt: row.verified_at || "",
    responsibleInstitution: row.responsible_institution || "",
    source: row.source || payload.source || "field-app",
    createdAt: row.created_at || payload.createdAt || "",
    updatedAt: row.updated_at || payload.updatedAt || "",
    syncedAt: row.synced_at || payload.syncedAt || "",
    lastActor: row.last_actor || payload.lastActor || ""
  };
}

function publicTrackingReport(row) {
  const payload = safeJsonParse(row.payload_json, {});
  const location = publicLocationForReport(row.id);
  const attachmentCount = Number(db.prepare("SELECT COUNT(*) AS count FROM report_attachments WHERE report_id = ?")
    .get(row.id)?.count || 0);
  const latestReporterAction = db.prepare(`
    SELECT action, created_at FROM citizen_reporter_actions WHERE report_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(row.id);
  return {
    reference: row.id,
    status: row.status || "Open",
    severity: row.severity || "",
    type: row.type || "",
    region: row.region || "",
    district: row.district || "",
    community: redactPublicLocationText(row.community || ""),
    publicLocationLabel: location?.label || [row.community, row.district, row.region].filter(Boolean).join(", "),
    locationVerificationState: location?.verificationState || "legacy-unverified",
    locationQuality: location?.quality || "unknown",
    boundaryVersion: location?.boundaryVersion || "",
    attachmentCount,
    responsibleInstitution: row.responsible_institution || "",
    resolutionEvidence: null,
    resolutionEvidenceState: row.status === "Resolved" ? "not-publicly-provided" : "not-applicable",
    reporterResolution: latestReporterAction ? { action: latestReporterAction.action, createdAt: latestReporterAction.created_at } : null,
    contactDataState: payload.contact || payload.trustedContact ? "stored-private" : "none",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updates: db.prepare(`
      SELECT status, public_note, created_at
      FROM report_updates
      WHERE report_id = ?
      ORDER BY created_at ASC
    `).all(row.id).map((update) => ({
      status: update.status,
      note: update.public_note || "",
      createdAt: update.created_at
    })),
    summary: redactPublicLocationText(sanitizeText(payload.details || "", 280))
  };
}

function publicFeedReport(row) {
  const payload = safeJsonParse(row.payload_json, {});
  const location = publicLocationForReport(row.id);
  const representation = location?.representation || {};
  const latestUpdate = db.prepare(`
    SELECT status, public_note, created_at
    FROM report_updates
    WHERE report_id = ? AND public_note <> ''
    ORDER BY created_at DESC
    LIMIT 1
  `).get(row.id);
  const confirmationRows = db.prepare(`
    SELECT action, COUNT(*) AS count
    FROM public_report_signals
    WHERE report_id = ?
    GROUP BY action
  `).all(row.id);
  const confirmations = { confirmed: 0, worsening: 0, fixed: 0, incorrect: 0 };
  for (const signal of confirmationRows) if (Object.prototype.hasOwnProperty.call(confirmations, signal.action)) confirmations[signal.action] = Number(signal.count || 0);
  const safeImages = activePublicImages(row.id);
  const publicUpdates = db.prepare(`
    SELECT status, public_note, created_at
    FROM report_updates
    WHERE report_id = ? AND public_note <> ''
    ORDER BY created_at DESC
    LIMIT 5
  `).all(row.id).map((update) => ({
    status: update.status,
    note: redactPublicLocationText(update.public_note || ""),
    createdAt: update.created_at
  }));
  return {
    id: row.id,
    title: redactPublicLocationText(sanitizeText(payload.title || `${row.type || "Community problem"} report`, 120)),
    summary: redactPublicLocationText(sanitizeText(payload.details || "", 240)),
    category: row.type || "Other",
    categoryGlyph: categoryGlyph(row.type),
    severity: row.severity || "",
    status: row.status || "Open",
    region: row.region || "",
    district: row.district || "",
    publicLocationLabel: location?.label || [row.community, row.district, row.region].filter(Boolean).join(", "),
    publicLatitude: Number.isFinite(Number(representation.latitude)) ? Number(representation.latitude) : null,
    publicLongitude: Number.isFinite(Number(representation.longitude)) ? Number(representation.longitude) : null,
    locationPrecision: representation.precision || "label-only",
    locationVerificationState: location?.verificationState || "legacy-unverified",
    boundaryVersion: location?.boundaryVersion || "",
    verification: "moderator-verified",
    responsibleInstitution: row.responsible_institution || "",
    latestPublicUpdate: latestUpdate ? {
      status: latestUpdate.status,
      note: redactPublicLocationText(latestUpdate.public_note || ""),
      createdAt: latestUpdate.created_at
    } : null,
    publicUpdates,
    safeImage: safeImages[0] || null,
    safeImages,
    safeImageState: safeImages.length ? "moderator-approved-public-image" : "no-approved-public-image",
    resolutionEvidence: null,
    resolutionEvidenceState: row.status === "Resolved" ? "not-publicly-provided" : "not-applicable",
    confirmations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at || ""
  };
}

function categoryGlyph(type) {
  const value = String(type || "").toLowerCase();
  if (value.includes("flood") || value.includes("water")) return "W";
  if (value.includes("electric")) return "P";
  if (value.includes("road") || value.includes("bridge")) return "R";
  if (value.includes("waste") || value.includes("sanitation")) return "S";
  if (value.includes("fire")) return "F";
  if (value.includes("safety")) return "!";
  if (value.includes("clinic")) return "+";
  if (value.includes("school")) return "E";
  return "i";
}

function haversineKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function listPublicReports(query) {
  const limit = Math.max(1, Math.min(Number(query.get("limit") || 100), 200));
  const category = sanitizeText(query.get("category"), 100).toLowerCase();
  const status = sanitizeText(query.get("status"), 60).toLowerCase();
  const region = sanitizeText(query.get("region"), 80).toLowerCase();
  const district = sanitizeText(query.get("district"), 120).toLowerCase();
  const latitude = Number(query.get("latitude"));
  const longitude = Number(query.get("longitude"));
  const distanceKm = Math.max(0, Math.min(Number(query.get("distanceKm") || 0), 500));
  const feed = sanitizeText(query.get("feed") || "nearby", 30).toLowerCase();
  const allowedFeeds = new Set(["nearby", "recent", "most-confirmed", "worsening", "recently-resolved"]);
  if (!allowedFeeds.has(feed)) throw Object.assign(new Error("Unsupported public feed view"), { statusCode: 400 });
  const hasDistance = Number.isFinite(latitude) && Number.isFinite(longitude) && distanceKm > 0;
  const rows = db.prepare(`
    SELECT * FROM reports
    WHERE public_verified = 1 AND hidden = 0 AND flagged = 0
      AND lower(COALESCE(source, '')) NOT LIKE '%demo%'
    ORDER BY updated_at DESC
    LIMIT 500
  `).all();
  let reports = rows.map(publicFeedReport).filter((report) => {
    if (category && report.category.toLowerCase() !== category) return false;
    if (status && report.status.toLowerCase() !== status) return false;
    if (region && report.region.toLowerCase() !== region) return false;
    if (district && canonicalScopeLabel(report.district) !== canonicalScopeLabel(district)) return false;
    if (hasDistance) {
      if (report.publicLatitude === null || report.publicLongitude === null) return false;
      if (haversineKm(latitude, longitude, report.publicLatitude, report.publicLongitude) > distanceKm) return false;
    }
    return true;
  });
  if (feed === "recent") reports.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  if (feed === "most-confirmed") reports.sort((left, right) => Number(right.confirmations.confirmed || 0) - Number(left.confirmations.confirmed || 0) || new Date(right.updatedAt) - new Date(left.updatedAt));
  if (feed === "worsening") reports = reports.filter((report) => Number(report.confirmations.worsening || 0) > 0)
    .sort((left, right) => Number(right.confirmations.worsening || 0) - Number(left.confirmations.worsening || 0) || new Date(right.updatedAt) - new Date(left.updatedAt));
  if (feed === "recently-resolved") reports = reports.filter((report) => report.status === "Resolved")
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  return reports.slice(0, limit);
}

function textSimilarity(left, right) {
  const tokens = (value) => new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let common = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) common += 1;
  return common / new Set([...leftTokens, ...rightTokens]).size;
}

function findPublicDuplicateSuggestions(input) {
  const report = input && typeof input === "object" ? input : {};
  const type = sanitizeText(report.type || report.category, 100);
  const community = sanitizeText(report.community, 160);
  const details = sanitizeText(report.details || report.description, 2000);
  if (!type || !community || !details) throw Object.assign(new Error("Category, community, and description are required for duplicate checking"), { statusCode: 400 });
  const location = parseReportLocation(report, community, nowIso());
  const candidates = listPublicReports(new URLSearchParams([["limit", "200"]]));
  return candidates.map((candidate) => {
    const sameCategory = candidate.category.toLowerCase() === type.toLowerCase();
    const sameDistrict = canonicalScopeLabel(candidate.district) === canonicalScopeLabel(location.district);
    const communityScore = textSimilarity(community, candidate.publicLocationLabel);
    const descriptionScore = textSimilarity(details, `${candidate.title} ${candidate.summary}`);
    const ageDays = Math.max(0, (Date.now() - new Date(candidate.createdAt).getTime()) / 86400000);
    const timeScore = ageDays <= 7 ? 1 : ageDays <= 30 ? 0.7 : ageDays <= 90 ? 0.35 : 0;
    const score = (sameCategory ? 0.3 : 0) + (sameDistrict ? 0.3 : 0) + communityScore * 0.15 + descriptionScore * 0.15 + timeScore * 0.1;
    const reasons = [];
    if (sameCategory) reasons.push("same category");
    if (sameDistrict) reasons.push("same MMDA");
    if (communityScore >= 0.2) reasons.push("similar locality");
    if (descriptionScore >= 0.2) reasons.push("similar description");
    if (timeScore >= 0.7) reasons.push("recent report");
    return { score: Number(score.toFixed(3)), reasons, report: candidate };
  }).filter((candidate) => candidate.score >= 0.55)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function recordPublicReportSignal(reportId, input, req) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!report || !Number(report.public_verified) || Number(report.hidden) || Number(report.flagged)) {
    throw Object.assign(new Error("Verified public report not found"), { statusCode: 404 });
  }
  const action = sanitizeText(input.action, 30).toLowerCase();
  if (!new Set(["confirmed", "worsening", "fixed", "incorrect"]).has(action)) {
    throw Object.assign(new Error("Unsupported structured report signal"), { statusCode: 400 });
  }
  const deviceKey = String(input.deviceKey || "");
  if (!/^[a-f0-9-]{36}$/i.test(deviceKey)) throw Object.assign(new Error("A valid private device key is required"), { statusCode: 400 });
  const actorHash = sha256(`${deviceKey}\n${PASSWORD_PEPPER}\npublic-signal`);
  const stamp = nowIso();
  db.prepare(`
    INSERT INTO public_report_signals (id, report_id, actor_hash, action, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id, actor_hash) DO UPDATE SET action = excluded.action, updated_at = excluded.updated_at
  `).run(crypto.randomUUID(), reportId, actorHash, action, stamp, stamp);
  logAudit(null, "public_report_signal", "report", reportId, { action }, req);
  return publicFeedReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId)).confirmations;
}

function redactPublicLocationText(value) {
  return String(value || "")
    .replace(/\b-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\b/g, "[exact coordinates protected]")
    .replace(/\b[A-Z]{2,3}-\d{3,4}-\d{3,4}\b/gi, "[digital address protected]")
    .trim();
}

function responderHistory(reportId) {
  return db.prepare(`
    SELECT id, from_status, to_status, public_update, private_note, actor_user_id, created_at
    FROM report_history
    WHERE report_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(reportId).map((entry) => ({
    id: entry.id,
    fromStatus: entry.from_status || "",
    toStatus: entry.to_status || "",
    publicUpdate: entry.public_update || "",
    privateNote: entry.private_note || "",
    actorUserId: entry.actor_user_id || null,
    createdAt: entry.created_at
  }));
}

function responderOperationalState(row) {
  const assignee = row.assignment_user_id
    ? db.prepare("SELECT id, username, name, role, agency FROM users WHERE id = ?").get(row.assignment_user_id)
    : null;
  const responderEvidence = db.prepare(`
    SELECT id, original_name, detected_mime, byte_size, quarantine_state, scan_result, created_at
    FROM responder_evidence WHERE report_id = ? ORDER BY created_at ASC
  `).all(row.id).map((item) => ({
    id: item.id,
    fileName: item.original_name,
    mimeType: item.detected_mime,
    bytes: Number(item.byte_size || 0),
    state: item.quarantine_state,
    scanResult: item.scan_result || "",
    createdAt: item.created_at,
    kind: "responder"
  }));
  const citizenEvidence = db.prepare(`
    SELECT report_attachments.id, report_attachments.original_name, report_attachments.detected_mime, report_attachments.byte_size,
      report_attachments.quarantine_state, report_attachments.scan_result, report_attachments.created_at, public_report_images.id AS public_image_id
    FROM report_attachments
    LEFT JOIN public_report_images ON public_report_images.attachment_id = report_attachments.id AND public_report_images.withdrawn_at IS NULL
    WHERE report_attachments.report_id = ? ORDER BY report_attachments.created_at ASC
  `).all(row.id).map((item) => ({
    id: item.id,
    fileName: item.original_name,
    mimeType: item.detected_mime,
    bytes: Number(item.byte_size || 0),
    state: item.quarantine_state,
    scanResult: item.scan_result || "",
    createdAt: item.created_at,
    publicImageId: item.public_image_id || "",
    kind: "citizen"
  }));
  const evidence = [...citizenEvidence, ...responderEvidence].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const assignmentHistory = db.prepare(`
    SELECT action, from_user_id, to_user_id, actor_user_id, note, created_at
    FROM report_assignments WHERE report_id = ? ORDER BY created_at ASC
  `).all(row.id).map((entry) => ({
    action: entry.action,
    fromUserId: entry.from_user_id || null,
    toUserId: entry.to_user_id || null,
    actorUserId: entry.actor_user_id,
    note: entry.note || "",
    createdAt: entry.created_at
  }));
  const escalations = db.prepare(`
    SELECT reason, target, actor_user_id, created_at FROM report_escalations
    WHERE report_id = ? ORDER BY created_at ASC
  `).all(row.id).map((entry) => ({
    reason: entry.reason,
    target: entry.target || "",
    actorUserId: entry.actor_user_id,
    createdAt: entry.created_at
  }));
  const overdue = Boolean(row.sla_due_at && row.sla_due_at < nowIso() && !["Resolved", "Rejected"].includes(row.status));
  return {
    assignment: {
      state: row.assignment_state || "unassigned",
      assignee: assignee ? { id: assignee.id, username: assignee.username, name: assignee.name, role: assignee.role, institution: assignee.agency || "" } : null,
      acceptedAt: row.accepted_at || "",
      acceptedBy: row.accepted_by || null
    },
    assignmentHistory,
    escalations,
    slaDueAt: row.sla_due_at || "",
    overdue,
    evidence,
    resolutionEvidenceId: row.resolution_evidence_id || "",
    resolutionEvidenceState: row.resolution_evidence_id
      ? (evidence.find((item) => item.id === row.resolution_evidence_id)?.state || "unavailable")
      : (row.resolution_exception ? "documented-exception" : "not-provided"),
    resolutionException: row.resolution_exception || ""
  };
}

function responderReport(row) {
  const location = responderLocationForReport(row.id);
  return {
    ...publicReport(row),
    ...(location && location.exactLatitude !== null ? { coordinates: `${location.exactLatitude}, ${location.exactLongitude}` } : {}),
    location,
    history: responderHistory(row.id),
    operations: responderOperationalState(row)
  };
}

function isDemoPayload(report) {
  const source = sanitizeText(report.source || "", 80).toLowerCase();
  const id = sanitizeText(report.id || "", 120).toLowerCase();
  return source.includes("demo") || id.startsWith("demo-") || id.startsWith("fn-test-");
}

function createTrackingReference() {
  return `FN-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
}

function verifyTrackingSecret(secret, storedHash) {
  if (String(storedHash || "").startsWith("scrypt$")) return verifyPassword(secret, storedHash);
  const expected = Buffer.from(String(storedHash || ""));
  const actual = Buffer.from(sha256(secret));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function canonicalScopeLabel(value) {
  return sanitizeText(value, 160)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\barea\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function locationRowForReport(reportId) {
  return db.prepare("SELECT * FROM report_locations WHERE report_id = ?").get(reportId) || null;
}

function publicLocationForReport(reportId) {
  const row = locationRowForReport(reportId);
  if (!row) return null;
  return {
    label: row.public_location_label || "",
    representation: safeJsonParse(row.public_location_json, {}),
    source: row.location_source || "manual",
    regionId: row.region_id || "",
    mmdaId: row.mmda_id || "",
    verificationState: row.verification_state || "unverified",
    quality: row.location_quality || "unknown",
    confidence: Number(row.location_confidence || 0),
    boundaryVersion: row.boundary_version || ""
  };
}

function responderLocationForReport(reportId) {
  const row = locationRowForReport(reportId);
  if (!row) return null;
  return {
    ...publicLocationForReport(reportId),
    exactLatitude: row.exact_latitude == null ? null : Number(row.exact_latitude),
    exactLongitude: row.exact_longitude == null ? null : Number(row.exact_longitude),
    googlePlaceId: row.google_place_id || "",
    accuracyMetres: row.accuracy_metres == null ? null : Number(row.accuracy_metres),
    exactLocationConsent: Boolean(row.exact_location_consent),
    exactLocationConsentAt: row.exact_location_consent_at || "",
    private: safeJsonParse(row.private_location_json, {})
  };
}

function parseReportLocation(report, community, stamp) {
  const exactLatitudeRaw = report.exactLatitude ?? report.exact_latitude;
  const exactLongitudeRaw = report.exactLongitude ?? report.exact_longitude;
  const coordinateText = sanitizeText(report.coordinates, 100);
  let exactLatitude = exactLatitudeRaw === undefined || exactLatitudeRaw === null || exactLatitudeRaw === "" ? null : Number(exactLatitudeRaw);
  let exactLongitude = exactLongitudeRaw === undefined || exactLongitudeRaw === null || exactLongitudeRaw === "" ? null : Number(exactLongitudeRaw);
  if (exactLatitude === null && exactLongitude === null && coordinateText) {
    const match = coordinateText.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) throw Object.assign(new Error("Coordinates must be latitude, longitude"), { statusCode: 400 });
    exactLatitude = Number(match[1]);
    exactLongitude = Number(match[2]);
  }
  if ((exactLatitude === null) !== (exactLongitude === null) ||
      (exactLatitude !== null && (!Number.isFinite(exactLatitude) || !Number.isFinite(exactLongitude) || exactLatitude < -90 || exactLatitude > 90 || exactLongitude < -180 || exactLongitude > 180))) {
    throw Object.assign(new Error("Valid latitude and longitude are required together"), { statusCode: 400 });
  }

  const allowedSources = new Set(["gps", "search", "dropped-pin", "ghanapostgps", "manual"]);
  const locationSource = sanitizeText(report.locationSource || (exactLatitude === null ? "manual" : "gps"), 40).toLowerCase();
  if (!allowedSources.has(locationSource)) throw Object.assign(new Error("Unsupported location source"), { statusCode: 400 });
  const accuracyValue = report.accuracyMetres ?? report.accuracy_metres;
  const accuracyMetres = accuracyValue === undefined || accuracyValue === null || accuracyValue === "" ? null : Number(accuracyValue);
  if (accuracyMetres !== null && (!Number.isFinite(accuracyMetres) || accuracyMetres < 0 || accuracyMetres > 100000)) {
    throw Object.assign(new Error("Location accuracy must be between 0 and 100000 metres"), { statusCode: 400 });
  }

  const digitalAddress = sanitizeText(report.digitalAddress, 120);
  const hasPrivatePreciseLocation = exactLatitude !== null || Boolean(digitalAddress);
  if (hasPrivatePreciseLocation && report.exactLocationConsent !== true) {
    throw Object.assign(new Error("Explicit exact-location consent is required"), { statusCode: 400 });
  }

  let derived = null;
  if (exactLatitude !== null) {
    derived = boundaryIndex.find(exactLatitude, exactLongitude);
    if (!derived) throw Object.assign(new Error("The exact location must be inside an official Ghana MMDA boundary"), { statusCode: 400 });
  }
  const declaredBoundary = derived || boundaryIndex.findByLabels(sanitizeText(report.region, 80), sanitizeText(report.district, 120));
  const region = declaredBoundary?.region || sanitizeText(report.region, 80);
  const district = declaredBoundary?.district || sanitizeText(report.district, 120);
  const verificationState = derived ? "boundary-verified" : (declaredBoundary ? "declared-mmda-matched" : "declared-unverified");
  const locationQuality = derived
    ? (accuracyMetres !== null && accuracyMetres <= 20 ? "high" : accuracyMetres !== null && accuracyMetres <= 100 ? "medium" : "boundary-only")
    : (declaredBoundary ? "mmda-only" : "manual");
  const locationConfidence = derived ? (locationQuality === "high" ? 1 : locationQuality === "medium" ? 0.85 : 0.7) : (declaredBoundary ? 0.5 : 0.25);
  const publicCommunity = redactPublicLocationText(community) || "Approximate location protected";
  const publicLocationLabel = [publicCommunity, district, region].filter(Boolean).join(", ");
  return {
    exactLatitude,
    exactLongitude,
    region,
    district,
    publicLocationLabel,
    publicLocation: {
      community: publicCommunity,
      district,
      region,
      precision: declaredBoundary ? "mmda-representative-point" : "community-label-only",
      ...(declaredBoundary ? { latitude: declaredBoundary.publicLatitude, longitude: declaredBoundary.publicLongitude } : {})
    },
    privateLocation: { digitalAddress },
    googlePlaceId: sanitizeText(report.googlePlaceId, 240),
    locationSource,
    accuracyMetres,
    regionId: declaredBoundary?.regionId || "",
    mmdaId: declaredBoundary?.mmdaId || "",
    exactLocationConsent: hasPrivatePreciseLocation,
    exactLocationConsentAt: hasPrivatePreciseLocation ? (cleanDate(report.exactLocationConsentAt) || stamp) : "",
    verificationState,
    locationQuality,
    locationConfidence,
    boundaryVersion: declaredBoundary?.boundaryVersion || boundaryIndex.metadata.version
  };
}

function storeReportLocation(reportId, location, stamp) {
  db.prepare(`
    INSERT INTO report_locations (
      report_id, exact_latitude, exact_longitude, private_location_json, public_location_json,
      public_location_label, google_place_id, location_source, accuracy_metres, region_id, mmda_id,
      exact_location_consent, exact_location_consent_at, verification_state, location_quality,
      location_confidence, boundary_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET
      exact_latitude = excluded.exact_latitude, exact_longitude = excluded.exact_longitude,
      private_location_json = excluded.private_location_json, public_location_json = excluded.public_location_json,
      public_location_label = excluded.public_location_label, google_place_id = excluded.google_place_id,
      location_source = excluded.location_source, accuracy_metres = excluded.accuracy_metres,
      region_id = excluded.region_id, mmda_id = excluded.mmda_id,
      exact_location_consent = excluded.exact_location_consent,
      exact_location_consent_at = excluded.exact_location_consent_at,
      verification_state = excluded.verification_state, location_quality = excluded.location_quality,
      location_confidence = excluded.location_confidence, boundary_version = excluded.boundary_version,
      updated_at = excluded.updated_at
  `).run(
    reportId, location.exactLatitude, location.exactLongitude, JSON.stringify(location.privateLocation),
    JSON.stringify(location.publicLocation), location.publicLocationLabel, location.googlePlaceId,
    location.locationSource, location.accuracyMetres, location.regionId, location.mmdaId,
    toIntBool(location.exactLocationConsent), location.exactLocationConsentAt, location.verificationState,
    location.locationQuality, location.locationConfidence, location.boundaryVersion, stamp, stamp
  );
}

function reportInActorScope(actor, row) {
  if (canModerate(actor)) return true;
  const actorRegion = sanitizeText(actor.region, 80).toLowerCase();
  const actorDistrict = sanitizeText(actor.district, 120).toLowerCase();
  return Boolean(actorRegion && actorDistrict &&
    canonicalScopeLabel(actorRegion) === canonicalScopeLabel(row.region) &&
    canonicalScopeLabel(actorDistrict) === canonicalScopeLabel(row.district));
}

// Which office a report has been routed to: the latest routing recommendation, or a human override of it.
function routedOfficeName(reportId) {
  const recommendation = db.prepare("SELECT agency_id, override_agency_id FROM routing_recommendations WHERE report_id = ? ORDER BY created_at DESC LIMIT 1").get(reportId);
  if (!recommendation) return "";
  const office = db.prepare("SELECT name FROM admin_directory_items WHERE id = ?").get(recommendation.override_agency_id || recommendation.agency_id);
  return office ? office.name : "";
}

// Moderators and admins see every report. A responder sees a report only inside their own area, and only when it is
// assigned to them, or it has been routed to their own office (routing happens when a moderator verifies or escalates).
// Reports waiting for review, hidden or rejected stay with moderators.
function reportVisibleToActor(actor, row) {
  if (canModerate(actor)) return true;
  if (!reportInActorScope(actor, row) || Number(row.hidden) || row.status === "Rejected") return false;
  if (Number(row.assignment_user_id || 0) === Number(actor.id)) return true;
  const office = routedOfficeName(row.id);
  return Boolean(office && actor.agency && canonicalScopeLabel(office) === canonicalScopeLabel(actor.agency));
}

function canAssignCases(actor) {
  if (canModerate(actor)) return true;
  return /lead|coordinator|supervisor|manager/i.test(String(actor?.role || ""));
}

function canActOnAssignedReport(actor, row) {
  return canModerate(actor) || Number(row.assignment_user_id || 0) === Number(actor.id);
}

function attachmentSecretHash(value) {
  return sha256(`${String(value || "")}\n${PASSWORD_PEPPER}`);
}

function detectImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", extension: "png" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

function createQuarantinedAttachment(input, req) {
  const body = input && typeof input === "object" ? input : {};
  const uploadSessionKey = sanitizeText(body.uploadSessionKey, 80).toLowerCase();
  const clientAttachmentId = sanitizeText(body.clientAttachmentId, 80).toLowerCase();
  const uploadSecret = String(body.uploadSecret || "");
  const originalName = sanitizeText(body.fileName || "evidence", 160);
  const claimedMime = sanitizeText(body.mimeType, 80).toLowerCase();
  const encoded = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  if (!uuidPattern.test(uploadSessionKey) || !uuidPattern.test(clientAttachmentId)) {
    throw Object.assign(new Error("Valid upload session and attachment IDs are required"), { statusCode: 400 });
  }
  if (uploadSecret.length < 43) throw Object.assign(new Error("A valid private upload secret is required"), { statusCode: 400 });
  if (!encoded || encoded.length > 1_100_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw Object.assign(new Error("Attachment data is invalid or too large"), { statusCode: 400 });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > 750_000) throw Object.assign(new Error("Each compressed image must be 750 KB or smaller"), { statusCode: 400 });
  const detected = detectImageType(bytes);
  if (!detected || (claimedMime && claimedMime !== detected.mime)) {
    throw Object.assign(new Error("Attachment content must be a valid JPEG, PNG, or WebP image"), { statusCode: 400 });
  }
  const payloadHash = sha256(bytes);
  const secretHash = attachmentSecretHash(uploadSecret);
  const existing = db.prepare("SELECT * FROM report_attachments WHERE upload_session_key = ? AND client_attachment_id = ?")
    .get(uploadSessionKey, clientAttachmentId);
  if (existing) {
    if (existing.payload_hash !== payloadHash || existing.upload_secret_hash !== secretHash) {
      throw Object.assign(new Error("Attachment ID has already been used with different data"), { statusCode: 409 });
    }
    return { attachmentId: existing.id, alreadyUploaded: true, state: existing.quarantine_state, bytes: existing.byte_size };
  }
  const id = crypto.randomUUID();
  const storageName = `${crypto.randomUUID().replaceAll("-", "")}.${detected.extension}`;
  const storagePath = path.join(ATTACHMENT_QUARANTINE_DIR, storageName);
  fs.writeFileSync(storagePath, bytes, { flag: "wx", mode: 0o600 });
  try {
    db.prepare(`
      INSERT INTO report_attachments (
        id, report_id, upload_session_key, client_attachment_id, upload_secret_hash,
        storage_name, original_name, detected_mime, byte_size, payload_hash,
        quarantine_state, scan_result, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)
    `).run(id, uploadSessionKey, clientAttachmentId, secretHash, storageName, originalName,
      detected.mime, bytes.length, payloadHash, nowIso(), nowIso());
  } catch (error) {
    try { fs.unlinkSync(storagePath); } catch {}
    throw error;
  }
  logAudit(null, "attachment_quarantined", "attachment", id, { detectedMime: detected.mime, byteSize: bytes.length }, req);
  return { attachmentId: id, alreadyUploaded: false, state: "pending", bytes: bytes.length };
}

function claimReportAttachments(reportId, attachmentIds, uploadSessionKey, uploadSecret) {
  const ids = [...new Set((Array.isArray(attachmentIds) ? attachmentIds : []).map((value) => sanitizeText(value, 80)).filter(Boolean))];
  if (ids.length > 5) throw Object.assign(new Error("A report can include at most five images"), { statusCode: 400 });
  const secretHash = attachmentSecretHash(uploadSecret);
  for (const id of ids) {
    const attachment = db.prepare("SELECT * FROM report_attachments WHERE id = ?").get(id);
    if (!attachment || attachment.upload_session_key !== uploadSessionKey || attachment.upload_secret_hash !== secretHash || attachment.report_id) {
      throw Object.assign(new Error("An attachment is missing, unauthorised, or already linked"), { statusCode: 400 });
    }
  }
  for (const id of ids) db.prepare("UPDATE report_attachments SET report_id = ?, updated_at = ? WHERE id = ?").run(reportId, nowIso(), id);
  return ids.length;
}

// The problem types a new report may use. Must match <select id="type"> in the app; test-api.js checks this.
// Only new reports are checked, so reports already saved with an older label keep working.
const REPORT_TYPES = Object.freeze([
  "Flooding or drainage",
  "Waste or sanitation",
  "Water supply",
  "Electricity",
  "Road or bridge",
  "Fire risk",
  "Clinic access",
  "Public safety",
  "Food or market price",
  "School facility",
  "Other"
]);
// Every status a report can have (the keys of validateResponderTransition). The web app's filters use the same list.
const REPORT_STATUSES = Object.freeze(["Open", "Acknowledged", "Dispatched", "In Progress", "Blocked", "Escalated", "Resolved", "Reopened"]);
const UNLISTED_REPORT_TYPE_MESSAGE = "Choose one of the listed problem types";

function createPublicReport(input, req, citizen = null) {
  const report = input && typeof input === "object" ? input : {};
  if (isDemoPayload(report)) {
    const error = new Error("Demo reports cannot be submitted");
    error.statusCode = 400;
    throw error;
  }
  if (report.consentConfirmed !== true) {
    const error = new Error("Privacy and reporting consent is required");
    error.statusCode = 400;
    throw error;
  }

  const type = sanitizeText(report.type || report.problemType || report.category, 100);
  const severity = sanitizeText(report.severity, 60);
  const declaredCommunity = sanitizeText(report.community, 160);
  const details = sanitizeText(report.details || report.description, 2000);
  const title = sanitizeText(report.title, 120);
  const contact = sanitizeText(report.contact, 160);
  const trustedContact = sanitizeText(report.trustedContact, 160);
  const submissionKey = sanitizeText(report.submissionKey, 80).toLowerCase();
  const trackingSecret = String(report.trackingSecret || "");
  const attachmentIds = Array.isArray(report.attachmentIds) ? report.attachmentIds.slice(0, 6) : [];
  if (!type || !severity || !declaredCommunity || !details) {
    const error = new Error("Type, severity, community, and details are required");
    error.statusCode = 400;
    throw error;
  }
  if (!REPORT_TYPES.includes(type)) {
    const error = new Error(UNLISTED_REPORT_TYPE_MESSAGE);
    error.statusCode = 400;
    throw error;
  }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(submissionKey)) {
    const error = new Error("A valid submission key is required");
    error.statusCode = 400;
    throw error;
  }
  if (trackingSecret.length < 43) {
    const error = new Error("A valid tracking secret is required");
    error.statusCode = 400;
    throw error;
  }
  if ((contact || trustedContact) && report.contactConsent !== true) {
    throw Object.assign(new Error("Explicit contact-use consent is required when contact details are provided"), { statusCode: 400 });
  }

  const stamp = nowIso();
  const location = parseReportLocation(report, declaredCommunity, stamp);
  const region = location.region;
  const district = location.district;
  const community = location.publicLocation.community;
  if (!region || !district) throw Object.assign(new Error("A declared location or verified exact location is required"), { statusCode: 400 });
  const payload = {
    type,
    title,
    subcategory: sanitizeText(report.subcategory, 100),
    severity,
    region,
    district,
    community,
    details,
    affected: Math.max(0, Math.min(Number(report.affected) || 0, 1_000_000)),
    accessBlocked: Boolean(report.accessBlocked),
    worsening: Boolean(report.worsening),
    immediateDanger: Boolean(report.immediateDanger),
    problemStarted: cleanDate(report.problemStarted),
    problemDuration: ["today", "days", "weeks", "months"].includes(report.problemDuration) ? report.problemDuration : "",
    publicLocationLabel: location.publicLocationLabel,
    locationSource: location.locationSource,
    locationVerificationState: location.verificationState,
    boundaryVersion: location.boundaryVersion,
    protectLocation: report.protectLocation !== false,
    reportMode: sanitizeText(report.reportMode || "Anonymous public case", 60),
    reporterRole: sanitizeText(report.role || "Resident", 60),
    contact,
    trustedContact,
    contactConsent: Boolean(contact || trustedContact),
    vulnerabilities: Array.isArray(report.vulnerabilities)
      ? report.vulnerabilities.slice(0, 20).map((value) => sanitizeText(value, 80)).filter(Boolean)
      : [],
    attachmentCount: attachmentIds.length,
    source: "public-web",
    consentConfirmed: true,
    createdAt: stamp,
    updatedAt: stamp
  };
  const { createdAt: ignoredCreatedAt, updatedAt: ignoredUpdatedAt, ...idempotencyPayload } = payload;
  const payloadHash = sha256(JSON.stringify({
    payload: idempotencyPayload,
    privateLocation: location.privateLocation,
    exactLatitude: location.exactLatitude,
    exactLongitude: location.exactLongitude,
    exactLocationConsent: location.exactLocationConsent,
    accuracyMetres: location.accuracyMetres,
    googlePlaceId: location.googlePlaceId,
    attachmentIds
  }));
  const secretHash = createPasswordHash(trackingSecret);

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT * FROM public_submission_keys WHERE submission_key = ?").get(submissionKey);
    if (existing) {
      if (existing.payload_hash !== payloadHash || !verifyTrackingSecret(trackingSecret, existing.secret_hash)) {
        const error = new Error("Submission key has already been used with different data");
        error.statusCode = 409;
        throw error;
      }
      const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(existing.report_id);
      if (citizen) db.prepare(`
        INSERT INTO citizen_report_links (citizen_id, report_id, link_source, linked_at)
        VALUES (?, ?, 'authenticated-submission', ?) ON CONFLICT(citizen_id, report_id) DO NOTHING
      `).run(citizen.id, row.id, nowIso());
      db.exec("COMMIT");
      return { reference: row.id, trackingSecret, alreadySubmitted: true, report: publicTrackingReport(row) };
    }

    const id = createTrackingReference();
    payload.id = id;

    db.prepare(`
    INSERT INTO reports (
      id, payload_json, status, severity, type, region, district, community, assigned_to,
      flagged, hidden, source, created_at, updated_at, synced_at, last_actor, sla_due_at
    ) VALUES (?, ?, 'Open', ?, ?, ?, ?, ?, '', 0, 0, 'public-web', ?, ?, ?, 'citizen', ?)
    `).run(id, JSON.stringify(payload), severity, type, region, district, community, stamp, stamp, stamp, slaDueAt(severity, stamp));
    storeReportLocation(id, location, stamp);
    claimReportAttachments(id, attachmentIds, submissionKey, trackingSecret);
    db.prepare("INSERT INTO report_tracking (report_id, tracking_reference, secret_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(id, id, secretHash, stamp);
    db.prepare("INSERT INTO public_submission_keys (submission_key, payload_hash, secret_hash, report_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(submissionKey, payloadHash, secretHash, id, stamp);
    if (citizen) db.prepare(`
      INSERT INTO citizen_report_links (citizen_id, report_id, link_source, linked_at)
      VALUES (?, ?, 'authenticated-submission', ?)
    `).run(citizen.id, id, stamp);
    db.prepare("INSERT INTO report_updates (id, report_id, status, public_note, actor_user_id, created_at) VALUES (?, ?, 'Open', ?, NULL, ?)")
      .run(crypto.randomUUID(), id, "Report received", stamp);
    db.prepare(`
      INSERT INTO report_history (id, report_id, from_status, to_status, public_update, private_note, actor_user_id, created_at)
      VALUES (?, ?, '', 'Open', ?, '', NULL, ?)
    `).run(crypto.randomUUID(), id, "Report received", stamp);
    logAudit(null, "public_report_created", "report", id, { source: "public-web" }, req);
    const created = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
    db.exec("COMMIT");
    return { reference: id, trackingSecret, alreadySubmitted: false, report: publicTrackingReport(created) };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function trackPublicReport(reference, secret) {
  const tracking = db.prepare("SELECT * FROM report_tracking WHERE tracking_reference = ?").get(sanitizeText(reference, 120));
  if (!tracking || !secret || !verifyTrackingSecret(secret, tracking.secret_hash)) {
    const error = new Error("Tracking reference or secret is invalid");
    error.statusCode = 404;
    throw error;
  }
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(tracking.report_id);
  if (!report) {
    const error = new Error("Tracking reference or secret is invalid");
    error.statusCode = 404;
    throw error;
  }
  return publicTrackingReport(report);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password) + PASSWORD_PEPPER, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, , nRaw, rRaw, pRaw, saltRaw, hashRaw] = ["", ...parts];
  const salt = Buffer.from(saltRaw, "base64url");
  const expected = Buffer.from(hashRaw, "base64url");
  const actual = crypto.scryptSync(String(password) + PASSWORD_PEPPER, salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: SCRYPT_MAXMEM
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function normalizeGhanaPhone(value) {
  const raw = String(value || "").trim().replace(/[\s().-]/g, "");
  const normalized = raw.startsWith("0") ? `+233${raw.slice(1)}` : raw.startsWith("233") ? `+${raw}` : raw;
  if (!/^\+233[2-5]\d{8}$/.test(normalized)) {
    throw Object.assign(new Error("Enter a valid Ghana phone number in +233 format"), { statusCode: 400 });
  }
  return normalized;
}

function citizenPhoneHash(phone) {
  return sha256(`citizen-phone\n${phone}\n${OTP_RUNTIME_SECRET}`);
}

function privateActorHash(kind, value) {
  return sha256(`${kind}\n${String(value || "unknown")}\n${OTP_RUNTIME_SECRET}`);
}

function citizenOtpHash(challengeId, code) {
  return crypto.createHmac("sha256", OTP_RUNTIME_SECRET).update(`${challengeId}\n${String(code || "")}`).digest("hex");
}

function publicCitizen(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: `+233 *** *** ${row.phone_last4}`,
    displayName: row.display_name || "",
    avatarUrl: row.avatar_url || "",
    hasPassword: Boolean(row.password_hash),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || ""
  };
}

function citizenAudit(citizen, action, entityType, entityId = "", details = {}) {
  db.prepare(`
    INSERT INTO citizen_audit_log (id, citizen_id, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(), citizen?.id || null, sanitizeText(action, 80), sanitizeText(entityType, 80),
    sanitizeText(entityId, 120), JSON.stringify(details), nowIso()
  );
}

function createCitizenSession(citizen, req, deviceKey, deviceLabel) {
  const token = crypto.randomBytes(32).toString("base64url");
  const sessionId = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + CITIZEN_SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM citizen_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").run(createdAt);
  db.prepare(`
    INSERT INTO citizen_sessions (id, token_hash, citizen_id, device_hash, device_label, ip_hash, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId, sha256(token), citizen.id, privateActorHash("device", deviceKey),
    sanitizeText(deviceLabel || "FixNow device", 80), privateActorHash("ip", getClientIp(req)),
    createdAt, createdAt, expiresAt
  );
  db.prepare("UPDATE citizen_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?").run(createdAt, createdAt, citizen.id);
  citizenAudit(citizen, "session_created", "citizen_session", sessionId, { deviceLabel: sanitizeText(deviceLabel || "FixNow device", 80) });
  return { token, sessionId, expiresAt };
}

function authenticateCitizen(req) {
  const token = readBearerToken(req);
  if (!token) return null;
  const stamp = nowIso();
  const row = db.prepare(`
    SELECT citizen_accounts.*, citizen_sessions.id AS citizen_session_id,
           citizen_sessions.expires_at AS citizen_session_expires_at
    FROM citizen_sessions
    JOIN citizen_accounts ON citizen_accounts.id = citizen_sessions.citizen_id
    WHERE citizen_sessions.token_hash = ? AND citizen_sessions.revoked_at IS NULL
  `).get(sha256(token));
  if (!row) return null;
  if (row.status !== "active" || row.citizen_session_expires_at <= stamp) {
    db.prepare("UPDATE citizen_sessions SET revoked_at = ? WHERE id = ?").run(stamp, row.citizen_session_id);
    return null;
  }
  db.prepare("UPDATE citizen_sessions SET last_seen_at = ? WHERE id = ?").run(stamp, row.citizen_session_id);
  return row;
}

function consumeSecurityRateLimit(key, limit, windowMs, message) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) throw Object.assign(new Error(message || "Too many attempts. Try again later."), { statusCode: 429 });
}

function validateOtpProviderUrl() {
  if (!OTP_PROVIDER_WEBHOOK_URL) {
    throw Object.assign(new Error("Phone OTP is unavailable until the owner configures a genuine delivery provider"), { statusCode: 503 });
  }
  let providerUrl;
  try { providerUrl = new URL(OTP_PROVIDER_WEBHOOK_URL); } catch {
    throw Object.assign(new Error("The configured OTP provider URL is invalid"), { statusCode: 503 });
  }
  const localProvider = ["localhost", "127.0.0.1", "::1"].includes(providerUrl.hostname);
  if (providerUrl.protocol !== "https:" && !localProvider) {
    throw Object.assign(new Error("The OTP provider must use HTTPS"), { statusCode: 503 });
  }
  return providerUrl;
}

async function deliverCitizenOtp(phone, code, purpose) {
  const providerUrl = validateOtpProviderUrl();
  const response = await fetch(providerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OTP_PROVIDER_AUTH_TOKEN ? { Authorization: `Bearer ${OTP_PROVIDER_AUTH_TOKEN}` } : {})
    },
    body: JSON.stringify({
      to: phone,
      template: "fixnow-citizen-otp",
      purpose,
      code,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      message: `Your FixNow Ghana security code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it.`
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Object.assign(new Error("The OTP delivery provider did not accept the message"), { statusCode: 502 });
}

async function requestCitizenOtp(body, req, forcedPurpose = "") {
  validateOtpProviderUrl();
  const phone = normalizeGhanaPhone(body.phone);
  const purpose = forcedPurpose || sanitizeText(body.purpose || "sign-in", 30);
  if (!new Set(["sign-in", "password-reset"]).has(purpose)) throw Object.assign(new Error("Unsupported OTP purpose"), { statusCode: 400 });
  const deviceKey = sanitizeText(body.deviceKey, 100);
  if (deviceKey.length < 16) throw Object.assign(new Error("A stable device key is required"), { statusCode: 400 });
  const phoneHash = citizenPhoneHash(phone);
  const deviceHash = privateActorHash("device", deviceKey);
  const ipHash = privateActorHash("ip", getClientIp(req));
  consumeSecurityRateLimit(`otp:phone:${phoneHash}`, 5, 60 * 60 * 1000, "Too many codes requested for this phone. Try again later.");
  consumeSecurityRateLimit(`otp:device:${deviceHash}`, 8, 60 * 60 * 1000, "Too many codes requested on this device. Try again later.");
  consumeSecurityRateLimit(`otp:ip:${ipHash}`, 20, 60 * 60 * 1000, "Too many codes requested from this network. Try again later.");
  const latest = db.prepare(`
    SELECT resend_available_at FROM citizen_otp_challenges
    WHERE phone_hash = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1
  `).get(phoneHash, purpose);
  if (latest && latest.resend_available_at > nowIso()) {
    throw Object.assign(new Error("Please wait before requesting another code"), { statusCode: 429 });
  }

  const account = db.prepare("SELECT * FROM citizen_accounts WHERE phone_hash = ? AND status = 'active'").get(phoneHash);
  const challengeId = crypto.randomUUID();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const resendAvailableAt = new Date(Date.now() + OTP_RESEND_SECONDS * 1000).toISOString();
  const deliverable = purpose === "sign-in" || Boolean(account);
  db.prepare(`
    INSERT INTO citizen_otp_challenges (
      id, phone_hash, phone_last4, purpose, code_hash, device_hash, ip_hash, attempt_count,
      max_attempts, expires_at, resend_available_at, consumed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?)
  `).run(challengeId, phoneHash, phone.slice(-4), purpose, citizenOtpHash(challengeId, code), deviceHash, ipHash,
    OTP_MAX_ATTEMPTS, expiresAt, resendAvailableAt, createdAt);
  try {
    if (deliverable) await deliverCitizenOtp(phone, code, purpose);
  } catch (error) {
    db.prepare("DELETE FROM citizen_otp_challenges WHERE id = ?").run(challengeId);
    throw error;
  }
  return {
    challengeId,
    expiresAt,
    resendAvailableAt,
    destination: `+233 *** *** ${phone.slice(-4)}`,
    provider: "configured-webhook",
    message: "If the number can receive FixNow messages, a one-time code has been sent."
  };
}

function verifyCitizenOtp(body, req) {
  const challengeId = sanitizeText(body.challengeId, 80).toLowerCase();
  const code = String(body.code || "").trim();
  const deviceKey = sanitizeText(body.deviceKey, 100);
  if (!/^[a-f0-9-]{36}$/.test(challengeId) || !/^\d{6}$/.test(code) || deviceKey.length < 16) {
    throw Object.assign(new Error("The security code is invalid or expired"), { statusCode: 400 });
  }
  const challenge = db.prepare("SELECT * FROM citizen_otp_challenges WHERE id = ?").get(challengeId);
  const invalid = !challenge || challenge.consumed_at || challenge.expires_at <= nowIso() ||
    challenge.attempt_count >= challenge.max_attempts || challenge.device_hash !== privateActorHash("device", deviceKey);
  if (invalid) throw Object.assign(new Error("The security code is invalid or expired"), { statusCode: 400 });
  db.prepare("UPDATE citizen_otp_challenges SET attempt_count = attempt_count + 1 WHERE id = ?").run(challengeId);
  const expected = Buffer.from(challenge.code_hash);
  const actual = Buffer.from(citizenOtpHash(challengeId, code));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw Object.assign(new Error("The security code is invalid or expired"), { statusCode: 400 });
  }

  let citizen = db.prepare("SELECT * FROM citizen_accounts WHERE phone_hash = ?").get(challenge.phone_hash);
  if (challenge.purpose === "sign-in" && !citizen && (body.acceptTerms !== true || body.acceptPrivacy !== true)) {
    throw Object.assign(new Error("Accept the current terms and privacy policy to create an optional account"), { statusCode: 400 });
  }
  const stamp = nowIso();
  db.prepare("UPDATE citizen_otp_challenges SET consumed_at = ? WHERE id = ?").run(stamp, challengeId);
  if (challenge.purpose === "password-reset") {
    if (!citizen || citizen.status !== "active") throw Object.assign(new Error("The security code is invalid or expired"), { statusCode: 400 });
    const resetToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO citizen_password_resets (token_hash, citizen_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run(sha256(resetToken), citizen.id, expiresAt, stamp);
    citizenAudit(citizen, "password_reset_verified", "citizen_account", citizen.id);
    return { resetToken, expiresAt };
  }

  if (!citizen) {
    const citizenId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO citizen_accounts (id, phone_hash, phone_last4, display_name, avatar_url, status, created_at, updated_at)
      VALUES (?, ?, ?, '', '', 'active', ?, ?)
    `).run(citizenId, challenge.phone_hash, challenge.phone_last4, stamp, stamp);
    citizen = db.prepare("SELECT * FROM citizen_accounts WHERE id = ?").get(citizenId);
  } else if (citizen.status !== "active") {
    throw Object.assign(new Error("This account is unavailable"), { statusCode: 403 });
  }
  if (body.acceptTerms === true && body.acceptPrivacy === true) {
    const prior = db.prepare(`
      SELECT id FROM citizen_consents WHERE citizen_id = ? AND terms_version = ? AND privacy_version = ?
    `).get(citizen.id, TERMS_VERSION, PRIVACY_VERSION);
    if (!prior) db.prepare(`
      INSERT INTO citizen_consents (id, citizen_id, terms_version, privacy_version, accepted_at, source)
      VALUES (?, ?, ?, ?, ?, 'otp-auth')
    `).run(crypto.randomUUID(), citizen.id, TERMS_VERSION, PRIVACY_VERSION, stamp);
  }
  const session = createCitizenSession(citizen, req, deviceKey, body.deviceLabel);
  return { citizen: publicCitizen(db.prepare("SELECT * FROM citizen_accounts WHERE id = ?").get(citizen.id)), ...session };
}

function loginCitizenWithPassword(body, req) {
  const phone = normalizeGhanaPhone(body.phone);
  const phoneHash = citizenPhoneHash(phone);
  const deviceKey = sanitizeText(body.deviceKey, 100);
  if (deviceKey.length < 16) throw Object.assign(new Error("A stable device key is required"), { statusCode: 400 });
  consumeSecurityRateLimit(`citizen-password:${phoneHash}`, 10, 15 * 60 * 1000, "Too many sign-in attempts. Try again later.");
  consumeSecurityRateLimit(`citizen-password-ip:${privateActorHash("ip", getClientIp(req))}`, 30, 15 * 60 * 1000, "Too many sign-in attempts from this network.");
  const citizen = db.prepare("SELECT * FROM citizen_accounts WHERE phone_hash = ? AND status = 'active'").get(phoneHash);
  if (!citizen || !citizen.password_hash || !verifyPassword(body.password || "", citizen.password_hash)) {
    throw Object.assign(new Error("Phone number or password is incorrect"), { statusCode: 401 });
  }
  const session = createCitizenSession(citizen, req, deviceKey, body.deviceLabel);
  return { citizen: publicCitizen(db.prepare("SELECT * FROM citizen_accounts WHERE id = ?").get(citizen.id)), ...session };
}

function setCitizenPassword(citizen, body) {
  const password = String(body.newPassword || "");
  if (password.length < 10 || password.length > 256) {
    throw Object.assign(new Error("Password must be between 10 and 256 characters"), { statusCode: 400 });
  }
  if (citizen.password_hash && !verifyPassword(body.currentPassword || "", citizen.password_hash)) {
    throw Object.assign(new Error("Current password is incorrect"), { statusCode: 403 });
  }
  const stamp = nowIso();
  db.prepare("UPDATE citizen_accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(createPasswordHash(password), stamp, citizen.id);
  db.prepare("UPDATE citizen_sessions SET revoked_at = ? WHERE citizen_id = ? AND id <> ? AND revoked_at IS NULL")
    .run(stamp, citizen.id, citizen.citizen_session_id);
  citizenAudit(citizen, citizen.password_hash ? "password_changed" : "password_created", "citizen_account", citizen.id);
  return publicCitizen(db.prepare("SELECT * FROM citizen_accounts WHERE id = ?").get(citizen.id));
}

function confirmCitizenPasswordReset(body) {
  const token = String(body.resetToken || "");
  const password = String(body.newPassword || "");
  if (token.length < 40 || password.length < 10 || password.length > 256) {
    throw Object.assign(new Error("The reset token is invalid or the password is too short"), { statusCode: 400 });
  }
  const reset = db.prepare("SELECT * FROM citizen_password_resets WHERE token_hash = ?").get(sha256(token));
  if (!reset || reset.consumed_at || reset.expires_at <= nowIso()) {
    throw Object.assign(new Error("The reset token is invalid or expired"), { statusCode: 400 });
  }
  const stamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE citizen_password_resets SET consumed_at = ? WHERE token_hash = ?").run(stamp, sha256(token));
    db.prepare("UPDATE citizen_accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(createPasswordHash(password), stamp, reset.citizen_id);
    db.prepare("UPDATE citizen_sessions SET revoked_at = ? WHERE citizen_id = ? AND revoked_at IS NULL").run(stamp, reset.citizen_id);
    const citizen = db.prepare("SELECT * FROM citizen_accounts WHERE id = ?").get(reset.citizen_id);
    citizenAudit(citizen, "password_reset_completed", "citizen_account", reset.citizen_id);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function updateCitizenProfile(citizen, body) {
  const displayName = sanitizeText(body.displayName, 80);
  const avatarUrl = String(body.avatarUrl || "").trim();
  if (avatarUrl && (!/^https:\/\//.test(avatarUrl) || avatarUrl.length > 500)) {
    throw Object.assign(new Error("Avatar URL must be a valid HTTPS address"), { statusCode: 400 });
  }
  const stamp = nowIso();
  db.prepare("UPDATE citizen_accounts SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?")
    .run(displayName, avatarUrl, stamp, citizen.id);
  citizenAudit(citizen, "profile_updated", "citizen_account", citizen.id, { hasDisplayName: Boolean(displayName), hasAvatar: Boolean(avatarUrl) });
  return publicCitizen(db.prepare("SELECT * FROM citizen_accounts WHERE id = ?").get(citizen.id));
}

function linkCitizenReport(citizen, body, source = "reference-secret") {
  const report = trackPublicReport(body.reference, body.secret);
  db.prepare(`
    INSERT INTO citizen_report_links (citizen_id, report_id, link_source, linked_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(citizen_id, report_id) DO NOTHING
  `).run(citizen.id, report.reference, sanitizeText(source, 40), nowIso());
  citizenAudit(citizen, "report_linked", "report", report.reference, { source });
  return report;
}

function listCitizenReports(citizen) {
  return db.prepare(`
    SELECT reports.* FROM citizen_report_links
    JOIN reports ON reports.id = citizen_report_links.report_id
    WHERE citizen_report_links.citizen_id = ?
    ORDER BY reports.updated_at DESC
  `).all(citizen.id).map((row) => {
    const report = publicTrackingReport(row);
    const preference = db.prepare(`
      SELECT notify_public_updates, notify_resolution, channel, updated_at
      FROM citizen_report_preferences WHERE citizen_id = ? AND report_id = ?
    `).get(citizen.id, row.id);
    return {
      ...report,
      accountLinked: true,
      notificationPreference: preference ? {
        publicUpdates: Boolean(preference.notify_public_updates),
        resolution: Boolean(preference.notify_resolution),
        channel: preference.channel,
        updatedAt: preference.updated_at
      } : { publicUpdates: true, resolution: true, channel: "in-app", updatedAt: "" }
    };
  });
}

function citizenHasReportLink(citizen, reportId) {
  return Boolean(citizen && db.prepare("SELECT 1 FROM citizen_report_links WHERE citizen_id = ? AND report_id = ?").get(citizen.id, reportId));
}

function resolveCitizenReportProof(reportId, body, citizen) {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!row) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  if (citizenHasReportLink(citizen, reportId)) {
    const tracking = db.prepare("SELECT * FROM report_tracking WHERE report_id = ?").get(reportId);
    const suppliedSecret = String(body.secret || "");
    const trackingSecret = tracking && suppliedSecret && verifyTrackingSecret(suppliedSecret, tracking.secret_hash) ? suppliedSecret : "";
    return { row, citizen, actorHash: privateActorHash("citizen-report-action", citizen.id), trackingSecret };
  }
  const tracking = db.prepare("SELECT * FROM report_tracking WHERE report_id = ? AND tracking_reference = ?").get(reportId, reportId);
  const secret = String(body.secret || "");
  if (!tracking || !secret || !verifyTrackingSecret(secret, tracking.secret_hash)) {
    throw Object.assign(new Error("Tracking reference or secret is invalid"), { statusCode: 404 });
  }
  return { row, citizen: null, actorHash: privateActorHash("tracking-report-action", tracking.secret_hash), trackingSecret: secret };
}

function updateCitizenReportPreference(citizen, reportId, body) {
  if (!citizenHasReportLink(citizen, reportId)) throw Object.assign(new Error("Linked report not found"), { statusCode: 404 });
  const stamp = nowIso();
  const publicUpdates = body.publicUpdates !== false;
  const resolution = body.resolution !== false;
  db.prepare(`
    INSERT INTO citizen_report_preferences (citizen_id, report_id, notify_public_updates, notify_resolution, channel, updated_at)
    VALUES (?, ?, ?, ?, 'in-app', ?)
    ON CONFLICT(citizen_id, report_id) DO UPDATE SET
      notify_public_updates = excluded.notify_public_updates,
      notify_resolution = excluded.notify_resolution,
      channel = excluded.channel,
      updated_at = excluded.updated_at
  `).run(citizen.id, reportId, toIntBool(publicUpdates), toIntBool(resolution), stamp);
  citizenAudit(citizen, "report_notification_preference_updated", "report", reportId, { publicUpdates, resolution, channel: "in-app" });
  return { publicUpdates, resolution, channel: "in-app", updatedAt: stamp };
}

function recordCitizenReporterAction(reportId, body, citizen) {
  const proof = resolveCitizenReportProof(reportId, body, citizen);
  const action = sanitizeText(body.action, 40).toLowerCase();
  if (!new Set(["confirm-resolution", "reopen"]).has(action)) throw Object.assign(new Error("Unsupported reporter action"), { statusCode: 400 });
  const actionKey = sanitizeText(body.actionKey, 80).toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(actionKey)) {
    throw Object.assign(new Error("A valid reporter action key is required"), { statusCode: 400 });
  }
  const reason = sanitizeText(body.reason, 1000);
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.slice(0, 5) : [];
  if (action === "reopen" && !reason) throw Object.assign(new Error("A reason is required to reopen a report"), { statusCode: 400 });
  if (action === "reopen" && proof.row.status !== "Resolved") throw Object.assign(new Error("Only a resolved report can be reopened"), { statusCode: 409 });
  if (action === "confirm-resolution" && proof.row.status !== "Resolved") throw Object.assign(new Error("Only a resolved report can be confirmed"), { statusCode: 409 });
  if (attachmentIds.length && !proof.trackingSecret) throw Object.assign(new Error("Private tracking proof is required to attach reopening evidence"), { statusCode: 400 });
  const payloadHash = sha256(JSON.stringify({ reportId, action, reason, attachmentIds }));
  const existing = db.prepare("SELECT * FROM citizen_reporter_actions WHERE action_key = ?").get(actionKey);
  if (existing) {
    if (existing.report_id !== reportId || existing.payload_hash !== payloadHash || existing.actor_hash !== proof.actorHash) {
      throw Object.assign(new Error("Reporter action key has already been used with different data"), { statusCode: 409 });
    }
    return publicTrackingReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId));
  }

  const stamp = nowIso();
  const nextStatus = action === "reopen" ? "Reopened" : proof.row.status;
  const publicUpdate = action === "reopen" ? "Reporter requested that this resolved report be reopened." : "Reporter confirmed the reported resolution.";
  db.exec("BEGIN IMMEDIATE");
  try {
    if (attachmentIds.length) claimReportAttachments(reportId, attachmentIds, sanitizeText(body.uploadSessionKey, 80).toLowerCase(), proof.trackingSecret);
    if (nextStatus !== proof.row.status) {
      const payload = safeJsonParse(proof.row.payload_json, {});
      db.prepare("UPDATE reports SET status = ?, payload_json = ?, updated_at = ?, last_actor = 'citizen-reporter' WHERE id = ?")
        .run(nextStatus, JSON.stringify({ ...payload, status: nextStatus, updatedAt: stamp }), stamp, reportId);
    }
    db.prepare(`
      INSERT INTO citizen_reporter_actions (action_key, report_id, citizen_id, actor_hash, action, reason, attachment_count, payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(actionKey, reportId, proof.citizen?.id || null, proof.actorHash, action, reason, attachmentIds.length, payloadHash, stamp);
    db.prepare("INSERT INTO report_updates (id, report_id, status, public_note, actor_user_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
      .run(crypto.randomUUID(), reportId, nextStatus, publicUpdate, stamp);
    db.prepare(`
      INSERT INTO report_history (id, report_id, from_status, to_status, public_update, private_note, actor_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(crypto.randomUUID(), reportId, proof.row.status, nextStatus, publicUpdate, reason, stamp);
    if (proof.citizen) citizenAudit(proof.citizen, action, "report", reportId, { attachmentCount: attachmentIds.length });
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
  return publicTrackingReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId));
}

function removeCitizenReportContact(reportId, body, citizen) {
  const proof = resolveCitizenReportProof(reportId, body, citizen);
  const payload = safeJsonParse(proof.row.payload_json, {});
  if (!payload.contact && !payload.trustedContact) return publicTrackingReport(proof.row);
  const stamp = nowIso();
  delete payload.contact;
  delete payload.trustedContact;
  payload.contactConsent = false;
  payload.updatedAt = stamp;
  db.prepare("UPDATE reports SET payload_json = ?, updated_at = ?, last_actor = 'citizen-reporter' WHERE id = ?")
    .run(JSON.stringify(payload), stamp, reportId);
  db.prepare(`
    INSERT INTO report_history (id, report_id, from_status, to_status, public_update, private_note, actor_user_id, created_at)
    VALUES (?, ?, ?, ?, '', 'Reporter removed stored contact channels', NULL, ?)
  `).run(crypto.randomUUID(), reportId, proof.row.status, proof.row.status, stamp);
  if (proof.citizen) citizenAudit(proof.citizen, "report_contact_removed", "report", reportId);
  return publicTrackingReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId));
}

function citizenDataExport(citizen) {
  const consents = db.prepare(`
    SELECT terms_version AS termsVersion, privacy_version AS privacyVersion, accepted_at AS acceptedAt, source
    FROM citizen_consents WHERE citizen_id = ? ORDER BY accepted_at ASC
  `).all(citizen.id);
  const sessions = db.prepare(`
    SELECT id, device_label AS deviceLabel, created_at AS createdAt, last_seen_at AS lastSeenAt,
           expires_at AS expiresAt, revoked_at AS revokedAt
    FROM citizen_sessions WHERE citizen_id = ? ORDER BY created_at DESC
  `).all(citizen.id);
  return {
    exportedAt: nowIso(),
    account: publicCitizen(citizen),
    policyConsents: consents,
    sessions,
    reports: listCitizenReports(citizen),
    exclusions: ["tracking secrets", "exact GPS", "contact details", "private responder notes", "authentication hashes"]
  };
}

function deleteCitizenAccount(citizen, body) {
  if (String(body.confirmation || "") !== "DELETE") {
    throw Object.assign(new Error("Type DELETE to confirm account deletion"), { statusCode: 400 });
  }
  if (citizen.password_hash && !verifyPassword(body.password || "", citizen.password_hash)) {
    throw Object.assign(new Error("Password confirmation is required"), { statusCode: 403 });
  }
  const stamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    citizenAudit(citizen, "account_deleted", "citizen_account", citizen.id);
    db.prepare("DELETE FROM citizen_report_links WHERE citizen_id = ?").run(citizen.id);
    db.prepare("DELETE FROM citizen_consents WHERE citizen_id = ?").run(citizen.id);
    db.prepare("DELETE FROM citizen_password_resets WHERE citizen_id = ?").run(citizen.id);
    db.prepare("UPDATE citizen_sessions SET revoked_at = ? WHERE citizen_id = ? AND revoked_at IS NULL").run(stamp, citizen.id);
    db.prepare(`
      UPDATE citizen_accounts SET phone_hash = ?, phone_last4 = '0000', password_hash = NULL,
        display_name = '', avatar_url = '', status = 'deleted', updated_at = ?, deleted_at = ? WHERE id = ?
    `).run(`deleted:${citizen.id}:${crypto.randomUUID()}`, stamp, stamp, citizen.id);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function applyMigrations() {
  const migrations = [{
    version: "20260808_01_secure_location_model",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS boundary_datasets (
          id TEXT PRIMARY KEY,
          version TEXT NOT NULL UNIQUE,
          publisher TEXT NOT NULL,
          source_url TEXT NOT NULL,
          source_date TEXT NOT NULL,
          licence TEXT NOT NULL,
          licence_status TEXT NOT NULL,
          file_sha256 TEXT NOT NULL,
          feature_count INTEGER NOT NULL,
          metadata_json TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 0,
          installed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS report_locations (
          report_id TEXT PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
          exact_latitude REAL,
          exact_longitude REAL,
          private_location_json TEXT NOT NULL DEFAULT '{}',
          public_location_json TEXT NOT NULL DEFAULT '{}',
          public_location_label TEXT NOT NULL DEFAULT '',
          google_place_id TEXT NOT NULL DEFAULT '',
          location_source TEXT NOT NULL,
          accuracy_metres REAL,
          region_id TEXT NOT NULL DEFAULT '',
          mmda_id TEXT NOT NULL DEFAULT '',
          exact_location_consent INTEGER NOT NULL DEFAULT 0,
          exact_location_consent_at TEXT NOT NULL DEFAULT '',
          verification_state TEXT NOT NULL,
          location_quality TEXT NOT NULL,
          location_confidence REAL NOT NULL DEFAULT 0,
          boundary_version TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (exact_latitude IS NULL OR (exact_latitude >= -90 AND exact_latitude <= 90)),
          CHECK (exact_longitude IS NULL OR (exact_longitude >= -180 AND exact_longitude <= 180)),
          CHECK ((exact_latitude IS NULL) = (exact_longitude IS NULL)),
          CHECK (exact_location_consent = 0 OR (exact_latitude IS NOT NULL AND exact_location_consent_at <> ''))
        );

        CREATE INDEX IF NOT EXISTS idx_report_locations_region_mmda ON report_locations(region_id, mmda_id);
        CREATE INDEX IF NOT EXISTS idx_report_locations_verification ON report_locations(verification_state);
      `);
      db.prepare(`
        INSERT INTO boundary_datasets (
          id, version, publisher, source_url, source_date, licence, licence_status,
          file_sha256, feature_count, metadata_json, active, installed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          version = excluded.version, publisher = excluded.publisher, source_url = excluded.source_url,
          source_date = excluded.source_date, licence = excluded.licence,
          licence_status = excluded.licence_status, file_sha256 = excluded.file_sha256,
          feature_count = excluded.feature_count, metadata_json = excluded.metadata_json,
          active = excluded.active
      `).run(
        BOUNDARY_METADATA.id, BOUNDARY_METADATA.version, BOUNDARY_METADATA.publisher,
        BOUNDARY_METADATA.sourcePage, BOUNDARY_METADATA.sourceFileDate, BOUNDARY_METADATA.licence,
        BOUNDARY_METADATA.licenceStatus, BOUNDARY_METADATA.runtimeFileSha256,
        BOUNDARY_METADATA.featureCount, JSON.stringify(BOUNDARY_METADATA), nowIso()
      );
    }
  }, {
    version: "20260810_02_verified_public_feed",
    apply() {
      db.exec(`
        ALTER TABLE report_locations RENAME TO report_locations_legacy;
        CREATE TABLE report_locations (
          report_id TEXT PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
          exact_latitude REAL,
          exact_longitude REAL,
          private_location_json TEXT NOT NULL DEFAULT '{}',
          public_location_json TEXT NOT NULL DEFAULT '{}',
          public_location_label TEXT NOT NULL DEFAULT '',
          google_place_id TEXT NOT NULL DEFAULT '',
          location_source TEXT NOT NULL,
          accuracy_metres REAL,
          region_id TEXT NOT NULL DEFAULT '',
          mmda_id TEXT NOT NULL DEFAULT '',
          exact_location_consent INTEGER NOT NULL DEFAULT 0,
          exact_location_consent_at TEXT NOT NULL DEFAULT '',
          verification_state TEXT NOT NULL,
          location_quality TEXT NOT NULL,
          location_confidence REAL NOT NULL DEFAULT 0,
          boundary_version TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (exact_latitude IS NULL OR (exact_latitude >= -90 AND exact_latitude <= 90)),
          CHECK (exact_longitude IS NULL OR (exact_longitude >= -180 AND exact_longitude <= 180)),
          CHECK ((exact_latitude IS NULL) = (exact_longitude IS NULL)),
          CHECK (exact_latitude IS NULL OR (exact_location_consent = 1 AND exact_location_consent_at <> '')),
          CHECK (exact_location_consent = 0 OR exact_location_consent_at <> '')
        );
        INSERT INTO report_locations SELECT * FROM report_locations_legacy;
        DROP TABLE report_locations_legacy;
        CREATE INDEX IF NOT EXISTS idx_report_locations_region_mmda ON report_locations(region_id, mmda_id);
        CREATE INDEX IF NOT EXISTS idx_report_locations_verification ON report_locations(verification_state);
      `);
      const columns = new Set(db.prepare("PRAGMA table_info(reports)").all().map((column) => column.name));
      if (!columns.has("public_verified")) db.exec("ALTER TABLE reports ADD COLUMN public_verified INTEGER NOT NULL DEFAULT 0");
      if (!columns.has("verified_at")) db.exec("ALTER TABLE reports ADD COLUMN verified_at TEXT");
      if (!columns.has("verified_by")) db.exec("ALTER TABLE reports ADD COLUMN verified_by INTEGER");
      if (!columns.has("responsible_institution")) db.exec("ALTER TABLE reports ADD COLUMN responsible_institution TEXT NOT NULL DEFAULT ''");
      db.exec("CREATE INDEX IF NOT EXISTS idx_reports_public_feed ON reports(public_verified, hidden, flagged, updated_at)");
    }
  }, {
    version: "20260810_03_private_evidence_uploads",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS report_attachments (
          id TEXT PRIMARY KEY,
          report_id TEXT REFERENCES reports(id) ON DELETE CASCADE,
          upload_session_key TEXT NOT NULL,
          client_attachment_id TEXT NOT NULL,
          upload_secret_hash TEXT NOT NULL,
          storage_name TEXT NOT NULL UNIQUE,
          original_name TEXT NOT NULL,
          detected_mime TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 750000),
          payload_hash TEXT NOT NULL,
          quarantine_state TEXT NOT NULL CHECK (quarantine_state IN ('pending', 'clean', 'rejected')),
          scan_result TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(upload_session_key, client_attachment_id)
        );
        CREATE INDEX IF NOT EXISTS idx_report_attachments_report ON report_attachments(report_id);
        CREATE INDEX IF NOT EXISTS idx_report_attachments_quarantine ON report_attachments(quarantine_state, created_at);
      `);
    }
  }, {
    version: "20260810_04_structured_public_signals",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS public_report_signals (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          actor_hash TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('confirmed', 'worsening', 'fixed', 'incorrect')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(report_id, actor_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_public_report_signals_report ON public_report_signals(report_id, action);
      `);
    }
  }, {
    version: "20260810_05_optional_citizen_accounts",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS citizen_accounts (
          id TEXT PRIMARY KEY,
          phone_hash TEXT NOT NULL UNIQUE,
          phone_last4 TEXT NOT NULL,
          password_hash TEXT,
          display_name TEXT NOT NULL DEFAULT '',
          avatar_url TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_login_at TEXT,
          deleted_at TEXT
        );
        CREATE TABLE IF NOT EXISTS citizen_sessions (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          citizen_id TEXT NOT NULL REFERENCES citizen_accounts(id) ON DELETE CASCADE,
          device_hash TEXT NOT NULL,
          device_label TEXT NOT NULL DEFAULT '',
          ip_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT
        );
        CREATE TABLE IF NOT EXISTS citizen_otp_challenges (
          id TEXT PRIMARY KEY,
          phone_hash TEXT NOT NULL,
          phone_last4 TEXT NOT NULL,
          purpose TEXT NOT NULL CHECK (purpose IN ('sign-in', 'password-reset')),
          code_hash TEXT NOT NULL,
          device_hash TEXT NOT NULL,
          ip_hash TEXT NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL,
          expires_at TEXT NOT NULL,
          resend_available_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS citizen_consents (
          id TEXT PRIMARY KEY,
          citizen_id TEXT NOT NULL REFERENCES citizen_accounts(id) ON DELETE CASCADE,
          terms_version TEXT NOT NULL,
          privacy_version TEXT NOT NULL,
          accepted_at TEXT NOT NULL,
          source TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS citizen_password_resets (
          token_hash TEXT PRIMARY KEY,
          citizen_id TEXT NOT NULL REFERENCES citizen_accounts(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS citizen_report_links (
          citizen_id TEXT NOT NULL REFERENCES citizen_accounts(id) ON DELETE CASCADE,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          link_source TEXT NOT NULL,
          linked_at TEXT NOT NULL,
          PRIMARY KEY (citizen_id, report_id)
        );
        CREATE TABLE IF NOT EXISTS citizen_audit_log (
          id TEXT PRIMARY KEY,
          citizen_id TEXT REFERENCES citizen_accounts(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          details_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_citizen_sessions_account ON citizen_sessions(citizen_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_citizen_otp_phone ON citizen_otp_challenges(phone_hash, purpose, created_at);
        CREATE INDEX IF NOT EXISTS idx_citizen_password_resets_account ON citizen_password_resets(citizen_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_citizen_report_links_account ON citizen_report_links(citizen_id, linked_at);
        CREATE INDEX IF NOT EXISTS idx_citizen_audit_account ON citizen_audit_log(citizen_id, created_at);
      `);
    }
  }, {
    version: "20260810_06_advanced_citizen_reports",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS citizen_report_preferences (
          citizen_id TEXT NOT NULL REFERENCES citizen_accounts(id) ON DELETE CASCADE,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          notify_public_updates INTEGER NOT NULL DEFAULT 1,
          notify_resolution INTEGER NOT NULL DEFAULT 1,
          channel TEXT NOT NULL DEFAULT 'in-app' CHECK (channel = 'in-app'),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (citizen_id, report_id)
        );
        CREATE TABLE IF NOT EXISTS citizen_reporter_actions (
          action_key TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          citizen_id TEXT REFERENCES citizen_accounts(id) ON DELETE SET NULL,
          actor_hash TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('confirm-resolution', 'reopen')),
          reason TEXT NOT NULL DEFAULT '',
          attachment_count INTEGER NOT NULL DEFAULT 0,
          payload_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_citizen_preferences_report ON citizen_report_preferences(report_id);
        CREATE INDEX IF NOT EXISTS idx_citizen_reporter_actions_report ON citizen_reporter_actions(report_id, created_at);
      `);
    }
  }, {
    version: "20260810_07_responder_field_operations",
    apply() {
      db.exec(`
        ALTER TABLE reports ADD COLUMN assignment_user_id INTEGER REFERENCES users(id);
        ALTER TABLE reports ADD COLUMN assignment_state TEXT NOT NULL DEFAULT 'unassigned';
        ALTER TABLE reports ADD COLUMN accepted_at TEXT;
        ALTER TABLE reports ADD COLUMN accepted_by INTEGER REFERENCES users(id);
        ALTER TABLE reports ADD COLUMN escalated_at TEXT;
        ALTER TABLE reports ADD COLUMN escalation_reason TEXT NOT NULL DEFAULT '';
        ALTER TABLE reports ADD COLUMN sla_due_at TEXT;
        ALTER TABLE reports ADD COLUMN resolution_evidence_id TEXT;
        ALTER TABLE reports ADD COLUMN resolution_exception TEXT NOT NULL DEFAULT '';

        CREATE TABLE IF NOT EXISTS responder_evidence (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          actor_user_id INTEGER NOT NULL REFERENCES users(id),
          client_attachment_id TEXT NOT NULL,
          storage_name TEXT NOT NULL UNIQUE,
          original_name TEXT NOT NULL,
          detected_mime TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 750000),
          payload_hash TEXT NOT NULL,
          quarantine_state TEXT NOT NULL CHECK (quarantine_state IN ('pending', 'clean', 'rejected')),
          scan_result TEXT NOT NULL DEFAULT '',
          reviewed_by INTEGER REFERENCES users(id),
          reviewed_at TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(report_id, actor_user_id, client_attachment_id)
        );
        CREATE TABLE IF NOT EXISTS report_assignments (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          from_user_id INTEGER REFERENCES users(id),
          to_user_id INTEGER REFERENCES users(id),
          action TEXT NOT NULL CHECK (action IN ('accepted', 'assigned', 'reassigned')),
          actor_user_id INTEGER NOT NULL REFERENCES users(id),
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS report_escalations (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          target TEXT NOT NULL DEFAULT '',
          actor_user_id INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS responder_action_keys (
          action_key TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          actor_user_id INTEGER NOT NULL REFERENCES users(id),
          payload_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        UPDATE reports
        SET sla_due_at = CASE
          WHEN lower(COALESCE(severity, '')) = 'critical' THEN strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+4 hours')
          WHEN lower(COALESCE(severity, '')) = 'high' THEN strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+24 hours')
          WHEN lower(COALESCE(severity, '')) = 'medium' THEN strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+72 hours')
          ELSE strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+120 hours')
        END
        WHERE sla_due_at IS NULL;

        CREATE INDEX IF NOT EXISTS idx_reports_assignment ON reports(assignment_user_id, assignment_state, updated_at);
        CREATE INDEX IF NOT EXISTS idx_reports_sla ON reports(sla_due_at, status);
        CREATE INDEX IF NOT EXISTS idx_responder_evidence_report ON responder_evidence(report_id, quarantine_state);
        CREATE INDEX IF NOT EXISTS idx_report_assignments_report ON report_assignments(report_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_report_escalations_report ON report_escalations(report_id, created_at);
      `);
    }
  }, {
    version: "20260810_08_administration_and_routing",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS admin_directory_items (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN (
            'agency', 'region', 'mmda', 'jurisdiction', 'category', 'subcategory',
            'contact-channel', 'escalation-path', 'response-target', 'role-scope',
            'retention-policy', 'emergency-info', 'environment-control'
          )),
          name TEXT NOT NULL,
          parent_id TEXT REFERENCES admin_directory_items(id),
          payload_json TEXT NOT NULL DEFAULT '{}',
          active INTEGER NOT NULL DEFAULT 1,
          version INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER NOT NULL REFERENCES users(id),
          updated_by INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS routing_rules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT '',
          region TEXT NOT NULL DEFAULT '',
          district TEXT NOT NULL DEFAULT '',
          agency_id TEXT NOT NULL REFERENCES admin_directory_items(id),
          response_target_id TEXT REFERENCES admin_directory_items(id),
          escalation_path_id TEXT REFERENCES admin_directory_items(id),
          priority INTEGER NOT NULL DEFAULT 100,
          rule_version TEXT NOT NULL,
          rationale TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER NOT NULL REFERENCES users(id),
          updated_by INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS routing_recommendations (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          rule_id TEXT REFERENCES routing_rules(id),
          rule_version TEXT NOT NULL,
          agency_id TEXT NOT NULL REFERENCES admin_directory_items(id),
          response_target_id TEXT REFERENCES admin_directory_items(id),
          rationale TEXT NOT NULL,
          recommendation_state TEXT NOT NULL DEFAULT 'recommended' CHECK (recommendation_state IN ('recommended', 'accepted', 'overridden', 'dismissed')),
          engine_type TEXT NOT NULL DEFAULT 'rules' CHECK (engine_type IN ('rules', 'model-assisted')),
          model_version TEXT NOT NULL DEFAULT '',
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          decided_by INTEGER REFERENCES users(id),
          decided_at TEXT,
          override_agency_id TEXT REFERENCES admin_directory_items(id),
          override_reason TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS delivery_attempts (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          routing_recommendation_id TEXT REFERENCES routing_recommendations(id),
          target_id TEXT REFERENCES admin_directory_items(id),
          channel TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('Not sent', 'Queued', 'Sent', 'Delivered', 'Failed', 'Acknowledged')),
          external_outcome_id TEXT NOT NULL DEFAULT '',
          outcome_note TEXT NOT NULL DEFAULT '',
          integration_name TEXT NOT NULL DEFAULT '',
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS responder_invitations (
          id TEXT PRIMARY KEY,
          invite_hash TEXT NOT NULL UNIQUE,
          contact TEXT NOT NULL,
          agency TEXT NOT NULL,
          role TEXT NOT NULL,
          region TEXT NOT NULL DEFAULT '',
          district TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
          expires_at TEXT NOT NULL,
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          accepted_by INTEGER REFERENCES users(id),
          accepted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_directory_kind_active ON admin_directory_items(kind, active, name);
        CREATE INDEX IF NOT EXISTS idx_routing_rules_match ON routing_rules(active, category, region, district, priority);
        CREATE INDEX IF NOT EXISTS idx_routing_recommendations_report ON routing_recommendations(report_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_delivery_attempts_report ON delivery_attempts(report_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_responder_invitations_status ON responder_invitations(status, expires_at);
      `);
    }
  }, {
    version: "20260810_09_production_security_operations",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS responder_login_security (
          username_hash TEXT PRIMARY KEY,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          first_failed_at TEXT NOT NULL,
          last_failed_at TEXT NOT NULL,
          locked_until TEXT
        );
        CREATE TABLE IF NOT EXISTS retention_runs (
          id TEXT PRIMARY KEY,
          mode TEXT NOT NULL CHECK (mode IN ('dry-run', 'execute')),
          policy_snapshot_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          actor_user_id INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_login_security_lock ON responder_login_security(locked_until);
        CREATE INDEX IF NOT EXISTS idx_retention_runs_created ON retention_runs(created_at);
      `);
    }
  }, {
    version: "20261108_10_moderated_public_images",
    apply() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS public_report_images (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          attachment_id TEXT NOT NULL REFERENCES report_attachments(id) ON DELETE CASCADE,
          storage_name TEXT NOT NULL UNIQUE,
          detected_mime TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size > 0),
          review_note TEXT NOT NULL,
          approved_by INTEGER NOT NULL REFERENCES users(id),
          approved_at TEXT NOT NULL,
          withdrawn_by INTEGER REFERENCES users(id),
          withdrawn_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_public_images_active_attachment ON public_report_images(attachment_id) WHERE withdrawn_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_public_images_report ON public_report_images(report_id, withdrawn_at);
      `);
    }
  }];

  for (const migration of migrations) {
    if (db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.apply();
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, nowIso());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      agency TEXT,
      region TEXT,
      district TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS onboarding_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      agency TEXT NOT NULL,
      role_requested TEXT NOT NULL,
      region TEXT,
      district TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      review_note TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      severity TEXT,
      type TEXT,
      region TEXT,
      district TEXT,
      community TEXT,
      assigned_to TEXT,
      flagged INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      last_actor TEXT
    );

    CREATE TABLE IF NOT EXISTS moderation_actions (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      note TEXT,
      actor_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_tracking (
      report_id TEXT PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
      tracking_reference TEXT NOT NULL UNIQUE,
      secret_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public_submission_keys (
      submission_key TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      report_id TEXT NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_updates (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      public_note TEXT,
      actor_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_history (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      public_update TEXT,
      private_note TEXT,
      actor_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS responder_update_keys (
      update_key TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_contact_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config_json TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_updated ON reports(updated_at);
    CREATE INDEX IF NOT EXISTS idx_reports_hidden ON reports(hidden);
    CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_requests(status);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_tracking_reference ON report_tracking(tracking_reference);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_public_submission_key ON public_submission_keys(submission_key);
    CREATE INDEX IF NOT EXISTS idx_report_updates_report ON report_updates(report_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_report_history_report ON report_history(report_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_responder_update_report ON responder_update_keys(report_id, actor_user_id);
  `);
  applyMigrations();
  const existingEmergencyConfig = db.prepare("SELECT id FROM emergency_contact_config WHERE id = 1").get();
  if (!existingEmergencyConfig) {
    const config = validateEmergencyContactConfig(emergencyContactFallback);
    db.prepare("INSERT INTO emergency_contact_config (id, config_json, updated_by, updated_at) VALUES (1, ?, NULL, ?)")
      .run(JSON.stringify(config), nowIso());
  }
}

function insertUser(input) {
  const username = sanitizeUsername(input.username);
  if (!username) throw new Error("Username is required");
  if (!input.password || String(input.password).length < 8) throw new Error("Password must be at least 8 characters");

  const stamp = nowIso();
  db.prepare(`
    INSERT INTO users (
      username, password_hash, role, name, phone, email, agency, region, district,
      status, must_change_password, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    username,
    createPasswordHash(input.password),
    sanitizeText(input.role || "Responder", 60),
    sanitizeText(input.name || username, 120),
    sanitizeText(input.phone || "", 40),
    sanitizeText(input.email || "", 160),
    sanitizeText(input.agency || "", 160),
    sanitizeText(input.region || "", 80),
    sanitizeText(input.district || "", 120),
    sanitizeText(input.status || "active", 24),
    toIntBool(input.mustChangePassword),
    stamp,
    stamp
  );

  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

function seedDatabase() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;

  if (!BOOTSTRAP_ADMIN_PASSWORD) {
    console.warn("No initial administrator created: set BOOTSTRAP_ADMIN_PASSWORD in the deployment secret manager before first startup.");
    return;
  }

  insertUser({
    username: "admin",
    password: BOOTSTRAP_ADMIN_PASSWORD,
    role: "Admin",
    name: "System Admin",
    agency: "FixNow Ghana",
    mustChangePassword: true
  });

  if (!SEED_DEMO_ACCOUNTS) return;

  const demoUsers = [
    ["assembly", "assembly123", "District Assembly", "Sample Assembly Desk", "Sample District Assembly", "Greater Accra", "Accra Metropolitan"],
    ["nadmo", "nadmo123", "Disaster Response Desk", "Sample Flood Response Desk", "Sample Flood Response Desk", "Greater Accra", "Accra Metropolitan"],
    ["utility", "utility123", "Utility Desk", "Sample Utility Desk", "Sample Water and Power Desk", "Greater Accra", "Accra Metropolitan"],
    ["moderator", "moderator123", "Moderator", "Moderation Desk", "FixNow Moderation", "", ""]
  ];

  for (const [username, password, role, name, agency, region, district] of demoUsers) {
    insertUser({ username, password, role, name, agency, region, district, mustChangePassword: true });
  }
}

function getClientIp(req) {
  const source = TRUST_PROXY ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress) : req.socket.remoteAddress;
  return String(source || "unknown").split(",")[0].trim();
}

function requestIsSecure(req) {
  return Boolean(req.socket.encrypted || (TRUST_PROXY && req.headers["x-forwarded-proto"] === "https"));
}

function allowedRequestOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin || PUBLIC_ORIGIN === "*") return true;
  const allowed = new Set(PUBLIC_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean));
  return allowed.has(origin);
}

// Raw IP addresses are kept only for staff sign-in attempts, so an administrator can spot or block a network that
// attacks staff accounts. Every other entry (public reports, signals, photo uploads, onboarding requests and staff
// actions) stores a keyed hash instead: it still links repeated actions from one network without revealing it.
const RAW_IP_AUDIT_ACTIONS = new Set(["login", "login_failed"]);

function auditIp(action, req) {
  if (!req) return "";
  const ip = getClientIp(req);
  return RAW_IP_AUDIT_ACTIONS.has(action) ? ip : `iphash:${privateActorHash("ip", ip)}`;
}

// Hashes raw IPs saved before this rule existed. Safe to run on every start.
function hashStoredAuditIps() {
  const rows = db.prepare("SELECT id, action, ip FROM audit_log WHERE ip IS NOT NULL AND ip != '' AND ip NOT LIKE 'iphash:%'").all();
  const update = db.prepare("UPDATE audit_log SET ip = ? WHERE id = ?");
  for (const row of rows) {
    if (!RAW_IP_AUDIT_ACTIONS.has(row.action)) update.run(`iphash:${privateActorHash("ip", row.ip)}`, row.id);
  }
}

function logAudit(actor, action, entityType, entityId, details, req) {
  db.prepare(`
    INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, details_json, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    actor && actor.id ? actor.id : null,
    sanitizeText(action, 80),
    sanitizeText(entityType, 80),
    entityId ? String(entityId).slice(0, 120) : "",
    JSON.stringify(details || {}),
    auditIp(sanitizeText(action, 80), req),
    nowIso()
  );
}

function createSession(user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(createdAt);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, user.id, expiresAt, createdAt);
  db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(createdAt, createdAt, user.id);
  logAudit(user, "login", "user", user.id, { username: user.username }, req);
  return { token, expiresAt };
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function authenticate(req) {
  const token = readBearerToken(req);
  if (!token) return null;
  const tokenHash = sha256(token);
  const stamp = nowIso();
  const row = db.prepare(`
    SELECT users.*, sessions.expires_at AS session_expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).get(tokenHash);

  if (!row) return null;
  if (row.session_expires_at <= stamp || row.status !== "active") {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  return row;
}

function responderLoginSecurityKey(username) {
  return sha256(`${OTP_RUNTIME_SECRET}:responder-login:${sanitizeUsername(username)}`);
}

function assertResponderLoginAvailable(username) {
  const row = db.prepare("SELECT * FROM responder_login_security WHERE username_hash = ?").get(responderLoginSecurityKey(username));
  if (row?.locked_until && row.locked_until > nowIso()) {
    throw Object.assign(new Error("Sign-in is temporarily locked after repeated failed attempts"), { statusCode: 429 });
  }
}

function recordResponderLoginFailure(username) {
  const key = responderLoginSecurityKey(username);
  const stamp = nowIso();
  const current = db.prepare("SELECT * FROM responder_login_security WHERE username_hash = ?").get(key);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const attempts = !current || current.first_failed_at < windowStart ? 1 : Number(current.failed_attempts || 0) + 1;
  const firstFailedAt = attempts === 1 ? stamp : current.first_failed_at;
  const lockedUntil = attempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
  db.prepare(`INSERT INTO responder_login_security (username_hash, failed_attempts, first_failed_at, last_failed_at, locked_until)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(username_hash) DO UPDATE SET failed_attempts = excluded.failed_attempts,
      first_failed_at = excluded.first_failed_at, last_failed_at = excluded.last_failed_at, locked_until = excluded.locked_until`)
    .run(key, attempts, firstFailedAt, stamp, lockedUntil);
}

function clearResponderLoginFailures(username) {
  db.prepare("DELETE FROM responder_login_security WHERE username_hash = ?").run(responderLoginSecurityKey(username));
}

function createOnboardingRequest(body, req) {
  const name = sanitizeText(body.name, 120);
  const phone = sanitizeText(body.phone, 40);
  const agency = sanitizeText(body.agency, 160);
  if (!name || !phone || !agency) throw new Error("Name, phone, and agency are required");

  const request = {
    id: crypto.randomUUID(),
    name,
    phone,
    email: sanitizeText(body.email, 160),
    agency,
    roleRequested: sanitizeText(body.roleRequested || body.role || "Responder", 80),
    region: sanitizeText(body.region, 80),
    district: sanitizeText(body.district, 120),
    reason: sanitizeText(body.reason, 500),
    createdAt: nowIso()
  };

  db.prepare(`
    INSERT INTO onboarding_requests (
      id, name, phone, email, agency, role_requested, region, district, reason, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    request.id,
    request.name,
    request.phone,
    request.email,
    request.agency,
    request.roleRequested,
    request.region,
    request.district,
    request.reason,
    request.createdAt
  );

  logAudit(null, "onboarding_requested", "onboarding_request", request.id, {
    agency: request.agency,
    district: request.district
  }, req);

  return request;
}

function publicOnboardingRequest(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    agency: row.agency,
    roleRequested: row.role_requested,
    region: row.region || "",
    district: row.district || "",
    reason: row.reason || "",
    status: row.status,
    reviewNote: row.review_note || "",
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || "",
    reviewedBy: row.reviewed_by || null
  };
}

function slugifyUsername(value) {
  const slug = sanitizeUsername(String(value || "").toLowerCase().replace(/\s+/g, "."));
  return slug || `responder.${Date.now()}`;
}

function uniqueUsername(base) {
  const root = sanitizeUsername(base) || "responder";
  let candidate = root;
  let suffix = 2;
  while (db.prepare("SELECT id FROM users WHERE username = ?").get(candidate)) {
    candidate = `${root}.${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function approveOnboarding(id, body, actor, req) {
  const row = db.prepare("SELECT * FROM onboarding_requests WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Onboarding request not found");
    error.statusCode = 404;
    throw error;
  }
  if (row.status !== "pending") {
    const error = new Error("Onboarding request has already been reviewed");
    error.statusCode = 409;
    throw error;
  }

  const username = uniqueUsername(body.username || slugifyUsername(`${row.agency}.${row.district || row.name}`));
  const tempPassword = body.tempPassword || crypto.randomBytes(12).toString("base64url");
  const user = insertUser({
    username,
    password: tempPassword,
    role: body.role || row.role_requested || "Responder",
    name: body.name || row.name,
    phone: row.phone,
    email: row.email,
    agency: row.agency,
    region: row.region,
    district: row.district,
    mustChangePassword: true
  });

  const stamp = nowIso();
  db.prepare(`
    UPDATE onboarding_requests
    SET status = 'approved', review_note = ?, reviewed_at = ?, reviewed_by = ?
    WHERE id = ?
  `).run(sanitizeText(body.note || "Approved", 500), stamp, actor.id, id);

  logAudit(actor, "onboarding_approved", "onboarding_request", id, {
    createdUserId: user.id,
    username
  }, req);

  return { request: publicOnboardingRequest(db.prepare("SELECT * FROM onboarding_requests WHERE id = ?").get(id)), user: publicUser(user), tempPassword };
}

function rejectOnboarding(id, body, actor, req) {
  const row = db.prepare("SELECT * FROM onboarding_requests WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Onboarding request not found");
    error.statusCode = 404;
    throw error;
  }
  const stamp = nowIso();
  db.prepare(`
    UPDATE onboarding_requests
    SET status = 'rejected', review_note = ?, reviewed_at = ?, reviewed_by = ?
    WHERE id = ?
  `).run(sanitizeText(body.note || "Rejected", 500), stamp, actor.id, id);
  logAudit(actor, "onboarding_rejected", "onboarding_request", id, { note: body.note || "" }, req);
  return publicOnboardingRequest(db.prepare("SELECT * FROM onboarding_requests WHERE id = ?").get(id));
}

function upsertReport(input, actor, req) {
  const report = input && typeof input === "object" ? input : {};
  const stamp = nowIso();
  const id = sanitizeText(report.id || `FN-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, 120);
  const existing = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  const existingPayload = existing ? safeJsonParse(existing.payload_json, {}) : {};
  const payload = {
    ...existingPayload,
    ...report,
    id,
    syncStatus: "synced",
    syncedAt: stamp,
    updatedAt: stamp,
    lastActor: actor ? actor.username : "anonymous"
  };

  const status = sanitizeText(report.status || existing?.status || "Open", 60);
  const severity = sanitizeText(report.severity || report.priority || existing?.severity || "", 60);
  const type = sanitizeText(report.type || report.problemType || report.category || existing?.type || "", 100);
  const declaredCommunity = sanitizeText(report.community || report.locationText || existing?.community || "", 160);
  const location = existing ? null : parseReportLocation(report, declaredCommunity, stamp);
  const community = location?.publicLocation.community || declaredCommunity;
  const region = location?.region || sanitizeText(report.region || existing?.region || "", 80);
  const district = location?.district || sanitizeText(report.district || existing?.district || "", 120);
  if (!existing && !reportInActorScope(actor, { region, district })) {
    throw Object.assign(new Error("Report is outside your permitted area"), { statusCode: 403 });
  }
  if (location) {
    delete payload.coordinates;
    delete payload.exactLatitude;
    delete payload.exactLongitude;
    delete payload.exact_latitude;
    delete payload.exact_longitude;
    delete payload.digitalAddress;
    payload.region = region;
    payload.district = district;
    payload.publicLocationLabel = location.publicLocationLabel;
    payload.locationVerificationState = location.verificationState;
    payload.boundaryVersion = location.boundaryVersion;
  }
  const assignedTo = sanitizeText(report.assignedTo || report.assigned_to || existing?.assigned_to || "", 160);
  const source = sanitizeText(report.source || existing?.source || "field-app", 80);
  const createdAt = existing?.created_at || cleanDate(report.createdAt) || stamp;
  const flagged = canModerate(actor) && Object.prototype.hasOwnProperty.call(report, "flagged")
    ? toIntBool(report.flagged)
    : Number(existing?.flagged || 0);
  const hidden = canModerate(actor) && Object.prototype.hasOwnProperty.call(report, "hidden")
    ? toIntBool(report.hidden)
    : Number(existing?.hidden || 0);

  if (existing) {
    db.prepare(`
      UPDATE reports
      SET payload_json = ?, status = ?, severity = ?, type = ?, region = ?, district = ?, community = ?,
          assigned_to = ?, flagged = ?, hidden = ?, source = ?, updated_at = ?, synced_at = ?, last_actor = ?
      WHERE id = ?
    `).run(
      JSON.stringify(payload),
      status,
      severity,
      type,
      region,
      district,
      community,
      assignedTo,
      flagged,
      hidden,
      source,
      stamp,
      stamp,
      actor ? actor.username : "anonymous",
      id
    );
    logAudit(actor, "report_synced_update", "report", id, { status, source }, req);
    return { action: "updated", report: publicReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(id)) };
  }

  const assignToAuthor = actor && actor.id && !canModerate(actor);
  db.prepare(`
    INSERT INTO reports (
      id, payload_json, status, severity, type, region, district, community, assigned_to,
      flagged, hidden, source, created_at, updated_at, synced_at, last_actor, sla_due_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    JSON.stringify(payload),
    status,
    severity,
    type,
    region,
    district,
    community,
    assignedTo,
    flagged,
    hidden,
    source,
    createdAt,
    stamp,
    stamp,
    actor ? actor.username : "anonymous",
    slaDueAt(severity, createdAt)
  );
  storeReportLocation(id, location, stamp);
  if (assignToAuthor) db.prepare("UPDATE reports SET assignment_user_id = ?, assignment_state = 'accepted', accepted_at = ?, accepted_by = ? WHERE id = ?").run(actor.id, stamp, actor.id, id);
  db.prepare(`
    INSERT INTO report_history (id, report_id, from_status, to_status, public_update, private_note, actor_user_id, created_at)
    VALUES (?, ?, '', ?, ?, '', ?, ?)
  `).run(crypto.randomUUID(), id, status, "Field report added", actor && actor.id ? actor.id : null, stamp);
  logAudit(actor, "report_synced_create", "report", id, { status, source }, req);
  return { action: "created", report: responderReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(id)) };
}

function listReports(actor, query) {
  const limit = Math.min(Number(query.get("limit") || 500), 1000);
  const queue = sanitizeText(query.get("queue") || "institutional", 40).toLowerCase();
  const status = sanitizeText(query.get("status"), 60).toLowerCase();
  const category = sanitizeText(query.get("category"), 100).toLowerCase();
  const overdueOnly = query.get("overdue") === "1";
  if (queue === "review" && !canModerate(actor)) throw Object.assign(new Error("Moderator access required"), { statusCode: 403 });
  const rows = db.prepare("SELECT * FROM reports ORDER BY updated_at DESC LIMIT ?").all(limit);
  const list = rows
    .filter((row) => reportVisibleToActor(actor, row))
    .filter((row) => queue !== "review" || isAwaitingReview(row))
    .filter((row) => queue !== "assigned" || Number(row.assignment_user_id) === Number(actor.id))
    .filter((row) => queue !== "unassigned" || !row.assignment_user_id)
    .filter((row) => queue !== "escalated" || row.status === "Escalated")
    .filter((row) => !status || String(row.status || "").toLowerCase() === status)
    .filter((row) => !category || String(row.type || "").toLowerCase() === category)
    .filter((row) => !overdueOnly || Boolean(row.sla_due_at && row.sla_due_at < nowIso() && !["Resolved", "Rejected"].includes(row.status)))
    .map(responderListReport);
  // The review queue puts immediate danger and Critical reports first, then the ones waiting longest.
  if (queue === "review") list.sort((left, right) => Number(isUrgentReport(right)) - Number(isUrgentReport(left)) || String(left.createdAt).localeCompare(String(right.createdAt)));
  return list;
}

// A report waits for moderator review until it is verified for public view, hidden or rejected.
function isAwaitingReview(row) {
  return !Number(row.public_verified) && !Number(row.hidden) && row.status !== "Rejected";
}

function isUrgentReport(report) {
  return Boolean(report.immediateDanger) || String(report.severity || "").toLowerCase() === "critical";
}

// Contact details and exact locations are never sent in staff lists: only on the case page (responderCaseDetail).
const PRIVATE_REPORT_KEYS = ["contact", "trustedContact", "coordinates", "digitalAddress", "exactLatitude", "exactLongitude", "accuracyMetres", "googlePlaceId"];

function responderListReport(row) {
  const report = responderReport(row);
  const hasContact = Boolean(report.contact || report.trustedContact);
  const hasExactLocation = Boolean(report.location && report.location.exactLatitude !== null && report.location.exactLatitude !== undefined);
  for (const key of PRIVATE_REPORT_KEYS) delete report[key];
  report.location = publicLocationForReport(row.id);
  return { ...report, hasContact, hasExactLocation, routedOffice: routedOfficeName(row.id) };
}

// Reporter contact details: moderators, admins and the responder the case is assigned to. Exact location: any staff
// member whose area covers the report (checked by reportInActorScope before this is called).
function canSeeReporterContact(actor, row) {
  return canModerate(actor) || Number(row.assignment_user_id || 0) === Number(actor.id);
}

function responderCaseDetail(reportId, actor, req) {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!row || (Number(row.hidden) && !canModerate(actor))) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  if (!reportVisibleToActor(actor, row)) throw Object.assign(new Error("This report has not been routed to your office"), { statusCode: 403 });
  const report = responderReport(row);
  const contactAllowed = canSeeReporterContact(actor, row);
  const hasContact = Boolean(report.contact || report.trustedContact);
  if (!contactAllowed) { delete report.contact; delete report.trustedContact; }
  logAudit(actor, "case_viewed", "report", reportId, { contactShown: contactAllowed && hasContact }, req);
  return { ...report, hasContact, contactAccess: contactAllowed ? "shown" : "assigned-or-moderator-only", awaitingReview: isAwaitingReview(row), routePreview: routePreview(row), routedOffice: routedOfficeName(row.id) };
}

// Counts for the staff home screen, all from the database for this account's area.
function staffSummary(actor) {
  const count = (queue, extra = {}) => listReports(actor, new URLSearchParams({ queue, ...extra })).length;
  const review = canModerate(actor) ? listReports(actor, new URLSearchParams({ queue: "review" })) : null;
  return {
    review: review ? review.length : null,
    urgentReview: review ? review.filter(isUrgentReport).length : null,
    assigned: count("assigned"),
    area: count("institutional"),
    overdue: count("institutional", { overdue: "1" }),
    escalated: count("escalated")
  };
}

function listAssignableResponders(actor, reportId = "") {
  const report = reportId ? db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId) : null;
  if (report && !reportVisibleToActor(actor, report)) throw Object.assign(new Error("This report has not been routed to your office"), { statusCode: 403 });
  return db.prepare("SELECT * FROM users WHERE status = 'active' ORDER BY name ASC").all()
    .filter((candidate) => isResponder(candidate) && (!report || reportInActorScope(candidate, report)))
    .filter((candidate) => canModerate(actor) || canonicalScopeLabel(candidate.agency) === canonicalScopeLabel(actor.agency))
    .map(publicUser);
}

function validateResponderTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return;
  const allowed = {
    Open: ["Acknowledged", "In Progress", "Blocked", "Escalated"],
    Acknowledged: ["Dispatched", "In Progress", "Blocked", "Escalated"],
    Dispatched: ["In Progress", "Blocked", "Escalated"],
    "In Progress": ["Blocked", "Resolved", "Escalated"],
    Blocked: ["In Progress", "Escalated"],
    Escalated: ["In Progress", "Blocked", "Resolved"],
    Reopened: ["Acknowledged", "In Progress", "Escalated"],
    Resolved: []
  };
  if (!(allowed[fromStatus] || []).includes(toStatus)) {
    throw Object.assign(new Error(`Status cannot move from ${fromStatus} to ${toStatus}`), { statusCode: 409 });
  }
}

function createResponderEvidence(reportId, body, actor, req) {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!row) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  if (!reportVisibleToActor(actor, row)) throw Object.assign(new Error("Report is outside your permitted area"), { statusCode: 403 });
  if (!canActOnAssignedReport(actor, row)) throw Object.assign(new Error("Accept or receive assignment before adding field evidence"), { statusCode: 403 });
  const clientAttachmentId = sanitizeText(body.clientAttachmentId, 80).toLowerCase();
  const encoded = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
  const claimedMime = sanitizeText(body.mimeType, 80).toLowerCase();
  const originalName = sanitizeText(body.fileName || "field-evidence", 160);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(clientAttachmentId)) {
    throw Object.assign(new Error("A valid client evidence ID is required"), { statusCode: 400 });
  }
  if (!encoded || encoded.length > 1_100_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw Object.assign(new Error("Evidence data is invalid or too large"), { statusCode: 400 });
  }
  const bytes = Buffer.from(encoded, "base64");
  const detected = detectImageType(bytes);
  if (!bytes.length || bytes.length > 750_000 || !detected || (claimedMime && claimedMime !== detected.mime)) {
    throw Object.assign(new Error("Evidence must be a valid JPEG, PNG, or WebP image no larger than 750 KB"), { statusCode: 400 });
  }
  const payloadHash = sha256(bytes);
  const existing = db.prepare("SELECT * FROM responder_evidence WHERE report_id = ? AND actor_user_id = ? AND client_attachment_id = ?")
    .get(reportId, actor.id, clientAttachmentId);
  if (existing) {
    if (existing.payload_hash !== payloadHash) throw Object.assign(new Error("Evidence ID has already been used with different data"), { statusCode: 409 });
    return { evidence: responderOperationalState(row).evidence.find((item) => item.id === existing.id), alreadyUploaded: true };
  }
  const id = crypto.randomUUID();
  const storageName = `${crypto.randomUUID().replaceAll("-", "")}.${detected.extension}`;
  const storagePath = path.join(ATTACHMENT_QUARANTINE_DIR, storageName);
  fs.writeFileSync(storagePath, bytes, { flag: "wx", mode: 0o600 });
  try {
    db.prepare(`
      INSERT INTO responder_evidence (
        id, report_id, actor_user_id, client_attachment_id, storage_name, original_name,
        detected_mime, byte_size, payload_hash, quarantine_state, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, reportId, actor.id, clientAttachmentId, storageName, originalName, detected.mime, bytes.length, payloadHash, nowIso());
  } catch (error) {
    try { fs.unlinkSync(storagePath); } catch {}
    throw error;
  }
  logAudit(actor, "responder_evidence_quarantined", "report", reportId, { evidenceId: id, detectedMime: detected.mime, byteSize: bytes.length }, req);
  return { evidence: responderOperationalState(row).evidence.find((item) => item.id === id), alreadyUploaded: false };
}

function reviewResponderEvidence(evidenceId, body, actor, req) {
  const evidence = db.prepare(`SELECT responder_evidence.*, reports.region, reports.district FROM responder_evidence
    JOIN reports ON reports.id = responder_evidence.report_id WHERE responder_evidence.id = ?`).get(evidenceId);
  if (!evidence) throw Object.assign(new Error("Responder evidence not found"), { statusCode: 404 });
  if (!reportInActorScope(actor, evidence)) throw Object.assign(new Error("Evidence is outside your permitted area"), { statusCode: 403 });
  const action = sanitizeText(body.action, 20).toLowerCase();
  if (!new Set(["clean", "rejected"]).has(action)) throw Object.assign(new Error("Evidence review must be clean or rejected"), { statusCode: 400 });
  const note = sanitizeText(body.note, 500);
  if (!note) throw Object.assign(new Error("An evidence scan or review note is required"), { statusCode: 400 });
  const stamp = nowIso();
  db.prepare("UPDATE responder_evidence SET quarantine_state = ?, scan_result = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?")
    .run(action, note, actor.id, stamp, evidenceId);
  logAudit(actor, `responder_evidence_${action}`, "report", evidence.report_id, { evidenceId }, req);
  return responderReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(evidence.report_id));
}

function stripJpegMetadata(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw Object.assign(new Error("Photo is not a valid JPEG"), { statusCode: 400 });
  const kept = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw Object.assign(new Error("Photo structure could not be read safely"), { statusCode: 400 });
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      kept.push(bytes.subarray(offset));
      return Buffer.concat(kept);
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) throw Object.assign(new Error("Photo structure could not be read safely"), { statusCode: 400 });
    const isAppSegment = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isAppSegment && !isComment) kept.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  throw Object.assign(new Error("Photo has no image data"), { statusCode: 400 });
}

function stripPngMetadata(bytes) {
  const allowed = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "gAMA", "cHRM", "sRGB", "pHYs", "sBIT", "bKGD"]);
  const kept = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    const end = offset + 12 + length;
    if (end > bytes.length) throw Object.assign(new Error("Photo structure could not be read safely"), { statusCode: 400 });
    if (allowed.has(type)) kept.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") return Buffer.concat(kept);
  }
  throw Object.assign(new Error("Photo has no image end marker"), { statusCode: 400 });
}

function stripWebpMetadata(bytes) {
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.subarray(offset, offset + 4).toString("latin1");
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (offset + 8 + length > bytes.length) throw Object.assign(new Error("Photo structure could not be read safely"), { statusCode: 400 });
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = Buffer.from(bytes.subarray(offset, Math.min(end, bytes.length)));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

function stripImageMetadata(bytes, mime) {
  if (mime === "image/jpeg") return stripJpegMetadata(bytes);
  if (mime === "image/png") return stripPngMetadata(bytes);
  if (mime === "image/webp") return stripWebpMetadata(bytes);
  throw Object.assign(new Error("Only JPEG, PNG and WebP photos can be published"), { statusCode: 400 });
}

function activePublicImages(reportId) {
  return db.prepare(`
    SELECT id FROM public_report_images
    WHERE report_id = ? AND withdrawn_at IS NULL
    ORDER BY approved_at ASC
    LIMIT ?
  `).all(reportId, PUBLIC_IMAGES_PER_REPORT).map((image) => ({
    id: image.id,
    url: `/api/public/images/${encodeURIComponent(image.id)}`,
    alt: "Moderator-approved photo of this report"
  }));
}

function setPublicImageState(reportId, attachmentId, body, actor, req) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!report) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  if (!reportInActorScope(actor, report)) throw Object.assign(new Error("Report is outside your permitted area"), { statusCode: 403 });
  const attachment = db.prepare("SELECT * FROM report_attachments WHERE id = ? AND report_id = ?").get(attachmentId, reportId);
  if (!attachment) throw Object.assign(new Error("Photo not found on this report"), { statusCode: 404 });
  const action = sanitizeText(body.action, 20).toLowerCase();
  const note = sanitizeText(body.note, 500);
  const active = db.prepare("SELECT * FROM public_report_images WHERE attachment_id = ? AND withdrawn_at IS NULL").get(attachmentId);
  const stamp = nowIso();

  if (action === "withdraw") {
    if (!active) return { images: activePublicImages(reportId), changed: false };
    withdrawPublicImage(active, actor, req, "moderator-withdrawal");
    return { images: activePublicImages(reportId), changed: true };
  }

  if (action !== "approve") throw Object.assign(new Error("Choose approve or withdraw"), { statusCode: 400 });
  if (active) return { images: activePublicImages(reportId), changed: false };
  if (!note) throw Object.assign(new Error("A public photo review note is required"), { statusCode: 400 });
  if (body.privacyChecked !== true) throw Object.assign(new Error("Confirm that no faces, number plates, house numbers or other identifying details are visible"), { statusCode: 400 });
  if (attachment.quarantine_state !== "clean") throw Object.assign(new Error("Mark the photo clean after review before publishing it"), { statusCode: 409 });
  if (Number(report.public_verified) !== 1 || Number(report.hidden) === 1 || Number(report.flagged) === 1) {
    throw Object.assign(new Error("Approve the report for public view before publishing a photo"), { statusCode: 409 });
  }
  const count = db.prepare("SELECT COUNT(*) AS count FROM public_report_images WHERE report_id = ? AND withdrawn_at IS NULL").get(reportId).count;
  if (Number(count) >= PUBLIC_IMAGES_PER_REPORT) throw Object.assign(new Error(`A report can show at most ${PUBLIC_IMAGES_PER_REPORT} public photos`), { statusCode: 409 });

  const privatePath = path.join(ATTACHMENT_QUARANTINE_DIR, attachment.storage_name);
  if (!privatePath.startsWith(`${ATTACHMENT_QUARANTINE_DIR}${path.sep}`) || !fs.existsSync(privatePath)) {
    throw Object.assign(new Error("Private photo file is unavailable"), { statusCode: 404 });
  }
  const original = fs.readFileSync(privatePath);
  const detected = detectImageType(original);
  const mime = detected ? detected.mime : "";
  if (!mime || mime !== attachment.detected_mime) throw Object.assign(new Error("Photo type does not match its recorded type"), { statusCode: 409 });
  const cleaned = stripImageMetadata(original, mime);
  const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[mime];
  const publicId = crypto.randomUUID();
  const storageName = `${crypto.randomUUID()}${extension}`;
  fs.writeFileSync(path.join(PUBLIC_IMAGE_DIR, storageName), cleaned, { mode: 0o640 });
  db.prepare(`
    INSERT INTO public_report_images (id, report_id, attachment_id, storage_name, detected_mime, byte_size, review_note, approved_by, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(publicId, reportId, attachmentId, storageName, mime, cleaned.length, note, actor.id, stamp);
  logAudit(actor, "public_image_approved", "report", reportId, { attachmentId, publicImageId: publicId, metadataStripped: true }, req);
  return { images: activePublicImages(reportId), changed: true };
}

function withdrawPublicImage(image, actor, req, reason) {
  db.prepare("UPDATE public_report_images SET withdrawn_at = ?, withdrawn_by = ? WHERE id = ? AND withdrawn_at IS NULL").run(nowIso(), actor.id, image.id);
  const publicPath = path.join(PUBLIC_IMAGE_DIR, image.storage_name);
  if (publicPath.startsWith(`${PUBLIC_IMAGE_DIR}${path.sep}`)) fs.rmSync(publicPath, { force: true });
  logAudit(actor, "public_image_withdrawn", "report", image.report_id, { attachmentId: image.attachment_id, publicImageId: image.id, reason }, req);
}

function sendPublicImage(req, res, imageId) {
  const image = db.prepare(`
    SELECT public_report_images.* FROM public_report_images
    JOIN reports ON reports.id = public_report_images.report_id
    WHERE public_report_images.id = ? AND public_report_images.withdrawn_at IS NULL
      AND reports.public_verified = 1 AND reports.hidden = 0 AND reports.flagged = 0
  `).get(imageId);
  const filePath = image ? path.join(PUBLIC_IMAGE_DIR, image.storage_name) : "";
  if (!image || !filePath.startsWith(`${PUBLIC_IMAGE_DIR}${path.sep}`) || !fs.existsSync(filePath)) {
    return send(req, res, 404, { ok: false, error: "Public photo not found" });
  }
  const bytes = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": image.detected_mime,
    "Content-Length": bytes.length,
    "Cache-Control": "public, max-age=600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer"
  });
  res.end(bytes);
}

function reviewCitizenAttachment(attachmentId, body, actor, req) {
  const attachment = db.prepare(`SELECT report_attachments.*, reports.region, reports.district FROM report_attachments
    JOIN reports ON reports.id = report_attachments.report_id WHERE report_attachments.id = ?`).get(attachmentId);
  if (!attachment) throw Object.assign(new Error("Citizen attachment not found"), { statusCode: 404 });
  if (!reportInActorScope(actor, attachment)) throw Object.assign(new Error("Attachment is outside your permitted area"), { statusCode: 403 });
  const action = sanitizeText(body.action, 20).toLowerCase();
  const note = sanitizeText(body.note, 500);
  if (!new Set(["clean", "rejected"]).has(action) || !note) throw Object.assign(new Error("Attachment review requires a clean or rejected outcome and note"), { statusCode: 400 });
  db.prepare("UPDATE report_attachments SET quarantine_state = ?, scan_result = ?, updated_at = ? WHERE id = ?")
    .run(action, note, nowIso(), attachmentId);
  logAudit(actor, `citizen_attachment_${action}`, "report", attachment.report_id, { attachmentId }, req);
  if (action === "rejected") {
    const published = db.prepare("SELECT * FROM public_report_images WHERE attachment_id = ? AND withdrawn_at IS NULL").get(attachmentId);
    if (published) withdrawPublicImage(published, actor, req, "attachment-rejected");
  }
  return responderReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(attachment.report_id));
}

async function queueUploadScan(kind, attachmentId, reportId = "") {
  if (!UPLOAD_SCAN_WEBHOOK_URL) return { configured: false, queued: false };
  let provider;
  try { provider = new URL(UPLOAD_SCAN_WEBHOOK_URL); } catch { throw Object.assign(new Error("Upload scanner webhook configuration is invalid"), { statusCode: 503 }); }
  const localDevelopment = APP_ENV !== "production" && ["127.0.0.1", "localhost"].includes(provider.hostname);
  if (provider.protocol !== "https:" && !(provider.protocol === "http:" && localDevelopment)) {
    throw Object.assign(new Error("Upload scanner webhook must use HTTPS"), { statusCode: 503 });
  }
  const response = await fetch(provider, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(UPLOAD_SCAN_AUTH_TOKEN ? { Authorization: `Bearer ${UPLOAD_SCAN_AUTH_TOKEN}` } : {}) },
    body: JSON.stringify({ kind, attachmentId, reportId, callbackRequired: true })
  });
  if (!response.ok) throw Object.assign(new Error("Upload scanner did not accept the quarantine job"), { statusCode: 502 });
  if (kind === "citizen") db.prepare("UPDATE report_attachments SET scan_result = 'scanner-queued', updated_at = ? WHERE id = ?").run(nowIso(), attachmentId);
  else db.prepare("UPDATE responder_evidence SET scan_result = 'scanner-queued' WHERE id = ?").run(attachmentId);
  return { configured: true, queued: true };
}

function attachmentRecord(attachmentId) {
  const citizen = db.prepare(`SELECT id, report_id, storage_name, original_name, detected_mime, byte_size, quarantine_state
    FROM report_attachments WHERE id = ? AND report_id IS NOT NULL`).get(attachmentId);
  if (citizen) return { ...citizen, kind: "citizen" };
  const responder = db.prepare(`SELECT id, report_id, storage_name, original_name, detected_mime, byte_size, quarantine_state
    FROM responder_evidence WHERE id = ?`).get(attachmentId);
  return responder ? { ...responder, kind: "responder" } : null;
}

function signedAttachmentPath(reportId, attachmentId, actor) {
  if (!ATTACHMENT_SIGNING_SECRET) throw Object.assign(new Error("Private attachment signing is not configured"), { statusCode: 503 });
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  const attachment = attachmentRecord(attachmentId);
  if (!report || !attachment || attachment.report_id !== reportId) throw Object.assign(new Error("Private attachment not found"), { statusCode: 404 });
  if (!reportVisibleToActor(actor, report)) throw Object.assign(new Error("Attachment is outside your permitted area"), { statusCode: 403 });
  if (attachment.quarantine_state === "rejected") throw Object.assign(new Error("Rejected evidence cannot be accessed"), { statusCode: 403 });
  const expires = Math.floor(Date.now() / 1000) + 300;
  const payload = `${attachmentId}.${expires}.${actor.id}`;
  const signature = crypto.createHmac("sha256", ATTACHMENT_SIGNING_SECRET).update(payload).digest("base64url");
  return { url: `/api/private/attachments/${encodeURIComponent(attachmentId)}?expires=${expires}&actor=${actor.id}&signature=${signature}`, expiresAt: new Date(expires * 1000).toISOString(), state: attachment.quarantine_state };
}

function verifySignedAttachment(attachmentId, query) {
  if (!ATTACHMENT_SIGNING_SECRET) throw Object.assign(new Error("Private attachment signing is not configured"), { statusCode: 503 });
  const expires = Number(query.get("expires"));
  const actorId = Number(query.get("actor"));
  const signature = String(query.get("signature") || "");
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 600 || !actorId || !signature) {
    throw Object.assign(new Error("Private attachment link is invalid or expired"), { statusCode: 403 });
  }
  const expected = crypto.createHmac("sha256", ATTACHMENT_SIGNING_SECRET).update(`${attachmentId}.${expires}.${actorId}`).digest("base64url");
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) {
    throw Object.assign(new Error("Private attachment link is invalid or expired"), { statusCode: 403 });
  }
  const actor = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(actorId);
  const attachment = attachmentRecord(attachmentId);
  const report = attachment ? db.prepare("SELECT * FROM reports WHERE id = ?").get(attachment.report_id) : null;
  if (!actor || !attachment || !report || !reportVisibleToActor(actor, report) || attachment.quarantine_state === "rejected") {
    throw Object.assign(new Error("Private attachment is unavailable"), { statusCode: 403 });
  }
  return attachment;
}

function responderFieldAction(reportId, body, actor, req) {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!row) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  if (!reportVisibleToActor(actor, row)) throw Object.assign(new Error("Report is outside your permitted area"), { statusCode: 403 });
  const action = sanitizeText(body.action, 30).toLowerCase();
  if (!new Set(["accept", "assign", "reassign", "escalate"]).has(action)) throw Object.assign(new Error("Unsupported field action"), { statusCode: 400 });
  const actionKey = sanitizeText(body.actionKey, 80).toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(actionKey)) {
    throw Object.assign(new Error("A valid action key is required"), { statusCode: 400 });
  }
  const publicUpdate = sanitizeText(body.publicUpdate, 1000);
  const privateNote = sanitizeText(body.privateNote, 1000);
  if (!publicUpdate) throw Object.assign(new Error("A public update is required for every field action"), { statusCode: 400 });
  const reason = sanitizeText(body.reason, 1000);
  const target = sanitizeText(body.target, 160);
  const targetUserId = Number(body.targetUserId || 0);
  const actionHash = sha256(JSON.stringify({ reportId, action, targetUserId, publicUpdate, privateNote, reason, target }));
  const previousAction = db.prepare("SELECT * FROM responder_action_keys WHERE action_key = ?").get(actionKey);
  if (previousAction) {
    if (previousAction.report_id !== reportId || previousAction.actor_user_id !== actor.id || previousAction.payload_hash !== actionHash) {
      throw Object.assign(new Error("Action key has already been used with different data"), { statusCode: 409 });
    }
    return responderReport(row);
  }

  let assignee = null;
  let nextStatus = row.status;
  let assignmentAction = "";
  if (action === "accept") {
    if (row.assignment_user_id && Number(row.assignment_user_id) !== Number(actor.id)) {
      throw Object.assign(new Error("This case is assigned to another responder"), { statusCode: 409 });
    }
    assignee = actor;
    assignmentAction = "accepted";
    if (row.status === "Open" || row.status === "Reopened") nextStatus = "Acknowledged";
  } else if (action === "assign" || action === "reassign") {
    if (!canAssignCases(actor)) throw Object.assign(new Error("A lead, supervisor, moderator, or administrator role is required to assign cases"), { statusCode: 403 });
    assignee = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(targetUserId);
    if (!assignee || !reportInActorScope(assignee, row)) throw Object.assign(new Error("The selected responder is not active in this case scope"), { statusCode: 400 });
    if (!canModerate(actor) && canonicalScopeLabel(assignee.agency) !== canonicalScopeLabel(actor.agency)) {
      throw Object.assign(new Error("Case leads may assign only within their institution"), { statusCode: 403 });
    }
    assignmentAction = row.assignment_user_id ? "reassigned" : "assigned";
  } else {
    if (!canActOnAssignedReport(actor, row)) throw Object.assign(new Error("Only the assigned responder or a moderator may escalate this case"), { statusCode: 403 });
    if (!reason) throw Object.assign(new Error("An escalation reason is required"), { statusCode: 400 });
    nextStatus = "Escalated";
  }
  validateResponderTransition(row.status, nextStatus);
  const stamp = nowIso();
  const payload = safeJsonParse(row.payload_json, {});
  db.exec("BEGIN IMMEDIATE");
  try {
    if (assignmentAction) {
      db.prepare(`UPDATE reports SET assignment_user_id = ?, assignment_state = 'accepted', accepted_at = ?, accepted_by = ?,
        assigned_to = ?, status = ?, payload_json = ?, updated_at = ?, last_actor = ? WHERE id = ?`)
        .run(assignee.id, stamp, actor.id, assignee.name, nextStatus,
          JSON.stringify({ ...payload, status: nextStatus, assignedTo: assignee.name, updatedAt: stamp, lastActor: actor.username }),
          stamp, actor.username, reportId);
      db.prepare(`INSERT INTO report_assignments (id, report_id, from_user_id, to_user_id, action, actor_user_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), reportId, row.assignment_user_id || null, assignee.id, assignmentAction, actor.id, privateNote, stamp);
    } else {
      db.prepare(`UPDATE reports SET status = 'Escalated', escalated_at = ?, escalation_reason = ?, payload_json = ?, updated_at = ?, last_actor = ? WHERE id = ?`)
        .run(stamp, reason, JSON.stringify({ ...payload, status: "Escalated", updatedAt: stamp, lastActor: actor.username }), stamp, actor.username, reportId);
      db.prepare(`INSERT INTO report_escalations (id, report_id, reason, target, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), reportId, reason, target, actor.id, stamp);
    }
    db.prepare(`INSERT INTO report_history (id, report_id, from_status, to_status, public_update, private_note, actor_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), reportId, row.status, nextStatus, publicUpdate, privateNote || (action === "escalate" ? reason : ""), actor.id, stamp);
    db.prepare(`INSERT INTO report_updates (id, report_id, status, public_note, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), reportId, nextStatus, publicUpdate, actor.id, stamp);
    db.prepare("INSERT INTO responder_action_keys (action_key, report_id, actor_user_id, payload_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(actionKey, reportId, actor.id, actionHash, stamp);
    logAudit(actor, `report_${action}`, "report", reportId, { targetUserId: assignee?.id || null, hasPrivateNote: Boolean(privateNote), hasReason: Boolean(reason) }, req);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
  return responderReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId));
}

const ADMIN_DIRECTORY_KINDS = new Set([
  "agency", "region", "mmda", "jurisdiction", "category", "subcategory",
  "contact-channel", "escalation-path", "response-target", "role-scope",
  "retention-policy", "emergency-info", "environment-control"
]);

function adminDirectoryItem(row) {
  return row ? {
    id: row.id,
    kind: row.kind,
    name: row.name,
    parentId: row.parent_id || "",
    configuration: safeJsonParse(row.payload_json, {}),
    active: Boolean(row.active),
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } : null;
}

function routingRule(row) {
  return row ? {
    id: row.id,
    name: row.name,
    category: row.category || "",
    region: row.region || "",
    district: row.district || "",
    agencyId: row.agency_id,
    responseTargetId: row.response_target_id || "",
    escalationPathId: row.escalation_path_id || "",
    priority: Number(row.priority || 100),
    ruleVersion: row.rule_version,
    rationale: row.rationale,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } : null;
}

function adminConfiguration() {
  const items = db.prepare("SELECT * FROM admin_directory_items ORDER BY kind, name").all().map(adminDirectoryItem);
  const rules = db.prepare("SELECT * FROM routing_rules ORDER BY priority ASC, name ASC").all().map(routingRule);
  const invitations = db.prepare(`SELECT id, contact, agency, role, region, district, status, expires_at, created_at, accepted_at
    FROM responder_invitations ORDER BY created_at DESC LIMIT 500`).all().map((row) => ({
    id: row.id,
    contact: row.contact,
    agency: row.agency,
    role: row.role,
    region: row.region || "",
    district: row.district || "",
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at || ""
  }));
  const boundaries = db.prepare("SELECT version, publisher, source_url, source_date, licence, licence_status, feature_count, active, installed_at FROM boundary_datasets ORDER BY installed_at DESC").all()
    .map((row) => ({ version: row.version, publisher: row.publisher, sourceUrl: row.source_url, sourceDate: row.source_date, licence: row.licence, licenceStatus: row.licence_status, featureCount: row.feature_count, active: Boolean(row.active), installedAt: row.installed_at }));
  return { items, rules, invitations, boundaries, emergency: getEmergencyContactConfig() };
}

function upsertAdminDirectoryItem(body, actor, req) {
  const id = sanitizeText(body.id || crypto.randomUUID(), 80);
  const kind = sanitizeText(body.kind, 40).toLowerCase();
  const name = sanitizeText(body.name, 160);
  const parentId = sanitizeText(body.parentId, 80) || null;
  const configuration = body.configuration && typeof body.configuration === "object" ? body.configuration : {};
  if (!ADMIN_DIRECTORY_KINDS.has(kind) || !name) throw Object.assign(new Error("A supported configuration kind and name are required"), { statusCode: 400 });
  if (parentId && !db.prepare("SELECT id FROM admin_directory_items WHERE id = ?").get(parentId)) throw Object.assign(new Error("Configuration parent was not found"), { statusCode: 400 });
  if (kind === "retention-policy" && (!Number.isInteger(Number(configuration.days)) || Number(configuration.days) < 1)) {
    throw Object.assign(new Error("A retention policy must define a positive number of days"), { statusCode: 400 });
  }
  if (kind === "environment-control" && /production/i.test(name) && configuration.demoEnabled === true) {
    throw Object.assign(new Error("Demo data cannot be enabled in a production environment control"), { statusCode: 400 });
  }
  const stamp = nowIso();
  const existing = db.prepare("SELECT * FROM admin_directory_items WHERE id = ?").get(id);
  db.prepare(`
    INSERT INTO admin_directory_items (id, kind, name, parent_id, payload_json, active, version, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, parent_id = excluded.parent_id,
      payload_json = excluded.payload_json, active = excluded.active, version = admin_directory_items.version + 1,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(id, kind, name, parentId, JSON.stringify(configuration), body.active === false ? 0 : 1, actor.id, actor.id, stamp, stamp);
  logAudit(actor, existing ? "admin_directory_updated" : "admin_directory_created", "admin_directory_item", id, { kind, name }, req);
  return adminDirectoryItem(db.prepare("SELECT * FROM admin_directory_items WHERE id = ?").get(id));
}

function upsertRoutingRule(body, actor, req) {
  const id = sanitizeText(body.id || crypto.randomUUID(), 80);
  const name = sanitizeText(body.name, 160);
  const agencyId = sanitizeText(body.agencyId, 80);
  const agency = db.prepare("SELECT * FROM admin_directory_items WHERE id = ? AND kind = 'agency' AND active = 1").get(agencyId);
  if (!name || !agency) throw Object.assign(new Error("A rule name and active agency are required"), { statusCode: 400 });
  for (const [field, kind] of [["responseTargetId", "response-target"], ["escalationPathId", "escalation-path"]]) {
    const value = sanitizeText(body[field], 80);
    if (value && !db.prepare("SELECT id FROM admin_directory_items WHERE id = ? AND kind = ? AND active = 1").get(value, kind)) {
      throw Object.assign(new Error(`The selected ${kind} is not active`), { statusCode: 400 });
    }
  }
  const stamp = nowIso();
  const existing = db.prepare("SELECT id FROM routing_rules WHERE id = ?").get(id);
  const ruleVersion = sanitizeText(body.ruleVersion || `rule-${stamp.slice(0, 10)}`, 80);
  const rationale = sanitizeText(body.rationale, 1000);
  if (!rationale) throw Object.assign(new Error("A plain-language routing rationale is required"), { statusCode: 400 });
  db.prepare(`
    INSERT INTO routing_rules (id, name, category, region, district, agency_id, response_target_id, escalation_path_id,
      priority, rule_version, rationale, active, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, region = excluded.region,
      district = excluded.district, agency_id = excluded.agency_id, response_target_id = excluded.response_target_id,
      escalation_path_id = excluded.escalation_path_id, priority = excluded.priority, rule_version = excluded.rule_version,
      rationale = excluded.rationale, active = excluded.active, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(id, name, sanitizeText(body.category, 100), sanitizeText(body.region, 80), sanitizeText(body.district, 120), agencyId,
    sanitizeText(body.responseTargetId, 80) || null, sanitizeText(body.escalationPathId, 80) || null,
    Math.max(1, Math.min(Number(body.priority) || 100, 10000)), ruleVersion, rationale, body.active === false ? 0 : 1,
    actor.id, actor.id, stamp, stamp);
  logAudit(actor, existing ? "routing_rule_updated" : "routing_rule_created", "routing_rule", id, { ruleVersion, agencyId }, req);
  return routingRule(db.prepare("SELECT * FROM routing_rules WHERE id = ?").get(id));
}

function createResponderInvitation(body, actor, req) {
  const contact = sanitizeText(body.contact, 160);
  const agency = sanitizeText(body.agency, 160);
  const role = sanitizeText(body.role, 80);
  if (!contact || !agency || !role) throw Object.assign(new Error("Invitation contact, agency, and role are required"), { statusCode: 400 });
  const inviteCode = crypto.randomBytes(32).toString("base64url");
  const id = crypto.randomUUID();
  const stamp = nowIso();
  const expiresDays = Math.max(1, Math.min(Number(body.expiresDays) || 7, 30));
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO responder_invitations (id, invite_hash, contact, agency, role, region, district, expires_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, sha256(inviteCode), contact, agency, role, sanitizeText(body.region, 80), sanitizeText(body.district, 120), expiresAt, actor.id, stamp);
  logAudit(actor, "responder_invitation_created", "responder_invitation", id, { agency, role, expiresAt }, req);
  return { invitation: { id, contact, agency, role, region: sanitizeText(body.region, 80), district: sanitizeText(body.district, 120), status: "pending", expiresAt, createdAt: stamp }, inviteCode };
}

function acceptResponderInvitation(body, req) {
  const inviteCode = String(body.inviteCode || "");
  const invitation = inviteCode ? db.prepare("SELECT * FROM responder_invitations WHERE invite_hash = ?").get(sha256(inviteCode)) : null;
  if (!invitation || invitation.status !== "pending" || invitation.expires_at <= nowIso()) {
    throw Object.assign(new Error("The responder invitation is invalid or expired"), { statusCode: 400 });
  }
  const user = insertUser({
    username: body.username,
    password: body.password,
    role: invitation.role,
    name: body.name,
    phone: body.phone || invitation.contact,
    email: body.email || "",
    agency: invitation.agency,
    region: invitation.region,
    district: invitation.district,
    mustChangePassword: false
  });
  const stamp = nowIso();
  db.prepare("UPDATE responder_invitations SET status = 'accepted', accepted_by = ?, accepted_at = ? WHERE id = ?")
    .run(user.id, stamp, invitation.id);
  logAudit(user, "responder_invitation_accepted", "responder_invitation", invitation.id, {}, req);
  return publicUser(user);
}

function routeRecommendation(reportId, actor, req) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!report) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  if (!reportVisibleToActor(actor, report)) throw Object.assign(new Error("Report is outside your permitted area"), { statusCode: 403 });
  const rule = matchRoutingRule(report);
  if (!rule) throw Object.assign(new Error("No active routing rule matches this report; an administrator must review configuration"), { statusCode: 404 });
  recordRoutingRecommendation(reportId, rule, actor, req);
  return routingState(reportId);
}

function recordRoutingRecommendation(reportId, rule, actor, req) {
  const id = crypto.randomUUID();
  const stamp = nowIso();
  db.prepare(`INSERT INTO routing_recommendations (
    id, report_id, rule_id, rule_version, agency_id, response_target_id, rationale,
    recommendation_state, engine_type, model_version, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'recommended', 'rules', '', ?, ?)`)
    .run(id, reportId, rule.id, rule.rule_version, rule.agency_id, rule.response_target_id, rule.rationale, actor.id, stamp);
  logAudit(actor, "routing_recommended", "report", reportId, { recommendationId: id, ruleId: rule.id, ruleVersion: rule.rule_version, agencyId: rule.agency_id }, req);
}

// After a moderator verifies or escalates: route the report to the office the active rules choose, unless it was
// routed already. Returns the office name, or "" when no rule matches (then only moderators and admins can see it).
function routeAfterModeration(reportId, actor, req) {
  const existing = routedOfficeName(reportId);
  if (existing) return existing;
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  const rule = report ? matchRoutingRule(report) : null;
  if (!rule) return "";
  recordRoutingRecommendation(reportId, rule, actor, req);
  return routedOfficeName(reportId);
}

function matchRoutingRule(report) {
  const rules = db.prepare("SELECT * FROM routing_rules WHERE active = 1 ORDER BY priority ASC, updated_at DESC").all();
  const candidates = rules.filter((rule) =>
    (!rule.category || canonicalScopeLabel(rule.category) === canonicalScopeLabel(report.type)) &&
    (!rule.region || canonicalScopeLabel(rule.region) === canonicalScopeLabel(report.region)) &&
    (!rule.district || canonicalScopeLabel(rule.district) === canonicalScopeLabel(report.district))
  );
  if (!candidates.length) return null;
  candidates.sort((left, right) => {
    const specificity = (rule) => [rule.category, rule.region, rule.district].filter(Boolean).length;
    return Number(left.priority) - Number(right.priority) || specificity(right) - specificity(left);
  });
  return candidates[0];
}

// Which office the active routing rules would choose, without recording anything. Nothing is sent by this.
function routePreview(report) {
  const rule = matchRoutingRule(report);
  if (!rule) return { matched: false, office: "", rule: "", note: "No active routing rule matches this report yet. An administrator needs to add one." };
  const agency = db.prepare("SELECT name FROM admin_directory_items WHERE id = ?").get(rule.agency_id);
  return { matched: true, office: agency ? agency.name : "", rule: rule.name, ruleVersion: rule.rule_version, note: "A routing rule recommends this office. Nothing is sent until staff act on it." };
}

function routingState(reportId) {
  const recommendation = db.prepare("SELECT * FROM routing_recommendations WHERE report_id = ? ORDER BY created_at DESC LIMIT 1").get(reportId);
  const deliveries = db.prepare("SELECT * FROM delivery_attempts WHERE report_id = ? ORDER BY created_at ASC").all(reportId).map((row) => ({
    id: row.id,
    recommendationId: row.routing_recommendation_id || "",
    targetId: row.target_id || "",
    channel: row.channel,
    state: row.state,
    externalOutcomeId: row.external_outcome_id || "",
    outcomeNote: row.outcome_note || "",
    integrationName: row.integration_name || "",
    createdAt: row.created_at
  }));
  return {
    recommendation: recommendation ? {
      id: recommendation.id,
      reportId: recommendation.report_id,
      ruleId: recommendation.rule_id || "",
      ruleVersion: recommendation.rule_version,
      agencyId: recommendation.override_agency_id || recommendation.agency_id,
      agencyName: (db.prepare("SELECT name FROM admin_directory_items WHERE id = ?").get(recommendation.override_agency_id || recommendation.agency_id) || {}).name || "",
      originalAgencyId: recommendation.agency_id,
      responseTargetId: recommendation.response_target_id || "",
      rationale: recommendation.rationale,
      state: recommendation.recommendation_state,
      engineType: recommendation.engine_type,
      modelVersion: recommendation.model_version || "",
      overrideReason: recommendation.override_reason || "",
      createdAt: recommendation.created_at,
      decidedAt: recommendation.decided_at || ""
    } : null,
    deliveryState: deliveries.length ? deliveries.at(-1).state : "Not sent",
    deliveries
  };
}

function overrideRoute(reportId, body, actor, req) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!report) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  if (!reportVisibleToActor(actor, report) || !canAssignCases(actor)) throw Object.assign(new Error("A scoped case lead or administrator is required"), { statusCode: 403 });
  const current = db.prepare("SELECT * FROM routing_recommendations WHERE report_id = ? ORDER BY created_at DESC LIMIT 1").get(reportId);
  const agencyId = sanitizeText(body.agencyId, 80);
  const reason = sanitizeText(body.reason, 1000);
  if (!current || !db.prepare("SELECT id FROM admin_directory_items WHERE id = ? AND kind = 'agency' AND active = 1").get(agencyId) || !reason) {
    throw Object.assign(new Error("An existing recommendation, active override agency, and reason are required"), { statusCode: 400 });
  }
  const stamp = nowIso();
  db.prepare(`UPDATE routing_recommendations SET recommendation_state = 'overridden', override_agency_id = ?, override_reason = ?, decided_by = ?, decided_at = ? WHERE id = ?`)
    .run(agencyId, reason, actor.id, stamp, current.id);
  logAudit(actor, "routing_overridden", "report", reportId, { recommendationId: current.id, agencyId, reason }, req);
  return routingState(reportId);
}

function recordDeliveryOutcome(reportId, body, actor, req) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!report) throw Object.assign(new Error("Report not found"), { statusCode: 404 });
  const state = sanitizeText(body.state, 40);
  const allowed = new Set(["Not sent", "Queued", "Sent", "Delivered", "Failed", "Acknowledged"]);
  const externalOutcomeId = sanitizeText(body.externalOutcomeId, 200);
  const integrationName = sanitizeText(body.integrationName, 120);
  if (!allowed.has(state)) throw Object.assign(new Error("Unsupported delivery state"), { statusCode: 400 });
  if (["Sent", "Delivered", "Acknowledged"].includes(state) && (!externalOutcomeId || !integrationName)) {
    throw Object.assign(new Error("Sent, delivered, or acknowledged states require a recorded external integration outcome"), { statusCode: 400 });
  }
  const routing = routingState(reportId);
  if (!routing.recommendation) throw Object.assign(new Error("Create and review a routing recommendation before recording delivery"), { statusCode: 409 });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO delivery_attempts (id, report_id, routing_recommendation_id, target_id, channel, state,
    external_outcome_id, outcome_note, integration_name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, reportId, routing.recommendation.id, sanitizeText(body.targetId || routing.recommendation.responseTargetId, 80) || null,
      sanitizeText(body.channel || "manual-review", 80), state, externalOutcomeId, sanitizeText(body.outcomeNote, 1000), integrationName, actor.id, nowIso());
  logAudit(actor, "delivery_outcome_recorded", "report", reportId, { deliveryId: id, state, integrationName, hasExternalOutcome: Boolean(externalOutcomeId) }, req);
  return routingState(reportId);
}

function runRetentionJob(body, actor, req) {
  const execute = body.execute === true && body.confirmation === "RUN RETENTION";
  const mode = execute ? "execute" : "dry-run";
  const policies = db.prepare("SELECT * FROM admin_directory_items WHERE kind = 'retention-policy' AND active = 1 ORDER BY updated_at DESC").all()
    .map(adminDirectoryItem);
  const contactPolicy = policies.find((policy) => Number(policy.configuration?.days) > 0);
  const contactDays = Number(contactPolicy?.configuration?.days || 90);
  const contactCutoff = new Date(Date.now() - contactDays * 24 * 60 * 60 * 1000).toISOString();
  const contactRows = db.prepare("SELECT id, payload_json FROM reports WHERE created_at < ?").all(contactCutoff)
    .filter((row) => {
      const payload = safeJsonParse(row.payload_json, {});
      return Boolean(payload.contact || payload.trustedContact);
    });
  const expiredSessions = Number(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at <= ?").get(nowIso()).count || 0) +
    Number(db.prepare("SELECT COUNT(*) AS count FROM citizen_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").get(nowIso()).count || 0);
  const expiredChallenges = Number(db.prepare("SELECT COUNT(*) AS count FROM citizen_otp_challenges WHERE expires_at <= ? OR consumed_at IS NOT NULL").get(nowIso()).count || 0);
  const expiredInvitations = Number(db.prepare("SELECT COUNT(*) AS count FROM responder_invitations WHERE status = 'pending' AND expires_at <= ?").get(nowIso()).count || 0);
  const result = { contactReportsEligible: contactRows.length, expiredSessions, expiredChallenges, expiredInvitations, contactRetentionDays: contactDays };
  if (execute) {
    const stamp = nowIso();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of contactRows) {
        const payload = safeJsonParse(row.payload_json, {});
        delete payload.contact;
        delete payload.trustedContact;
        payload.contactConsent = false;
        payload.contactRedactedAt = stamp;
        db.prepare("UPDATE reports SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(payload), stamp, row.id);
        db.prepare(`INSERT INTO report_history (id, report_id, from_status, to_status, public_update, private_note, actor_user_id, created_at)
          SELECT ?, id, status, status, '', 'Private contact data removed by retention policy.', ?, ? FROM reports WHERE id = ?`)
          .run(crypto.randomUUID(), actor.id, stamp, row.id);
      }
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(stamp);
      db.prepare("DELETE FROM citizen_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").run(stamp);
      db.prepare("DELETE FROM citizen_otp_challenges WHERE expires_at <= ? OR consumed_at IS NOT NULL").run(stamp);
      db.prepare("UPDATE responder_invitations SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?").run(stamp);
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }
  const runId = crypto.randomUUID();
  db.prepare("INSERT INTO retention_runs (id, mode, policy_snapshot_json, result_json, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(runId, mode, JSON.stringify(policies), JSON.stringify(result), actor.id, nowIso());
  logAudit(actor, "retention_job_completed", "retention_run", runId, { mode, ...result }, req);
  return { runId, mode, result };
}

function readinessState() {
  const checks = [];
  try {
    checks.push({ name: "database", ok: db.prepare("SELECT 1 AS ok").get().ok === 1, adapter: "sqlite-development" });
  } catch { checks.push({ name: "database", ok: false, adapter: "sqlite-development" }); }
  checks.push({ name: "boundary-dataset", ok: boundaryIndex.metadata.featureCount === 261, version: boundaryIndex.metadata.version });
  try {
    fs.accessSync(ATTACHMENT_QUARANTINE_DIR, fs.constants.R_OK | fs.constants.W_OK);
    checks.push({ name: "private-attachment-storage", ok: true, adapter: "local-pilot" });
  } catch { checks.push({ name: "private-attachment-storage", ok: false, adapter: "local-pilot" }); }
  checks.push({ name: "restricted-origin", ok: APP_ENV !== "production" || PUBLIC_ORIGIN !== "*" });
  checks.push({ name: "https", ok: APP_ENV !== "production" || REQUIRE_HTTPS });
  checks.push({ name: "trusted-proxy", ok: APP_ENV !== "production" || TRUST_PROXY });
  checks.push({ name: "attachment-signing", ok: Boolean(ATTACHMENT_SIGNING_SECRET && ATTACHMENT_SIGNING_SECRET.length >= 32) });
  return { ready: checks.every((check) => check.ok), environment: APP_ENV, checks };
}

async function notifyMonitoring(event) {
  if (!MONITORING_WEBHOOK_URL) return;
  try {
    const url = new URL(MONITORING_WEBHOOK_URL);
    if (url.protocol !== "https:" && !(APP_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(MONITORING_AUTH_TOKEN ? { Authorization: `Bearer ${MONITORING_AUTH_TOKEN}` } : {}) },
      body: JSON.stringify({ service: "fixnow-api", environment: APP_ENV, ...event, at: nowIso() })
    });
  } catch {}
}

function patchReport(reportId, body, actor, req) {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!row) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }
  if (!reportVisibleToActor(actor, row)) {
    const error = new Error("Report is outside your permitted area");
    error.statusCode = 403;
    throw error;
  }
  if (!canModerate(actor) && Number(row.assignment_user_id || 0) !== Number(actor.id)) {
    throw Object.assign(new Error("Accept or receive assignment before updating this case"), { statusCode: 403 });
  }
  if (Object.prototype.hasOwnProperty.call(body, "assignedTo")) {
    throw Object.assign(new Error("Use the audited field-action endpoint to assign or reassign a case"), { statusCode: 400 });
  }

  const payload = safeJsonParse(row.payload_json, {});
  const next = {
    status: row.status,
    severity: row.severity || "",
    type: row.type || "",
    region: row.region || "",
    district: row.district || "",
    community: row.community || "",
    assignedTo: row.assigned_to || "",
    flagged: Number(row.flagged || 0),
    hidden: Number(row.hidden || 0)
  };

  if (Object.prototype.hasOwnProperty.call(body, "status")) next.status = sanitizeText(body.status, 60);
  if (Object.prototype.hasOwnProperty.call(body, "severity")) next.severity = sanitizeText(body.severity, 60);
  if (Object.prototype.hasOwnProperty.call(body, "assignedTo")) next.assignedTo = sanitizeText(body.assignedTo, 160);

  const publicUpdate = sanitizeText(body.publicUpdate ?? body.publicNote, 1000);
  const privateNote = sanitizeText(body.privateNote ?? body.responderNote, 1000);
  const statusChanged = next.status !== row.status;
  validateResponderTransition(row.status, next.status);
  const resolutionEvidenceId = sanitizeText(body.resolutionEvidenceId || row.resolution_evidence_id || "", 80);
  const resolutionException = sanitizeText(body.resolutionException || row.resolution_exception || "", 1000);
  if (next.status === "Resolved") {
    const cleanEvidence = resolutionEvidenceId
      ? db.prepare("SELECT id FROM responder_evidence WHERE id = ? AND report_id = ? AND quarantine_state = 'clean'").get(resolutionEvidenceId, reportId)
      : null;
    if (!cleanEvidence && resolutionException.length < 20) {
      throw Object.assign(new Error("Resolution requires clean field evidence or a documented exception of at least 20 characters"), { statusCode: 400 });
    }
  }
  if (!publicUpdate) {
    const error = new Error("A public update is required for every responder update");
    error.statusCode = 400;
    throw error;
  }

  const updateKey = sanitizeText(body.updateKey, 80).toLowerCase();
  if (updateKey && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(updateKey)) {
    const error = new Error("A valid update key is required");
    error.statusCode = 400;
    throw error;
  }
  const updatePayloadHash = sha256(JSON.stringify({
    reportId,
    status: next.status,
    severity: next.severity,
    assignedTo: next.assignedTo,
    publicUpdate,
    privateNote,
    resolutionEvidenceId,
    resolutionException
  }));
  if (updateKey) {
    const existingUpdate = db.prepare("SELECT * FROM responder_update_keys WHERE update_key = ?").get(updateKey);
    if (existingUpdate) {
      if (existingUpdate.report_id !== reportId || existingUpdate.actor_user_id !== actor.id || existingUpdate.payload_hash !== updatePayloadHash) {
        const error = new Error("Update key has already been used with different data");
        error.statusCode = 409;
        throw error;
      }
      return responderReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId));
    }
  }

  if (canModerate(actor)) {
    if (Object.prototype.hasOwnProperty.call(body, "flagged")) next.flagged = toIntBool(body.flagged);
    if (Object.prototype.hasOwnProperty.call(body, "hidden")) next.hidden = toIntBool(body.hidden);
  }

  const stamp = nowIso();
  const nextPayload = {
    ...payload,
    status: next.status,
    severity: next.severity,
    assignedTo: next.assignedTo,
    flagged: Boolean(next.flagged),
    hidden: Boolean(next.hidden),
    updatedAt: stamp,
    lastActor: actor.username
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE reports
      SET payload_json = ?, status = ?, severity = ?, assigned_to = ?, flagged = ?, hidden = ?,
          resolution_evidence_id = ?, resolution_exception = ?, updated_at = ?, last_actor = ?
      WHERE id = ?
    `).run(
      JSON.stringify(nextPayload),
      next.status,
      next.severity,
      next.assignedTo,
      next.flagged,
      next.hidden,
      resolutionEvidenceId || null,
      resolutionException,
      stamp,
      actor.username,
      reportId
    );

    if (statusChanged || publicUpdate || privateNote) {
      db.prepare(`
        INSERT INTO report_history (id, report_id, from_status, to_status, public_update, private_note, actor_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), reportId, row.status, next.status, publicUpdate, privateNote, actor.id, stamp);
    }

    if (statusChanged || publicUpdate) {
      db.prepare(`
        INSERT INTO report_updates (id, report_id, status, public_note, actor_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), reportId, next.status, publicUpdate, actor.id, stamp);
    }

    if (updateKey) {
      db.prepare(`
        INSERT INTO responder_update_keys (update_key, report_id, actor_user_id, payload_hash, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(updateKey, reportId, actor.id, updatePayloadHash, stamp);
    }

    logAudit(actor, "report_patched", "report", reportId, {
      changedFields: Object.keys(body).filter((key) => !["publicUpdate", "publicNote", "privateNote", "responderNote"].includes(key)),
      status: next.status,
      hasPublicUpdate: Boolean(publicUpdate),
      hasPrivateNote: Boolean(privateNote)
    }, req);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
  return responderReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId));
}

function moderateReport(reportId, body, actor, req) {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!row) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }

  const action = sanitizeText(body.action, 40).toLowerCase();
  const note = sanitizeText(body.note || body.reason || "", 1000);
  const payload = safeJsonParse(row.payload_json, {});
  let flagged = Number(row.flagged || 0);
  let hidden = Number(row.hidden || 0);
  let status = row.status || "Open";
  let publicVerified = Number(row.public_verified || 0);
  let verifiedAt = row.verified_at || null;
  let verifiedBy = row.verified_by || null;
  let responsibleInstitution = row.responsible_institution || "";

  if (action === "flag") {
    flagged = 1;
    publicVerified = 0;
  }
  else if (action === "unflag") flagged = 0;
  else if (action === "hide") {
    if (!note) throw Object.assign(new Error("A reason is required to hide a report"), { statusCode: 400 });
    hidden = 1;
    publicVerified = 0;
  }
  else if (action === "unhide") hidden = 0;
  else if (action === "approve") {
    if (isDemoPayload({ id: row.id, source: row.source })) throw Object.assign(new Error("Demo reports cannot be approved for public display"), { statusCode: 400 });
    if (!note) throw Object.assign(new Error("A moderation verification note is required"), { statusCode: 400 });
    if (body.privacyChecked !== true) throw Object.assign(new Error("Confirm that the public text shows no contact details, exact address or other identifying information"), { statusCode: 400 });
    if (!publicLocationForReport(reportId)) throw Object.assign(new Error("A safe public location is required before approval"), { statusCode: 400 });
    flagged = 0;
    hidden = 0;
    status = sanitizeText(body.status || status, 60);
    publicVerified = 1;
    verifiedAt = nowIso();
    verifiedBy = actor.id;
    responsibleInstitution = sanitizeText(body.responsibleInstitution || row.responsible_institution || "", 160);
  } else if (action === "reject") {
    if (!note) throw Object.assign(new Error("A reason is required to reject a report"), { statusCode: 400 });
    hidden = 1;
    publicVerified = 0;
    status = "Rejected";
  } else if (action === "escalate") {
    status = "Escalated";
  } else {
    const error = new Error("Unsupported moderation action");
    error.statusCode = 400;
    throw error;
  }

  const stamp = nowIso();
  const nextPayload = {
    ...payload,
    status,
    flagged: Boolean(flagged),
    hidden: Boolean(hidden),
    moderationNote: note || payload.moderationNote || "",
    updatedAt: stamp,
    lastActor: actor.username
  };

  db.prepare(`
    UPDATE reports
    SET payload_json = ?, status = ?, flagged = ?, hidden = ?, public_verified = ?, verified_at = ?,
        verified_by = ?, responsible_institution = ?, updated_at = ?, last_actor = ?
    WHERE id = ?
  `).run(JSON.stringify(nextPayload), status, flagged, hidden, publicVerified, verifiedAt, verifiedBy,
    responsibleInstitution, stamp, actor.username, reportId);

  db.prepare(`
    INSERT INTO moderation_actions (id, report_id, action, note, actor_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), reportId, action, note, actor.id, stamp);

  logAudit(actor, `moderation_${action}`, "report", reportId, {
    note,
    status,
    flagged: Boolean(flagged),
    hidden: Boolean(hidden),
    publicVerified: Boolean(publicVerified),
    responsibleInstitution
  }, req);
  // Verifying or escalating releases the report to the office the routing rules choose (nothing is sent outside FixNow).
  const routedOffice = action === "approve" || action === "escalate" ? routeAfterModeration(reportId, actor, req) : routedOfficeName(reportId);
  return { ...publicReport(db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId)), routedOffice };
}

function migrateLegacyReports() {
  const reportCount = db.prepare("SELECT COUNT(*) AS count FROM reports").get().count;
  const legacyFile = path.join(DATA_DIR, "reports.json");
  if (reportCount > 0 || !fs.existsSync(legacyFile)) return;

  const legacyReports = safeJsonParse(fs.readFileSync(legacyFile, "utf8"), []);
  if (!Array.isArray(legacyReports) || legacyReports.length === 0) return;

  const actor = { id: null, username: "legacy-import", role: "Admin", status: "active" };
  for (const report of legacyReports) upsertReport(report, actor, null);
}

function send(req, res, status, payload) {
  const secure = requestIsSecure(req);
  const body = status === 204 ? "" : JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": PUBLIC_ORIGIN === "*" ? "*" : (String(req.headers.origin || "").trim() || PUBLIC_ORIGIN.split(",")[0].trim()),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Resource-Policy": "same-site"
  };
  if (PUBLIC_ORIGIN !== "*") headers.Vary = "Origin";
  if (secure) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  res.writeHead(status, headers);
  res.end(body);
}

function sendPrivateAttachment(req, res, attachment) {
  const storagePath = path.join(ATTACHMENT_QUARANTINE_DIR, attachment.storage_name);
  if (!storagePath.startsWith(`${ATTACHMENT_QUARANTINE_DIR}${path.sep}`) || !fs.existsSync(storagePath)) {
    throw Object.assign(new Error("Private attachment file is unavailable"), { statusCode: 404 });
  }
  const bytes = fs.readFileSync(storagePath);
  // Same cross-origin rule as every other API response, so the staff page (served from its own origin) can read
  // the photo with fetch and show it from a temporary blob: URL.
  res.writeHead(200, {
    "Access-Control-Allow-Origin": PUBLIC_ORIGIN === "*" ? "*" : (String(req.headers.origin || "").trim() || PUBLIC_ORIGIN.split(",")[0].trim()),
    ...(PUBLIC_ORIGIN === "*" ? {} : { Vary: "Origin" }),
    "Content-Type": attachment.detected_mime,
    "Content-Length": bytes.length,
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `inline; filename="evidence-${String(attachment.id).replace(/[^a-z0-9-]/gi, "")}"`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-site",
    "Referrer-Policy": "no-referrer"
  });
  res.end(bytes);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > BODY_LIMIT_BYTES) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const pathname = String(req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
  const isLogin = pathname === "/api/login";
  const isPublicReport = pathname === "/api/public/reports" && req.method === "POST";
  const limit = isPublicReport ? PUBLIC_REPORT_LIMIT_PER_HOUR : (isLogin ? 20 : 180);
  const windowMs = isPublicReport ? 60 * 60 * 1000 : 60_000;
  const bucketName = isPublicReport ? "public-report" : (isLogin ? "login" : "api");
  const key = `${ip}:${bucketName}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (rateBuckets.size > 5000) {
    for (const [bucketKey, value] of rateBuckets.entries()) {
      if (now > value.resetAt) rateBuckets.delete(bucketKey);
    }
  }

  return bucket.count <= limit;
}

function route(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return { pathname, query: url.searchParams };
}

async function handler(req, res) {
  if (!allowedRequestOrigin(req)) return send(req, res, 403, { ok: false, error: "Request origin is not allowed" });
  if (req.method === "OPTIONS") return send(req, res, 204, {});
  if (!checkRateLimit(req)) return send(req, res, 429, { ok: false, error: "Too many requests. Try again soon." });

  const secure = requestIsSecure(req);
  if (REQUIRE_HTTPS && !secure) {
    return send(req, res, 426, { ok: false, error: "HTTPS is required for this API" });
  }

  const { pathname, query } = route(req);

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      const reports = db.prepare("SELECT COUNT(*) AS count FROM reports").get().count;
      const users = db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'active'").get().count;
      return send(req, res, 200, {
        ok: true,
        service: "FixNow Ghana API",
        database: "sqlite",
        boundaryDataset: boundaryIndex.metadata.version,
        boundaryFeatures: boundaryIndex.metadata.featureCount,
        httpsRequired: REQUIRE_HTTPS,
        directTls: Boolean(TLS_KEY_PATH && TLS_CERT_PATH),
        time: nowIso(),
        reports,
        users
      });
    }

    if (req.method === "GET" && pathname === "/api/ready") {
      const readiness = readinessState();
      return send(req, res, readiness.ready ? 200 : 503, { ok: readiness.ready, ...readiness, time: nowIso() });
    }

    const privateAttachmentMatch = pathname.match(/^\/api\/private\/attachments\/([^/]+)$/);
    if (req.method === "GET" && privateAttachmentMatch) {
      const attachment = verifySignedAttachment(decodeURIComponent(privateAttachmentMatch[1]), query);
      return sendPrivateAttachment(req, res, attachment);
    }

    if (req.method === "POST" && pathname === "/api/onboarding/request") {
      const body = await readBody(req);
      const request = createOnboardingRequest(body, req);
      return send(req, res, 201, { ok: true, request });
    }

    if (req.method === "POST" && pathname === "/api/login") {
      const body = await readBody(req);
      const username = sanitizeUsername(body.username);
      assertResponderLoginAvailable(username);
      const user = username ? db.prepare("SELECT * FROM users WHERE username = ?").get(username) : null;
      if (!user || user.status !== "active" || !verifyPassword(body.password || "", user.password_hash)) {
        recordResponderLoginFailure(username);
        logAudit(user || null, "login_failed", "user", sha256(username).slice(0, 16), { accountIdentifierHashed: true }, req);
        return send(req, res, 401, { ok: false, error: "Invalid username or password" });
      }
      clearResponderLoginFailures(username);
      const session = createSession(user, req);
      return send(req, res, 200, { ok: true, token: session.token, expiresAt: session.expiresAt, user: publicUser(user) });
    }

    if (req.method === "POST" && pathname === "/api/citizen/auth/otp/request") {
      const body = await readBody(req);
      const challenge = await requestCitizenOtp(body, req, "sign-in");
      return send(req, res, 202, { ok: true, challenge });
    }

    if (req.method === "POST" && pathname === "/api/citizen/auth/otp/verify") {
      const body = await readBody(req);
      const result = verifyCitizenOtp(body, req);
      return send(req, res, 200, { ok: true, ...result });
    }

    if (req.method === "POST" && pathname === "/api/citizen/auth/password/login") {
      const body = await readBody(req);
      const result = loginCitizenWithPassword(body, req);
      return send(req, res, 200, { ok: true, ...result });
    }

    if (req.method === "POST" && pathname === "/api/citizen/auth/password/reset/request") {
      const body = await readBody(req);
      const challenge = await requestCitizenOtp(body, req, "password-reset");
      return send(req, res, 202, { ok: true, challenge });
    }

    if (req.method === "POST" && pathname === "/api/citizen/auth/password/reset/verify") {
      const body = await readBody(req);
      const result = verifyCitizenOtp(body, req);
      if (!result.resetToken) return send(req, res, 400, { ok: false, error: "This challenge cannot reset a password" });
      return send(req, res, 200, { ok: true, ...result });
    }

    if (req.method === "POST" && pathname === "/api/citizen/auth/password/reset/confirm") {
      const body = await readBody(req);
      confirmCitizenPasswordReset(body);
      return send(req, res, 200, { ok: true });
    }

    if (req.method === "POST" && ["/api/citizen/auth/google", "/api/citizen/auth/apple"].includes(pathname)) {
      const provider = pathname.endsWith("google") ? "Google" : "Apple";
      return send(req, res, 503, { ok: false, error: `${provider} sign-in is unavailable until owner credentials and server-side token verification are configured` });
    }

    const publicImageMatch = pathname.match(/^\/api\/public\/images\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && publicImageMatch) return sendPublicImage(req, res, publicImageMatch[1]);

    if (req.method === "GET" && pathname === "/api/public/reports") {
      const reports = listPublicReports(query);
      return send(req, res, 200, {
        ok: true,
        reports,
        count: reports.length,
        locationPrecision: "MMDA representative points; never exact report coordinates"
      });
    }

    if (req.method === "POST" && pathname === "/api/public/uploads") {
      const body = await readBody(req);
      const attachment = createQuarantinedAttachment(body, req);
      const scanning = attachment.alreadyUploaded ? { configured: Boolean(UPLOAD_SCAN_WEBHOOK_URL), queued: false } : await queueUploadScan("citizen", attachment.attachmentId);
      return send(req, res, attachment.alreadyUploaded ? 200 : 201, { ok: true, attachment, scanning });
    }

    if (req.method === "POST" && pathname === "/api/public/reports/duplicates") {
      const body = await readBody(req);
      const suggestions = findPublicDuplicateSuggestions(body);
      return send(req, res, 200, {
        ok: true,
        suggestions,
        merged: false,
        note: "Suggestions are advisory. FixNow never merges reports automatically."
      });
    }

    const publicSignalMatch = pathname.match(/^\/api\/public\/reports\/([^/]+)\/signals$/);
    if (req.method === "POST" && publicSignalMatch) {
      const body = await readBody(req);
      const confirmations = recordPublicReportSignal(decodeURIComponent(publicSignalMatch[1]), body, req);
      return send(req, res, 200, { ok: true, confirmations });
    }

    if (req.method === "POST" && pathname === "/api/public/reports") {
      const body = await readBody(req);
      const citizen = authenticateCitizen(req);
      if (readBearerToken(req) && !citizen) return send(req, res, 401, { ok: false, error: "Citizen session is invalid or expired" });
      const result = createPublicReport(body, req, citizen);
      return send(req, res, 201, { ok: true, ...result });
    }

    if (req.method === "POST" && pathname === "/api/public/reports/track") {
      const body = await readBody(req);
      const report = trackPublicReport(body.reference, body.secret);
      return send(req, res, 200, { ok: true, report });
    }

    const reporterActionMatch = pathname.match(/^\/api\/public\/reports\/([^/]+)\/reporter-action$/);
    if (req.method === "POST" && reporterActionMatch) {
      const body = await readBody(req);
      const citizen = authenticateCitizen(req);
      if (readBearerToken(req) && !citizen) return send(req, res, 401, { ok: false, error: "Citizen session is invalid or expired" });
      const report = recordCitizenReporterAction(decodeURIComponent(reporterActionMatch[1]), body, citizen);
      return send(req, res, 200, { ok: true, report });
    }

    const contactControlMatch = pathname.match(/^\/api\/public\/reports\/([^/]+)\/contact$/);
    if (req.method === "DELETE" && contactControlMatch) {
      const body = await readBody(req);
      const citizen = authenticateCitizen(req);
      if (readBearerToken(req) && !citizen) return send(req, res, 401, { ok: false, error: "Citizen session is invalid or expired" });
      const report = removeCitizenReportContact(decodeURIComponent(contactControlMatch[1]), body, citizen);
      return send(req, res, 200, { ok: true, report });
    }

    if (req.method === "GET" && pathname === "/api/public/boundaries/metadata") {
      return send(req, res, 200, {
        ok: true,
        boundary: {
          id: BOUNDARY_METADATA.id,
          version: BOUNDARY_METADATA.version,
          publisher: BOUNDARY_METADATA.publisher,
          sourcePage: BOUNDARY_METADATA.sourcePage,
          sourceFileDate: BOUNDARY_METADATA.sourceFileDate,
          licence: BOUNDARY_METADATA.licence,
          licenceStatus: BOUNDARY_METADATA.licenceStatus,
          featureCount: BOUNDARY_METADATA.featureCount
        }
      });
    }

    if (req.method === "GET" && pathname === "/api/public/boundaries/geojson") {
      return send(req, res, 200, {
        ok: true,
        boundaryVersion: BOUNDARY_METADATA.version,
        geojson: boundaryIndex.toGeoJson()
      });
    }

    if (req.method === "GET" && pathname === "/api/public/config") {
      const mapsEnabled = Boolean(GOOGLE_MAPS_BROWSER_KEY && GOOGLE_MAP_ID);
      return send(req, res, 200, {
        ok: true,
        maps: {
          enabled: mapsEnabled,
          provider: mapsEnabled ? "google" : "unconfigured",
          browserKey: mapsEnabled ? GOOGLE_MAPS_BROWSER_KEY : "",
          mapId: mapsEnabled ? GOOGLE_MAP_ID : "",
          apiVersion: "weekly"
        },
        citizenAccounts: {
          policies: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
          phoneOtp: {
            enabled: Boolean(OTP_PROVIDER_WEBHOOK_URL),
            provider: OTP_PROVIDER_WEBHOOK_URL ? "configured-webhook" : "unconfigured",
            reason: OTP_PROVIDER_WEBHOOK_URL ? "" : "Owner setup is required before real security codes can be delivered."
          },
          google: {
            enabled: false,
            clientConfigured: Boolean(GOOGLE_IDENTITY_CLIENT_ID),
            reason: "Server-side Google token verification is not configured."
          },
          apple: {
            enabled: false,
            serviceConfigured: Boolean(APPLE_SERVICE_ID),
            reason: "Server-side Apple token verification is not configured."
          }
        },
        uploads: {
          scanningEnabled: Boolean(UPLOAD_SCAN_WEBHOOK_URL),
          state: UPLOAD_SCAN_WEBHOOK_URL ? "configured-quarantine-hook" : "manual-review-required"
        },
        environment: APP_ENV === "production" ? "production" : "development"
      });
    }

    if (req.method === "POST" && pathname === "/api/public/location/resolve") {
      const body = await readBody(req);
      const location = parseReportLocation({ ...body, exactLocationConsent: true }, sanitizeText(body.community, 160), nowIso());
      if (location.exactLatitude === null) return send(req, res, 400, { ok: false, error: "Exact coordinates are required for boundary resolution" });
      return send(req, res, 200, {
        ok: true,
        location: {
          region: location.region,
          district: location.district,
          regionId: location.regionId,
          mmdaId: location.mmdaId,
          publicLocationLabel: location.publicLocationLabel,
          verificationState: location.verificationState,
          boundaryVersion: location.boundaryVersion
        }
      });
    }

    if (req.method === "GET" && pathname === "/api/emergency-contacts") {
      const config = getEmergencyContactConfig();
      return send(req, res, 200, {
        ok: true,
        config: { ...config, contacts: config.contacts.filter((contact) => contact.active && contact.verificationStatus === "verified") }
      });
    }

    if (pathname.startsWith("/api/citizen/")) {
      const citizen = authenticateCitizen(req);
      if (!citizen) return send(req, res, 401, { ok: false, error: "Citizen sign-in required" });

      if (req.method === "GET" && pathname === "/api/citizen/me") {
        return send(req, res, 200, { ok: true, citizen: publicCitizen(citizen) });
      }
      if (req.method === "PATCH" && pathname === "/api/citizen/me") {
        const body = await readBody(req);
        return send(req, res, 200, { ok: true, citizen: updateCitizenProfile(citizen, body) });
      }
      if (req.method === "POST" && pathname === "/api/citizen/password") {
        const body = await readBody(req);
        return send(req, res, 200, { ok: true, citizen: setCitizenPassword(citizen, body) });
      }
      if (req.method === "GET" && pathname === "/api/citizen/reports") {
        const reports = listCitizenReports(citizen);
        return send(req, res, 200, { ok: true, reports, count: reports.length });
      }
      if (req.method === "POST" && pathname === "/api/citizen/reports/link") {
        const body = await readBody(req);
        return send(req, res, 200, { ok: true, report: linkCitizenReport(citizen, body) });
      }
      const preferenceMatch = pathname.match(/^\/api\/citizen\/reports\/([^/]+)\/preferences$/);
      if (req.method === "PATCH" && preferenceMatch) {
        const body = await readBody(req);
        const preference = updateCitizenReportPreference(citizen, decodeURIComponent(preferenceMatch[1]), body);
        return send(req, res, 200, { ok: true, preference });
      }
      if (req.method === "GET" && pathname === "/api/citizen/sessions") {
        const sessions = db.prepare(`
          SELECT id, device_label AS deviceLabel, created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt
          FROM citizen_sessions WHERE citizen_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC
        `).all(citizen.id, nowIso()).map((session) => ({ ...session, current: session.id === citizen.citizen_session_id }));
        return send(req, res, 200, { ok: true, sessions });
      }
      const sessionMatch = pathname.match(/^\/api\/citizen\/sessions\/([a-f0-9-]{36})$/);
      if (req.method === "DELETE" && sessionMatch) {
        const stamp = nowIso();
        const result = db.prepare("UPDATE citizen_sessions SET revoked_at = ? WHERE id = ? AND citizen_id = ? AND revoked_at IS NULL")
          .run(stamp, sessionMatch[1], citizen.id);
        if (!result.changes) return send(req, res, 404, { ok: false, error: "Session not found" });
        citizenAudit(citizen, "session_revoked", "citizen_session", sessionMatch[1]);
        return send(req, res, 200, { ok: true, currentSessionRevoked: sessionMatch[1] === citizen.citizen_session_id });
      }
      if (req.method === "POST" && pathname === "/api/citizen/logout") {
        const stamp = nowIso();
        db.prepare("UPDATE citizen_sessions SET revoked_at = ? WHERE id = ?").run(stamp, citizen.citizen_session_id);
        citizenAudit(citizen, "logout", "citizen_session", citizen.citizen_session_id);
        return send(req, res, 200, { ok: true });
      }
      if (req.method === "GET" && pathname === "/api/citizen/export") {
        return send(req, res, 200, { ok: true, export: citizenDataExport(citizen) });
      }
      if (req.method === "DELETE" && pathname === "/api/citizen/account") {
        const body = await readBody(req);
        deleteCitizenAccount(citizen, body);
        return send(req, res, 200, { ok: true });
      }
      return send(req, res, 404, { ok: false, error: "Citizen account route not found" });
    }

    if (req.method === "POST" && pathname === "/api/onboarding/invitations/accept") {
      const body = await readBody(req);
      const user = acceptResponderInvitation(body, req);
      return send(req, res, 201, { ok: true, user });
    }

    const actor = authenticate(req);
    if (!actor) return send(req, res, 401, { ok: false, error: "Login required" });

    if (req.method === "POST" && pathname === "/api/logout") {
      const token = readBearerToken(req);
      if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
      logAudit(actor, "logout", "user", actor.id, {}, req);
      return send(req, res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/api/me") {
      return send(req, res, 200, { ok: true, user: publicUser(actor) });
    }

    if (req.method === "POST" && pathname === "/api/change-password") {
      const body = await readBody(req);
      if (!verifyPassword(body.currentPassword || "", actor.password_hash)) {
        return send(req, res, 403, { ok: false, error: "Current password is incorrect" });
      }
      if (!body.newPassword || String(body.newPassword).length < 10) {
        return send(req, res, 400, { ok: false, error: "New password must be at least 10 characters" });
      }
      const stamp = nowIso();
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?")
        .run(createPasswordHash(body.newPassword), stamp, actor.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(actor.id, sha256(readBearerToken(req)));
      logAudit(actor, "password_changed", "user", actor.id, {}, req);
      return send(req, res, 200, { ok: true });
    }

    if (req.method === "PATCH" && pathname === "/api/admin/emergency-contacts") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      const config = validateEmergencyContactConfig(body.config);
      const stamp = nowIso();
      db.prepare("UPDATE emergency_contact_config SET config_json = ?, updated_by = ?, updated_at = ? WHERE id = 1")
        .run(JSON.stringify(config), actor.id, stamp);
      logAudit(actor, "emergency_contacts_updated", "emergency_contact_config", "1", { version: config.version }, req);
      return send(req, res, 200, { ok: true, config: { ...config, contacts: config.contacts.filter((contact) => contact.active && contact.verificationStatus === "verified") } });
    }

    if (req.method === "GET" && pathname === "/api/admin/config") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      return send(req, res, 200, { ok: true, configuration: adminConfiguration() });
    }

    if (req.method === "POST" && pathname === "/api/admin/directory") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      return send(req, res, 200, { ok: true, item: upsertAdminDirectoryItem(body, actor, req) });
    }

    if (req.method === "POST" && pathname === "/api/admin/routing-rules") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      return send(req, res, 200, { ok: true, rule: upsertRoutingRule(body, actor, req) });
    }

    if (req.method === "POST" && pathname === "/api/admin/invitations") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      return send(req, res, 201, { ok: true, ...createResponderInvitation(body, actor, req) });
    }

    if (req.method === "POST" && pathname === "/api/admin/maintenance/retention") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      return send(req, res, 200, { ok: true, retention: runRetentionJob(body, actor, req) });
    }

    if (req.method === "GET" && pathname === "/api/users") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 500").all();
      return send(req, res, 200, { ok: true, users: rows.map(publicUser) });
    }

    if (req.method === "POST" && pathname === "/api/users") {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      const user = insertUser({
        username: body.username,
        password: body.password,
        role: body.role,
        name: body.name,
        phone: body.phone,
        email: body.email,
        agency: body.agency,
        region: body.region,
        district: body.district,
        status: body.status || "active",
        mustChangePassword: body.mustChangePassword ?? true
      });
      logAudit(actor, "user_created", "user", user.id, { username: user.username, role: user.role }, req);
      return send(req, res, 201, { ok: true, user: publicUser(user) });
    }

    const userPatchMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (req.method === "PATCH" && userPatchMatch) {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      const target = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(userPatchMatch[1]));
      if (!target) return send(req, res, 404, { ok: false, error: "User not found" });
      const stamp = nowIso();
      db.prepare(`
        UPDATE users
        SET role = ?, name = ?, phone = ?, email = ?, agency = ?, region = ?, district = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        sanitizeText(body.role ?? target.role, 60),
        sanitizeText(body.name ?? target.name, 120),
        sanitizeText(body.phone ?? target.phone, 40),
        sanitizeText(body.email ?? target.email, 160),
        sanitizeText(body.agency ?? target.agency, 160),
        sanitizeText(body.region ?? target.region, 80),
        sanitizeText(body.district ?? target.district, 120),
        sanitizeText(body.status ?? target.status, 24),
        stamp,
        target.id
      );
      logAudit(actor, "user_updated", "user", target.id, body, req);
      return send(req, res, 200, { ok: true, user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(target.id)) });
    }

    if (req.method === "GET" && pathname === "/api/onboarding/requests") {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const status = sanitizeText(query.get("status") || "", 24);
      const rows = status
        ? db.prepare("SELECT * FROM onboarding_requests WHERE status = ? ORDER BY created_at DESC LIMIT 500").all(status)
        : db.prepare("SELECT * FROM onboarding_requests ORDER BY created_at DESC LIMIT 500").all();
      return send(req, res, 200, { ok: true, requests: rows.map(publicOnboardingRequest) });
    }

    const approveMatch = pathname.match(/^\/api\/onboarding\/([^/]+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      const result = approveOnboarding(decodeURIComponent(approveMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, ...result });
    }

    const rejectMatch = pathname.match(/^\/api\/onboarding\/([^/]+)\/reject$/);
    if (req.method === "POST" && rejectMatch) {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const body = await readBody(req);
      const request = rejectOnboarding(decodeURIComponent(rejectMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, request });
    }

    if (req.method === "GET" && pathname === "/api/reports") {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      return send(req, res, 200, { ok: true, reports: listReports(actor, query) });
    }

    if (req.method === "GET" && pathname === "/api/staff/summary") {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      return send(req, res, 200, { ok: true, user: publicUser(actor), summary: staffSummary(actor) });
    }

    const caseDetailMatch = pathname.match(/^\/api\/reports\/([^/]+)\/case$/);
    if (req.method === "GET" && caseDetailMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      return send(req, res, 200, { ok: true, report: responderCaseDetail(decodeURIComponent(caseDetailMatch[1]), actor, req) });
    }

    if (req.method === "GET" && pathname === "/api/responders") {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      return send(req, res, 200, { ok: true, responders: listAssignableResponders(actor, query.get("reportId") || "") });
    }

    const routingMatch = pathname.match(/^\/api\/reports\/([^/]+)\/routing$/);
    if (req.method === "GET" && routingMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const reportId = decodeURIComponent(routingMatch[1]);
      const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
      if (!row) return send(req, res, 404, { ok: false, error: "Report not found" });
      if (!reportVisibleToActor(actor, row)) return send(req, res, 403, { ok: false, error: "This report has not been routed to your office" });
      return send(req, res, 200, { ok: true, routing: routingState(reportId) });
    }

    const recommendRouteMatch = pathname.match(/^\/api\/reports\/([^/]+)\/routing\/recommend$/);
    if (req.method === "POST" && recommendRouteMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const routing = routeRecommendation(decodeURIComponent(recommendRouteMatch[1]), actor, req);
      return send(req, res, 201, { ok: true, routing });
    }

    const overrideRouteMatch = pathname.match(/^\/api\/reports\/([^/]+)\/routing\/override$/);
    if (req.method === "POST" && overrideRouteMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const body = await readBody(req);
      const routing = overrideRoute(decodeURIComponent(overrideRouteMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, routing });
    }

    const deliveryMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)\/deliveries$/);
    if (req.method === "POST" && deliveryMatch) {
      if (!isAdmin(actor)) return send(req, res, 403, { ok: false, error: "Admin access required" });
      const body = await readBody(req);
      const routing = recordDeliveryOutcome(decodeURIComponent(deliveryMatch[1]), body, actor, req);
      return send(req, res, 201, { ok: true, routing });
    }

    const reportLocationMatch = pathname.match(/^\/api\/reports\/([^/]+)\/location$/);
    if (req.method === "GET" && reportLocationMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const reportId = decodeURIComponent(reportLocationMatch[1]);
      const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
      if (!row) return send(req, res, 404, { ok: false, error: "Report not found" });
      if (!reportVisibleToActor(actor, row)) return send(req, res, 403, { ok: false, error: "This report has not been routed to your office" });
      return send(req, res, 200, { ok: true, reportId, location: responderLocationForReport(reportId) });
    }

    if (req.method === "POST" && pathname === "/api/reports/sync") {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const body = await readBody(req);
      const reports = Array.isArray(body.reports) ? body.reports : [];
      let created = 0;
      // Check the whole batch first, so one bad report cannot leave half a batch saved.
      for (const report of reports) {
        if (isDemoPayload(report)) return send(req, res, 400, { ok: false, error: "Demo reports cannot sync" });
        const existing = db.prepare("SELECT * FROM reports WHERE id = ?").get(sanitizeText(report.id, 120));
        if (existing) return send(req, res, 409, { ok: false, error: "Existing reports must be updated through the scoped report endpoint" });
        if (!REPORT_TYPES.includes(sanitizeText(report.type || report.problemType || report.category, 100))) {
          return send(req, res, 400, { ok: false, error: UNLISTED_REPORT_TYPE_MESSAGE });
        }
      }
      for (const report of reports) {
        const result = upsertReport(report, actor, req);
        if (result.action === "created") created += 1;
      }
      return send(req, res, 200, { ok: true, created, updated: 0, reports: listReports(actor, new URLSearchParams()) });
    }

    const responderEvidenceMatch = pathname.match(/^\/api\/reports\/([^/]+)\/responder-evidence$/);
    if (req.method === "POST" && responderEvidenceMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const body = await readBody(req);
      const result = createResponderEvidence(decodeURIComponent(responderEvidenceMatch[1]), body, actor, req);
      const scanning = result.alreadyUploaded ? { configured: Boolean(UPLOAD_SCAN_WEBHOOK_URL), queued: false } : await queueUploadScan("responder", result.evidence.id, decodeURIComponent(responderEvidenceMatch[1]));
      return send(req, res, result.alreadyUploaded ? 200 : 201, { ok: true, ...result, scanning });
    }

    const signedAttachmentMatch = pathname.match(/^\/api\/reports\/([^/]+)\/attachments\/([^/]+)\/signed-url$/);
    if (req.method === "POST" && signedAttachmentMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const signed = signedAttachmentPath(decodeURIComponent(signedAttachmentMatch[1]), decodeURIComponent(signedAttachmentMatch[2]), actor);
      return send(req, res, 200, { ok: true, attachment: signed });
    }

    const evidenceReviewMatch = pathname.match(/^\/api\/admin\/responder-evidence\/([^/]+)\/review$/);
    if (req.method === "POST" && evidenceReviewMatch) {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const body = await readBody(req);
      const report = reviewResponderEvidence(decodeURIComponent(evidenceReviewMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, report });
    }

    const citizenAttachmentReviewMatch = pathname.match(/^\/api\/admin\/citizen-attachments\/([^/]+)\/review$/);
    if (req.method === "POST" && citizenAttachmentReviewMatch) {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const body = await readBody(req);
      const report = reviewCitizenAttachment(decodeURIComponent(citizenAttachmentReviewMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, report });
    }

    const fieldActionMatch = pathname.match(/^\/api\/reports\/([^/]+)\/field-action$/);
    if (req.method === "POST" && fieldActionMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const body = await readBody(req);
      const report = responderFieldAction(decodeURIComponent(fieldActionMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, report });
    }

    const reportPatchMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);
    if (req.method === "PATCH" && reportPatchMatch) {
      if (!isResponder(actor)) return send(req, res, 403, { ok: false, error: "Responder account required" });
      const body = await readBody(req);
      const report = patchReport(decodeURIComponent(reportPatchMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, report });
    }

    const publicImageStateMatch = pathname.match(/^\/api\/reports\/([^/]+)\/attachments\/([^/]+)\/public$/);
    if (req.method === "POST" && publicImageStateMatch) {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const body = await readBody(req);
      const result = setPublicImageState(decodeURIComponent(publicImageStateMatch[1]), decodeURIComponent(publicImageStateMatch[2]), body, actor, req);
      return send(req, res, 200, { ok: true, ...result });
    }

    const moderationMatch = pathname.match(/^\/api\/reports\/([^/]+)\/moderation$/);
    if (req.method === "POST" && moderationMatch) {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const body = await readBody(req);
      const report = moderateReport(decodeURIComponent(moderationMatch[1]), body, actor, req);
      return send(req, res, 200, { ok: true, report });
    }

    if (req.method === "GET" && pathname === "/api/audit") {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const rows = db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500").all();
      return send(req, res, 200, {
        ok: true,
        events: rows.map((row) => ({
          id: row.id,
          actorUserId: row.actor_user_id,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          details: safeJsonParse(row.details_json, {}),
          ip: row.ip,
          createdAt: row.created_at
        }))
      });
    }

    if (req.method === "GET" && pathname === "/api/events") {
      if (!canModerate(actor)) return send(req, res, 403, { ok: false, error: "Moderator access required" });
      const rows = db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
      return send(req, res, 200, {
        ok: true,
        events: rows.map((row) => ({
          id: row.id,
          type: row.action,
          reportId: row.entity_type === "report" ? row.entity_id : "",
          actorUserId: row.actor_user_id,
          details: safeJsonParse(row.details_json, {}),
          createdAt: row.created_at
        }))
      });
    }

    return send(req, res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status >= 500 ? "Server error" : error.message;
    if (status >= 500) {
      console.error(JSON.stringify({ level: "error", service: "fixnow-api", status, path: pathname, errorType: error.name || "Error", at: nowIso() }));
      notifyMonitoring({ level: "error", status, path: pathname, errorType: error.name || "Error" });
    }
    return send(req, res, status, { ok: false, error: message });
  }
}

function loadTlsOptions() {
  if (!TLS_KEY_PATH && !TLS_CERT_PATH) return null;
  if (!TLS_KEY_PATH || !TLS_CERT_PATH) {
    throw new Error("Both TLS_KEY_PATH and TLS_CERT_PATH are required for direct HTTPS");
  }
  return {
    key: fs.readFileSync(TLS_KEY_PATH),
    cert: fs.readFileSync(TLS_CERT_PATH)
  };
}

function startServer() {
  initDatabase();
  seedDatabase();
  migrateLegacyReports();
  hashStoredAuditIps();

  const tlsOptions = loadTlsOptions();
  const server = tlsOptions ? https.createServer(tlsOptions, handler) : http.createServer(handler);
  const protocol = tlsOptions ? "https" : "http";

  server.listen(PORT, HOST, () => {
    const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
    console.log(`FixNow Ghana API running on ${protocol}://${displayHost}:${PORT}`);
    console.log(`SQLite database: ${DB_FILE}`);
    if (!tlsOptions) {
      console.log("Direct TLS is not enabled. Use Nginx/Certbot for production HTTPS, or set TLS_KEY_PATH and TLS_CERT_PATH.");
    }
    if (SEED_DEMO_ACCOUNTS) {
      console.log("Seeded demo users on first run: assembly/assembly123, nadmo/nadmo123, utility/utility123, moderator/moderator123");
    }
    console.log("Bootstrap admin on first run: admin / value from BOOTSTRAP_ADMIN_PASSWORD");
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, handler, REPORT_TYPES, REPORT_STATUSES, validateResponderTransition };
