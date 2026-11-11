"use strict";

// Staff area check (outputs/staff.html). Signs in as each demo role on a phone (390 px and 320 px) and a laptop,
// opens every staff screen, page and main dialog, screenshots them into work/qa/screenshots/staff/<light|dark>/,
// and fails on axe WCAG 2.1 A/AA violations, sideways scrolling, buttons under 44 px, page errors, or private details
// (contact or exact coordinates) in a list, any content security policy violation, or private data left after sign-out. Pass --dark for dark mode and --engine=webkit for Safari's engine.
// Needs the local API and web server, and the demo seed (npm run qa:seed). Local demo data only.
const path = require("path");
const fs = require("fs");
const { launchBrowser, contextOptions, localSettings, root, COLOR_SCHEME, RUN_FOLDER, THEME_LABEL, API } = require("./common");
const out = path.join(root, "work/qa/screenshots/staff", RUN_FOLDER || "light");
fs.mkdirSync(out, { recursive: true });
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const STAFF_URL = `${(process.env.FIXNOW_APP || "http://localhost:4173/fixnow-ghana.html").replace("fixnow-ghana.html", "staff.html")}?api=${encodeURIComponent(API)}`;
setTimeout(() => { console.error("Timed out after 10 minutes"); process.exit(1); }, 10 * 60 * 1000).unref();
let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL: ${message}`); };

// Demo seed: three reports wait for review; the others are routed to one desk each by the demo routing rules.
const WAITING = ["Live wire hanging over the footpath", "Drain overflowing into homes", "Loose planks on the footbridge"];
const NOT_MINE = {
  assembly: ["Blocked drain floods the road after rain", "Streetlights out along the junction"],
  nadmo: ["Refuse not collected for two weeks", "Streetlights out along the junction"],
  utility: ["Refuse not collected for two weeks", "Blocked drain floods the road after rain"]
};
const roles = [["moderator", "moderator123"], ["assembly", "assembly123"], ["nadmo", "nadmo123"], ["utility", "utility123"], ["admin", null]];
const devices = [["phone", 390, 844], ["small", 320, 640], ["laptop", 1280, 800]];

(async () => {
  const browser = await launchBrowser();
  for (const [username, demoPassword] of roles) {
    for (const [device, width, height] of devices) {
      const context = await browser.newContext(contextOptions(width, height));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Any content security policy violation (a blocked script, style, image or connection) fails the run.
      await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(event.violatedDirective + " " + (event.blockedURI || "inline")));
      });
      const label = `${username} ${device}`;
      const check = async (screen, shot) => {
        await page.waitForTimeout(250);
        if (shot && device !== "small") {
          // Full-length screenshots: a full page is a fixed layer, so it is laid out in the normal flow just for the picture.
          const dialog = await page.evaluate(() => !document.querySelector("#dialogBackdrop").hidden);
          // (Set through element.style, which the page's content security policy allows, unlike an added <style> tag.)
          const unfix = await page.evaluate((isDialog) => {
            if (!isDialog && document.querySelector("#staffPage").hidden && window.innerWidth < 900) {
              // Phone lists: the fixed tab bar would land mid-picture, so it goes to the end of the page for the shot.
              document.body.style.setProperty("position", "relative");
              document.querySelector(".s-tabs").style.setProperty("position", "absolute", "important");
              return "tabs";
            }
            if (isDialog || document.querySelector("#staffPage").hidden) return false;
            document.querySelector("#staffPage").style.setProperty("position", "static", "important");
            document.querySelector("#staffPage").style.setProperty("overflow", "visible", "important");
            document.querySelector(".s-shell").style.setProperty("display", "none", "important");
            document.querySelector(".s-topbar").style.setProperty("display", "none", "important");
            document.body.style.setProperty("overflow", "visible", "important");
            return true;
          }, dialog);
          // In WebKit, Playwright's screenshot inserts a style of its own, which the policy reports; that is the test tool,
          // not the page, so reports made during the screenshot itself are set aside.
          const before = await page.evaluate(() => window.__cspViolations.length);
          await page.screenshot({ path: path.join(out, `${username}-${device}-${shot}.png`), fullPage: !dialog });
          await page.evaluate((count) => { window.__cspViolations.length = count; }, before);
          if (unfix === "tabs") await page.evaluate(() => { document.body.style.removeProperty("position"); document.querySelector(".s-tabs").removeAttribute("style"); });
          else if (unfix) await page.evaluate(() => {
            ["#staffPage", ".s-shell", ".s-topbar"].forEach((selector) => document.querySelector(selector).removeAttribute("style"));
            document.body.style.removeProperty("overflow");
            document.body.style.overflow = "hidden";
          });
        }
        const scrollWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector("#staffPage").hidden ? 0 : document.querySelector("#staffPage").scrollWidth));
        if (scrollWidth > width) fail(`${label}, ${screen}: page is ${scrollWidth}px wide`);
        const small = await page.evaluate(() => [...document.querySelectorAll("button, a.btn, select, input:not([type=checkbox]):not([type=file])")]
          .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
          .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 && r.width > 0; })
          .map((el) => (el.textContent || el.id || el.tagName).trim().slice(0, 30)));
        if (small.length) fail(`${label}, ${screen}: targets under 44 px: ${small.join(", ")}`);
        if (device !== "small") {
          await page.evaluate(axeSource);
          const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(", ")}`));
          if (violations.length) fail(`${label}, ${screen}: ${violations.join(" | ")}`);
        }
      };
      const closeDialog = () => page.click("#dialogActions button:last-child");

      await page.goto(STAFF_URL, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await check("sign in", "0-sign-in");
      await page.fill("#signInUsername", username);
      await page.fill("#signInPassword", demoPassword || localSettings().adminPassword);
      await page.click("#signInForm button[type=submit]");
      await page.waitForSelector("#staffView:not([hidden]) h1");
      await page.waitForTimeout(600);

      const listText = async () => page.textContent("#staffView");
      const tabs = await page.$$eval("[data-tab]", (buttons) => buttons.map((b) => b.dataset.tab));
      for (const tab of tabs) {
        await page.click(`[data-tab="${tab}"]`);
        await page.waitForSelector("#staffView h1");
        await page.waitForTimeout(500);
        await check(tab, `1-${tab}`);
        if ((tab === "review" || tab === "cases") && /Demo contact|5\.55\d{3}/.test(await listText())) fail(`${label}, ${tab}: a list shows contact details or exact coordinates`);
        if (tab === "cases" && NOT_MINE[username]) {
          const text = await listText();
          for (const title of WAITING) if (text.includes(title)) fail(`${label}: a report still waiting for review is in a responder list (${title})`);
          for (const title of NOT_MINE[username]) if (text.includes(title)) fail(`${label}: a report routed to another desk is in this desk's list (${title})`);
        }
      }

      // Review page and its dialogs (moderators and admins).
      if (tabs.includes("review")) {
        await page.click('[data-tab="review"]');
        await page.waitForSelector("[data-open]");
        const first = await page.textContent("[data-open] h3");
        if (first !== "Live wire hanging over the footpath") fail(`${label}: the immediate-danger report should be first in the review queue, found "${first}"`);
        if (!/Waiting /.test(await page.textContent("[data-open]"))) fail(`${label}: review items should say how long they have been waiting`);
        await page.click("[data-open]");
        await page.waitForSelector("#pageTitle:not(:empty)");
        await page.waitForTimeout(500);
        if (!/Demo contact 024/.test(await page.textContent("#pageBody"))) fail(`${label}: moderators should see contact details on the review page`);
        if (!/Water and Power Response \(demo\)/.test(await page.textContent("#pageBody"))) fail(`${label}: the review page should show the office the live wire report will be routed to`);
        await check("review page", "2-review-page");
        for (const [act, name] of [["verify", "3-verify-dialog"], ["reject", "4-reject-dialog"], ["escalate-review", "5-escalate-dialog"], ["hide", "6-hide-dialog"]]) {
          await page.click(`[data-act="${act}"]`);
          await page.waitForTimeout(250);
          if (act === "verify") {
            await page.click("#dialogActions .btn-primary");
            if (!(await page.textContent("#dialogStatus"))) fail(`${label}: Verify without the privacy check should explain what is missing`);
          }
          await check(`${act} dialog`, name);
          await closeDialog();
        }
        await page.goBack();
        await page.waitForTimeout(400);
        if (!(await page.evaluate(() => document.querySelector("#staffPage").hidden))) fail(`${label}: browser Back should close the review page`);
      }

      // Case page (every role that has cases in its area).
      await page.click('[data-tab="cases"]');
      await page.waitForTimeout(800);
      // Prefer a case assigned to this account, so the update and photo dialogs are reachable.
      await page.click('[data-queue="assigned"]');
      await page.waitForTimeout(800);
      if (!(await page.$("[data-open]"))) { await page.click('[data-queue="institutional"]'); await page.waitForTimeout(800); }
      const caseButtons = await page.$$("[data-open]");
      if (caseButtons.length) {
        await page.click("[data-open]");
        await page.waitForSelector("#pageTitle:not(:empty)");
        await page.waitForTimeout(500);
        await check("case page", "7-case-page");
        if (await page.$('[data-act="update"]')) {
          await page.click('[data-act="update"]');
          await page.waitForTimeout(250);
          await check("update dialog", "8-update-dialog");
          await closeDialog();
        }
        if (await page.$("[data-photo]")) {
          await page.click("[data-photo]");
          await page.waitForSelector("#dialogBackdrop:not([hidden]) img", { timeout: 8000 }).catch(() => fail(`${label}: the private photo did not open`));
          await page.waitForTimeout(400);
          await check("photo dialog", "9-photo-dialog");
          await closeDialog();
        }
        await page.click("#pageBack");
        await page.waitForTimeout(400);
      } else if (!NOT_MINE[username]) fail(`${label}: moderators and admins should see the demo cases`);

      // Sign out works for everyone and leaves nothing private behind: no token, no account, no unsent updates,
      // nothing from the last account in the page, and no staff data from older versions of the resident page.
      await page.evaluate(() => {
        localStorage.setItem("fixnow-gh-v3-staff-outbox", JSON.stringify([{ reportId: "FN-QA", actorId: 999, body: { status: "Open", updateKey: "qa" }, queuedAt: "" }]));
        localStorage.setItem("fixnow-gh-v3-responder-reports", JSON.stringify([{ id: "FN-OLD", contact: "old" }]));
        localStorage.setItem("fixnow-gh-v3-sync", JSON.stringify({ server: "x", token: "old-token", user: { id: 1 } }));
      });
      await page.click(device === "laptop" ? ".s-side-head [data-sign-out]" : ".s-topbar [data-sign-out]");
      if (await page.evaluate(() => !document.querySelector("#dialogBackdrop").hidden)) {
        if (!/not sent yet/.test(await page.textContent("#dialogBody"))) fail(`${label}: sign-out should warn about unsent updates`);
        await page.click("#dialogActions .btn-danger");
      }
      await page.waitForSelector("#signInView:not([hidden])");
      const leftovers = await page.evaluate(() => {
        const found = [];
        const staff = JSON.parse(localStorage.getItem("fixnow-gh-v3-staff") || "{}");
        if (staff.token || staff.user) found.push("staff session");
        if (localStorage.getItem("fixnow-gh-v3-staff-outbox")) found.push("unsent updates");
        if (localStorage.getItem("fixnow-gh-v3-responder-reports")) found.push("old staff cases");
        const sync = JSON.parse(localStorage.getItem("fixnow-gh-v3-sync") || "{}");
        if (sync.token || sync.user) found.push("old staff session");
        const text = document.body.innerText;
        if (/FN-[0-9A-F]{8}/.test(text)) found.push("a report reference on screen");
        if (document.querySelector("#staffView").innerHTML || document.querySelector("#pageBody").innerHTML) found.push("hidden staff content in the page");
        return found;
      });
      if (leftovers.length) fail(`${label}: after sign-out the device still holds ${leftovers.join(", ")}`);
      const csp = await page.evaluate(() => window.__cspViolations);
      if (csp.length) fail(`${label}: content security policy blocked ${[...new Set(csp)].join(", ")}`);
      if (errors.length) fail(`${label}: page errors ${errors.join("; ")}`);
      await context.close();
    }
  }
  await browser.close();
  console.log(failures ? `${failures} staff check(s) failed${THEME_LABEL}` : `Staff area: every role, phone, 320 px and laptop, 0 WCAG violations, no sideways scrolling, 44 px targets, private details only on case pages${THEME_LABEL}.`);
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error("Staff check failed:", error.message.split("\n")[0]); process.exit(1); });
