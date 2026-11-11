"use strict";

// Shared settings for the local QA scripts. Everything here is for a local test server only.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..", "..");
const localDataDir = path.join(root, "work", "fixnow-backend", "local-data");
const settingsFile = path.join(localDataDir, "local-dev-settings.json");

const API = process.env.FIXNOW_API || "http://localhost:4180";
const APP = process.env.FIXNOW_APP || "http://localhost:4173/fixnow-ghana.html";
const APP_URL = `${APP}?api=${encodeURIComponent(API)}`;
// Pass --dark to any QA script to run it with the phone set to dark mode, and --engine=webkit or --engine=firefox
// to run it in Safari's or Firefox's engine (default: Chromium). WebKit phone runs use Playwright's iPhone profiles.
const COLOR_SCHEME = process.argv.includes("--dark") ? "dark" : "light";
const ENGINE = ((process.argv.find((arg) => arg.startsWith("--engine=")) || "--engine=chromium").split("=")[1] || "chromium").toLowerCase();
if (!["chromium", "webkit", "firefox"].includes(ENGINE)) throw new Error(`Unknown engine: ${ENGINE}`);
const ENGINE_NAME = { chromium: "Chromium", webkit: "WebKit", firefox: "Firefox" }[ENGINE];
const THEME_LABEL = ` (${ENGINE_NAME}, ${COLOR_SCHEME} mode)`;
// Screenshot folder suffix: "" for Chromium light, then "dark", "webkit", "webkit-dark", "firefox", "firefox-dark".
const RUN_FOLDER = [ENGINE === "chromium" ? "" : ENGINE, COLOR_SCHEME === "dark" ? "dark" : ""].filter(Boolean).join("-");

// Local-only admin password and signing secret, generated once and kept in an ignored folder.
function localSettings() {
  fs.mkdirSync(localDataDir, { recursive: true });
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch {
    const settings = {
      note: "Local development only. Never reuse these values anywhere else.",
      adminPassword: `Local-${crypto.randomBytes(12).toString("base64url")}`,
      signingSecret: crypto.randomBytes(32).toString("hex")
    };
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    return settings;
  }
}

// Browser context settings for this run. mobile: true asks for a phone (touch, mobile viewport handling).
function contextOptions(width, height, { mobile = false, ...extra } = {}) {
  const options = { viewport: { width, height }, colorScheme: COLOR_SCHEME, ...extra };
  if (ENGINE === "webkit" && width < 700) {
    const device = loadPlaywright().devices[width <= 320 ? "iPhone SE" : "iPhone 13"];
    return { userAgent: device.userAgent, deviceScaleFactor: device.deviceScaleFactor, isMobile: true, hasTouch: true, ...options };
  }
  if (mobile) {
    options.hasTouch = true;
    if (ENGINE !== "firefox") options.isMobile = true; // Firefox has no mobile emulation
  }
  return options;
}

async function launchBrowser() {
  return loadPlaywright()[ENGINE].launch();
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    console.error("Playwright is not installed. Run: npm install --no-save playwright@1.63.0 axe-core@4.10.2 && npx playwright install chromium webkit firefox");
    process.exit(2);
  }
}

// Gets past the welcome and consent screens the way a resident would.
async function passWelcome(page) {
  await page.goto(APP_URL, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.click("#welcomeStartBtn");
  for (const id of ["#consentPrivacy", "#consentTerms", "#consentEmergency"]) await page.check(id);
  await page.click("#welcomeAcceptBtn");
  await page.waitForTimeout(400);
}

// Fills the six report steps with a realistic flooding report and stops on step 6.
async function fillReportToReview(page, { keepSimilarPage = false } = {}) {
  await page.click(".home-primary");
  await page.click('[data-quick-type="Flooding or drainage"]');
  await page.click('[data-wizard-step="1"] [data-wizard-next]');
  await page.fill("#community", "Kaneshie Market, near the Odaw drain");
  await page.fill("#district", "Accra Metropolitan");
  await page.click('[data-wizard-step="2"] [data-wizard-next]');
  await page.fill("#reportTitle", "Blocked drain flooding the market road");
  await page.fill("#details", "The main drain beside the market is full of plastic. After rain, water runs into the stalls and the road.");
  await page.click('[data-severity="High"]');
  await page.click('[data-wizard-step="3"] [data-wizard-next]');
  await page.click('[data-wizard-step="4"] [data-wizard-next]');
  await page.click('[data-wizard-step="5"] [data-wizard-next]');
  await page.waitForTimeout(1200);
  // The demo data has a similar verified report, so step 6 opens the "Similar report found nearby" page first.
  await page.waitForTimeout(1300);
  const similarOpen = await page.evaluate(() => document.querySelector("#modalTitle").textContent === "Similar report found nearby" && !document.querySelector("#modalBackdrop").hidden);
  if (similarOpen && !keepSimilarPage) await page.click("#modalActions button:last-child"); // Continue with new report
}

module.exports = { root, localDataDir, API, APP, APP_URL, COLOR_SCHEME, ENGINE, THEME_LABEL, RUN_FOLDER, localSettings, loadPlaywright, launchBrowser, contextOptions, passWelcome, fillReportToReview };
