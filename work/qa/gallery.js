"use strict";

// Builds the screen gallery in design/screens: every resident screen, dialog and state, and every staff screen, on a
// phone and a laptop, in light and dark. Images are compressed WebP. It also writes index.html (to open in a browser)
// and README.md (which GitHub displays). Run it only when screens change:
//   npm run start:api, npm run start:web, npm run qa:seed (fresh local data), then: npm run gallery
// Everything shown is demo data from the local seed. Chromium only (it encodes the WebP images).
const fs = require("fs");
const path = require("path");
const { root, APP_URL, API, passWelcome, fillReportToReview, loadPlaywright, localSettings } = require("./common");

const outDir = path.join(root, "design", "screens");
const imgDir = path.join(outDir, "img");
fs.mkdirSync(imgDir, { recursive: true });
setTimeout(() => { console.error("Timed out after 20 minutes"); process.exit(1); }, 20 * 60 * 1000).unref();
const STAFF_URL = APP_URL.replace("fixnow-ghana.html", "staff.html");
const MAX_HEIGHT = { phone: 2600, laptop: 2000 };

// The gallery's screen list, in order. "figma" is the Figma page name; staff screens are labelled "Staff: ...".
const screens = [];
const shots = {}; // id -> { "light-phone": file, ... }
function screen(id, group, label, note) { if (!screens.some((s) => s.id === id)) screens.push({ id, group, label, note }); }

