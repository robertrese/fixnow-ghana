"use strict";

// Offline reopening and offline saving, with service workers on, each test in a fresh browser context.
//
// Entry points (the bug of November 2026: after an online visit, the demo's address and index.html did not open
// offline, while fixnow-ghana.html did):
//   - The public demo (docs/) is served here under /fixnow-ghana/, the path GitHub Pages uses. After one online visit,
//     once the service worker controls the page and every file in its offline list is cached, the network is cut
//     and each supported address must open the cached demo app: /fixnow-ghana/, /fixnow-ghana/index.html and
//     /fixnow-ghana/fixnow-ghana.html (also with a query string). The staff and legal pages must open themselves,
//     never the resident app, and a page that was never cached (the screen gallery) must not turn into the app.
//   - The normal app (outputs/) is served at the root, as npm run start:web does: / and /fixnow-ghana.html must open
//     the cached app in normal mode. outputs/ has no index.html, so none is tested or cached.
// Saving offline and reopening:
//   - Demo: a report made offline survives closing and reopening the app offline, stays labelled Demo only, never
//     enters the send queue, and nothing is ever sent, also after the connection comes back.
//   - Normal mode: a report with a photo made offline survives reopening offline, with its photo, and stays
//     Not sent yet. When the connection comes back while the app is open, it is sent. The server's answers are
//     lost on purpose at first (the server saved the report, the phone never heard), so the report must stay
//     Not sent yet; once answers get through, the app's retry of the same submission must be acknowledged, and the
//     server must hold exactly one report, with its photo, however many times it was sent.
//
// "Offline" means both: the test's own servers refuse every connection, and the browser context is set offline
// (so the page sees navigator.onLine false and the online event when it comes back).
//
// Needs the local API (npm run start:api, seeded or not) for the normal-mode send test; the demo needs nothing.
// Options: --engine=webkit|firefox, --site=<folder> (default docs), --outputs=<folder> (default outputs),
// --only=entry,demo,normal (default all). If the engine has no working service worker, the test says SKIP.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { root, API, ENGINE, launchBrowser, contextOptions } = require("./common");

const arg = (name, fallback) => { const found = process.argv.find((a) => a.startsWith(`--${name}=`)); return found ? found.slice(name.length + 3) : fallback; };
const SITE = path.resolve(root, arg("site", "docs"));
const OUTPUTS = path.resolve(root, arg("outputs", "outputs"));
const ONLY = arg("only", "entry,demo,normal").split(",");
const DEMO_PORT = 4186, NORMAL_PORT = 4187, PROXY_PORT = 4188;
const DEMO_BASE = `http://localhost:${DEMO_PORT}/fixnow-ghana/`;
const NORMAL_BASE = `http://localhost:${NORMAL_PORT}/`;
const PROXY = `http://localhost:${PROXY_PORT}`;
const API_QUERY = `?api=${encodeURIComponent(PROXY)}`;
const PHOTO = path.join(root, "work", "qa", "demo-photos", "drain.jpg");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
let failures = 0, skipped = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
setTimeout(() => { console.error("Timed out after 8 minutes"); process.exit(1); }, 8 * 60 * 1000).unref();

// A static server that can be switched off: while it is down every connection is closed at once, as when a phone
// has no signal. "prefix" is the path the folder is served under; "dirIndex" the file a folder address serves.
function staticServer(port, dir, prefix, dirIndex) {
  const state = { down: false, log: [], sockets: new Set() };
  const server = http.createServer((req, res) => {
    if (state.down) { req.socket.destroy(); return; }
    const url = new URL(req.url, `http://localhost:${port}`);
    state.log.push(`${req.method} ${url.pathname}`);
    if (prefix !== "/" && url.pathname === prefix.slice(0, -1)) { res.writeHead(301, { Location: prefix }); res.end(); return; }
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end("Not found"); return; }
    let rel = decodeURIComponent(url.pathname.slice(prefix.length));
    if (rel === "" || rel.endsWith("/")) rel += dirIndex;
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end("Not found"); return; }
      // no-store: the browser's own HTTP cache must not hide what the service worker does.
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  server.on("connection", (socket) => { if (state.down) { socket.destroy(); return; } state.sockets.add(socket); socket.on("close", () => state.sockets.delete(socket)); });
  state.setDown = (down) => { state.down = down; if (down) for (const socket of state.sockets) socket.destroy(); };
  state.listen = () => new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  state.close = () => new Promise((resolve) => { state.setDown(true); server.close(resolve); });
  return state;
}

