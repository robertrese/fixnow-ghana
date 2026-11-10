"use strict";

// Walks through FixNow like a resident and saves a screenshot of every screen.
// Usage: node work/qa/walkthrough.js [output-folder] [--dark]
// Default folder: work/qa/screenshots, or work/qa/screenshots/dark with --dark (both ignored by Git).
// Fails if the page logs an error. Needs the local API and web server running (see work/qa/README.md).
const fs = require("fs");
const path = require("path");
const { root, passWelcome, fillReportToReview, loadPlaywright, COLOR_SCHEME } = require("./common");

const folderArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const out = path.resolve(folderArg || path.join(root, "work", "qa", "screenshots", ...(COLOR_SCHEME === "dark" ? ["dark"] : [])));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const errors = [];

  // Phone, 390 x 844, at 2x like a real handset.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: COLOR_SCHEME });
  const page = await phone.newPage();
  page.on("pageerror", (error) => errors.push(`phone: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`phone console: ${message.text()}`); });
  const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({ path: path.join(out, `phone-${name}.png`) }); };

  await page.goto(require("./common").APP_URL, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await shot("01-welcome");
  await passWelcome(page);
  await page.waitForTimeout(2200);
  await shot("02-home");
  await fillReportToReview(page);
  await shot("03-report-review");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.check("#caseConsent");
  await page.click('[data-wizard-step="6"] button[type="submit"]');
  await page.waitForTimeout(2500);
  await shot("04-report-submitted");
  await page.click("#modalActions button:last-child");
  await page.click('.nav button[data-app-view="nearby"]');
  await page.waitForTimeout(1500);
  await shot("05-nearby");
  const firstCard = page.locator(".public-report-card [data-view-public]").first();
  if (await firstCard.count()) {
    await firstCard.click();
    await shot("06-nearby-detail");
    await page.click("#modalActions button:last-child");
  }
  await page.click('.nav button[data-app-view="my"]');
  await shot("07-my-reports");
  await page.click('.nav button[data-app-view="profile"]');
  await shot("08-profile");
  await page.click('.nav button[data-app-view="home"]');
  await page.click(".hotline-fire");
  await shot("09-fire-choice");
  await page.click("#modalActions button:last-child");
  await phone.close();

  // Laptop, 1280 x 800.
  const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: COLOR_SCHEME });
  const desk = await laptop.newPage();
  desk.on("pageerror", (error) => errors.push(`laptop: ${error.message}`));
  const deskShot = async (name) => { await desk.mouse.move(2, 790); await desk.waitForTimeout(2200); await desk.screenshot({ path: path.join(out, `laptop-${name}.png`) }); };
  await passWelcome(desk);
  await deskShot("01-home");
  await fillReportToReview(desk);
  await desk.evaluate(() => window.scrollTo(0, 0));
  await deskShot("02-report-review");
  await desk.click('.rail .nav button[data-app-view="nearby"]');
  await deskShot("03-nearby");
  await desk.click('.rail .nav button[data-app-view="my"]');
  await deskShot("04-my-reports");
  await laptop.close();

  await browser.close();
  console.log(`Screenshots saved to ${out}`);
  if (errors.length) {
    console.error(`Page errors:\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("No page errors.");
})().catch((error) => { console.error("Walkthrough failed:", error.message.split("\n")[0]); process.exit(1); });
