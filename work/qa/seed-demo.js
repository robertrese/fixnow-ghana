"use strict";

// Seeds the LOCAL API with four moderated demo reports so Nearby, photos and timelines can be tested.
// Every step goes through the real API: upload, submit, moderate, review photo, publish photo, responder update.
// The two photos in demo-photos/ are drawings, not real places. Label any screenshot that uses them as demo data.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { API, localSettings } = require("./common");

async function call(pathname, { method = "GET", token, body } = {}) {
  const response = await fetch(API + pathname, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4173", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status} ${JSON.stringify(data)}`);
  return data;
}

const reports = [
  {
    type: "Flooding or drainage", subcategory: "Blocked drain", severity: "High", title: "Blocked drain floods the road after rain",
    details: "The roadside drain is packed with plastic waste. After rain, water spreads across the road and into shop fronts.",
    community: "Kaneshie, near the market road", coordinates: "5.5689,-0.2365", worsening: true, accessBlocked: true, problemDuration: "weeks",
    photo: "drain.jpg", institution: "Accra Metropolitan Assembly",
    updates: [
      { action: "accept", publicUpdate: "Accra Metropolitan Assembly has received this report and assigned it to its drainage desk." },
      { status: "In Progress", publicUpdate: "A site visit to inspect the drain is planned." }
    ]
  },
  {
    type: "Road or bridge", subcategory: "Pothole", severity: "Medium", title: "Deep pothole in the middle lane",
    details: "A wide pothole has opened in the middle lane. Taxis swerve around it and it fills with water when it rains.",
    community: "Adabraka, close to the main junction", coordinates: "5.5629,-0.2093", worsening: true, problemDuration: "days",
    photo: "pothole.jpg", institution: "Korle Klottey Municipal Assembly", updates: []
  },
  {
    type: "Waste or sanitation", subcategory: "Uncollected refuse", severity: "Medium", title: "Refuse not collected for two weeks",
    details: "Refuse bags have piled up at the collection point and are spilling into the lane.",
    community: "Korle Gonno, beside the lane to the beach", coordinates: "5.5365,-0.2268", problemDuration: "weeks", updates: []
  },
  {
    type: "Electricity", subcategory: "Streetlight out", severity: "Low", title: "Streetlights out along the junction",
    details: "Three streetlights at the junction have been off for several nights, so the crossing is dark.",
    community: "Asylum Down, at the junction", coordinates: "5.5708,-0.2036", problemDuration: "days", updates: []
  }
];

(async () => {
  const settings = localSettings();
  const admin = await call("/api/login", { method: "POST", body: { username: "admin", password: settings.adminPassword } });
  const responder = await call("/api/login", { method: "POST", body: { username: "assembly", password: "assembly123" } });
  for (const item of reports) {
    const submissionKey = crypto.randomUUID();
    const trackingSecret = crypto.randomBytes(32).toString("base64url");
    const attachmentIds = [];
    if (item.photo) {
      const bytes = fs.readFileSync(path.join(__dirname, "demo-photos", item.photo));
      const upload = await call("/api/public/uploads", {
        method: "POST",
        body: { uploadSessionKey: submissionKey, clientAttachmentId: crypto.randomUUID(), uploadSecret: trackingSecret, fileName: item.photo, mimeType: "image/jpeg", dataBase64: bytes.toString("base64") }
      });
      attachmentIds.push(upload.attachment.attachmentId);
    }
    const submitted = await call("/api/public/reports", {
      method: "POST",
      body: {
        submissionKey, trackingSecret, type: item.type, subcategory: item.subcategory, severity: item.severity, title: item.title,
        region: "Greater Accra", district: "Accra Metropolitan", community: item.community, details: item.details,
        coordinates: item.coordinates, locationSource: "gps", accuracyMetres: 12, exactLocationConsent: true,
        worsening: Boolean(item.worsening), accessBlocked: Boolean(item.accessBlocked),
        problemDuration: item.problemDuration, consentConfirmed: true, attachmentIds
      }
    });
    const ref = submitted.reference;
    await call(`/api/reports/${ref}/moderation`, {
      method: "POST", token: admin.token,
      body: { action: "approve", note: "Checked against the description and location.", ...(item.institution ? { responsibleInstitution: item.institution } : {}) }
    });
    for (const attachmentId of attachmentIds) {
      await call(`/api/admin/citizen-attachments/${attachmentId}/review`, { method: "POST", token: admin.token, body: { action: "clean", note: "Viewed: no people, plates or house numbers." } });
      await call(`/api/reports/${ref}/attachments/${attachmentId}/public`, { method: "POST", token: admin.token, body: { action: "approve", privacyChecked: true, note: "Shows the problem only." } });
    }
    for (const update of item.updates) {
      if (update.action) {
        await call(`/api/reports/${ref}/field-action`, { method: "POST", token: responder.token, body: { action: update.action, actionKey: crypto.randomUUID(), publicUpdate: update.publicUpdate } });
      } else {
        await call(`/api/reports/${ref}`, { method: "PATCH", token: responder.token, body: { status: update.status, publicUpdate: update.publicUpdate, updateKey: crypto.randomUUID() } });
      }
    }
    console.log(`Seeded ${ref}: ${item.title}${attachmentIds.length ? " (with demo photo)" : ""}`);
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
