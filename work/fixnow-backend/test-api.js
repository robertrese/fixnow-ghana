"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const zlib = require("zlib");

const root = __dirname;
const port = 4197;
const dataDir = path.join(root, "test-data");
const dbFile = path.join(dataDir, "fixnow-test.sqlite");
const baseUrl = `http://127.0.0.1:${port}`;

fs.mkdirSync(dataDir, { recursive: true });
fs.rmSync(path.join(dataDir, "attachments"), { recursive: true, force: true });
for (const suffix of ["", "-shm", "-wal"]) {
  const file = `${dbFile}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

process.env.PORT = String(port);
process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = dataDir;
process.env.DB_FILE = dbFile;
process.env.REQUIRE_HTTPS = "0";
process.env.SCRYPT_N = "1024";
process.env.SCRYPT_MAXMEM = String(64 * 1024 * 1024);
process.env.BOOTSTRAP_ADMIN_PASSWORD = "ChangeMeAdmin!2026";
process.env.SEED_DEMO_ACCOUNTS = "1";
process.env.PUBLIC_REPORT_LIMIT_PER_HOUR = "50";
process.env.OTP_PROVIDER_WEBHOOK_URL = "http://127.0.0.1:4198/deliver";
process.env.OTP_PROVIDER_AUTH_TOKEN = "test-provider-token";
process.env.OTP_HASH_SECRET = "test-only-otp-hash-secret";
process.env.ATTACHMENT_SIGNING_SECRET = "test-only-attachment-signing-secret-2026";

const otpDeliveries = [];
const otpProvider = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    const delivery = JSON.parse(raw || "{}");
    otpDeliveries.push({ ...delivery, authorized: req.headers.authorization === "Bearer test-provider-token" });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end('{"accepted":true}');
  });
});
otpProvider.listen(4198, "127.0.0.1");

const { startServer, REPORT_TYPES } = require("./server");
const server = startServer();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth() {
  const startedAt = Date.now();
  let lastProblem = "no attempt made";
  while (Date.now() - startedAt < 15000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const text = await response.text();
      if (response.ok) return JSON.parse(text);
      lastProblem = `HTTP ${response.status}: ${text}`;
    } catch (error) {
      lastProblem = error.message || "connection not ready";
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server did not become healthy. Last problem: ${lastProblem}`);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function apiFailure(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  assert(!response.ok, `${options.method || "GET"} ${pathname} should fail`);
  return { status: response.status, data };
}

