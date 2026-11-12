"use strict";

// Outcome checks for problems a visitor can hit in the first minute (outside review, November 2026). It uses the app
// the way a person does and checks what they see, not just the layout:
//   1. The demo banner never covers a heading: on every view (welcome, consent, Home, the six report steps, Nearby,
//      My reports, Profile, a full page and a dialog) the first heading starts below the banner and is not under it,
//      and the sticky topbar or laptop sidebar stays below it after scrolling, at 320, 390 and 1280 px and with Large text.
//   2. My reports search finds a report by its title and its description.
//   3. The My reports badge shows how many reports will still be sent (never demo reports), from the same data,
//      and is hidden at 0.
//   4. A demo report is labelled Demo only and kept only in this browser, never "not sent yet" or that it will be
//      sent, has no Retry, and is not counted in the badge.
//   5. Normal mode on the same origin never sends anything made in demo mode (nor an orphaned queued item).
//   6. Resident screens never show raw errors ("Failed to fetch", "TypeError", "NetworkError"), with the server
//      unreachable or in the demo, and the location step says plainly what to do.
//   7. Every problem type and every status can be filtered, in My reports and in Nearby.
//   8. Resident screens use plain words for photo privacy (no "re-encoded", "EXIF" or "quarantine").
// Needs the local web server (npm run start:web). It never contacts the API: normal-mode requests are answered by
// the test itself, so it can count exactly what the page tries to send. Add --engine=webkit or --engine=firefox.
const path = require("path");
const fs = require("fs");
const { root, APP, API, ENGINE, launchBrowser, contextOptions } = require("./common");

const DEMO_URL = `${APP}?demo=1`;
const NORMAL_URL = `${APP}?api=${encodeURIComponent(API)}`;
const out = path.join(root, "work", "qa", "screenshots", "outcomes" + (ENGINE === "chromium" ? "" : `-${ENGINE}`));
fs.mkdirSync(out, { recursive: true });
const RAW_ERRORS = /failed to fetch|typeerror|networkerror|network error|load failed|referenceerror|syntaxerror|domexception|\[object /i;
const TECH_WORDS = /re-?encod|\bexif\b|quarantin/i;
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };
setTimeout(() => { console.error("Timed out after 10 minutes"); process.exit(1); }, 10 * 60 * 1000).unref();

// The first visible heading of whatever is on top (dialog or full page, welcome screen, or the app) must start below
// the banner, and the point just inside it must show the heading, not the banner.
async function headingBelowBanner(page) {
  return page.evaluate(() => {
    const banner = document.querySelector("#demoBanner");
    const bottom = banner && !banner.hidden ? banner.getBoundingClientRect().bottom : 0;
    const modal = document.querySelector("#modalBackdrop");
    const welcome = document.querySelector("#welcomeScreen");
    const scope = modal && !modal.hidden && modal.classList.contains("show") ? modal : (welcome && !welcome.hidden ? welcome : document.querySelector(".app"));
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden]"); };
    // The heading people are taken to: the one that has focus (each wizard step moves focus to its legend, each view to its title),
    // otherwise the first visible heading.
    const focused = document.activeElement && /^(H[1-3]|LEGEND)$/.test(document.activeElement.tagName) && scope.contains(document.activeElement) ? document.activeElement : null;
    const heading = focused || [...scope.querySelectorAll("h1, h2, h3")].find(visible);
    if (!heading) return { ok: false, why: "no visible heading" };
    const r = heading.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(Math.max(r.left + 6, 1), innerWidth - 2), r.top + Math.min(r.height / 2, 12));
    const covered = !hit || (banner && banner.contains(hit));
    return { ok: r.top >= bottom - 0.5 && !covered, why: `"${heading.textContent.trim().slice(0, 40)}" top ${Math.round(r.top)}, banner bottom ${Math.round(bottom)}${covered ? ", covered" : ""}` };
  });
}

