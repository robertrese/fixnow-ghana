"use strict";

// Checks that no screen scrolls sideways on small phones, including with the app's Large text setting, and that
// no visible text field uses text under 16 px (iPhone zooms in on those). Exits with 1 and names the screen.
const { passWelcome, launchBrowser, contextOptions, THEME_LABEL } = require("./common");

(async () => {
  const browser = await launchBrowser();
  const problems = [];
  for (const [width, height, largeText] of [[320, 640, false], [390, 844, true], [320, 640, true]]) {
    const page = await (await browser.newContext(contextOptions(width, height))).newPage();
    await passWelcome(page);
    if (largeText) {
      await page.click('.nav button[data-app-view="profile"]');
      await page.click("#largeTextBtn");
      await page.click('.nav button[data-app-view="home"]');
    }
    const label = `${width}px${largeText ? " with large text" : ""}`;
    const check = async (screen) => {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scrollWidth > width) problems.push(`${label}, ${screen}: page is ${scrollWidth}px wide`);
      const smallFields = await page.evaluate(() => [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea")]
        .filter((field) => field.getClientRects().length && getComputedStyle(field).visibility !== "hidden" && parseFloat(getComputedStyle(field).fontSize) < 16)
        .map((field) => `#${field.id || field.name || field.tagName.toLowerCase()} ${getComputedStyle(field).fontSize}`));
      if (smallFields.length) problems.push(`${label}, ${screen}: text under 16 px makes iPhone zoom in: ${smallFields.join(", ")}`);
    };
    await check("home");
    await page.click(".home-primary");
    await check("step 1");
    await page.click('[data-quick-type="Flooding or drainage"]');
    await page.click('[data-wizard-step="1"] [data-wizard-next]');
    await check("step 2");
    await page.fill("#community", "Kaneshie");
    await page.fill("#district", "Accra Metropolitan");
    await page.click('[data-wizard-step="2"] [data-wizard-next]');
    await check("step 3");
    await page.fill("#reportTitle", "Blocked drain");
    await page.fill("#details", "The drain is blocked with plastic and floods the road after rain.");
    await page.click('[data-severity="High"]');
    await page.click('[data-wizard-step="3"] [data-wizard-next]');
    await check("step 4");
    await page.click('[data-wizard-step="4"] [data-wizard-next]');
    await check("step 5");
    await page.click('[data-wizard-step="5"] [data-wizard-next]');
    await page.waitForTimeout(1200);
    await check("step 6");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.check("#caseConsent");
    await page.click('[data-wizard-step="6"] button[type="submit"]');
    await page.waitForTimeout(2000);
    await check("submitted");
    await page.click("#modalActions button:last-child");
    for (const view of ["nearby", "my", "profile"]) {
      await page.click(`.nav button[data-app-view="${view}"]`);
      await page.waitForTimeout(view === "nearby" ? 1200 : 300);
      await check(view);
    }
    // Fields that only appear in dialogs: Find report and staff sign-in.
    await page.click('.nav button[data-app-view="my"]');
    await page.click("#trackAnotherBtn");
    await page.waitForTimeout(300);
    await check("find report");
    await page.click("#modalActions button:last-child").catch(() => {});
    await page.click('.nav button[data-app-view="profile"]');
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => /Verified staff access/.test(button.textContent)).click());
    await page.waitForTimeout(300);
    await check("staff sign-in");
    await page.close();
  }
  await browser.close();
  if (problems.length) {
    console.error(`Sideways scrolling found:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`No sideways scrolling and no text field under 16 px at 320 px, 390 px with large text, or 320 px with large text${THEME_LABEL}.`);
})().catch((error) => { console.error("Check failed:", error.message.split("\n")[0]); process.exit(1); });