(async () => {
  try {
    const health = await waitForHealth();
    assert(health.ok && health.database === "sqlite", "health should report sqlite");
    assert(health.boundaryFeatures === 261 && health.boundaryDataset, "health should report the active official MMDA boundary dataset");
    const readiness = await api("/api/ready");
    assert(readiness.ready && readiness.checks.some((check) => check.name === "attachment-signing" && check.ok), "readiness should validate database, boundaries, private storage, origins, HTTPS policy, proxy policy, and attachment signing");

    const boundaryMetadata = await api("/api/public/boundaries/metadata");
    assert(boundaryMetadata.boundary.publisher === "Ghana Statistical Service", "boundary metadata should name the official publisher");
    assert(boundaryMetadata.boundary.featureCount === 261, "boundary metadata should record 261 administrative MMDAs");
    const boundaryGeoJson = await api("/api/public/boundaries/geojson");
    assert(boundaryGeoJson.geojson.type === "FeatureCollection", "the map boundary endpoint should return GeoJSON");
    assert(boundaryGeoJson.geojson.features.length === 261, "the map boundary endpoint should return all 261 MMDAs");
    assert(boundaryGeoJson.geojson.features.every((feature) => feature.properties.mmdaId && feature.properties.boundaryVersion), "each map boundary must have stable identity and version metadata");
    const publicConfig = await api("/api/public/config");
    assert(publicConfig.maps.enabled === false && publicConfig.maps.browserKey === "", "unconfigured Google Maps must be labelled disabled without a key");
    assert(!JSON.stringify(publicConfig).includes("SERVER_GEOCODING"), "public config must never expose server geocoding credentials");
    assert(publicConfig.citizenAccounts.phoneOtp.enabled === true, "configured OTP delivery should be reported honestly");
    assert(publicConfig.citizenAccounts.google.enabled === false && publicConfig.citizenAccounts.apple.enabled === false, "external identity providers must remain unavailable without genuine token verification");

    const citizenDeviceKey = crypto.randomUUID();
    const citizenPhone = "+233241234567";
    const citizenChallenge = await api("/api/citizen/auth/otp/request", {
      method: "POST",
      body: { phone: citizenPhone, deviceKey: citizenDeviceKey }
    });
    assert(otpDeliveries.length === 1 && otpDeliveries[0].authorized && /^\d{6}$/.test(otpDeliveries[0].code), "a genuine one-time code should be delivered to the configured provider");
    assert(citizenChallenge.challenge.destination.endsWith("4567") && !JSON.stringify(citizenChallenge).includes(otpDeliveries[0].code), "OTP request should return only a masked destination and no code value");
    const missingCitizenConsent = await apiFailure("/api/citizen/auth/otp/verify", {
      method: "POST",
      body: { challengeId: citizenChallenge.challenge.challengeId, code: otpDeliveries[0].code, deviceKey: citizenDeviceKey }
    });
    assert(missingCitizenConsent.status === 400, "first-time account creation must record current terms and privacy acceptance");
    const citizenAuth = await api("/api/citizen/auth/otp/verify", {
      method: "POST",
      body: {
        challengeId: citizenChallenge.challenge.challengeId,
        code: otpDeliveries[0].code,
        deviceKey: citizenDeviceKey,
        deviceLabel: "API test phone",
        acceptTerms: true,
        acceptPrivacy: true
      }
    });
    assert(citizenAuth.token && citizenAuth.citizen.phone.endsWith("4567"), "a delivered OTP should create an optional citizen account and session");
    const reusedOtp = await apiFailure("/api/citizen/auth/otp/verify", {
      method: "POST",
      body: { challengeId: citizenChallenge.challenge.challengeId, code: otpDeliveries[0].code, deviceKey: citizenDeviceKey }
    });
    assert(reusedOtp.status === 400, "an OTP must be usable only once");
    const citizenMe = await api("/api/citizen/me", { token: citizenAuth.token });
    assert(citizenMe.citizen.id === citizenAuth.citizen.id && !JSON.stringify(citizenMe).includes(citizenPhone), "citizen profile should mask the phone number");
    const citizenPassword = "CitizenStrong!2026";
    const passwordCreated = await api("/api/citizen/password", {
      method: "POST",
      token: citizenAuth.token,
      body: { newPassword: citizenPassword }
    });
    assert(passwordCreated.citizen.hasPassword === true, "an authenticated citizen should be able to create a hashed password");
    const passwordLogin = await api("/api/citizen/auth/password/login", {
      method: "POST",
      body: { phone: citizenPhone, password: citizenPassword, deviceKey: crypto.randomUUID(), deviceLabel: "Second test device" }
    });
    const citizenSessions = await api("/api/citizen/sessions", { token: passwordLogin.token });
    assert(citizenSessions.sessions.length === 2 && citizenSessions.sessions.some((session) => session.current), "citizens should be able to inspect active sessions across devices");
    const resolvedLocation = await api("/api/public/location/resolve", {
      method: "POST",
      body: { exactLatitude: 5.525, exactLongitude: -0.25, locationSource: "gps", community: "Accra test point" }
    });
    assert(resolvedLocation.location.region === "Greater Accra", "server should derive the region from the official geometry");
    assert(resolvedLocation.location.district === "Accra Metropolitan Area (AMA)", "server should derive the MMDA from the official geometry");
    assert(!JSON.stringify(resolvedLocation).includes("5.525"), "public boundary resolution must not echo exact coordinates");
    const outsideGhana = await apiFailure("/api/public/location/resolve", {
      method: "POST",
      body: { exactLatitude: 0, exactLongitude: 0, locationSource: "gps", community: "Outside Ghana" }
    });
    assert(outsideGhana.status === 400, "coordinates outside Ghana must be rejected");
    const missingExactConsent = await apiFailure("/api/public/reports", {
      method: "POST",
      body: {
        submissionKey: crypto.randomUUID(),
        trackingSecret: crypto.randomBytes(32).toString("base64url"),
        type: "Road or bridge",
        severity: "High",
        community: "Accra",
        details: "Unsafe road edge",
        coordinates: "5.525,-0.250",
        locationSource: "gps",
        consentConfirmed: true
      }
    });
    assert(missingExactConsent.status === 400, "exact coordinates must require explicit per-report consent");
    const missingDigitalAddressConsent = await apiFailure("/api/public/reports", {
      method: "POST",
      body: {
        submissionKey: crypto.randomUUID(),
        trackingSecret: crypto.randomBytes(32).toString("base64url"),
        type: "Road or bridge",
        severity: "High",
        region: "Greater Accra",
        district: "Accra Metropolitan",
        community: "Accra",
        details: "Unsafe road edge",
        digitalAddress: "GA-184-3321",
        locationSource: "ghanapostgps",
        consentConfirmed: true
      }
    });
    assert(missingDigitalAddressConsent.status === 400, "GhanaPostGPS must require explicit per-report consent");
    const consentedDigitalAddress = await api("/api/public/reports", {
      method: "POST",
      body: {
        submissionKey: crypto.randomUUID(),
        trackingSecret: crypto.randomBytes(32).toString("base64url"),
        type: "Road or bridge",
        severity: "Medium",
        region: "Greater Accra",
        district: "Accra Metropolitan",
        community: "Central Accra",
        details: "Unsafe road edge",
        digitalAddress: "GA-184-3321",
        locationSource: "ghanapostgps",
        exactLocationConsent: true,
        exactLocationConsentAt: new Date().toISOString(),
        consentConfirmed: true
      }
    });
    assert(consentedDigitalAddress.report.locationVerificationState === "declared-mmda-matched", "consented GhanaPostGPS reports should retain an official MMDA match without claiming GPS verification");

    const emergencyContacts = await api("/api/emergency-contacts");
    const emergencyById = Object.fromEntries(emergencyContacts.config.contacts.map((contact) => [contact.serviceId, contact]));
    assert(emergencyById["general-emergency"].primaryNumber === "112", "general emergency must use 112");
    assert(emergencyById.police.primaryNumber === "191", "police must use 191");
    assert(emergencyById.fire.primaryNumber === "192", "fire must use 192");
    assert(emergencyById.ambulance.primaryNumber === "112" && emergencyById.ambulance.alternativeNumbers.includes("193"), "ambulance must use 112 with 193 as an alternative");

    const adminLogin = await api("/api/login", {
      method: "POST",
      body: { username: "admin", password: "ChangeMeAdmin!2026" }
    });
    assert(adminLogin.token, "admin login should return token");

    const routingAgency = await api("/api/admin/directory", {
      method: "POST", token: adminLogin.token,
      body: { kind: "agency", name: "Accra Metropolitan Assembly", configuration: { verified: true, publicContact: "" } }
    });
    const backupAgency = await api("/api/admin/directory", {
      method: "POST", token: adminLogin.token,
      body: { kind: "agency", name: "Greater Accra Regional Operations", configuration: { verified: true } }
    });
    const responseTarget = await api("/api/admin/directory", {
      method: "POST", token: adminLogin.token,
      body: { kind: "response-target", name: "AMA works dispatch", parentId: routingAgency.item.id, configuration: { channel: "integration", destinationConfigured: false } }
    });
    const escalationPath = await api("/api/admin/directory", {
      method: "POST", token: adminLogin.token,
      body: { kind: "escalation-path", name: "Accra regional escalation", configuration: { steps: ["MMDA review", "Regional review"] } }
    });
    await api("/api/admin/directory", {
      method: "POST", token: adminLogin.token,
      body: { kind: "category", name: "Flooding or drainage", configuration: { subcategories: ["Blocked drain", "Rising water"] } }
    });
    await api("/api/admin/directory", {
      method: "POST", token: adminLogin.token,
      body: { kind: "retention-policy", name: "Private contact retention", configuration: { days: 90, action: "redact" } }
    });
    const unsafeProductionControl = await apiFailure("/api/admin/directory", {
      method: "POST", token: adminLogin.token,
      body: { kind: "environment-control", name: "Production", configuration: { demoEnabled: true } }
    });
    assert(unsafeProductionControl.status === 400, "production controls must reject demo data enablement");
    const routeRule = await api("/api/admin/routing-rules", {
      method: "POST", token: adminLogin.token,
      body: {
        name: "Accra flooding to AMA works",
        category: "Flooding or drainage",
        region: "Greater Accra",
        district: "Accra Metropolitan",
        agencyId: routingAgency.item.id,
        responseTargetId: responseTarget.item.id,
        escalationPathId: escalationPath.item.id,
        priority: 10,
        ruleVersion: "accra-flood-v1",
        rationale: "Flooding reports in Accra Metropolitan are reviewed by the assembly works desk."
      }
    });
    assert(routeRule.rule.ruleVersion === "accra-flood-v1", "routing rules should record an explicit version and rationale");
    const invitation = await api("/api/admin/invitations", {
      method: "POST", token: adminLogin.token,
      body: { contact: "invited@example.org", agency: "Accra Metropolitan Assembly", role: "Field Responder", region: "Greater Accra", district: "Accra Metropolitan", expiresDays: 2 }
    });
    assert(invitation.inviteCode.length >= 40 && !JSON.stringify(invitation.invitation).includes(invitation.inviteCode), "an invitation code should be returned once and not stored in invitation metadata");
    const invitedUser = await api("/api/onboarding/invitations/accept", {
      method: "POST",
      body: { inviteCode: invitation.inviteCode, username: "invited.field", password: "InvitedStrong!2026", name: "Invited Field Responder" }
    });
    assert(invitedUser.user.agency === "Accra Metropolitan Assembly" && invitedUser.user.district === "Accra Metropolitan", "invitation acceptance should create the pre-scoped responder account");
    const adminConfig = await api("/api/admin/config", { token: adminLogin.token });
    assert(adminConfig.configuration.items.some((item) => item.kind === "retention-policy") && adminConfig.configuration.boundaries[0].featureCount === 261, "admin configuration should include retention controls and boundary datasets");

    const onboarding = await api("/api/onboarding/request", {
      method: "POST",
      body: {
        name: "Ama Response Lead",
        phone: "+233240000000",
        email: "ama@example.org",
        agency: "Accra Metro Response",
        roleRequested: "District Assembly",
        region: "Greater Accra",
        district: "Accra Metropolitan",
        reason: "Official district reporting desk"
      }
    });
    assert(onboarding.request.id, "onboarding request should be created");

    const pending = await api("/api/onboarding/requests?status=pending", { token: adminLogin.token });
    assert(pending.requests.length === 1, "admin should see pending onboarding request");

    const approved = await api(`/api/onboarding/${onboarding.request.id}/approve`, {
      method: "POST",
      token: adminLogin.token,
      body: {
        username: "accra.response",
        tempPassword: "StrongPass123!",
        role: "District Assembly",
        note: "Verified by operations"
      }
    });
    assert(approved.user.username === "accra.response", "approval should create requested username");

    const responderLogin = await api("/api/login", {
      method: "POST",
      body: { username: "accra.response", password: "StrongPass123!" }
    });
    assert(responderLogin.token, "approved responder should log in");
    assert(responderLogin.user.role === "District Assembly", "login should expose responder role");
    assert(responderLogin.user.agency === "Accra Metro Response", "login should expose responder institution");
    assert(responderLogin.user.region === "Greater Accra" && responderLogin.user.district === "Accra Metropolitan", "login should expose responder geographic scope");

    const responderAdminConfig = await apiFailure("/api/admin/config", { token: responderLogin.token });
    assert(responderAdminConfig.status === 403, "ordinary responders must not manage platform configuration");

    const responderEmergencyUpdate = await apiFailure("/api/admin/emergency-contacts", {
      method: "PATCH",
      token: responderLogin.token,
      body: { config: emergencyContacts.config }
    });
    assert(responderEmergencyUpdate.status === 403, "only an administrator may update emergency contacts");

    const outOfScopeUser = await api("/api/users", {
      method: "POST",
      token: adminLogin.token,
      body: {
        username: "kumasi.response",
        password: "StrongPass456!",
        role: "District Assembly",
        name: "Kumasi Response Desk",
        agency: "Kumasi Metropolitan Assembly",
        region: "Ashanti",
        district: "Kumasi Metropolitan",
        mustChangePassword: false
      }
    });
    assert(outOfScopeUser.user.district === "Kumasi Metropolitan", "admin process should create a scoped development responder");
    const outOfScopeLogin = await api("/api/login", {
      method: "POST",
      body: { username: "kumasi.response", password: "StrongPass456!" }
    });

    const sync = await api("/api/reports/sync", {
      method: "POST",
      token: responderLogin.token,
      body: {
        reports: [
          {
            id: "FN-CASE-1",
            type: "Flooding or drainage",
            subcategory: "Blocked drain",
            severity: "High",
            status: "Open",
            region: "Greater Accra",
            district: "Accra Metropolitan",
            community: "Osu",
            description: "Drain is blocked near a school entrance",
            source: "field-app"
          }
        ]
      }
    });
    assert(sync.created === 1, "report sync should create one report");

    // Report types: the server's list must match the app's list exactly.
    const appHtml = fs.readFileSync(path.join(root, "..", "..", "outputs", "fixnow-ghana.html"), "utf8");
    const appTypeOptions = appHtml.match(/<select id="type" required>([\s\S]*?)<\/select>/)[1];
    const appTypes = [...appTypeOptions.matchAll(/<option>([^<]+)<\/option>/g)].map((match) => match[1]);
    assert(appTypes.length === 11 && [...appTypes].sort().join("|") === [...REPORT_TYPES].sort().join("|"), "server report types must match the app's problem type list");
    const quickTypes = [...appHtml.matchAll(/data-quick-type="([^"]+)"/g)].map((match) => match[1]);
    assert(quickTypes.length > 0 && quickTypes.every((type) => REPORT_TYPES.includes(type)), "every Home and wizard shortcut must use a listed report type");

    // A bad type anywhere in a sync batch must reject the whole batch, leaving nothing half saved.
    const fieldCase = { severity: "High", status: "Open", region: "Greater Accra", district: "Accra Metropolitan", community: "Osu", description: "Field case", source: "field-app" };
    const mixedSync = await apiFailure("/api/reports/sync", {
      method: "POST",
      token: responderLogin.token,
      body: { reports: [{ ...fieldCase, id: "FN-CASE-GOOD", type: "Road or bridge" }, { ...fieldCase, id: "FN-CASE-BAD", type: "Not a real type" }] }
    });
    assert(mixedSync.status === 400 && mixedSync.data.error === "Choose one of the listed problem types", "sync must reject a report type that is not on the list");
    const missingTypeSync = await apiFailure("/api/reports/sync", {
      method: "POST",
      token: responderLogin.token,
      body: { reports: [{ ...fieldCase, id: "FN-CASE-NO-TYPE" }] }
    });
    assert(missingTypeSync.status === 400, "sync must reject a new report with no type");
    const afterRejectedSync = await api("/api/reports", { token: responderLogin.token });
    assert(afterRejectedSync.reports.some((report) => report.id === "FN-CASE-1"), "a listed type must still sync");
    assert(!afterRejectedSync.reports.some((report) => report.id === "FN-CASE-GOOD"), "a rejected batch must not save any of its reports");

    // Reports saved before the list existed can hold other labels. The steps further down must still work on one.
    const { DatabaseSync } = require("node:sqlite");
    const testDb = new DatabaseSync(dbFile);
    testDb.prepare("UPDATE reports SET type = 'Blocked drain' WHERE id = 'FN-CASE-1'").run();
    testDb.close();

    const publicPayload = {
      submissionKey: crypto.randomUUID(),
      trackingSecret: crypto.randomBytes(32).toString("base64url"),
      type: "Flooding or drainage",
      severity: "High",
      region: "Greater Accra",
      district: "Accra Metropolitan",
      community: "Osu near 5.525,-0.250",
      details: "Water is blocking a public road near GA-184-3321.",
      coordinates: "5.525,-0.250",
      locationSource: "gps",
      accuracyMetres: 15,
      exactLocationConsent: true,
      contact: "private-contact",
      contactConsent: true,
      consentConfirmed: true
    };
    const unlistedTypeSubmission = await apiFailure("/api/public/reports", {
      method: "POST",
      body: { ...publicPayload, submissionKey: crypto.randomUUID(), trackingSecret: crypto.randomBytes(32).toString("base64url"), type: "Not a real type" }
    });
    assert(unlistedTypeSubmission.status === 400 && unlistedTypeSubmission.data.error === "Choose one of the listed problem types", "public reports must use a listed type");
    const listedTypeSubmission = await api("/api/public/reports", {
      method: "POST",
      body: { ...publicPayload, submissionKey: crypto.randomUUID(), trackingSecret: crypto.randomBytes(32).toString("base64url"), type: "Clinic access", details: "The clinic road is cut off by standing water." }
    });
    assert(listedTypeSubmission.reference, "every listed type must be accepted, including ones without a Home shortcut");
    const clientAttachmentId = crypto.randomUUID();
    const plainPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4qQAAAAASUVORK5CYII=", "base64");
    const pngChunk = (type, data) => {
      const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
      const chunk = Buffer.alloc(data.length + 12);
      chunk.writeUInt32BE(data.length, 0);
      body.copy(chunk, 4);
      chunk.writeUInt32BE(zlib.crc32(body) >>> 0, data.length + 8);
      return chunk;
    };
    // Phone photos can carry location in their metadata, so the test photo carries some too.
    const tinyPng = Buffer.concat([
      plainPng.subarray(0, 33),
      pngChunk("tEXt", Buffer.from("Comment\0GPS 5.5250 -0.2500 private-metadata", "latin1")),
      plainPng.subarray(33)
    ]).toString("base64");
    const uploadedAttachment = await api("/api/public/uploads", {
      method: "POST",
      body: {
        uploadSessionKey: publicPayload.submissionKey,
        clientAttachmentId,
        uploadSecret: publicPayload.trackingSecret,
        fileName: "private-evidence.png",
        mimeType: "image/png",
        dataBase64: tinyPng
      }
    });
    assert(uploadedAttachment.attachment.state === "pending" && !uploadedAttachment.attachment.storageName, "uploaded evidence should enter private quarantine without exposing a storage path");
    assert(uploadedAttachment.scanning.configured === false && uploadedAttachment.scanning.queued === false, "unconfigured scanning must be reported honestly without claiming a scan occurred");
    const duplicateUpload = await api("/api/public/uploads", {
      method: "POST",
      body: {
        uploadSessionKey: publicPayload.submissionKey,
        clientAttachmentId,
        uploadSecret: publicPayload.trackingSecret,
        fileName: "private-evidence.png",
        mimeType: "image/png",
        dataBase64: tinyPng
      }
    });
    assert(duplicateUpload.attachment.attachmentId === uploadedAttachment.attachment.attachmentId && duplicateUpload.attachment.alreadyUploaded, "lost upload responses must not duplicate attachment files");
    const invalidAttachment = await apiFailure("/api/public/uploads", {
      method: "POST",
      body: {
        uploadSessionKey: publicPayload.submissionKey,
        clientAttachmentId: crypto.randomUUID(),
        uploadSecret: publicPayload.trackingSecret,
        fileName: "fake.jpg",
        mimeType: "image/jpeg",
        dataBase64: Buffer.from("not an image").toString("base64")
      }
    });
    assert(invalidAttachment.status === 400, "server must reject an image whose signature does not match an allowed format");
    publicPayload.attachmentIds = [uploadedAttachment.attachment.attachmentId];
    const publicSubmission = await api("/api/public/reports", {
      method: "POST",
      token: citizenAuth.token,
      body: publicPayload
    });
    assert(/^FN-[A-F0-9]{24}$/.test(publicSubmission.reference), "public report should receive a strong tracking reference");
    assert(publicSubmission.trackingSecret.length >= 40, "public report should receive a private tracking secret");
    assert(!JSON.stringify(publicSubmission.report).includes("private-contact"), "submission response must not expose private contact data");
    assert(!JSON.stringify(publicSubmission.report).includes("5.525"), "submission response must not expose precise coordinates");
    assert(publicSubmission.report.district === "Accra Metropolitan Area (AMA)", "submitted district text must be replaced by the official boundary result");
    assert(!JSON.stringify(publicSubmission.report).includes("GA-184-3321"), "public report text must redact digital addresses");
    assert(publicSubmission.report.attachmentCount === 1, "citizen tracking may expose only the safe attachment count");
    const accountReports = await api("/api/citizen/reports", { token: citizenAuth.token });
    assert(accountReports.reports.some((report) => report.reference === publicSubmission.reference), "an authenticated submission should be linked for cross-device access");
    const citizenExport = await api("/api/citizen/export", { token: citizenAuth.token });
    assert(citizenExport.export.reports.some((report) => report.reference === publicSubmission.reference), "citizen export should include linked reports");
    assert(!JSON.stringify(citizenExport).includes(publicSubmission.trackingSecret) && !JSON.stringify(citizenExport).includes("5.525") && !JSON.stringify(citizenExport).includes("private-contact"), "citizen export must exclude tracking secrets, exact GPS, and private contact data");
    const feedBeforeApproval = await api("/api/public/reports");
    assert(!feedBeforeApproval.reports.some((report) => report.id === publicSubmission.reference), "unmoderated reports must not appear in the public feed");
    const publicApproval = await api(`/api/reports/${publicSubmission.reference}/moderation`, {
      method: "POST",
      token: adminLogin.token,
      body: {
        action: "approve",
        note: "Location and evidence reviewed for public display",
        responsibleInstitution: "Accra Metropolitan Assembly"
      }
    });
    assert(publicApproval.report.publicVerified === true, "moderator approval should explicitly verify a report for public display");
    const publicFeed = await api("/api/public/reports?category=Flooding%20or%20drainage");
    const publicFeedReport = publicFeed.reports.find((report) => report.id === publicSubmission.reference);
    assert(publicFeedReport && publicFeedReport.verification === "moderator-verified", "approved reports should appear in the public feed with verification state");
    assert(publicFeedReport.responsibleInstitution === "Accra Metropolitan Assembly", "public feed should show only a genuinely assigned institution");
    assert(publicFeedReport.locationPrecision === "mmda-representative-point", "public map points must be MMDA representative points");
    assert(publicFeedReport.publicLatitude !== 5.525 && publicFeedReport.publicLongitude !== -0.25, "public map coordinates must not be the exact report point");
    assert(!JSON.stringify(publicFeedReport).includes("private-contact") && !JSON.stringify(publicFeedReport).includes(publicSubmission.trackingSecret), "public feed must exclude contact and tracking secrets");

    // Public photos: only a clean, privacy-checked photo on a verified report, re-written without metadata.
    const photoAttachmentId = uploadedAttachment.attachment.attachmentId;
    const photoRoute = `/api/reports/${publicSubmission.reference}/attachments/${photoAttachmentId}/public`;
    assert(publicFeedReport.safeImageState === "no-approved-public-image" && publicFeedReport.safeImages.length === 0 && publicFeedReport.safeImage === null, "a verified report shows no photo until a moderator publishes one");
    assert(!JSON.stringify(publicFeedReport).includes(photoAttachmentId), "the public feed must not reveal private attachment IDs");
    const photoBeforeReview = await apiFailure(photoRoute, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "approve", privacyChecked: true, note: "Drain and road only" }
    });
    assert(photoBeforeReview.status === 409, "a photo still in quarantine must not be published");
    await api(`/api/admin/citizen-attachments/${photoAttachmentId}/review`, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "clean", note: "Reviewed: drain and road only" }
    });
    const photoWithoutAttestation = await apiFailure(photoRoute, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "approve", note: "Drain and road only" }
    });
    assert(photoWithoutAttestation.status === 400, "publishing a photo requires the moderator's privacy check");
    const photoByCitizen = await apiFailure(photoRoute, {
      method: "POST",
      token: citizenAuth.token,
      body: { action: "approve", privacyChecked: true, note: "Looks fine" }
    });
    assert([401, 403].includes(photoByCitizen.status), `only moderators can publish photos (got ${photoByCitizen.status})`);
    const photoApproval = await api(photoRoute, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "approve", privacyChecked: true, note: "Drain and road only; no people, plates or house numbers" }
    });
    assert(photoApproval.changed === true && photoApproval.images.length === 1, "a moderator can publish one reviewed photo");
    const repeatApproval = await api(photoRoute, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "approve", privacyChecked: true, note: "Repeat click" }
    });
    assert(repeatApproval.changed === false && repeatApproval.images.length === 1, "approving the same photo twice must not publish a second copy");
    const photoFeed = await api("/api/public/reports?category=Flooding%20or%20drainage");
    const photoFeedReport = photoFeed.reports.find((report) => report.id === publicSubmission.reference);
    assert(photoFeedReport.safeImageState === "moderator-approved-public-image" && photoFeedReport.safeImages.length === 1, "the feed should mark the report as having a moderator-approved photo");
    const publicPhotoUrl = photoFeedReport.safeImages[0].url;
    assert(/^\/api\/public\/images\/[0-9a-f-]{36}$/.test(publicPhotoUrl) && !publicPhotoUrl.includes(photoAttachmentId), "public photo links must not reveal the private attachment ID");
    const publicPhoto = await fetch(`${baseUrl}${publicPhotoUrl}`);
    const publicPhotoBytes = Buffer.from(await publicPhoto.arrayBuffer());
    assert(publicPhoto.status === 200 && publicPhoto.headers.get("content-type") === "image/png", "the approved photo should be served as an image");
    assert(publicPhoto.headers.get("cross-origin-resource-policy") === "cross-origin" && publicPhoto.headers.get("x-content-type-options") === "nosniff", "public photos need safe headers that still let the app display them");
    assert(publicPhotoBytes.subarray(0, 8).equals(plainPng.subarray(0, 8)) && publicPhotoBytes.includes(Buffer.from("IDAT")) && publicPhotoBytes.includes(Buffer.from("IEND")), "the published file must still be a complete PNG");
    assert(!publicPhotoBytes.includes(Buffer.from("tEXt")) && !publicPhotoBytes.includes(Buffer.from("private-metadata")) && !publicPhotoBytes.includes(Buffer.from("5.5250")), "published photos must have their metadata removed");
    const photoAudit = await api("/api/audit", { token: adminLogin.token });
    assert(photoAudit.events.some((event) => event.action === "public_image_approved" && event.entityId === publicSubmission.reference), "publishing a photo must be audited");
    const photoWithdrawal = await api(photoRoute, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "withdraw", note: "Withdrawn during test" }
    });
    assert(photoWithdrawal.changed === true && photoWithdrawal.images.length === 0, "a moderator can withdraw a public photo");
    const withdrawnPhoto = await fetch(`${baseUrl}${publicPhotoUrl}`);
    assert(withdrawnPhoto.status === 404, "a withdrawn photo must stop being served");
    const feedAfterWithdrawal = await api("/api/public/reports?category=Flooding%20or%20drainage");
    assert(feedAfterWithdrawal.reports.find((report) => report.id === publicSubmission.reference).safeImages.length === 0, "a withdrawn photo must leave the public feed");
    const republished = await api(photoRoute, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "approve", privacyChecked: true, note: "Re-checked after withdrawal" }
    });
    assert(republished.changed === true && republished.images.length === 1 && republished.images[0].url !== publicPhotoUrl, "a re-approved photo gets a new public link");
    await api(`/api/admin/citizen-attachments/${photoAttachmentId}/review`, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "rejected", note: "A face was found on second look" }
    });
    const rejectedPhoto = await fetch(`${baseUrl}${republished.images[0].url}`);
    assert(rejectedPhoto.status === 404, "rejecting a photo after review must take it off the public feed");
    const feedAfterRejection = await api("/api/public/reports?category=Flooding%20or%20drainage");
    assert(feedAfterRejection.reports.find((report) => report.id === publicSubmission.reference).safeImageState === "no-approved-public-image", "a rejected photo must not stay public");
    const duplicateSuggestions = await api("/api/public/reports/duplicates", {
      method: "POST",
      body: {
        type: publicPayload.type,
        region: publicPayload.region,
        district: publicPayload.district,
        community: publicPayload.community,
        details: publicPayload.details,
        coordinates: publicPayload.coordinates,
        locationSource: publicPayload.locationSource,
        exactLocationConsent: true
      }
    });
    assert(duplicateSuggestions.merged === false && duplicateSuggestions.suggestions.some((suggestion) => suggestion.report.id === publicSubmission.reference), "duplicate check should suggest a close verified report without merging it");
    const confirmation = await api(`/api/public/reports/${publicSubmission.reference}/signals`, {
      method: "POST",
      body: { action: "confirmed", deviceKey: crypto.randomUUID() }
    });
    assert(confirmation.confirmations.confirmed === 1, "a structured confirmation should be counted");
    await api(`/api/public/reports/${publicSubmission.reference}/signals`, {
      method: "POST",
      body: { action: "worsening", deviceKey: crypto.randomUUID() }
    });
    const mostConfirmedFeed = await api("/api/public/reports?feed=most-confirmed");
    assert(mostConfirmedFeed.reports[0].id === publicSubmission.reference, "Most Confirmed should be a transparent feed ordering over verified reports");
    const worseningFeed = await api("/api/public/reports?feed=worsening");
    assert(worseningFeed.reports.some((report) => report.id === publicSubmission.reference && report.confirmations.worsening === 1), "Worsening should contain only genuine structured worsening observations");
    assert(mostConfirmedFeed.reports[0].safeImage === null && mostConfirmedFeed.reports[0].safeImageState === "no-approved-public-image", "public feed should never substitute unapproved private evidence for a safe image");
    const lostResponseRetry = await api("/api/public/reports", { method: "POST", body: publicPayload });
    assert(lostResponseRetry.reference === publicSubmission.reference && lostResponseRetry.alreadySubmitted, "lost-response retry must return the original report");
    const concurrent = await Promise.all([
      api("/api/public/reports", { method: "POST", body: publicPayload }),
      api("/api/public/reports", { method: "POST", body: publicPayload })
    ]);
    assert(concurrent.every((result) => result.reference === publicSubmission.reference), "simultaneous retries must return one report reference");
    const changedReuse = await apiFailure("/api/public/reports", {
      method: "POST",
      body: { ...publicPayload, details: "Changed after initial submission." }
    });
    assert(changedReuse.status === 409, "changed payload reuse must be rejected");
    const wrongSecretReuse = await apiFailure("/api/public/reports", {
      method: "POST",
      body: { ...publicPayload, trackingSecret: crypto.randomBytes(32).toString("base64url") }
    });
    assert(wrongSecretReuse.status === 409, "wrong-secret reuse must be rejected");

    const tracked = await api("/api/public/reports/track", {
      method: "POST",
      body: { reference: publicSubmission.reference, secret: publicSubmission.trackingSecret }
    });
    assert(tracked.report.reference === publicSubmission.reference, "tracking should work from another device using the reference and secret");
    assert(!JSON.stringify(tracked.report).includes("GA-184-3321"), "tracking must redact a digital address typed into public text");
    const rejectedTracking = await apiFailure("/api/public/reports/track", {
      method: "POST",
      body: { reference: publicSubmission.reference, secret: "incorrect-secret" }
    });
    assert(rejectedTracking.status === 404, "tracking must reject an incorrect secret");

    const responderReports = await api("/api/reports", { token: responderLogin.token });
    assert(responderReports.reports.some((report) => report.id === publicSubmission.reference), "scoped responder should see a report in their district");
    const responderExactLocation = await api(`/api/reports/${publicSubmission.reference}/location`, { token: responderLogin.token });
    assert(responderExactLocation.location.exactLatitude === 5.525 && responderExactLocation.location.exactLongitude === -0.25, "an in-scope responder should receive the exact location");
    assert(responderExactLocation.location.verificationState === "boundary-verified", "exact responder location should record official boundary verification");
    const recommendedRoute = await api(`/api/reports/${publicSubmission.reference}/routing/recommend`, {
      method: "POST", token: responderLogin.token, body: {}
    });
    assert(recommendedRoute.routing.recommendation.ruleVersion === "accra-flood-v1" && recommendedRoute.routing.deliveryState === "Not sent", "routing should create a versioned recommendation without claiming delivery");
    const falseDeliveryClaim = await apiFailure(`/api/admin/reports/${publicSubmission.reference}/deliveries`, {
      method: "POST", token: adminLogin.token,
      body: { state: "Sent", channel: "integration", integrationName: "Test adapter" }
    });
    assert(falseDeliveryClaim.status === 400, "sent delivery state must require a recorded external outcome");
    const queuedDelivery = await api(`/api/admin/reports/${publicSubmission.reference}/deliveries`, {
      method: "POST", token: adminLogin.token,
      body: { state: "Queued", channel: "integration", targetId: responseTarget.item.id, outcomeNote: "Waiting for an owner-configured connector." }
    });
    assert(queuedDelivery.routing.deliveryState === "Queued", "an internal queue state should be recorded without claiming transmission");
    const sentDelivery = await api(`/api/admin/reports/${publicSubmission.reference}/deliveries`, {
      method: "POST", token: adminLogin.token,
      body: { state: "Sent", channel: "integration", targetId: responseTarget.item.id, integrationName: "Test adapter", externalOutcomeId: "provider-message-001", outcomeNote: "Provider accepted the message." }
    });
    assert(sentDelivery.routing.deliveryState === "Sent" && sentDelivery.routing.deliveries.at(-1).externalOutcomeId === "provider-message-001", "sent state should retain the genuine integration outcome identifier");
    const overriddenRoute = await api(`/api/reports/${publicSubmission.reference}/routing/override`, {
      method: "POST", token: adminLogin.token,
      body: { agencyId: backupAgency.item.id, reason: "Regional equipment is required for this incident." }
    });
    assert(overriddenRoute.routing.recommendation.state === "overridden" && overriddenRoute.routing.recommendation.agencyId === backupAgency.item.id, "a human override should retain the original recommendation and reason");

    const outOfScopeReports = await api("/api/reports", { token: outOfScopeLogin.token });
    assert(!outOfScopeReports.reports.some((report) => report.id === publicSubmission.reference), "out-of-scope report must not appear in responder queue");
    const outOfScopePatch = await apiFailure(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: outOfScopeLogin.token,
      body: { status: "In Progress", publicUpdate: "Attempted out-of-scope update", updateKey: crypto.randomUUID() }
    });
    assert(outOfScopePatch.status === 403, "out-of-scope responder update must remain forbidden");
    const outOfScopeExactLocation = await apiFailure(`/api/reports/${publicSubmission.reference}/location`, {
      token: outOfScopeLogin.token
    });
    assert(outOfScopeExactLocation.status === 403, "out-of-scope responders must not retrieve exact coordinates");

    const acceptKey = crypto.randomUUID();
    const acceptedCase = await api(`/api/reports/${publicSubmission.reference}/field-action`, {
      method: "POST",
      token: responderLogin.token,
      body: {
        action: "accept",
        actionKey: acceptKey,
        publicUpdate: "The district response desk accepted this case.",
        privateNote: "Accepted during the morning field handover."
      }
    });
    assert(acceptedCase.report.operations.assignment.assignee.id === responderLogin.user.id, "a scoped responder should be able to accept an unassigned case");
    assert(acceptedCase.report.status === "Acknowledged", "accepting an open case should acknowledge it");
    const acceptedRetry = await api(`/api/reports/${publicSubmission.reference}/field-action`, {
      method: "POST",
      token: responderLogin.token,
      body: {
        action: "accept",
        actionKey: acceptKey,
        publicUpdate: "The district response desk accepted this case.",
        privateNote: "Accepted during the morning field handover."
      }
    });
    assert(acceptedRetry.report.operations.assignmentHistory.filter((entry) => entry.action === "accepted").length === 1, "field-action retries must not duplicate assignment history");
    const assignedQueue = await api("/api/reports?queue=assigned", { token: responderLogin.token });
    assert(assignedQueue.reports.some((report) => report.id === publicSubmission.reference), "the assigned queue should contain cases assigned to the authenticated responder");
    const invalidTransition = await apiFailure(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: responderLogin.token,
      body: { status: "Resolved", publicUpdate: "Attempted premature closure.", resolutionException: "No visit was made, so this should not close.", updateKey: crypto.randomUUID() }
    });
    assert(invalidTransition.status === 409, "the backend should reject invalid responder status transitions");

    const missingPublicUpdate = await apiFailure(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: responderLogin.token,
      body: { status: "In Progress", privateNote: "Internal only", updateKey: crypto.randomUUID() }
    });
    assert(missingPublicUpdate.status === 400, "status changes must require a public update");

    const missingPublicUpdateForNonStatusChange = await apiFailure(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: responderLogin.token,
      body: { severity: "Medium", privateNote: "Internal only", updateKey: crypto.randomUUID() }
    });
    assert(missingPublicUpdateForNonStatusChange.status === 400, "every responder change must require a public update");

    const updateKey = crypto.randomUUID();
    const statusUpdate = await api(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: responderLogin.token,
      body: {
        status: "In Progress",
        publicUpdate: "A response team has been assigned.",
        privateNote: "Crew lead contacted through the internal duty line.",
        updateKey
      }
    });
    assert(statusUpdate.report.status === "In Progress", "responder should update a permitted report status");
    assert(statusUpdate.report.history.some((entry) => entry.privateNote === "Crew lead contacted through the internal duty line."), "authorised responder history should include the private note");
    const idempotentStatusRetry = await api(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: responderLogin.token,
      body: {
        status: "In Progress",
        publicUpdate: "A response team has been assigned.",
        privateNote: "Crew lead contacted through the internal duty line.",
        updateKey
      }
    });
    assert(idempotentStatusRetry.report.history.filter((entry) => entry.publicUpdate === "A response team has been assigned.").length === 1, "lost-response retry must not duplicate immutable history");
    const trackedUpdate = await api("/api/public/reports/track", {
      method: "POST",
      body: { reference: publicSubmission.reference, secret: publicSubmission.trackingSecret }
    });
    assert(trackedUpdate.report.updates.some((update) => update.note === "A response team has been assigned."), "tracking must show responder public updates");
    assert(!JSON.stringify(trackedUpdate.report).includes("Crew lead contacted"), "citizen tracking must never expose private responder notes");
    assert(!JSON.stringify(trackedUpdate.report).includes("5.525"), "citizen tracking must never expose exact coordinates");

    const missingResolutionProof = await apiFailure(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: responderLogin.token,
      body: {
        status: "Resolved",
        publicUpdate: "Attempted closure without evidence.",
        updateKey: crypto.randomUUID()
      }
    });
    assert(missingResolutionProof.status === 400, "resolution must require clean evidence or a documented exception");
    const fieldEvidence = await api(`/api/reports/${publicSubmission.reference}/responder-evidence`, {
      method: "POST",
      token: responderLogin.token,
      body: {
        clientAttachmentId: crypto.randomUUID(),
        fileName: "cleared-drain.png",
        mimeType: "image/png",
        dataBase64: tinyPng
      }
    });
    assert(fieldEvidence.evidence.state === "pending" && !fieldEvidence.evidence.storageName, "responder evidence should enter private quarantine without exposing storage names");
    const reviewedEvidence = await api(`/api/admin/responder-evidence/${fieldEvidence.evidence.id}/review`, {
      method: "POST",
      token: adminLogin.token,
      body: { action: "clean", note: "Automated signature scan and moderator review passed." }
    });
    assert(reviewedEvidence.report.operations.evidence.some((item) => item.id === fieldEvidence.evidence.id && item.state === "clean"), "moderator review should make clean field evidence eligible for resolution");
    const signedEvidence = await api(`/api/reports/${publicSubmission.reference}/attachments/${fieldEvidence.evidence.id}/signed-url`, {
      method: "POST", token: responderLogin.token, body: {}
    });
    assert(signedEvidence.attachment.url.startsWith("/api/private/attachments/") && signedEvidence.attachment.state === "clean", "an authorised responder should receive a short-lived relative signed URL without a storage name");
    const signedEvidenceResponse = await fetch(`${baseUrl}${signedEvidence.attachment.url}`);
    assert(signedEvidenceResponse.ok && signedEvidenceResponse.headers.get("content-type") === "image/png", "a valid signed URL should stream the private image with no-store headers");
    assert((await signedEvidenceResponse.arrayBuffer()).byteLength > 0, "signed attachment response should contain evidence bytes");
    const tamperedSignedUrl = new URL(signedEvidence.attachment.url, baseUrl);
    tamperedSignedUrl.searchParams.set("signature", `${tamperedSignedUrl.searchParams.get("signature")}x`);
    const tamperedSignedResponse = await fetch(tamperedSignedUrl);
    assert(tamperedSignedResponse.status === 403, "tampered private attachment signatures must be rejected");
    const outOfScopeSignedEvidence = await apiFailure(`/api/reports/${publicSubmission.reference}/attachments/${fieldEvidence.evidence.id}/signed-url`, {
      method: "POST", token: outOfScopeLogin.token, body: {}
    });
    assert(outOfScopeSignedEvidence.status === 403, "out-of-scope responders must not receive private attachment URLs");

    await api(`/api/reports/${publicSubmission.reference}`, {
      method: "PATCH",
      token: responderLogin.token,
      body: {
        status: "Resolved",
        publicUpdate: "The drain was cleared and road access was restored.",
        privateNote: "Crew completion record retained internally.",
        resolutionEvidenceId: fieldEvidence.evidence.id,
        updateKey: crypto.randomUUID()
      }
    });
    const recentlyResolvedFeed = await api("/api/public/reports?feed=recently-resolved");
    assert(recentlyResolvedFeed.reports.some((report) => report.id === publicSubmission.reference), "Recently Resolved should use genuine resolved report state");
    const reporterActionKey = crypto.randomUUID();
    const reporterConfirmed = await api(`/api/public/reports/${publicSubmission.reference}/reporter-action`, {
      method: "POST", token: citizenAuth.token,
      body: { action: "confirm-resolution", actionKey: reporterActionKey }
    });
    assert(reporterConfirmed.report.reporterResolution.action === "confirm-resolution", "an account-linked reporter should be able to confirm a resolution");
    const confirmedRetry = await api(`/api/public/reports/${publicSubmission.reference}/reporter-action`, {
      method: "POST", token: citizenAuth.token,
      body: { action: "confirm-resolution", actionKey: reporterActionKey }
    });
    assert(confirmedRetry.report.updates.filter((update) => update.note === "Reporter confirmed the reported resolution.").length === 1, "reporter action retries must not duplicate immutable timeline entries");
    const preference = await api(`/api/citizen/reports/${publicSubmission.reference}/preferences`, {
      method: "PATCH", token: citizenAuth.token,
      body: { publicUpdates: true, resolution: false }
    });
    assert(preference.preference.channel === "in-app" && preference.preference.resolution === false, "per-report notification preferences must describe only a genuine in-app channel");
    const contactRemoved = await api(`/api/public/reports/${publicSubmission.reference}/contact`, {
      method: "DELETE", token: citizenAuth.token, body: {}
    });
    assert(contactRemoved.report.contactDataState === "none", "a reporter should be able to remove stored private contact channels");
    const missingReopenReason = await apiFailure(`/api/public/reports/${publicSubmission.reference}/reporter-action`, {
      method: "POST", token: citizenAuth.token,
      body: { action: "reopen", actionKey: crypto.randomUUID() }
    });
    assert(missingReopenReason.status === 400, "reopening a report must require a reason");
    const reopened = await api(`/api/public/reports/${publicSubmission.reference}/reporter-action`, {
      method: "POST", token: citizenAuth.token,
      body: { action: "reopen", actionKey: crypto.randomUUID(), reason: "Water began collecting again after the next rain." }
    });
    assert(reopened.report.status === "Reopened" && reopened.report.updates.some((update) => update.note.includes("reopened")), "the reporter should be able to reopen with an immutable public timeline event");
    assert(!JSON.stringify(reopened.report).includes("Water began collecting again"), "the reporter reopening reason must remain private by default");
    const accountReportsAfterPreference = await api("/api/citizen/reports", { token: citizenAuth.token });
    const accountReportAfterPreference = accountReportsAfterPreference.reports.find((report) => report.reference === publicSubmission.reference);
    assert(accountReportAfterPreference.notificationPreference.resolution === false, "account reports should return the saved per-report preference across devices");

    const existingSyncRejected = await apiFailure("/api/reports/sync", {
      method: "POST",
      token: responderLogin.token,
      body: { reports: [{ id: publicSubmission.reference, region: "Greater Accra", district: "Accra Metropolitan", status: "Resolved" }] }
    });
    assert(existingSyncRejected.status === 409, "bulk sync must not bypass scoped status-update history");

    const demoSubmission = await apiFailure("/api/public/reports", {
      method: "POST",
      body: {
        id: "DEMO-1",
        source: "demo",
        submissionKey: crypto.randomUUID(),
        trackingSecret: crypto.randomBytes(32).toString("base64url"),
        type: "Flooding or drainage",
        severity: "High",
        region: "Greater Accra",
        district: "Accra Metropolitan",
        community: "Osu",
        details: "Synthetic demo report",
        consentConfirmed: true
      }
    });
    assert(demoSubmission.status === 400, "demo reports must be rejected by the public API");

    const moderatorLogin = await api("/api/login", {
      method: "POST",
      body: { username: "moderator", password: "moderator123" }
    });
    assert(moderatorLogin.token, "moderator should log in");

    const moderation = await api("/api/reports/FN-CASE-1/moderation", {
      method: "POST",
      token: moderatorLogin.token,
      body: { action: "flag", note: "Needs verification before public display" }
    });
    assert(moderation.report.flagged === true, "moderation should flag report");

    const escalatedCase = await api("/api/reports/FN-CASE-1/field-action", {
      method: "POST",
      token: adminLogin.token,
      body: {
        action: "escalate",
        actionKey: crypto.randomUUID(),
        reason: "The district desk lacks the equipment required for this blockage.",
        target: "Regional operations centre",
        publicUpdate: "The case was escalated to the regional operations centre.",
        privateNote: "Escalation approved in the operations review."
      }
    });
    assert(escalatedCase.report.status === "Escalated" && escalatedCase.report.operations.escalations.length === 1, "a permitted escalation should create immutable operational history");

    const audit = await api("/api/audit", { token: moderatorLogin.token });
    assert(audit.events.some((event) => event.action === "moderation_flag"), "audit should include moderation action");
    assert(audit.events.some((event) => event.action === "report_patched" && event.entityId === publicSubmission.reference), "audit should include responder status updates");
    assert(audit.events.some((event) => event.action === "report_accept" && event.entityId === publicSubmission.reference), "audit should include responder acceptance");
    assert(audit.events.some((event) => event.action === "responder_evidence_clean" && event.entityId === publicSubmission.reference), "audit should include evidence review outcome");
    assert(!JSON.stringify(audit.events).includes("Crew lead contacted"), "audit payload must record private-note presence without private-note content");

    const olderTypeCases = await api("/api/reports", { token: adminLogin.token });
    assert(olderTypeCases.reports.find((report) => report.id === "FN-CASE-1")?.type === "Blocked drain", "reports saved with an older type must stay listed and keep their type after moderation and field actions");

    const retentionDryRun = await api("/api/admin/maintenance/retention", {
      method: "POST", token: adminLogin.token, body: { execute: false }
    });
    assert(retentionDryRun.retention.mode === "dry-run" && retentionDryRun.retention.result.contactRetentionDays === 90, "retention jobs should default to an audited dry run using admin-managed policy");
    const retentionExecute = await api("/api/admin/maintenance/retention", {
      method: "POST", token: adminLogin.token, body: { execute: true, confirmation: "RUN RETENTION" }
    });
    assert(retentionExecute.retention.mode === "execute", "retention execution should require an explicit confirmation phrase");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await apiFailure("/api/login", { method: "POST", body: { username: "invited.field", password: "wrong-password" } });
      assert(failedLogin.status === 401, "failed responder sign-in should remain generic before lockout");
    }
    const lockedLogin = await apiFailure("/api/login", { method: "POST", body: { username: "invited.field", password: "InvitedStrong!2026" } });
    assert(lockedLogin.status === 429, "account-level brute-force protection should lock sign-in after repeated failures");

    const secondSession = citizenSessions.sessions.find((session) => session.current);
    const revokedSecondSession = await api(`/api/citizen/sessions/${secondSession.id}`, { method: "DELETE", token: citizenAuth.token });
    assert(revokedSecondSession.currentSessionRevoked === false, "a citizen should be able to revoke another device without losing the current session");
    const revokedSessionUse = await apiFailure("/api/citizen/me", { token: passwordLogin.token });
    assert(revokedSessionUse.status === 401, "a revoked citizen session must stop working immediately");

    const resetDeviceKey = crypto.randomUUID();
    const resetChallenge = await api("/api/citizen/auth/password/reset/request", {
      method: "POST",
      body: { phone: citizenPhone, deviceKey: resetDeviceKey }
    });
    const resetDelivery = otpDeliveries.at(-1);
    assert(resetDelivery.purpose === "password-reset", "password reset must use a genuine purpose-labelled OTP delivery");
    const resetVerified = await api("/api/citizen/auth/password/reset/verify", {
      method: "POST",
      body: { challengeId: resetChallenge.challenge.challengeId, code: resetDelivery.code, deviceKey: resetDeviceKey }
    });
    const resetPassword = "CitizenReset!2026";
    await api("/api/citizen/auth/password/reset/confirm", {
      method: "POST",
      body: { resetToken: resetVerified.resetToken, newPassword: resetPassword }
    });
    const oldSessionAfterReset = await apiFailure("/api/citizen/me", { token: citizenAuth.token });
    assert(oldSessionAfterReset.status === 401, "password reset must invalidate every existing citizen session");
    const postResetLogin = await api("/api/citizen/auth/password/login", {
      method: "POST",
      body: { phone: citizenPhone, password: resetPassword, deviceKey: crypto.randomUUID(), deviceLabel: "Post-reset test device" }
    });
    const updatedCitizen = await api("/api/citizen/me", {
      method: "PATCH",
      token: postResetLogin.token,
      body: { displayName: "Test Citizen", avatarUrl: "https://example.org/avatar.png" }
    });
    assert(updatedCitizen.citizen.displayName === "Test Citizen", "citizens should be able to update optional profile fields");
    const wrongDeletePassword = await apiFailure("/api/citizen/account", {
      method: "DELETE", token: postResetLogin.token, body: { confirmation: "DELETE", password: "wrong password" }
    });
    assert(wrongDeletePassword.status === 403, "password-protected accounts must confirm the password before deletion");
    await api("/api/citizen/account", {
      method: "DELETE", token: postResetLogin.token, body: { confirmation: "DELETE", password: resetPassword }
    });
    const deletedAccountSession = await apiFailure("/api/citizen/me", { token: postResetLogin.token });
    assert(deletedAccountSession.status === 401, "account deletion must revoke the active session immediately");

    console.log("Backend API test passed");
  } finally {
    server.close();
    otpProvider.close();
  }
})().catch((error) => {
  server.close();
  otpProvider.close();
  console.error(error.message);
  process.exit(1);
});