// A pass-through to the local API that can be switched off, records every report submission, and can lose the
// server's answers to them (each report is saved, but the phone never hears back) while dropReportAnswers is on.
function apiProxy() {
  const state = { down: false, dropReportAnswers: false, reportPosts: [], sockets: new Set() };
  const target = new URL(API);
  const server = http.createServer((req, res) => {
    if (state.down) { req.socket.destroy(); return; }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const headers = { ...req.headers, host: target.host };
      const forward = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (answer) => {
        const parts = [];
        answer.on("data", (c) => parts.push(c));
        answer.on("end", () => {
          const answerBody = Buffer.concat(parts);
          const isReport = req.method === "POST" && req.url.startsWith("/api/public/reports");
          if (isReport) {
            let sent = {}, got = {};
            try { sent = JSON.parse(body.toString("utf8")); } catch {}
            try { got = JSON.parse(answerBody.toString("utf8")); } catch {}
            state.reportPosts.push({ submissionKey: sent.submissionKey, title: sent.title, status: answer.statusCode, reference: got.reference, alreadySubmitted: Boolean(got.alreadySubmitted), dropped: state.dropReportAnswers });
            if (state.dropReportAnswers) { req.socket.destroy(); return; }
          }
          res.writeHead(answer.statusCode, answer.headers);
          res.end(answerBody);
        });
      });
      forward.on("error", () => { res.writeHead(502); res.end(); });
      forward.end(body);
    });
  });
  server.on("connection", (socket) => { if (state.down) { socket.destroy(); return; } state.sockets.add(socket); socket.on("close", () => state.sockets.delete(socket)); });
  state.setDown = (down) => { state.down = down; if (down) for (const socket of state.sockets) socket.destroy(); };
  state.listen = () => new Promise((resolve) => server.listen(PROXY_PORT, "127.0.0.1", resolve));
  state.close = () => new Promise((resolve) => { state.setDown(true); server.close(resolve); });
  return state;
}

// Every file in a service worker's offline list, as full addresses.
function offlineList(dir, base) {
  const source = fs.readFileSync(path.join(dir, "service-worker.js"), "utf8");
  const list = source.slice(source.indexOf("const ASSETS = ["), source.indexOf("];", source.indexOf("const ASSETS = [")));
  return [...list.matchAll(/"\.\/([^"]+)"/g)].map((m) => new URL(m[1], base).href);
}

// Waits until the service worker controls the page and every file in the offline list is in its cache.
async function waitForOfflineReady(page, assets) {
  const supported = await page.evaluate(() => "serviceWorker" in navigator && "caches" in window);
  if (!supported) return { supported: false };
  for (let i = 0; i < 120; i++) {
    const state = await page.evaluate(async (urls) => {
      if (!navigator.serviceWorker.controller) return { controlled: false, missing: urls.length };
      const names = await caches.keys();
      const name = names.find((n) => n.startsWith("fixnow-ghana-static"));
      if (!name) return { controlled: true, missing: urls.length };
      const cache = await caches.open(name);
      const found = await Promise.all(urls.map((u) => cache.match(u)));
      return { controlled: true, missing: found.filter((f) => !f).length, name };
    }, assets).catch(() => ({ controlled: false, missing: -1 }));
    if (state.controlled && state.missing === 0) return { supported: true, ready: true, ...state };
    await wait(250);
  }
  const state = await page.evaluate(() => ({ controlled: Boolean(navigator.serviceWorker.controller) })).catch(() => ({}));
  return { supported: true, ready: false, ...state };
}

