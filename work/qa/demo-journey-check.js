"use strict";

// End-to-end check of the public demo's complete journey, on the built demo site in docs/ (run npm run build:demo
// first). Like a visitor, it:
//   - browses Nearby: 11 sample reports, each labelled Sample, and every type and status filter works;
//   - reports a problem next to a sample report and gets "Similar report found nearby";
//   - sends it and follows the seven simulated steps with Show next step, once confirming the fix and, after Restart,
//     once reopening;
//   - checks every simulated step says Simulated, only sample offices appear, the work-done photo is a sample drawing
//     labelled Planned, and no screen names a real agency as a FixNow office;
//   - checks 0 WCAG violations along the way, focus on each new step, no request leaving the site, no call, no CSP
//     report and no page error.
// Phone (light and dark) and laptop. Add --engine=webkit or --engine=firefox. Screenshots: work/qa/screenshots/journey.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { root, ENGINE, launchBrowser, contextOptions } = require("./common");

const site = path.join(root, "docs");
const out = path.join(root, "work", "qa", "screenshots", "journey" + (ENGINE === "chromium" ? "" : `-${ENGINE}`));
fs.mkdirSync(out, { recursive: true });
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".json": "application/json", ".txt": "text/plain" };
// Real agencies must never appear as offices in the demo (they do not use FixNow).
const REAL_AGENCIES = /\b(AMA|NADMO|ECG|NEDCo|GWCL|Ghana Water|Ghana Police Service|Ghana National Fire Service|Accra Metropolitan Assembly|Korle Klottey Municipal Assembly)\b/;
setTimeout(() => { console.error("Timed out after 10 minutes"); process.exit(1); }, 10 * 60 * 1000).unref();
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };

