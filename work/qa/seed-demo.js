"use strict";

// Seeds the LOCAL API with four moderated demo reports so Nearby, photos and timelines can be tested, plus three
// reports waiting for moderator review and three demo offices with routing rules for the staff screens.
// Pass --review-only to add just the offices, routing rules and review reports to data that was seeded before.
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
    photo: "drain.jpg", institution: "Sample Flood Response Desk", desk: "nadmo",
    updates: [
      { action: "accept", publicUpdate: "The flood response desk has received this report and is arranging a site visit." },
      { status: "In Progress", publicUpdate: "A site visit to inspect the drain is planned." }
    ]
  },
  {
    type: "Road or bridge", subcategory: "Pothole", severity: "Medium", title: "Deep pothole in the middle lane",
    details: "A wide pothole has opened in the middle lane. Taxis swerve around it and it fills with water when it rains.",
    community: "Adabraka, close to the main junction", coordinates: "5.5629,-0.2093", worsening: true, problemDuration: "days",
    photo: "pothole.jpg", institution: "Sample District Assembly", updates: []
  },
  {
    type: "Waste or sanitation", subcategory: "Uncollected refuse", severity: "Medium", title: "Refuse not collected for two weeks",
    details: "Refuse bags have piled up at the collection point and are spilling into the lane.",
    community: "Korle Gonno, beside the lane to the beach", coordinates: "5.5365,-0.2268", problemDuration: "weeks", updates: []
  },
  {
    type: "Electricity", subcategory: "Streetlight out", severity: "Low", title: "Streetlights out along the junction",
    details: "Three streetlights at the junction have been off for several nights, so the crossing is dark.",
    community: "Near the main junction", coordinates: "5.5450,-0.2100", problemDuration: "days", updates: []
  }
];

(async () => {
  const settings = localSettings();
  const admin = await call("/api/login", { method: "POST", body: { username: "admin", password: settings.adminPassword } });
  const desks = {
    assembly: await call("/api/login", { method: "POST", body: { username: "assembly", password: "assembly123" } }),
    nadmo: await call("/api/login", { method: "POST", body: { username: "nadmo", password: "nadmo123" } }),
    utility: await call("/api/login", { method: "POST", body: { username: "utility", password: "utility123" } })
  };
  const reviewOnly = process.argv.includes("--review-only");

  // Demo offices and routing rules. Office names match the demo staff accounts' offices (the "(demo)" label is ignored
  // when matching), so each desk sees only the reports routed to it. Lower priority numbers are checked first.
  const office = async (name) => (await call("/api/admin/directory", { method: "POST", token: admin.token, body: { kind: "agency", name, configuration: { demo: true } } })).item.id;
  const offices = { assembly: await office("Sample District Assembly"), nadmo: await office("Sample Flood Response Desk"), utility: await office("Sample Water and Power Desk") };
  const rules = [
    ["Flooding to the flood response desk (demo)", "Flooding or drainage", "nadmo", 100],
    ["Water supply to the utility desk (demo)", "Water supply", "utility", 100],
    ["Electricity to the utility desk (demo)", "Electricity", "utility", 100],
    ["Waste to the assembly (demo)", "Waste or sanitation", "assembly", 100],
    ["Roads to the assembly (demo)", "Road or bridge", "assembly", 100],
    ["Anything else in Accra Metro to the assembly (demo)", "", "assembly", 1000]
  ];
  for (const [name, category, desk, priority] of rules) {
    await call("/api/admin/routing-rules", {
      method: "POST", token: admin.token,
      body: { name, category, region: "Greater Accra", district: "Accra Metropolitan", agencyId: offices[desk], priority, ruleVersion: "demo-2026-11", rationale: `Demo rule: ${category || "other"} reports in Accra Metropolitan go to this desk.` }
    });
  }
  console.log("Seeded 3 demo offices and 6 demo routing rules");
  for (const item of reviewOnly ? [] : reports) {
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
      body: { action: "approve", privacyChecked: true, note: "Checked against the description and location.", ...(item.institution ? { responsibleInstitution: item.institution } : {}) }
    });
    for (const attachmentId of attachmentIds) {
      await call(`/api/admin/citizen-attachments/${attachmentId}/review`, { method: "POST", token: admin.token, body: { action: "clean", note: "Viewed: no people, plates or house numbers." } });
      await call(`/api/reports/${ref}/attachments/${attachmentId}/public`, { method: "POST", token: admin.token, body: { action: "approve", privacyChecked: true, note: "Shows the problem only." } });
    }
    for (const update of item.updates) {
      if (update.action) {
        await call(`/api/reports/${ref}/field-action`, { method: "POST", token: desks[item.desk || "assembly"].token, body: { action: update.action, actionKey: crypto.randomUUID(), publicUpdate: update.publicUpdate } });
      } else {
        await call(`/api/reports/${ref}`, { method: "PATCH", token: desks[item.desk || "assembly"].token, body: { status: update.status, publicUpdate: update.publicUpdate, updateKey: crypto.randomUUID() } });
      }
    }
    console.log(`Seeded ${ref}: ${item.title}${attachmentIds.length ? " (with demo photo)" : ""}`);
  }


  // Reports waiting for moderator review: not verified, so they never appear publicly.
  const waiting = [
    { type: "Electricity", subcategory: "Fallen wire", severity: "Critical", immediateDanger: true, title: "Live wire hanging over the footpath",
      details: "A power line has come down after the storm and is hanging low over the footpath near the school gate.", community: "Kaneshie, near the school gate", coordinates: "5.5700,-0.2300", contact: "Demo contact 024 000 0000" },
    { type: "Flooding or drainage", subcategory: "Overflowing drain", severity: "High", title: "Drain overflowing into homes",
      details: "Water from the main drain is entering houses on the lane every time it rains.", community: "Kaneshie, along the main lane", coordinates: "5.5660,-0.2250" },
    { type: "Road or bridge", subcategory: "Damaged bridge", severity: "Medium", title: "Loose planks on the footbridge",
      details: "Two planks on the footbridge are loose and children cross it every morning.", community: "Abossey Okai, at the footbridge", coordinates: "5.5750,-0.2200" }
  ];
  for (const item of waiting) {
    const submitted = await call("/api/public/reports", {
      method: "POST",
      body: {
        submissionKey: crypto.randomUUID(), trackingSecret: crypto.randomBytes(32).toString("base64url"), type: item.type, subcategory: item.subcategory,
        severity: item.severity, immediateDanger: Boolean(item.immediateDanger), title: item.title, region: "Greater Accra", district: "Accra Metropolitan",
        community: item.community, details: item.details, coordinates: item.coordinates, locationSource: "gps", accuracyMetres: 10, exactLocationConsent: true,
        ...(item.contact ? { contact: item.contact, contactConsent: true } : {}), consentConfirmed: true, attachmentIds: []
      }
    });
    console.log(`Seeded ${submitted.reference} waiting for review: ${item.title}`);
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