async function stickyBelowBanner(page) {
  return page.evaluate(() => {
    const bottom = document.querySelector("#demoBanner").getBoundingClientRect().bottom;
    const wide = innerWidth > 880;
    const el = document.querySelector(wide ? ".rail" : ".topbar");
    window.scrollTo(0, 600);
    const top = el.getBoundingClientRect().top;
    window.scrollTo(0, 0);
    return { ok: top >= bottom - 0.5, why: `${wide ? "sidebar" : "topbar"} top ${Math.round(top)}, banner bottom ${Math.round(bottom)}` };
  });
}

async function passWelcomeAt(page, url, { onIntro, onConsent } = {}) {
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  if (onIntro) await onIntro();
  await page.click("#welcomeStartBtn");
  await page.waitForTimeout(250);
  if (onConsent) await onConsent();
  for (const id of ["#consentPrivacy", "#consentTerms", "#consentEmergency"]) await page.check(id);
  await page.click("#welcomeAcceptBtn");
  await page.waitForTimeout(400);
}

const closeOverlay = async (page) => {
  if (await page.evaluate(() => !document.querySelector("#modalBackdrop").hidden)) {
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(200);
  }
};

async function fillReport(page, { title, details, onStep } = {}) {
  await page.evaluate(() => setView("home"));
  await page.click(".home-primary");
  await page.waitForTimeout(200);
  if (onStep) await onStep(1);
  await page.click('[data-quick-type="Flooding or drainage"]');
  await page.click('[data-wizard-step="1"] [data-wizard-next]');
  await page.waitForTimeout(700);
  if (onStep) await onStep(2);
  await page.fill("#community", "Old barrier road, near the clinic");
  await page.fill("#district", "Accra Metropolitan");
  await page.click('[data-wizard-step="2"] [data-wizard-next]');
  await page.waitForTimeout(700);
  if (onStep) await onStep(3);
  await page.fill("#reportTitle", title || "Blocked drain");
  await page.fill("#details", details || "Water runs across the road after rain.");
  await page.click('[data-severity="High"]');
  for (const step of [3, 4, 5]) {
    await page.click(`[data-wizard-step="${step}"] [data-wizard-next]`);
    await page.waitForTimeout(700); // the step scrolls smoothly to its heading
    if (onStep && step < 5) await onStep(step + 1);
  }
  await page.waitForTimeout(1500);
  if (onStep && await page.evaluate(() => !document.querySelector("#modalBackdrop").hidden)) await onStep("similar report page");
  await closeOverlay(page);
  if (onStep) await onStep(6);
}