const server = http.createServer((req, res) => {
  let file = path.join(site, decodeURIComponent(req.url.split("?")[0]));
  if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, "index.html");
  if (!file.startsWith(site) || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  if (!fs.existsSync(path.join(site, "demo-journey.js"))) throw new Error("docs/ has no demo journey: run npm run build:demo first");
  await new Promise((resolve) => server.listen(4179, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:4179/";
  const browser = await launchBrowser();
  const runs = [["phone", 390, 844, "light"], ["phone", 390, 844, "dark"], ["laptop", 1280, 800, "light"]];
  for (const [device, width, height, scheme] of runs) {
    const label = `${device} ${scheme}`;
    const context = await browser.newContext({ ...contextOptions(width, height, { mobile: device === "phone" }), colorScheme: scheme, serviceWorkers: "block" });
    const page = await context.newPage();
    const external = [], errors = [], dialled = [], seen = [];
    page.on("request", (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u); });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("framenavigated", (frame) => { if (/^tel:/i.test(frame.url())) dialled.push(frame.url()); });
    await page.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
    const shot = (name) => page.screenshot({ path: path.join(out, `${device}-${scheme}-${name}.png`) });
    const keep = async () => seen.push(await page.evaluate(() => document.body.innerText));
    const axeFails = [];
    const axe = async (name) => {
      await page.waitForTimeout(300);
      await page.evaluate(axeSource);
      const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(", ")}`));
      if (v.length) axeFails.push(`${name}: ${v.join(" | ")}`);
    };
    const modalText = () => page.textContent("#modalBackdrop");
    const hasSampleTag = () => page.evaluate(() => [...document.querySelectorAll("#modalBackdrop .demo-sample-tag")].some((t) => t.textContent === "Sample"));
    const clickAction = async (text) => { await page.click(`#modalActions button:text-is("${text}")`); await page.waitForTimeout(500); };

    await page.goto(base, { waitUntil: "load" });
    await page.waitForURL(/fixnow-ghana\.html/);
    await page.evaluate(() => document.fonts.ready);
    await page.click("#welcomeStartBtn");
    for (const id of ["#consentPrivacy", "#consentTerms", "#consentEmergency"]) await page.check(id);
    await page.click("#welcomeAcceptBtn");
    await page.waitForTimeout(500);

    // ---------- Nearby: sample reports and filters ----------
    await page.evaluate(() => setView("nearby"));
    await page.waitForTimeout(500);
    const cards = await page.$$eval("#nearbyReportList .demo-sample-card", (c) => c.map((x) => x.innerText));
    check(cards.length === 11 && cards.every((t) => /\bSample\b/.test(t)), `${label}: Nearby lists 11 sample reports, each labelled Sample (${cards.length})`);
    if (device === "phone" && scheme === "light") await shot("01-nearby");
    await axe("Nearby");
    await keep();
    const lists = await page.evaluate(() => ({ types: REPORT_TYPES, statuses: REPORT_STATUSES }));
    const choose = (id, value) => page.evaluate(([i, v]) => { const s = document.querySelector(i); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, [id, value]);
    const shown = () => page.$$eval("#nearbyReportList .demo-sample-card", (c) => c.map((x) => x.dataset.sampleReport));
    const filterFails = [];
    for (const type of lists.types) {
      await choose("#nearbyCategoryFilter", type);
      const ids = await shown();
      const expected = await page.evaluate((t) => window.fixNowDemo.samples.filter((r) => r.category === t).map((r) => r.id), type);
      if (!ids.length || JSON.stringify(ids) !== JSON.stringify(expected)) filterFails.push(type);
    }
    await choose("#nearbyCategoryFilter", "");
    for (const status of lists.statuses) {
      await choose("#nearbyStatusFilter", status);
      const ids = await shown();
      const expected = await page.evaluate((s) => window.fixNowDemo.samples.filter((r) => r.status === s).map((r) => r.id), status);
      if (!ids.length || JSON.stringify(ids) !== JSON.stringify(expected)) filterFails.push(status);
    }
    await choose("#nearbyStatusFilter", "");
    await choose("#nearbyRegionFilter", "Ashanti");
    const ashanti = await shown();
    await choose("#nearbyRegionFilter", "");
    await choose("#nearbyCategoryFilter", "Other");
    await choose("#nearbyStatusFilter", "Resolved");
    const none = await page.textContent("#nearbyReportList");
    await choose("#nearbyCategoryFilter", "");
    await choose("#nearbyStatusFilter", "");
    check(filterFails.length === 0 && ashanti.length === 1 && /No verified reports match these filters/.test(none), `${label}: every type, status and region filter shows exactly the matching sample reports ${filterFails.join(", ")}`);
    await page.click('[data-view-sample="SAMPLE-01"]');
    await page.waitForTimeout(400);
    check(await hasSampleTag() && /Sample District Assembly/.test(await modalText()), `${label}: a sample report page says Sample and names a sample office`);
    await keep();
    await page.evaluate(() => closeModal());

    // ---------- A new report next to a sample one ----------
    await page.evaluate(() => setView("home"));
    await page.click(".home-primary");
    await page.click('[data-quick-type="Flooding or drainage"]');
    await page.click('[data-wizard-step="1"] [data-wizard-next]');
    await page.waitForTimeout(500);
    await page.fill("#community", "Odaw drain area, near the footbridge");
    await page.fill("#district", "Accra Metropolitan");
    await page.click('[data-wizard-step="2"] [data-wizard-next]');
    await page.fill("#reportTitle", "Drain overflowing onto the road");
    await page.fill("#details", "After rain the drain overflows and water covers the road.");
    await page.click('[data-severity="High"]');
    for (const step of [3, 4, 5]) { await page.click(`[data-wizard-step="${step}"] [data-wizard-next]`); await page.waitForTimeout(400); }
    await page.waitForTimeout(1200);
    const similar = await page.evaluate(() => !document.querySelector("#modalBackdrop").hidden && document.querySelector("#modalTitle").textContent);
    check(similar === "Similar report found nearby" && /Nothing is merged automatically/.test(await modalText()), `${label}: a report next to a sample report gets "Similar report found nearby" (${similar})`);
    if (device === "phone" && scheme === "light") await shot("02-similar-report");
    await axe("Similar report");
    await keep();
    await clickAction("View existing report");
    check(await hasSampleTag(), `${label}: View existing report opens the sample report`);
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(300);
    const hint = await page.textContent(".review-route");
    check(/Sample office/.test(hint) && /Sample District Assembly/.test(hint) && /No real agency uses FixNow yet/.test(hint), `${label}: the review step shows a sample office and says no real agency uses FixNow`);
    await keep();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.check("#caseConsent");
    await page.click('[data-wizard-step="6"] button[type="submit"]');
    await page.waitForTimeout(1200);
    check(await page.textContent("#modalTitle") === "Demo report saved", `${label}: sending opens Demo report saved`);
    await keep();

    // ---------- The seven simulated steps ----------
    const started = Date.now();
    let clicks = 0;
    await clickAction("Follow this report (simulated)"); clicks++;
    const stepFails = [];
    const readStep = (n) => page.evaluate((i) => ({
      progress: document.querySelector(".demo-progress").textContent,
      heading: (document.querySelector("#demoStep" + i) || {}).textContent || "",
      body: (document.querySelector("#demoStep" + i) || { closest: () => null }).closest("li").innerText,
      focused: document.activeElement && document.activeElement.id === "demoStep" + i,
      words: (document.querySelector("#demoStep" + i).closest("li").innerText.match(/\S+/g) || []).length
    }), n);
    for (let n = 1; n <= 7; n++) {
      if (n > 1) { await clickAction("Show next step"); clicks++; }
      const s = await readStep(n);
      if (s.progress !== `Simulated step ${n} of 7`) stepFails.push(`step ${n} progress "${s.progress}"`);
      if (n > 1 && !/Simulated/.test(s.heading)) stepFails.push(`step ${n} not labelled Simulated`);
      if (n > 1 && !s.focused) stepFails.push(`step ${n} heading not focused`);
      if (s.words > 70) stepFails.push(`step ${n} too long (${s.words} words)`);
      if (n === 2 && !/no names, phone numbers or exact addresses/.test(s.body)) stepFails.push("step 2 does not say what moderators confirm");
      if (n === 3 && !/Sample District Assembly/.test(s.body)) stepFails.push("step 3 office is not a sample office");
      if (n === 6 && !(/Sample photo/.test(s.body) && /Planned: the real app doesn't show this yet/.test(s.body))) stepFails.push("step 6 photo is not labelled Sample photo and Planned");
      if (device === "phone" && scheme === "light" && [2, 3, 6].includes(n)) await shot(`0${n + 1}-step-${n}`);
      if ([1, 2, 6].includes(n)) await axe(`journey step ${n}`);
      await keep();
    }
    await page.click('[data-demo-answer="confirmed"]'); clicks++;
    await page.waitForTimeout(400);
    const confirmed = await page.evaluate(() => ({ text: document.querySelector("#demoStep7").closest("li").innerText, pill: document.querySelector(".demo-journey .report-detail-summary .status-pill").textContent }));
    check(/You confirmed it is fixed/.test(confirmed.text) && confirmed.pill === "Resolved", `${label}: confirming the fix ends the journey as Resolved`);
    const seconds = Math.round((Date.now() - started) / 1000);
    check(clicks === 8, `${label}: the journey takes ${clicks} taps (the test took ${seconds} s)`);
    if (device === "phone" && scheme === "light") await shot("08-confirmed");
    await axe("journey confirmed");
    await keep();

    // Restart, then reopen at the end.
    await clickAction("Restart");
    check((await readStep(1)).progress === "Simulated step 1 of 7", `${label}: Restart goes back to step 1`);
    for (let n = 2; n <= 7; n++) await clickAction("Show next step");
    await page.click('[data-demo-answer="reopened"]');
    await page.waitForTimeout(400);
    const reopened = await page.evaluate(() => ({ text: document.querySelector("#demoStep7").closest("li").innerText, pill: document.querySelector(".demo-journey .report-detail-summary .status-pill").textContent }));
    check(/You reopened the report/.test(reopened.text) && reopened.pill === "Reopened", `${label}: reopening ends the journey as Reopened`);
    if (device === "phone" && scheme === "light") await shot("09-reopened");
    await keep();
    check(stepFails.length === 0, `${label}: every step is labelled, focused, short and accurate ${stepFails.join("; ")}`);

    // The journey is kept on the demo report and opens again from My reports.
    await clickAction("Close");
    await page.evaluate(() => setView("my"));
    await page.click("[data-details-local]");
    await page.waitForTimeout(400);
    check(await page.textContent("#modalTitle") === "Follow your report", `${label}: the report opens its journey again from My reports`);
    await page.evaluate(() => closeModal());

    const agencies = seen.filter((t) => REAL_AGENCIES.test(t)).map((t) => t.match(REAL_AGENCIES)[0]);
    check(agencies.length === 0, `${label}: no demo screen names a real agency ${[...new Set(agencies)].join(", ")}`);
    check(axeFails.length === 0, `${label}: 0 WCAG violations on every journey screen ${axeFails.join(" || ")}`);
    check(external.length === 0, `${label}: no request left the site ${[...new Set(external)].slice(0, 4).join(", ")}`);
    check(dialled.length === 0, `${label}: no call was started`);
    check((await page.evaluate(() => window.__csp)).length === 0, `${label}: the content security policy blocked nothing`);
    check(errors.length === 0, `${label}: no page errors ${errors.join("; ")}`);
    await context.close();
  }
  await browser.close();
  server.close();
  console.log(failures ? `${failures} demo journey check(s) failed` : `Demo journey checks passed (${ENGINE})`);
  process.exit(failures ? 1 : 0);
})().catch((error) => { server.close(); console.error("Demo journey check failed:", error.message.split("\n")[0]); process.exit(1); });