// Cuts or restores the connection. The test's servers always refuse while offline, so the service worker really
// has no network. In Chromium the context is also set offline (navigator.onLine false, and the online event when it
// comes back). In WebKit, Playwright's offline switch also stops the service worker from answering at all, which a
// real phone does not do, so there (and in Firefox, to be safe) the page is sent the offline and online events instead.
const SET_OFFLINE = ENGINE === "chromium";
async function setNetwork(context, servers, online) {
  for (const server of servers) server.setDown(!online);
  if (SET_OFFLINE) await context.setOffline(!online);
  else for (const page of context.pages()) await page.evaluate((on) => window.dispatchEvent(new Event(on ? "online" : "offline")), online).catch(() => {});
}

// What an address opened: the resident app (and in which mode), or another page.
async function opened(page, url) {
  try {
    await page.goto(url, { waitUntil: "load", timeout: 15000 });
  } catch (error) {
    return { ok: false, why: error.message.split("\n")[0].slice(0, 90) };
  }
  // index.html may hand over to the app page; give it a moment.
  await page.waitForFunction(() => typeof window.setView === "function" || document.readyState === "complete", null, { timeout: 8000 }).catch(() => {});
  await wait(600);
  return page.evaluate(() => ({ ok: true, app: typeof window.setView === "function" && Boolean(document.querySelector("main#main")), demo: typeof IS_DEMO_MODE !== "undefined" ? IS_DEMO_MODE : null, title: document.title, url: location.pathname })).catch((error) => ({ ok: false, why: error.message.slice(0, 90) }));
}

async function passWelcome(page) {
  if (await page.isVisible("#welcomeStartBtn").catch(() => false)) {
    await page.click("#welcomeStartBtn");
    for (const id of ["#consentPrivacy", "#consentTerms", "#consentEmergency"]) await page.check(id);
    await page.click("#welcomeAcceptBtn");
    await wait(500);
  }
}

// Makes a report through the form and submits it. Flooding needs a photo (or the "I can't" choice); water does not.
async function makeReport(page, { title, photo }) {
  await page.evaluate(() => setView("home"));
  await page.click(".home-primary");
  await page.evaluate((type) => { const s = document.querySelector("#type"); s.value = type; s.dispatchEvent(new Event("change", { bubbles: true })); }, photo ? "Flooding or drainage" : "Water supply");
  await page.click('[data-wizard-step="1"] [data-wizard-next]');
  await wait(400);
  await page.fill("#community", "Sample area near the main junction");
  await page.fill("#district", "Accra Metropolitan");
  await page.click('[data-wizard-step="2"] [data-wizard-next]');
  await page.fill("#reportTitle", title);
  await page.fill("#details", "Made by the offline check while the phone had no connection.");
  await page.click('[data-severity="Medium"]');
  await page.click('[data-wizard-step="3"] [data-wizard-next]');
  if (photo) { await page.setInputFiles("#evidenceLibrary", photo); await page.waitForSelector("#evidenceGallery .evidence-item img"); }
  await page.click('[data-wizard-step="4"] [data-wizard-next]');
  await page.click('[data-wizard-step="5"] [data-wizard-next]');
  await wait(2500);
  // The demo has similar sample reports, so step 6 may open "Similar report found nearby" first.
  if (await page.evaluate(() => !document.querySelector("#modalBackdrop").hidden && document.querySelector("#modalTitle").textContent === "Similar report found nearby")) {
    await page.click("#modalActions button:last-child");
    await wait(400);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.check("#caseConsent");
  await page.click('[data-wizard-step="6"] button[type="submit"]');
  await wait(1500);
  return page.evaluate(() => document.querySelector("#modalBackdrop").hidden ? "" : document.querySelector("#modalTitle").textContent);
}

// The report as the app keeps it, its card in My reports, and the send queue.
async function reportState(page, title) {
  await page.evaluate(() => { if (!document.querySelector("#modalBackdrop").hidden) closeModal(); setView("my"); });
  await wait(500);
  return page.evaluate(async (t) => {
    const report = reports.find((r) => r.title === t);
    const card = [...document.querySelectorAll(".my-report-card")].find((c) => c.textContent.includes(t));
    const queue = await queuedSubmissions();
    const item = report ? queue.find((q) => q.submissionKey === report.submissionKey) : null;
    const photo = item && item.attachments && item.attachments[0];
    return {
      found: Boolean(report), syncStatus: report ? report.syncStatus : "", id: report ? report.id : "",
      card: card ? card.textContent.replace(/\s+/g, " ").trim() : "",
      queueLength: queue.length, queued: Boolean(item),
      photos: item && item.attachments ? item.attachments.length : 0,
      photoBytes: photo && photo.dataBase64 ? Math.floor(photo.dataBase64.length * 3 / 4) : 0
    };
  }, title);
}

async function newContext(browser) {
  return browser.newContext({ ...contextOptions(390, 844, { mobile: true }), serviceWorkers: "allow" });
}

// ---------- Entry points ----------
async function entryPoints(browser, { label, base, first, servers, assets, entries, others, demo }) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto(first, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.setView === "function", null, { timeout: 15000 }).catch(() => {});
  const ready = await waitForOfflineReady(page, assets);
  if (!ready.supported || (!ready.ready && !ready.controlled)) {
    console.log(`SKIP: ${label}: this engine (${ENGINE}) has no working service worker here, so offline reopening cannot be tested`);
    skipped++;
    await context.close();
    return;
  }
  check(ready.ready, `${label}: after one online visit the service worker controls the page and all ${assets.length} offline files are cached (${ready.name || "no cache"})`);
  await page.close();
  await setNetwork(context, servers, false);
  for (const url of entries) {
    const tab = await context.newPage();
    const result = await opened(tab, url);
    check(result.ok && result.app && result.demo === demo, `${label}: offline, ${url.replace(base, "./") || "./"} opens the ${demo ? "demo" : "normal"} app${result.ok ? ` (${result.url}, ${result.app ? (result.demo ? "demo app" : "normal app") : `"${result.title}"`})` : ` (${result.why})`}`);
    await tab.close();
  }
  for (const [url, expectTitle] of others) {
    const tab = await context.newPage();
    const result = await opened(tab, url);
    if (expectTitle) check(result.ok && !result.app && expectTitle.test(result.title), `${label}: offline, ${url.replace(base, "./")} opens its own page, not the resident app ("${result.title || result.why}")`);
    else check(!result.app, `${label}: offline, ${url.replace(base, "./")} (never cached) does not turn into the resident app (${result.ok ? `"${result.title}"` : "fails, as it should"})`);
    await tab.close();
  }
  await context.close();
  for (const server of servers) server.setDown(false); // the next test starts online
}

