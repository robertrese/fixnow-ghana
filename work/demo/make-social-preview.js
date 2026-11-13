"use strict";

// Renders work/demo/social-preview.html to work/demo/social-preview.png (1200 x 630), the link-preview image that
// npm run build:demo copies into docs/. Needs Playwright (see work/qa/README.md). Run: node work/demo/make-social-preview.js
const path = require("path");
const { pathToFileURL } = require("url");
const { loadPlaywright } = require("../qa/common");

(async () => {
  const browser = await loadPlaywright().chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, "social-preview.html")).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(__dirname, "social-preview.png");
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log(`Link preview image written to ${path.relative(process.cwd(), out)} (1200 x 630)`);
})().catch((error) => { console.error(error.message); process.exit(1); });
