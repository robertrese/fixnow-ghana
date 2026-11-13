"use strict";

// Checks the public demo site in docs/ (build it first with npm run build:demo). Serves docs/ on a local port, uses the
// demo like a visitor on a phone, in light and dark, and fails if any request goes to another server, a call could
// start, the content security policy blocks something, an axe WCAG 2.1 A/AA violation appears, or a page errors.
// Needs no API server. Screenshots go to work/qa/screenshots/demo. Add --base=<url> to check the published site.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadPlaywright, root } = require("./common");

const site = path.join(root, "docs");
const out = path.join(root, "work", "qa", "screenshots", "demo");
fs.mkdirSync(out, { recursive: true });
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".json": "application/json" };
setTimeout(() => { console.error("Timed out after 10 minutes"); process.exit(1); }, 10 * 60 * 1000).unref();
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };

const server = http.createServer((req, res) => {
  let file = path.join(site, decodeURIComponent(req.url.split("?")[0]));
  if (file.endsWith(path.sep) || fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!file.startsWith(site) || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  // --base=https://robertrese.github.io/fixnow-ghana/ checks the live site instead of a local copy of docs/.
  const liveBase = (process.argv.find((arg) => arg.startsWith("--base=")) || "").slice(7);
  if (!liveBase && !fs.existsSync(path.join(site, "fixnow-ghana.html"))) throw new Error("docs/ is missing: run npm run build:demo first");
  if (!liveBase) await new Promise((resolve) => server.listen(4177, "127.0.0.1", resolve));
  const base = liveBase || "http://127.0.0.1:4177/";
  const browser = await loadPlaywright().chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const external = [], errors = [], dialled = [];
    page.on("request", (request) => { const url = request.url(); if (!url.startsWith(base) && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("framenavigated", (frame) => { if (/^tel:/i.test(frame.url())) dialled.push(frame.url()); });
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const axe = async (label) => {
      // A short-lived toast mid-fade has partial opacity; wait until it has gone before checking contrast.
      await page.waitForFunction(() => !(document.querySelector("#toast") && document.querySelector("#toast").classList.contains("show")), null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.evaluate(axeSource);
      const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(", ")}`));
      check(v.length === 0, `${scheme}: ${label} has 0 WCAG violations ${v.join(" | ")}`);
    };
    const shot = (name) => page.screenshot({ path: path.join(out, `${scheme}-${name}.png`) });

    await page.goto(base, { waitUntil: "load" });
    await page.waitForURL(/fixnow-ghana\.html/);
    await page.evaluate(() => document.fonts.ready);
    await page.click("#welcomeStartBtn");
    for (const id of ["#consentPrivacy", "#consentTerms", "#consentEmergency"]) await page.check(id);
    await page.click("#welcomeAcceptBtn");
    await page.waitForTimeout(800);
    check(await page.isVisible("#demoBanner") && /Nothing you enter leaves this page/.test(await page.textContent("#demoBanner")), `${scheme}: the Demo banner is shown`);
    await shot("1-home"); await axe("home");

    await page.click(".home-danger");
    await page.waitForTimeout(400);
    const callText = await page.textContent("#modalBackdrop");
    check(/This is a demo\. In a real emergency, dial 112 from your phone/.test(callText) && /112/.test(callText), `${scheme}: the 112 dialog shows the number and the demo advice`);
    check(!(await page.$$eval("#modalActions button", (b) => b.map((x) => x.textContent))).some((t) => /^Call /.test(t)), `${scheme}: there is no Call button in the demo`);
    await shot("2-call-112"); await axe("112 dialog");
    await page.click("#modalActions button:last-child");
    await page.click(".hotline-fire");
    await page.waitForTimeout(300);
    await page.click("#modalActions button:first-child"); // Use 192
    await page.waitForTimeout(300);
    check(/This is a demo/.test(await page.textContent("#modalBackdrop")), `${scheme}: hotline numbers also show the demo advice`);
    await page.click("#modalActions button:last-child");

    // Send a report: nothing leaves the page.
    await page.click(".home-primary");
    await page.click('[data-quick-type="Flooding or drainage"]');
    await page.click('[data-wizard-step="1"] [data-wizard-next]');
    await page.fill("#community", "Kaneshie");
    await page.fill("#district", "Accra Metropolitan");
    await page.click('[data-wizard-step="2"] [data-wizard-next]');
    await page.fill("#reportTitle", "Demo report");
    await page.fill("#details", "Testing the public demo: this must not be sent anywhere.");
    await page.click('[data-severity="High"]');
    for (const step of [3, 4, 5]) await page.click(`[data-wizard-step="${step}"] [data-wizard-next]`);
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => !document.querySelector("#modalBackdrop").hidden)) await page.click("#modalActions button:last-child");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.check("#caseConsent");
    await page.click('[data-wizard-step="6"] button[type="submit"]');
    await page.waitForTimeout(1500);
    check(await page.textContent("#modalTitle") === "Demo report saved" && /nothing was sent/.test(await page.textContent("#modalBackdrop")), `${scheme}: sending a report says nothing was sent`);
    await shot("3-demo-report-saved"); await axe("demo report saved");
    await page.click('#modalActions button:text-is("View in My reports")');
    await page.waitForTimeout(500);
    check(/Demo only/.test(await page.textContent("main")) && !/not sent yet/i.test(await page.textContent("main")), `${scheme}: the report is labelled Demo only in My reports, never Not sent yet`);

    await page.evaluate(() => setView("nearby"));
    await page.waitForTimeout(800);
    check(/sample reports? for the demo/i.test(await page.textContent("#nearbyResultSummary")) && (await page.$$("#nearbyReportList .demo-sample-card")).length > 0, `${scheme}: Nearby shows sample reports (the demo has no server)`);
    await shot("4-nearby"); await axe("nearby");

    await page.evaluate(() => setView("profile"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Verified staff access/.test(b.textContent)).click());
    await page.waitForTimeout(400);
    check(await page.textContent("#modalTitle") === "Staff sign-in is not in the demo", `${scheme}: staff access explains and offers the gallery`);
    await shot("5-staff-access"); await axe("staff access dialog");
    await page.click("#modalActions button:first-child");
    await page.waitForURL(/screens\//);
    await page.waitForTimeout(800);
    check(await page.evaluate(() => document.images.length > 100 && [...document.images].slice(0, 8).every((i) => !i.complete || i.naturalWidth > 0)), `${scheme}: the screen gallery opens at /screens/ with its images`);

    await page.goto(base + "staff.html", { waitUntil: "load" });
    check(/no staff accounts/.test(await page.textContent("#signInStatus")), `${scheme}: the staff page says the demo has no staff accounts`);

    check(external.length === 0, `${scheme}: no request left the site ${[...new Set(external)].slice(0, 5).join(", ")}`);
    check(dialled.length === 0, `${scheme}: no call was started`);
    check((await page.evaluate(() => window.__csp)).length === 0, `${scheme}: the content security policy blocked nothing`);
    check(errors.length === 0, `${scheme}: no page errors ${errors.join("; ")}`);
    await context.close();
  }
  await browser.close();
  server.close();
  console.log(failures ? `${failures} demo check(s) failed` : "Public demo checks passed");
  process.exit(failures ? 1 : 0);
})().catch((error) => { server.close(); console.error("Demo check failed:", error.message.split("\n")[0]); process.exit(1); });
