"use strict";

// Automated WCAG 2.1 A/AA check (axe-core) of the resident screens at 320, 390 and 1280 px.
// Exits with 1 if any rule fails. Automated checks find many problems but not all of them;
// keep testing with a screen reader and a keyboard too.
const { passWelcome, fillReportToReview, loadPlaywright, COLOR_SCHEME, THEME_LABEL } = require("./common");

let axeSource;
try {
  axeSource = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  console.error("axe-core is not installed. Run: npm install --no-save playwright@1.63.0 axe-core@4.10.2");
  process.exit(2);
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const findings = new Map();
  const scan = async (page, label) => {
    await page.waitForTimeout(400);
    await page.evaluate(axeSource);
    const violations = await page.evaluate(async () => (await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"]
    })).violations.map((v) => ({ id: v.id, help: v.help, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) })));
    for (const v of violations) {
      const entry = findings.get(v.id) || { help: v.help, where: [] };
      entry.where.push(...v.targets.map((t) => `${label}: ${t}`));
      findings.set(v.id, entry);
    }
  };

  for (const [width, height, tag] of [[390, 844, "phone"], [1280, 800, "laptop"], [320, 640, "small phone"]]) {
    const page = await (await browser.newContext({ viewport: { width, height }, isMobile: width < 700, hasTouch: width < 700, colorScheme: COLOR_SCHEME })).newPage();
    await page.goto(require("./common").APP_URL, { waitUntil: "load" });
    await scan(page, `${tag} welcome`);
    await passWelcome(page);
    await scan(page, `${tag} home`);
    await fillReportToReview(page);
    await scan(page, `${tag} review step`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.check("#caseConsent");
    await page.click('[data-wizard-step="6"] button[type="submit"]');
    await page.waitForTimeout(2000);
    await scan(page, `${tag} submitted`);
    await page.click("#modalActions button:last-child");
    for (const view of ["nearby", "my", "profile"]) {
      await page.click(`.nav button[data-app-view="${view}"]`);
      await page.waitForTimeout(view === "nearby" ? 1200 : 300);
      await scan(page, `${tag} ${view}`);
    }
    await page.close();
  }
  await browser.close();

  if (!findings.size) {
    console.log(`0 WCAG 2.1 A/AA violations found by axe-core${THEME_LABEL}.`);
    return;
  }
  for (const [id, entry] of findings) {
    console.log(`\n${id}: ${entry.help}`);
    for (const where of [...new Set(entry.where)].slice(0, 10)) console.log(`  ${where}`);
  }
  process.exit(1);
})().catch((error) => { console.error("Scan failed:", error.message.split("\n")[0]); process.exit(1); });
