"use strict";

// Records the computed style of every element on the app's screens, so a CSS cleanup can prove it changed nothing.
//   node work/qa/style-snapshot.js save <file>      before the change
//   node work/qa/style-snapshot.js compare <file>   after the change: fails on any difference
// Needs the local API and web server running. Runs in Chromium with a fixed clock and reduced motion, on phone and
// laptop, in light and dark, with Large text and High contrast, including dialogs and the staff portal.
const fs = require("fs");
const { passWelcome, fillReportToReview, loadPlaywright, APP_URL } = require("./common");

const [mode, file] = process.argv.slice(2);
if (!["save", "compare"].includes(mode) || !file) {
  console.error("Usage: node work/qa/style-snapshot.js save|compare <file>");
  process.exit(2);
}

// Each distinct style string is stored once; screens keep an index into that list.
const styles = [];
const styleIndex = new Map();
const keep = (style) => { if (!styleIndex.has(style)) { styleIndex.set(style, styles.length); styles.push(style); } return styleIndex.get(style); };
let propNames = [];
let lastStep = "start";

const collect = (page) => page.evaluate(() => {
  const props = [...getComputedStyle(document.documentElement)].filter((name) => !name.startsWith("--") && !/^(transition|animation)/.test(name)).sort();
  const out = [];
  const read = (cs) => props.map((name) => cs.getPropertyValue(name)).join("|");
  const walk = (el, path) => {
    if (el.getClientRects().length || el === document.body) {
      out.push([path, read(getComputedStyle(el))]);
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content && ps.content !== "none") out.push([path + pseudo, read(ps)]);
      }
    }
    [...el.children].forEach((child, i) => {
      if (!["SCRIPT", "STYLE", "TEMPLATE"].includes(child.tagName)) walk(child, `${path}>${child.tagName.toLowerCase()}${child.id ? "#" + child.id : ""}:${i}`);
    });
  };
  walk(document.body, "body");
  return { props, out };
});

const runs = [
  { width: 390, height: 844, scheme: "light" },
  { width: 390, height: 844, scheme: "dark" },
  { width: 390, height: 844, scheme: "dark", contrast: true },
  { width: 320, height: 640, scheme: "light", large: true, contrast: true },
  { width: 320, height: 640, scheme: "dark", large: true },
  { width: 1280, height: 800, scheme: "light" },
  { width: 1280, height: 800, scheme: "dark" }
];

(async () => {
  const browser = await loadPlaywright().chromium.launch();
  const snapshot = {};
  for (const run of runs) {
    const context = await browser.newContext({ viewport: { width: run.width, height: run.height }, colorScheme: run.scheme, isMobile: run.width < 700, hasTouch: run.width < 700, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-11-11T09:30:00Z")); // same greeting, "time ago" and Last saved text every run
    const tag = `${run.width}-${run.scheme}${run.large ? "-large" : ""}${run.contrast ? "-contrast" : ""}`;
    const take = async (name) => {
      lastStep = `${tag} ${name}`;
      await page.waitForTimeout(500);
      const result = await collect(page);
      propNames = result.props;
      snapshot[`${tag} ${name}`] = Object.fromEntries(result.out.map(([path, style]) => [path, keep(style)]));
    };
    const closeDialog = () => page.evaluate(() => typeof closeModal === "function" && closeModal());
    await page.goto(APP_URL, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await take("welcome");
    await page.click("#welcomeStartBtn");
    await take("consent");
    await passWelcome(page);
    await page.evaluate(({ large, contrast }) => {
      setView("profile");
      if (large) document.querySelector("#largeTextBtn").click();
      if (contrast) document.querySelector("#contrastBtn").click();
      setView("home");
    }, run);
    await page.waitForTimeout(1500);
    await take("home");
    await page.click(".hotline-fire");
    await take("hotline choice");
    await page.click("#modalActions button:first-child");
    await take("call confirmation");
    await closeDialog();
    await page.click(".home-primary");
    await take("report step 1");
    await page.evaluate(() => setView("home"));
    await fillReportToReview(page);
    await take("report review");
    await page.route("**/api/public/reports", (route) => route.abort());
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.check("#caseConsent");
    await page.click('[data-wizard-step="6"] button[type="submit"]');
    await page.waitForTimeout(2500);
    await take("saved and waiting");
    await closeDialog();
    await page.unroute("**/api/public/reports");
    for (const view of ["nearby", "my", "profile"]) {
      await page.evaluate((v) => setView(v), view);
      await page.waitForTimeout(view === "nearby" ? 2500 : 600);
      await take(view);
    }
    await page.evaluate(() => setView("nearby"));
    await page.waitForTimeout(1500);
    await page.click("#nearbyNotificationsBtn");
    await take("notifications");
    await closeDialog();
    await page.locator(".public-report-card [data-view-public]").first().click();
    await take("public report detail");
    await closeDialog();
    await page.evaluate(() => setView("profile"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Verified staff access/.test(b.textContent)).click());
    await take("staff sign-in");
    await page.fill("#responderPortalUsername", "assembly");
    await page.fill("#responderPortalPassword", "assembly123");
    await page.click("#modalActions button:first-child");
    await page.waitForTimeout(3500);
    await take("staff portal");
    await context.close();
  }
  await browser.close();
  const count = Object.values(snapshot).reduce((n, s) => n + Object.keys(s).length, 0);
  if (mode === "save") {
    fs.writeFileSync(file, JSON.stringify({ propNames, styles, snapshot }));
    console.log(`Saved ${count} element styles (${styles.length} distinct) across ${Object.keys(snapshot).length} screens.`);
    return;
  }
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  const diffs = [];
  for (const [screen, elements] of Object.entries(before.snapshot)) {
    const after = snapshot[screen];
    if (!after) { diffs.push(`${screen}: screen missing`); continue; }
    for (const [path, index] of Object.entries(elements)) {
      if (!(path in after)) { diffs.push(`${screen}: element missing ${path.slice(-90)}`); continue; }
      const a = before.styles[index].split("|"), b = styles[after[path]].split("|");
      const changed = before.propNames.filter((_, i) => a[i] !== b[i]);
      if (changed.length) diffs.push(`${screen}: ${path.slice(-80)}: ${changed.slice(0, 5).map((p) => `${p} ${a[before.propNames.indexOf(p)]} -> ${b[before.propNames.indexOf(p)]}`).join("; ")}`);
    }
    for (const path of Object.keys(after)) if (!(path in elements)) diffs.push(`${screen}: new element ${path.slice(-90)}`);
  }
  if (diffs.length) {
    console.error(`${diffs.length} style differences:\n${diffs.slice(0, 40).join("\n")}`);
    process.exit(1);
  }
  console.log(`No style differences: ${count} elements across ${Object.keys(before.snapshot).length} screens.`);
})().catch((error) => { console.error(`Snapshot failed after "${lastStep}":`, error.message.split("\n")[0]); process.exit(1); });
