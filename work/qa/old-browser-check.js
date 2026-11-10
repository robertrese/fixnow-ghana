"use strict";

// Older phones (iOS 15.0 to 15.3, Chrome before 92) and plain-HTTP pages have no crypto.randomUUID.
// This removes it before the page loads, then checks that the app starts, makes valid IDs and can save a report.
// Needs the local API and web server running (see work/qa/README.md). Pass --engine=webkit to use Safari's engine.
const { passWelcome, fillReportToReview, launchBrowser, contextOptions, THEME_LABEL } = require("./common");

(async () => {
  const browser = await launchBrowser();
  const page = await (await browser.newContext(contextOptions(390, 844, { mobile: true }))).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    delete Crypto.prototype.randomUUID;
    if (window.crypto) delete window.crypto.randomUUID;
  });
  await passWelcome(page);
  const state = await page.evaluate(() => ({
    randomUUID: typeof crypto.randomUUID,
    id: makeUuid(),
    deviceKey: localStorage.getItem("fixnow-gh-v3-public-device-key") || ""
  }));
  const problems = [];
  if (state.randomUUID !== "undefined") problems.push("crypto.randomUUID was not removed, so the test proves nothing");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!uuid.test(state.id)) problems.push(`makeUuid() gave an invalid ID: ${state.id}`);
  if (!uuid.test(state.deviceKey)) problems.push("the app did not finish starting (no device key was saved)");
  await fillReportToReview(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.check("#caseConsent");
  await page.click('[data-wizard-step="6"] button[type="submit"]');
  await page.waitForTimeout(2500);
  const title = await page.textContent("#modalTitle");
  if (!/Report submitted|Saved and waiting to send/.test(title)) problems.push(`saving a report failed: the result was "${title}"`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fixnow-gh-v3-reports") || "[]").length);
  if (saved < 1) problems.push("no report was saved on the device");
  await browser.close();
  if (errors.length) problems.push(`page errors: ${errors.join("; ")}`);
  if (problems.length) {
    console.error(`Older-browser check failed${THEME_LABEL}:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`Without crypto.randomUUID the app starts, makes valid IDs and saves a report ("${title}")${THEME_LABEL}.`);
})().catch((error) => { console.error("Check failed:", error.message.split("\n")[0]); process.exit(1); });