async function submitReport(page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.check("#caseConsent");
  await page.click('[data-wizard-step="6"] button[type="submit"]');
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await launchBrowser();

  // ---------- 1. The demo banner never covers a heading ----------
  const sizes = [[320, 640, false], [390, 844, false], [1280, 800, false], [320, 640, true], [390, 844, true]];
  for (const [width, height, large] of sizes) {
    const label = `${width} px${large ? ", Large text" : ""}`;
    const context = await browser.newContext({ ...contextOptions(width, height, { mobile: width < 700 }), serviceWorkers: "block" });
    const page = await context.newPage();
    if (large) await page.addInitScript(() => { try { if (!localStorage.getItem("fixnow-gh-demo-v1-settings")) localStorage.setItem("fixnow-gh-demo-v1-settings", JSON.stringify({ language: "en", appearance: "light", largeText: true, highContrast: false, simpleMode: true, fieldMode: false, oneHand: false })); } catch { /* storage blocked */ } });
    const failed = [];
    const at = async (name) => {
      const result = await headingBelowBanner(page);
      if (!result.ok) failed.push(`${name}: ${result.why}`);
    };
    await passWelcomeAt(page, DEMO_URL, { onIntro: () => at("welcome"), onConsent: async () => { await at("consent (Before you start)"); if (width === 390 && !large) await page.screenshot({ path: path.join(out, "consent-390.png") }); } });
    if (width <= 390 && !large) await page.screenshot({ path: path.join(out, `home-${width}.png`) });
    await at("Home");
    const sticky = await stickyBelowBanner(page);
    if (!sticky.ok) failed.push(`scrolled: ${sticky.why}`);
    await page.click(".home-danger");
    await page.waitForTimeout(300);
    await at("112 dialog");
    await closeOverlay(page);
    for (const view of ["nearby", "my", "profile"]) {
      await page.evaluate((v) => setView(v), view);
      await page.waitForTimeout(300);
      await at(view);
    }
    await page.evaluate(() => setView("my"));
    await page.click("[data-details-local]");
    await page.waitForTimeout(300);
    await at("report details (full page)");
    await closeOverlay(page);
    await fillReport(page, { onStep: async (step) => { await at(`report step ${step}`); if (step === 2 && width === 390 && !large) await page.screenshot({ path: path.join(out, "location-390.png") }); } });
    check(failed.length === 0, `1. demo banner covers no heading at ${label} ${failed.join(" | ")}`);
    await context.close();
  }

  // ---------- 2 to 8 on a phone ----------
  const context = await browser.newContext({ ...contextOptions(390, 844, { mobile: true }), serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const toasts = [];
  await page.exposeFunction("__toastSeen", (text) => toasts.push(text));
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const toast = document.querySelector("#toast");
      if (toast) new MutationObserver(() => window.__toastSeen(toast.textContent)).observe(toast, { childList: true, characterData: true, subtree: true });
    });
  });
  // The page's whole text, hidden steps and dialogs included, without scripts and styles.
  const allText = () => page.evaluate(() => { const copy = document.body.cloneNode(true); copy.querySelectorAll("script, style, template").forEach((n) => n.remove()); return copy.textContent.replace(/\s+/g, " "); });
  const seenText = [];
  const keepText = async () => seenText.push(await page.evaluate(() => document.body.innerText));

  await passWelcomeAt(page, DEMO_URL);
  const badgeAtStart = await page.evaluate(() => ({ hidden: document.querySelector("#openBadge").hidden, label: document.querySelector('.nav [data-app-view="my"]').getAttribute("aria-label") }));
  check(badgeAtStart.hidden && badgeAtStart.label === null, "3. with no unsent reports the My reports badge is hidden");

  // A demo report made through the form.
  await fillReport(page, { title: "Floodwater crossing the old barrier road", details: "Brown water is waist deep beside the clinic gate.", onStep: async (step) => { if (step === 2) { await keepText(); check(/The map is switched off in the demo\. Type the community and a landmark below\./.test(await page.textContent('[data-wizard-step="2"]')), "6. the demo location step says the map is switched off and to type a place"); } } });
  await submitReport(page);
  check(await page.textContent("#modalTitle") === "Demo report saved", "4. sending in the demo opens Demo report saved");
  await keepText();
  await closeOverlay(page);
  await page.evaluate(() => setView("my"));
  await page.waitForTimeout(300);

  // 2. Search by title and by description.
  const search = async (text) => { await page.fill("#myReportSearch", text); await page.dispatchEvent("#myReportSearch", "input"); await page.waitForTimeout(150); return page.$$eval("#myReportList [data-details-local]", (b) => b.map((x) => x.textContent.trim())); };
  check((await search("Floodwater")).includes("Floodwater crossing the old barrier road"), "2. My reports search finds the report by a word in its title (Floodwater)");
  check((await search("waist deep")).includes("Floodwater crossing the old barrier road"), "2. My reports search finds the report by words in its description");
  check((await search("no such words anywhere")).length === 0, "2. a search with no match shows no reports");
  await search("");

  // 3. Badge from the same data.
  const badge = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("fixnow-gh-demo-v1-reports") || "[]");
    const unsent = stored.filter((r) => ["queued-offline", "sending", "needs-attention"].includes(r.syncStatus)).length;
    const demo = stored.filter((r) => r.syncStatus === "demo-local").length;
    return { unsent, demo, text: document.querySelector("#openBadge").textContent, hidden: document.querySelector("#openBadge").hidden, count: document.querySelector("#myReportCount").textContent };
  });
  check(badge.demo === 1 && badge.unsent === 0 && badge.hidden && badge.text === "", `4. a demo report is not counted as waiting to send: the badge stays hidden (data: ${badge.demo} demo, ${badge.unsent} to send)`);
  check(await page.getByRole("button", { name: "My reports", exact: true }).count() === 1, "4. the My reports button never says a demo report is not sent yet");

  // 4. The demo report never says it will be sent, and has no Retry.
  const card = await page.evaluate(() => [...document.querySelectorAll(".my-report-card")].find((c) => /Floodwater crossing/.test(c.textContent)).innerText);
  check(/Demo report: kept only in this browser/.test(card) && /Demo only/.test(card), "4. the My reports card says Demo only and Demo report: kept only in this browser");
  const neverSends = /not sent yet|keep trying|will be sent|sends when|send it|waiting to send|retry/i;
  check(!neverSends.test(card), `4. the card never says the demo report will be sent (${card.replace(/\s+/g, " ")})`);
  await page.evaluate(() => [...document.querySelectorAll("[data-details-local]")].find((b) => /Floodwater crossing/.test(b.textContent)).click());
  await page.waitForTimeout(300);
  const details = await page.textContent("#modalBackdrop");
  check(!neverSends.test(details) && /Demo reports are never sent/.test(details) && !(await page.$("#modalBackdrop [data-retry-local]")), "4. the report page never says it will be sent and has no Retry");
  await keepText();
  await closeOverlay(page);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("fixnow-gh-demo-v1-reports")).find((r) => /Floodwater/.test(r.title)).syncStatus) === "demo-local", "4. the demo report is stored as demo-local");

  // 5. Nothing made in the demo reaches the real send queue.
  const realQueue = () => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open("fixnow-citizen-queue", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("submissions", { keyPath: "submissionKey" });
    request.onsuccess = () => { const db = request.result; const all = db.transaction("submissions").objectStore("submissions").getAll(); all.onsuccess = () => { db.close(); resolve(all.result); }; };
    request.onerror = () => resolve(null);
  }));
  check(Array.isArray(await realQueue()) && (await realQueue()).length === 0, "5. the demo report is not in the real send queue");
  // An orphaned item, as an older demo on this origin could have left it, with no report in normal mode.
  await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open("fixnow-citizen-queue", 1);
    request.onsuccess = () => { const db = request.result; const tx = db.transaction("submissions", "readwrite"); tx.objectStore("submissions").put({ submissionKey: "old-demo-item", payload: { id: "LOCAL-old-demo", title: "Old demo report", type: "Other", syncStatus: "queued-offline" }, attachments: [], queuedAt: new Date().toISOString() }); tx.oncomplete = () => { db.close(); resolve(); }; };
  }));

  // 7. Every type and every status can be filtered in My reports (demo data with one report per type and status).
  const lists = await page.evaluate(() => ({ types: REPORT_TYPES, statuses: REPORT_STATUSES }));
  check(["Fire risk", "Clinic access", "School facility"].every((t) => lists.types.includes(t)) && ["Dispatched", "Blocked", "Escalated"].every((s) => lists.statuses.includes(s)), "7. the shared lists include Fire risk, Clinic access, School facility, Dispatched, Blocked and Escalated");
  await page.evaluate(({ types, statuses }) => {
    const made = [
      ...types.map((type, i) => ({ id: `FN-TYPE-${i}`, title: `Type check ${i}`, type, status: "Open", syncStatus: "submitted", created: Date.now() - i * 1000 })),
      ...statuses.map((status, i) => ({ id: `FN-STATUS-${i}`, title: `Status check ${i}`, type: "Other", status, syncStatus: "submitted", created: Date.now() - i * 1000 }))
    ];
    localStorage.setItem("fixnow-gh-demo-v1-reports", JSON.stringify(made));
  }, lists);
  await page.goto(`${DEMO_URL}&view=my`, { waitUntil: "load" });
  await page.evaluate(() => setView("my"));
  const choose = (id, value) => page.evaluate(([i, v]) => { const select = document.querySelector(i); select.value = v; select.dispatchEvent(new Event("change", { bubbles: true })); select.dispatchEvent(new Event("input", { bubbles: true })); }, [id, value]);
  const options = (id) => page.$$eval(`${id} option`, (o) => o.map((x) => x.value).filter(Boolean));
  check(JSON.stringify(await options("#myReportCategoryFilter")) === JSON.stringify(lists.types), "7. My reports offers every problem type as a filter");
  check(JSON.stringify(await options("#myReportStatusFilter")) === JSON.stringify(lists.statuses), "7. My reports offers every status as a filter");
  const shownIds = () => page.$$eval("#myReportList .my-report-card", (c) => c.map((x) => x.dataset.myReport));
  const filterFails = [];
  for (const [i, type] of lists.types.entries()) {
    await page.selectOption("#myReportCategoryFilter", type);
    const ids = await shownIds();
    const expected = await page.evaluate((t) => JSON.parse(localStorage.getItem("fixnow-gh-demo-v1-reports")).filter((r) => r.type === t).map((r) => r.id).sort(), type);
    if (!ids.includes(`FN-TYPE-${i}`) || JSON.stringify([...ids].sort()) !== JSON.stringify(expected)) filterFails.push(type);
  }
  await page.selectOption("#myReportCategoryFilter", "");
  for (const [i, status] of lists.statuses.entries()) {
    await page.selectOption("#myReportStatusFilter", status);
    const ids = await shownIds();
    const expected = await page.evaluate((s) => JSON.parse(localStorage.getItem("fixnow-gh-demo-v1-reports")).filter((r) => r.status === s).map((r) => r.id).sort(), status);
    if (!ids.includes(`FN-STATUS-${i}`) || JSON.stringify([...ids].sort()) !== JSON.stringify(expected)) filterFails.push(status);
  }
  await page.selectOption("#myReportStatusFilter", "");
  check(filterFails.length === 0, `7. filtering My reports by each type and status shows exactly the matching reports ${filterFails.join(", ")}`);
  await page.goto(DEMO_URL, { waitUntil: "load" });
  for (const view of ["home", "nearby", "my", "profile"]) { await page.evaluate((v) => setView(v), view); await page.waitForTimeout(200); await keepText(); }

  // 8. Plain words on every resident screen of the demo (all steps, pages and dialogs in the page).
  const demoText = await allText();
  check(!TECH_WORDS.test(demoText) && !seenText.some((t) => TECH_WORDS.test(t)), `8. resident screens never say re-encoded, EXIF or quarantine ${(demoText.match(TECH_WORDS) || [""])[0]}`);
  check(/We remove hidden location information from photos/.test(demoText), "8. the photo step explains in plain words that hidden location information is removed");

  // ---------- Normal mode on the same origin, the server answered by this test ----------
  const sent = [];
  let unreachable = false;
  await context.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") sent.push(`${request.method()} ${url.pathname}`);
    if (unreachable) return route.abort("failed");
    if (url.pathname === "/api/public/config") return route.fulfill({ json: { ok: true, maps: { enabled: false } } });
    if (url.pathname === "/api/public/reports" && request.method() === "GET") return route.fulfill({ json: { ok: true, reports: [] } });
    return route.fulfill({ json: { ok: true } });
  });
  await passWelcomeAt(page, NORMAL_URL);
  await page.evaluate(() => processSubmissionQueue());
  await page.waitForTimeout(1500);
  check(!sent.some((s) => /reports|uploads|sync/.test(s)), `5. normal mode sends nothing made in demo mode, even an orphaned queued item ${sent.join(", ")}`);
  await page.evaluate(() => setView("my"));
  check(!/Floodwater crossing|Old demo report/.test(await page.textContent("main")), "5. demo reports do not appear in normal mode");

  // 7. Nearby asks the server for each type and status.
  const asked = [];
  page.on("request", (r) => { if (r.url().includes("/api/public/reports?")) asked.push(new URL(r.url()).searchParams); });
  await page.evaluate(() => setView("nearby"));
  await page.waitForTimeout(300);
  check(JSON.stringify(await options("#nearbyCategoryFilter")) === JSON.stringify(lists.types) && JSON.stringify(await options("#nearbyStatusFilter")) === JSON.stringify(lists.statuses), "7. Nearby offers every problem type and status as a filter");
  const nearbyFails = [];
  for (const type of lists.types) { asked.length = 0; await choose("#nearbyCategoryFilter", type); await page.waitForTimeout(250); if (!asked.some((q) => q.get("category") === type)) nearbyFails.push(type); }
  await choose("#nearbyCategoryFilter", "");
  for (const status of lists.statuses) { asked.length = 0; await choose("#nearbyStatusFilter", status); await page.waitForTimeout(250); if (!asked.some((q) => q.get("status") === status)) nearbyFails.push(status); }
  check(nearbyFails.length === 0, `7. Nearby filters by each type and status ${nearbyFails.join(", ")}`);

  // 6. With the server unreachable, nothing raw reaches the screen.
  unreachable = true;
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.evaluate(() => setView("nearby"));
  await page.waitForTimeout(800);
  await keepText();
  await fillReport(page, { onStep: async (step) => { if (step === 2) { await page.waitForTimeout(800); await keepText(); check(/The map could not load\. Type the community and a landmark below/.test(await page.textContent('[data-wizard-step="2"]')), "6. with the server unreachable the location step says the map could not load and what to do"); await page.screenshot({ path: path.join(out, "location-unreachable-390.png") }); } } });
  await submitReport(page);
  await keepText();
  await closeOverlay(page);
  const realBadge = await page.evaluate(() => ({ text: document.querySelector("#openBadge").textContent, hidden: document.querySelector("#openBadge").hidden, unsent: JSON.parse(localStorage.getItem("fixnow-gh-v3-reports") || "[]").filter((r) => ["queued-offline", "sending", "needs-attention"].includes(r.syncStatus)).length }));
  check(realBadge.unsent === 1 && realBadge.text === "1" && !realBadge.hidden, `3. a real report saved while the server is unreachable shows in the badge (${realBadge.text}, data says ${realBadge.unsent})`);
  await page.evaluate(() => setView("my")); // the tab bar is hidden during the report form on phones
  await page.waitForTimeout(200);
  check(await page.getByRole("button", { name: "My reports, 1 report not sent yet", exact: true }).count() === 1, "3. the My reports button is named My reports, 1 report not sent yet");
  await page.evaluate(() => setView("home"));
  await page.fill("#trackCaseInput", "FN-ABC123");
  if (await page.$("#trackSecretInput")) await page.fill("#trackSecretInput", "not-a-real-secret");
  await page.evaluate(() => findTrackedCase());
  await page.waitForTimeout(800);
  await keepText();
  const raw = seenText.concat(toasts).filter((t) => RAW_ERRORS.test(t)).map((t) => (t.match(RAW_ERRORS) || [""])[0]);
  check(raw.length === 0, `6. no resident screen or message showed a raw error ${raw.join(", ")}`);
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);

  await browser.close();
  console.log(failures ? `${failures} resident outcome check(s) failed` : `Resident outcome checks passed (${ENGINE})`);
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error("Resident outcome check failed:", error.message.split("\n")[0]); process.exit(1); });