(async () => {
  const browser = await loadPlaywright().chromium.launch();
  const encoder = await (await browser.newContext()).newPage();
  const errors = [];

  async function save(page, scheme, device, id, { full = true } = {}) {
    await page.waitForTimeout(500);
    const fixedLayer = await page.evaluate(() => {
      const open = [...document.querySelectorAll("#modalBackdrop, #staffPage, #dialogBackdrop")].some((el) => !el.hidden);
      return open;
    }).catch(() => false);
    // In a full-length phone picture the fixed tab bar would land mid-page, so it moves to the end of the page for the shot.
    const moved = full && !fixedLayer && device === "phone" ? await page.evaluate(() => {
      const bar = document.querySelector(".s-tabs:not([hidden])") || [...document.querySelectorAll(".nav")].find((el) => getComputedStyle(el).position === "fixed");
      if (!bar) return false;
      document.body.style.setProperty("position", "relative");
      bar.style.setProperty("position", "absolute", "important");
      bar.setAttribute("data-gallery-moved", "");
      return true;
    }) : false;
    let png = await page.screenshot({ fullPage: full && !fixedLayer, type: "png" });
    if (moved) await page.evaluate(() => { const bar = document.querySelector("[data-gallery-moved]"); bar.style.removeProperty("position"); bar.removeAttribute("data-gallery-moved"); document.body.style.removeProperty("position"); });
    const webp = await encoder.evaluate(async ({ b64, maxHeight }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = Math.min(image.height, maxHeight);
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", 0.72).split(",")[1];
    }, { b64: png.toString("base64"), maxHeight: MAX_HEIGHT[device] });
    const file = `${scheme}-${device}-${id}.webp`;
    fs.writeFileSync(path.join(imgDir, file), Buffer.from(webp, "base64"));
    (shots[id] = shots[id] || {})[`${scheme}-${device}`] = file;
    if (process.argv.includes("--verbose")) console.log(`  saved ${file}`);
  }

  // Staff screens first, so the reports the resident walk submits do not clutter the moderator queue.
  for (const phase of process.argv.includes("--resident-only") ? ["resident"] : ["staff", "resident"]) for (const scheme of ["light", "dark"]) {
    for (const [device, width, height] of [["phone", 390, 844], ["laptop", 1280, 800]]) {
      const isPhone = device === "phone";
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: scheme, ...(isPhone ? { isMobile: true, hasTouch: true } : {}) });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${scheme} ${device}: ${error.message}`));
      const shot = (id, group, label, note, options) => { screen(id, group, label, note); return save(page, scheme, device, id, options); };
      // Switch screens the way the tab bar does (the tab bar is hidden during the report flow on phones).
      const nav = async (view) => { await page.evaluate((v) => setView(v), view); await page.waitForTimeout(300); };
      const closeModal = () => page.click("#modalActions button:last-child");

      // Resident screens.
      if (phase === "resident") {
      await page.goto(APP_URL, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await shot("01-welcome", "Resident", "Welcome and consent", "No Figma page; first screen after install.");
      await page.click('.nav button[data-app-view="my"]').catch(() => {});
      await passWelcome(page);
      await page.waitForTimeout(1500);
      await shot("02-home", "Resident", "v2-home");
      await nav("my");
      await shot("03-my-reports-empty", "States", "v2-my-reports: empty", "Nothing sent from this phone yet.");
      await nav("home");

      await page.click(".home-primary");
      await shot("04-step-1", "Resident", "v2-report-step-1", "What happened?");
      await page.click('[data-quick-type="Flooding or drainage"]');
      await page.click('[data-wizard-step="1"] [data-wizard-next]');
      await page.fill("#community", "Kaneshie Market, near the Odaw drain");
      await page.fill("#district", "Accra Metropolitan");
      await shot("05-step-2", "Resident", "v2-report-step-2", "Where is it?");
      await page.click('[data-wizard-step="2"] [data-wizard-next]');
      await page.fill("#reportTitle", "Blocked drain flooding the market road");
      await page.fill("#details", "The main drain beside the market is full of plastic. After rain, water runs into the stalls and the road.");
      await page.click('[data-severity="High"]');
      await shot("06-step-3", "Resident", "v2-report-step-3", "Describe the problem.");
      await page.click('[data-wizard-step="3"] [data-wizard-next]');
      await shot("07-step-4", "Resident", "v2-report-step-4", "Add photos (optional).");
      await page.click('[data-wizard-step="4"] [data-wizard-next]');
      await shot("08-step-5", "Resident", "v2-report-step-5", "Contact (optional).");
      await page.click('[data-wizard-step="5"] [data-wizard-next]');
      await page.waitForTimeout(2500);
      if (await page.evaluate(() => !document.querySelector("#modalBackdrop").hidden)) {
        await shot("09-similar", "Resident", "Similar report found nearby", "Figma canvas frame. Nothing is merged automatically.");
        await closeModal();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot("10-step-6", "Resident", "v2-report-step-6", "Review and send.");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.check("#caseConsent");
      await page.click('[data-wizard-step="6"] button[type="submit"]');
      await page.waitForTimeout(2500);
      await shot("11-success", "Resident", "v2-report-success", "Report submitted: reference and private tracking secret.");
      await closeModal();

      await nav("my");
      await page.waitForTimeout(500);
      await shot("12-my-reports", "Resident", "v2-my-reports");
      await page.locator(".my-report-card .card-link").first().click();
      await shot("13-timeline", "Resident", "v2-report-timeline", "Report progress.");
      await closeModal().catch(() => page.click("#modalBackBtn"));

      await nav("nearby");
      await page.waitForTimeout(2500);
      await shot("14-nearby", "Resident", "v2-nearby");
      await page.locator(".public-report-card [data-view-public]").first().click();
      await shot("15-detail", "Resident", "Report detail", "Figma canvas frame; approximate area only.");
      await page.click("#modalBackBtn");

      await nav("profile");
      await shot("16-profile", "Resident", "v2-profile-1 and v2-profile-2", "Account, accessibility, appearance, staff access, privacy.");
      await page.evaluate(() => setView("track"));
      await page.waitForTimeout(400);
      await shot("17-find-report", "Resident", "v2-find-report");
      await page.fill("#trackCaseInput", "FN-0000000000000000000000AA");
      await page.fill("#trackSecretInput", "not-the-right-secret-for-this-report-0000000000");
      await page.click("#trackCaseBtn");
      await page.waitForTimeout(1500);
      await shot("18-find-report-error", "States", "v2-find-report: error", "Wrong reference or secret.");

      // Dialogs.
      await nav("home");
      await page.click(".home-danger");
      await shot("19-call-112", "Dialogs", "Call confirmation (112)", "Every call goes through this confirmation.", { full: false });
      await closeModal();
      await page.click(".hotline-fire");
      await shot("20-hotline-choice", "Dialogs", "Hotline choice (Fire: 192 or 112)", "", { full: false });
      await closeModal();

      // States: saved and waiting, not sent yet, offline, Nearby could not load.
      await page.route("**/api/public/reports", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
      await fillReportToReview(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.check("#caseConsent");
      await page.click('[data-wizard-step="6"] button[type="submit"]');
      await page.waitForTimeout(2500);
      await shot("21-saved-waiting", "States", "Saved and waiting to send", "No reference or secret until the server confirms.");
      await page.click("#modalBackBtn");
      await nav("my");
      await shot("22-not-sent-yet", "States", "v2-my-reports: Not sent yet", "An unsent report on this phone.");
      await page.unroute("**/api/public/reports");
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await nav("home");
      await shot("23-offline", "States", "v2-home: offline", "Reports wait on the phone and send when the connection returns.");
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.route("**/api/public/reports**", (route) => route.abort());
      await nav("nearby");
      await page.waitForTimeout(2500);
      await shot("24-nearby-error", "States", "v2-nearby: could not load", "The server could not be reached.");
      await page.unroute("**/api/public/reports**");
      }
      await page.close();

      // Staff screens.
      if (phase === "staff") {
      const staff = await context.newPage();
      staff.on("pageerror", (error) => errors.push(`${scheme} ${device} staff: ${error.message}`));
      const sshot = (id, label, note, options) => { screen(id, "Staff", label, note); return save(staff, scheme, device, id, options); };
      const signIn = async (username, password) => {
        await staff.goto(`${STAFF_URL}`, { waitUntil: "load" });
        await staff.fill("#signInUsername", username);
        await staff.fill("#signInPassword", password);
        await staff.click("#signInForm button[type=submit]");
        await staff.waitForSelector("#staffView:not([hidden]) h1");
        await staff.waitForTimeout(700);
      };
      const signOut = async () => { await staff.click(isPhone ? ".s-topbar [data-sign-out]" : ".s-side-head [data-sign-out]"); await staff.waitForSelector("#signInView:not([hidden])"); };
      await staff.goto(STAFF_URL, { waitUntil: "load" });
      await sshot("30-staff-sign-in", "Staff: Sign in");
      await signIn("moderator", "moderator123");
      await sshot("31-staff-review", "Staff: Review queue", "Immediate danger and Critical first, then longest waiting.");
      await staff.click("[data-open]");
      await staff.waitForSelector("#pageTitle:not(:empty)");
      await sshot("32-staff-review-page", "Staff: Review page", "Private details, public preview and the office it will be routed to.", { full: false });
      await staff.click('[data-act="verify"]');
      await sshot("33-staff-verify", "Staff: Verify and publish", "", { full: false });
      await staff.click("#dialogActions button:last-child");
      await staff.click('[data-act="reject"]');
      await sshot("34-staff-reject", "Staff: Reject with a reason", "", { full: false });
      await staff.click("#dialogActions button:last-child");
      await staff.click("#pageBack");
      await staff.click('[data-tab="cases"]');
      await staff.waitForTimeout(800);
      await sshot("35-staff-all-cases", "Staff: All cases (moderator)", "Shows which verified cases no office can see yet.");
      await signOut();
      await signIn("nadmo", "nadmo123");
      await sshot("36-staff-desk-cases", "Staff: Desk cases (NADMO)", "Only cases verified or escalated and routed to this office.");
      await staff.click("[data-open]");
      await staff.waitForSelector("#pageTitle:not(:empty)");
      await sshot("37-staff-case-page", "Staff: Case page", "Exact location here only; contact only for the assigned responder and moderators.", { full: false });
      await staff.click('[data-act="update"]');
      await sshot("38-staff-update", "Staff: Post an update", "Public update and internal note kept apart.", { full: false });
      await staff.click("#dialogActions button:last-child");
      await staff.click("#pageBack");
      await signOut();
      await signIn("admin", localSettings().adminPassword);
      await staff.click('[data-tab="routing"]');
      await staff.waitForTimeout(700);
      await sshot("39-staff-routing", "Staff: Routing (admin)", "Demo offices and demo routing rules.");
      await staff.click('[data-tab="accounts"]');
      await staff.waitForTimeout(700);
      await sshot("40-staff-accounts", "Staff: Staff accounts (admin)");
      await staff.click('[data-tab="audit"]');
      await staff.waitForTimeout(700);
      await sshot("41-staff-audit", "Staff: Audit log (admin)", "Network addresses stored as a keyed hash, except staff sign-ins.");
      await signOut();
      }
      await context.close();
      console.log(`${phase} ${scheme} ${device}: done`);
    }
  }
  await browser.close();

  // index.html and README.md, from the same list.
  const groups = ["Resident", "Dialogs", "States", "Staff"];
  const variants = [["light-phone", "Phone, light"], ["dark-phone", "Phone, dark"], ["light-laptop", "Laptop, light"], ["dark-laptop", "Laptop, dark"]];
  const esc = (v) => String(v || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FixNow Ghana screens</title>
<style>
  :root { --ink:#0d2a22; --muted:#4f5c55; --line:#ddd5c2; --page:#f3eee1; --card:#fffdf8; --accent:#0a7a52; }
  @media (prefers-color-scheme: dark) { :root { --ink:#eef2ee; --muted:#b3beb6; --line:#2e3a32; --page:#131914; --card:#1f2720; --accent:#97d1a6; } }
  body { margin:0; background:var(--page); color:var(--ink); font-family:system-ui, -apple-system, "Segoe UI", sans-serif; line-height:1.5; }
  main { max-width:1400px; margin:0 auto; padding:24px 16px 48px; }
  h1 { margin:0 0 4px; } h2 { margin:32px 0 8px; } p { color:var(--muted); margin:0 0 12px; }
  .filters { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }
  .filters button { min-height:44px; padding:8px 16px; border-radius:999px; border:1px solid var(--line); background:var(--card); color:var(--ink); font:inherit; font-weight:700; cursor:pointer; }
  .filters button[aria-pressed="true"] { background:var(--ink); color:var(--page); }
  .screen { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; margin:12px 0; }
  .screen h3 { margin:0; } .screen p { margin:2px 0 10px; }
  .row { display:flex; gap:12px; overflow-x:auto; align-items:flex-start; }
  figure { margin:0; flex:0 0 auto; } figcaption { font-size:.85rem; color:var(--muted); }
  figure img { display:block; border:1px solid var(--line); border-radius:10px; height:auto; }
  figure.phone img { width:220px; } figure.laptop img { width:460px; }
  .hide-phone figure.phone, .hide-laptop figure.laptop, .hide-light figure.light, .hide-dark figure.dark { display:none; }
</style>
</head>
<body>
<main>
<h1>FixNow Ghana screens</h1>
<p>Every resident and staff screen, on a phone (390 px) and a laptop (1280 px), in light and dark. All content is demo data from the local test server; no real reports, people or places are shown. Labels are the Figma page names, or "Staff: ..." for staff screens.</p>
<div class="filters" role="group" aria-label="Show">
  <button type="button" data-toggle="phone" aria-pressed="true">Phone</button>
  <button type="button" data-toggle="laptop" aria-pressed="true">Laptop</button>
  <button type="button" data-toggle="light" aria-pressed="true">Light</button>
  <button type="button" data-toggle="dark" aria-pressed="true">Dark</button>
</div>
${groups.map((group) => `<h2>${group}</h2>
${screens.filter((s) => s.group === group).map((s) => `<section class="screen" aria-label="${esc(s.label)}"><h3>${esc(s.label)}</h3>${s.note ? `<p>${esc(s.note)}</p>` : "<p></p>"}<div class="row">
${variants.filter(([key]) => shots[s.id] && shots[s.id][key]).map(([key, caption]) => `<figure class="${key.split("-")[1]} ${key.split("-")[0]}"><img src="img/${shots[s.id][key]}" alt="${esc(s.label)}, ${caption.toLowerCase()} (demo data)" loading="lazy" /><figcaption>${caption}</figcaption></figure>`).join("\n")}
</div></section>`).join("\n")}`).join("\n")}
</main>
<script>
  document.querySelectorAll("[data-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      var on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      document.body.classList.toggle("hide-" + button.dataset.toggle, !on);
    });
  });
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, "index.html"), html);

  const md = [
    "# FixNow Ghana screens",
    "",
    "Every resident and staff screen, on a phone (390 px) and a laptop (1280 px), in light and dark. **All content is demo data** from the local test server; no real reports, people or places are shown. Labels are the Figma page names, or \"Staff: ...\" for staff screens.",
    "",
    "Open [index.html](index.html) in a browser for the same gallery with filters. To rebuild it after screens change, start the local API and web server on fresh seeded data and run `npm run gallery`.",
    ""
  ];
  for (const group of groups) {
    md.push(`## ${group}`, "", "| Screen | Phone, light | Phone, dark | Laptop, light | Laptop, dark |", "| --- | --- | --- | --- | --- |");
    for (const s of screens.filter((item) => item.group === group)) {
      const cell = (key, w) => (shots[s.id] && shots[s.id][key] ? `<img src="img/${shots[s.id][key]}" width="${w}" alt="${esc(s.label)} (demo data)" />` : "");
      md.push(`| **${s.label.replace(/\|/g, "/")}**${s.note ? `<br />${s.note.replace(/\|/g, "/")}` : ""} | ${cell("light-phone", 140)} | ${cell("dark-phone", 140)} | ${cell("light-laptop", 220)} | ${cell("dark-laptop", 220)} |`);
    }
    md.push("");
  }
  fs.writeFileSync(path.join(outDir, "README.md"), md.join("\n"));

  const bytes = fs.readdirSync(imgDir).reduce((total, file) => total + fs.statSync(path.join(imgDir, file)).size, 0);
  console.log(`Gallery: ${screens.length} screens, ${Object.values(shots).reduce((n, v) => n + Object.keys(v).length, 0)} images, ${(bytes / 1024 / 1024).toFixed(1)} MB in design/screens/img`);
  if (errors.length) { console.error(`Page errors:\n${errors.join("\n")}`); process.exit(1); }
})().catch((error) => { console.error("Gallery failed:", error.message.split("\n")[0]); process.exit(1); });