(async () => {
  const browser = await launchBrowser();
  const demoServer = staticServer(DEMO_PORT, SITE, "/fixnow-ghana/", "index.html");
  const normalServer = staticServer(NORMAL_PORT, OUTPUTS, "/", "fixnow-ghana.html");
  const proxy = apiProxy();
  await Promise.all([demoServer.listen(), normalServer.listen(), proxy.listen()]);
  // The staff page names its tab itself ("Staff sign in: FixNow Ghana"); the legal pages keep their own titles.
  const own = { staff: /^Staff/, privacy: /Privacy Policy/, terms: /Terms and Community Rules/, support: /Support$/ };
  console.log(`Offline check (${ENGINE}): demo from ${path.relative(root, SITE) || "."} at ${DEMO_BASE}, normal app from ${path.relative(root, OUTPUTS)} at ${NORMAL_BASE}`);

  try {
    if (ONLY.includes("entry")) {
      const demoEntries = [DEMO_BASE];
      if (fs.existsSync(path.join(SITE, "index.html"))) demoEntries.push(`${DEMO_BASE}index.html`);
      demoEntries.push(`${DEMO_BASE}fixnow-ghana.html`, `${DEMO_BASE}fixnow-ghana.html?from=home-screen`);
      await entryPoints(browser, {
        label: "demo", base: DEMO_BASE, first: DEMO_BASE, servers: [demoServer], demo: true,
        assets: offlineList(SITE, DEMO_BASE), entries: demoEntries,
        others: [[`${DEMO_BASE}staff.html`, own.staff], [`${DEMO_BASE}privacy.html`, own.privacy], [`${DEMO_BASE}terms.html`, own.terms], [`${DEMO_BASE}support.html`, own.support], [`${DEMO_BASE}screens/`, null]]
      });
      const normalEntries = [`${NORMAL_BASE}${API_QUERY}`, `${NORMAL_BASE}fixnow-ghana.html${API_QUERY}`];
      if (fs.existsSync(path.join(OUTPUTS, "index.html"))) normalEntries.push(`${NORMAL_BASE}index.html${API_QUERY}`);
      await entryPoints(browser, {
        label: "normal", base: NORMAL_BASE, first: `${NORMAL_BASE}${API_QUERY}`, servers: [normalServer, proxy], demo: false,
        assets: offlineList(OUTPUTS, NORMAL_BASE), entries: normalEntries,
        others: [[`${NORMAL_BASE}staff.html`, own.staff], [`${NORMAL_BASE}privacy.html`, own.privacy], [`${NORMAL_BASE}terms.html`, own.terms], [`${NORMAL_BASE}support.html`, own.support]]
      });
    }

    if (ONLY.includes("demo")) {
      const context = await newContext(browser);
      const outside = [];
      context.on("request", (r) => { if (!r.url().startsWith(DEMO_BASE) && !/^(data|blob):/.test(r.url())) outside.push(r.url()); });
      const page = await context.newPage();
      await page.goto(DEMO_BASE, { waitUntil: "load" });
      await page.waitForFunction(() => typeof window.setView === "function", null, { timeout: 15000 });
      const ready = await waitForOfflineReady(page, offlineList(SITE, DEMO_BASE));
      if (!ready.supported || !ready.ready) { console.log(`SKIP: demo offline saving: no working service worker in ${ENGINE}`); skipped++; }
      else {
        await passWelcome(page);
        await setNetwork(context, [demoServer], false);
        const logBefore = demoServer.log.length;
        const title = `Offline demo check ${Date.now()}`;
        const saved = await makeReport(page, { title, photo: "" });
        check(saved === "Demo report saved", `demo: offline, the report is saved ("${saved}")`);
        await page.close();
        const again = await context.newPage();
        const reopened = await opened(again, DEMO_BASE);
        check(reopened.ok && reopened.app && reopened.demo === true, `demo: closed and reopened offline at ./, the demo app opens (${reopened.ok ? reopened.url : reopened.why})`);
        let state = await reportState(again, title);
        check(state.found && /Demo only/.test(state.card) && !/Not sent yet/.test(state.card) && state.syncStatus === "demo-local", `demo: the report survives and is labelled Demo only (${state.syncStatus}; "${state.card.slice(0, 90)}")`);
        check(state.queueLength === 0 && !state.queued, `demo: nothing is in the send queue (${state.queueLength})`);
        await setNetwork(context, [demoServer], true);
        await again.evaluate(() => { window.dispatchEvent(new Event("online")); return processSubmissionQueue(); });
        await wait(2500);
        state = await reportState(again, title);
        check(state.found && /Demo only/.test(state.card) && state.syncStatus === "demo-local" && state.queueLength === 0, "demo: back online, it is still Demo only and still not queued");
        const writes = demoServer.log.slice(logBefore).filter((line) => !line.startsWith("GET"));
        check(writes.length === 0 && outside.length === 0, `demo: nothing was ever submitted (${writes.length} non-GET requests to the site, ${outside.length} requests elsewhere${outside.length ? `: ${outside.slice(0, 2).join(", ")}` : ""})`);
      }
      await context.close();
    }

    if (ONLY.includes("normal")) {
      let apiUp = false;
      try { apiUp = (await fetch(`${API}/api/health`)).ok; } catch {}
      if (!apiUp) check(false, `normal: the local API must be running at ${API} for the send test (npm run start:api)`);
      else {
        const context = await newContext(browser);
        const page = await context.newPage();
        await page.goto(`${NORMAL_BASE}${API_QUERY}`, { waitUntil: "load" });
        await page.waitForFunction(() => typeof window.setView === "function", null, { timeout: 15000 });
        const ready = await waitForOfflineReady(page, offlineList(OUTPUTS, NORMAL_BASE));
        if (!ready.supported || !ready.ready) { console.log(`SKIP: normal offline saving: no working service worker in ${ENGINE}`); skipped++; }
        else {
          await passWelcome(page);
          await setNetwork(context, [normalServer, proxy], false);
          const title = `Offline photo check ${Date.now()}`;
          const saved = await makeReport(page, { title, photo: PHOTO });
          check(/waiting to send/i.test(saved) || /Saved/i.test(saved), `normal: offline, the report is saved to send later ("${saved}")`);
          await page.close();
          const again = await context.newPage();
          const reopened = await opened(again, `${NORMAL_BASE}${API_QUERY}`);
          check(reopened.ok && reopened.app && reopened.demo === false, `normal: closed and reopened offline at ./, the app opens (${reopened.ok ? reopened.url : reopened.why})`);
          let state = await reportState(again, title);
          check(state.found && state.queued && state.photos === 1 && state.photoBytes > 1000, `normal: the report and its photo survive (queued: ${state.queued}, photos: ${state.photos}, ${state.photoBytes} bytes)`);
          check(/Not sent yet/.test(state.card) && state.syncStatus !== "submitted", `normal: it is labelled Not sent yet ("${state.card.slice(0, 90)}")`);
          check(proxy.reportPosts.length === 0, "normal: nothing reached the server while offline");

          // Back online while the app is open. The server saves the report, but its answers are lost on purpose (as
          // when the signal drops just after sending) until the test has seen what the phone shows meanwhile.
          proxy.dropReportAnswers = true;
          await setNetwork(context, [normalServer, proxy], true);
          for (let i = 0; i < 80 && proxy.reportPosts.length < 1; i++) await wait(250);
          await wait(1000);
          state = await reportState(again, title);
          const first = proxy.reportPosts[0];
          check(Boolean(first) && first.dropped && first.status < 300 && /^FN-/.test(first.reference || ""), `normal: back online, the app sends the report by itself; the server saves it but its answer is lost (${proxy.reportPosts.length} sent, server status ${first ? first.status : "none"})`);
          check(/Not sent yet/.test(state.card) && state.syncStatus !== "submitted" && state.queued, `normal: without the server's answer it stays Not sent yet (${state.syncStatus})`);

          // Answers get through again; the app retries the same submission (also prompted by the online event, as
          // when the signal comes back) until it is acknowledged.
          proxy.dropReportAnswers = false;
          await again.evaluate(() => { window.dispatchEvent(new Event("online")); });
          for (let i = 0; i < 120; i++) { state = await reportState(again, title); if (state.syncStatus === "submitted") break; await wait(250); }
          const acknowledged = proxy.reportPosts.filter((p) => !p.dropped);
          check(state.syncStatus === "submitted" && !/Not sent yet/.test(state.card) && !state.queued && /^FN-/.test(state.id), `normal: the retry is acknowledged and the report is marked sent (${state.syncStatus}, ${state.id})`);
          check(proxy.reportPosts.length >= 2 && proxy.reportPosts.every((p) => p.submissionKey === first.submissionKey && p.reference === first.reference) && acknowledged.length >= 1 && acknowledged.every((p) => p.alreadySubmitted) && first.reference === state.id, `normal: every retry used the same submission and the server answered with the same report (${proxy.reportPosts.length} sends, all ${first.reference}; acknowledged as already submitted: ${acknowledged.map((p) => p.alreadySubmitted).join(", ")})`);

          // The server holds exactly one such report, with its photo.
          const login = await (await fetch(`${API}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "moderator", password: "moderator123" }) })).json();
          const list = await (await fetch(`${API}/api/reports`, { headers: { Authorization: `Bearer ${login.token}` } })).json();
          const matches = (list.reports || []).filter((r) => r.title === title);
          const photoCount = matches[0] ? (Array.isArray(matches[0].attachments) ? matches[0].attachments.length : Number(matches[0].attachmentCount || matches[0].photoCount || 0)) : 0;
          check(matches.length === 1, `normal: the server holds exactly one report for it (${matches.length})`);
          check(photoCount === 1, `normal: and the photo arrived with it (${photoCount})`);
        }
        await context.close();
      }
    }
  } finally {
    await Promise.all([demoServer.close(), normalServer.close(), proxy.close()]);
    await browser.close();
  }
  const note = skipped ? `, ${skipped} part(s) skipped: no working service worker in ${ENGINE}` : "";
  console.log(failures ? `${failures} offline check(s) failed${note}` : `Offline checks passed (${ENGINE}${note})`);
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error("Offline check failed:", error.message.split("\n")[0]); process.exit(1); });
