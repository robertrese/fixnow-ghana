"use strict";

// Opens every full-screen page (similar report, report submitted, saved and waiting, report progress, report detail,
// find your report) in light and dark, screenshots it into work/qa/screenshots/pages, and checks that the page Back
// button and the browser Back button close it while staying in the app. Needs the local API and web server running.
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..", "..");
const { passWelcome, fillReportToReview, loadPlaywright } = require("./common");
const out = path.join(root, "work/qa/screenshots/pages");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
fs.mkdirSync(out, { recursive: true });
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };
setTimeout(() => { console.error("Timed out after 10 minutes"); process.exit(1); }, 10 * 60 * 1000).unref();

(async () => {
  const browser = await loadPlaywright().chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const shot = async (name) => {
      await page.screenshot({ path: path.join(out, `${scheme}-${name}.png`) });
      await page.evaluate(axeSource);
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`));
      check(violations.length === 0, `${scheme}: ${name} has 0 WCAG violations ${violations.join(" | ")}`);
    };
    const isPage = () => page.evaluate(() => !document.querySelector("#modalBackdrop").hidden && document.querySelector("#modalBackdrop").classList.contains("is-page"));
    const closed = () => page.evaluate(() => document.querySelector("#modalBackdrop").hidden);
    await passWelcome(page);
    const appUrl = page.url();

    // Similar report: the demo data has a verified flooding report at Kaneshie, like the walkthrough's draft.
    await fillReportToReview(page, { keepSimilarPage: true });
    await page.waitForTimeout(500);
    const similar = await page.evaluate(() => document.querySelector("#modalTitle").textContent);
    check(similar === "Similar report found nearby" && await isPage(), `${scheme}: similar report opens as a full page (${similar})`);
    await page.waitForTimeout(400); await shot("1-similar-report");
    await page.click("#modalActions button:last-child"); // Continue with new report
    check(await closed() && await page.evaluate(() => document.body.dataset.view) === "report", `${scheme}: Continue with new report returns to the review step`);

    // Report submitted, closed with the browser's Back.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.check("#caseConsent");
    await page.click('[data-wizard-step="6"] button[type="submit"]');
    await page.waitForTimeout(2500);
    check(await isPage() && await page.textContent("#modalTitle") === "Report submitted", `${scheme}: Report submitted is a full page`);
    await shot("2-report-submitted");
    await page.goBack();
    await page.waitForTimeout(500);
    check(await closed() && page.url() === appUrl, `${scheme}: browser Back closes Report submitted and stays in the app`);

    // Report timeline from My reports, closed with the Back button.
    await page.evaluate(() => setView("my"));
    await page.waitForTimeout(500);
    await page.locator(".my-report-card .card-link").first().click();
    await page.waitForTimeout(500);
    check(await isPage() && (await page.textContent("#modalTitle")) === "Report progress", `${scheme}: report timeline is a full page titled Report progress`);
    await shot("3-report-timeline");
    await page.click("#modalBackBtn");
    await page.waitForTimeout(400);
    check(await closed() && page.url() === appUrl && await page.evaluate(() => !(history.state && history.state.fixnowPage)), `${scheme}: Back button closes the timeline and removes its history entry`);

    // Report detail from Nearby.
    await page.evaluate(() => setView("nearby"));
    await page.waitForTimeout(2500);
    await page.locator(".public-report-card [data-view-public]").first().click();
    await page.waitForTimeout(500);
    check(await isPage(), `${scheme}: report detail is a full page`);
    await shot("4-report-detail");
    await page.goBack();
    await page.waitForTimeout(400);
    check(await closed() && await page.evaluate(() => document.body.dataset.view) === "nearby", `${scheme}: browser Back from report detail returns to Nearby`);

    // Saved and waiting to send.
    await page.route("**/api/public/reports", (r) => r.abort());
    await page.evaluate(() => setView("home"));
    await fillReportToReview(page);
    await page.waitForTimeout(1500);
    if (await isPage()) await page.click("#modalActions button:last-child");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.check("#caseConsent");
    await page.click('[data-wizard-step="6"] button[type="submit"]');
    await page.waitForTimeout(2500);
    check(await isPage() && await page.textContent("#modalTitle") === "Saved and waiting to send", `${scheme}: Saved and waiting to send is a full page`);
    await shot("5-saved-waiting");
    await page.click("#modalBackBtn");
    await page.unroute("**/api/public/reports");

    // Find your report.
    await page.evaluate(() => setView("track"));
    await page.waitForTimeout(500);
    await shot("6-find-report");
    check(errors.length === 0, `${scheme}: no page errors ${errors.join("; ")}`);
  }
  await browser.close();
  console.log(failures ? `${failures} check(s) failed` : "all page checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); });
