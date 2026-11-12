"use strict";

// Android smoke check of the web code the app shares with the browser: My reports search, the "not sent yet" badge,
// the send queue (a report saved while the server is unreachable sends once it is back), plain error messages, and the
// type and status filters. It drives the installed debug app over the WebView's DevTools connection, using the local
// API through adb reverse (debug builds only). Needs: a running emulator or phone with the debug app installed,
// npm run start:api, and adb reverse tcp:4180 tcp:4180. Reports it makes go to the local test server only.
const { execFileSync } = require("child_process");
const path = require("path");
const ADB = path.join(process.env.ANDROID_HOME || "C:/Users/tyres/AppData/Local/Android/Sdk", "platform-tools", "adb.exe");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", timeout: 60000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RAW_ERRORS = /failed to fetch|typeerror|networkerror|network error|load failed|referenceerror|syntaxerror|domexception|\[object /i;
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };
const serverOn = () => adb("reverse", "tcp:4180", "tcp:4180");
const serverOff = () => { try { adb("reverse", "--remove", "tcp:4180"); } catch { /* already off */ } };

(async () => {
  serverOn();
  try { adb("shell", "pm", "clear", "com.fixnowghana.command"); } catch {}
  adb("shell", "am", "start", "-n", "com.fixnowghana.command/.MainActivity");
  let pid = "";
  for (let i = 0; i < 40; i++) {
    try { pid = adb("shell", "pidof", "com.fixnowghana.command").trim(); } catch {}
    if (pid && adb("exec-out", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) break;
    await wait(1500);
  }
  try { adb("forward", "--remove", "tcp:9335"); } catch {}
  adb("forward", "tcp:9335", `localabstract:webview_devtools_remote_${pid}`);
  let targets = [];
  for (let i = 0; i < 20 && !targets.length; i++) { try { targets = (await (await fetch("http://localhost:9335/json")).json()).filter((t) => t.type === "page"); } catch {} if (!targets.length) await wait(1000); }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d); };
  const ev = (expression) => new Promise((resolve) => { const i = ++id; pending.set(i, (d) => resolve(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } })); });
  for (let i = 0; i < 40 && (await ev("document.readyState")) !== "complete"; i++) await wait(500);
  await wait(2500);
  console.log(`WebView ${await ev("(navigator.userAgent.match(/Chrome\\/(\\d+)/) || [])[1]")}, page ${await ev("location.href")}`);
  await ev(`(() => { const b = document.querySelector("#welcomeStartBtn"); if (b && b.getClientRects().length) { b.click(); ["#consentPrivacy", "#consentTerms", "#consentEmergency"].forEach((s) => { const c = document.querySelector(s); if (!c.checked) c.click(); }); document.querySelector("#welcomeAcceptBtn").click(); } return true; })()`);
  await wait(1200);

  // Install a toast recorder so every message shown is checked for raw errors.
  await ev(`(() => { window.__toasts = []; new MutationObserver(() => window.__toasts.push(document.querySelector("#toast").textContent)).observe(document.querySelector("#toast"), { childList: true, characterData: true, subtree: true }); return true; })()`);
  const seen = [];
  const keep = async () => seen.push(await ev("document.body.innerText"));
  // Fills the report form through the page's own controls and submits it.
  const makeReport = (title, details) => ev(`(async () => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    setView("home"); await pause(300);
    document.querySelector(".home-primary").click(); await pause(300);
    document.querySelector('[data-quick-type="Water supply"]').click();
    document.querySelector('[data-wizard-step="1"] [data-wizard-next]').click(); await pause(1500);
    const step2 = document.querySelector('[data-wizard-step="2"]').innerText;
    const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    set("#community", "Kaneshie, near the water tank"); set("#district", "Accra Metropolitan");
    document.querySelector('[data-wizard-step="2"] [data-wizard-next]').click(); await pause(300);
    set("#reportTitle", ${JSON.stringify(title)}); set("#details", ${JSON.stringify(details)});
    document.querySelector('[data-severity="High"]').click();
    for (const s of [3, 4, 5]) { document.querySelector('[data-wizard-step="' + s + '"] [data-wizard-next]').click(); await pause(400); }
    await pause(2500);
    if (!document.querySelector("#modalBackdrop").hidden) { closeModal(); await pause(300); }
    const consent = document.querySelector("#caseConsent"); if (!consent.checked) consent.click();
    document.querySelector('[data-wizard-step="6"] button[type="submit"]').click();
    await pause(3500);
    const title2 = document.querySelector("#modalBackdrop").hidden ? "" : document.querySelector("#modalTitle").textContent;
    return { step2, result: title2 };
  })()`);

  // 1. A report sent with the server reachable, then found by a word in its title and in its description.
  const sentReport = await makeReport("Burst pipe flooding the lorry station", "Clean water has been pouring out since dawn beside the tro-tro rank.");
  check(sentReport.result === "Report submitted", `a report sends to the local server (${sentReport.result})`);
  await ev("closeModal()");
  const searchFor = (text) => ev(`(async () => { setView("my"); const s = document.querySelector("#myReportSearch"); s.value = ${JSON.stringify(text)}; s.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); return [...document.querySelectorAll("#myReportList [data-details-local]")].map((b) => b.textContent.trim()); })()`);
  check((await searchFor("Burst pipe")).includes("Burst pipe flooding the lorry station"), "search finds the report by a word in its title");
  check((await searchFor("tro-tro rank")).includes("Burst pipe flooding the lorry station"), "search finds the report by words in its description");
  await searchFor("");

  // 2. The server unreachable: plain messages, the report is saved and counted, then sends when the server is back.
  serverOff();
  // A connection the WebView already has open survives removing the route; the local server closes idle
  // connections after 5 seconds, so wait for that before testing "unreachable".
  await wait(7000);
  await ev(`(async () => { setView("nearby"); await new Promise((r) => setTimeout(r, 2500)); return true; })()`);
  await keep();
  const queued = await makeReport("Standpipe dry for three days", "No water at the standpipe near the school since Monday.");
  seen.push(queued.step2);
  check(!RAW_ERRORS.test(queued.step2) && /The map could not load|The map is not available yet/.test(queued.step2), `the location step explains the map in plain words (${(queued.step2.match(/The map[^.]*\./) || [""])[0]})`);
  check(queued.result === "Saved and waiting to send", `with the server unreachable the report is saved and waiting (${queued.result})`);
  await keep();
  await ev("closeModal()");
  const badge = await ev(`(() => { setView("my"); const b = document.querySelector("#openBadge"); return { text: b.textContent, hidden: b.hidden, label: document.querySelector('.nav [data-app-view="my"]').getAttribute("aria-label"), card: [...document.querySelectorAll(".my-report-card")].find((c) => /Standpipe dry/.test(c.textContent)).innerText }; })()`);
  check(badge.text === "1" && !badge.hidden && badge.label === "My reports, 1 report not sent yet", `the badge counts the unsent report (${badge.text}, "${badge.label}")`);
  check(/Not sent yet/.test(badge.card) && !/Demo/.test(badge.card), "the unsent report is labelled Not sent yet");
  await ev(`(async () => { setView("home"); document.querySelector("#trackCaseInput").value = "FN-ABC123"; const s = document.querySelector("#trackSecretInput"); if (s) s.value = "not-a-real-secret"; await findTrackedCase(); return true; })()`);
  await wait(800);
  await keep();
  serverOn();
  await ev(`(async () => { await processSubmissionQueue(); return true; })()`);
  await wait(2500);
  const after = await ev(`(() => { const r = reports.find((x) => /Standpipe dry/.test(x.title)); return { status: r && r.syncStatus, id: r && r.id, badge: document.querySelector("#openBadge").hidden }; })()`);
  check(after.status === "submitted" && /^FN-/.test(after.id || "") && after.badge, `once the server is back the queued report sends and the badge clears (${after.status}, ${after.id})`);

  // 3. Every type and status can be filtered.
  const lists = await ev(`(() => ({ types: REPORT_TYPES, statuses: REPORT_STATUSES, my: [...document.querySelectorAll("#myReportCategoryFilter option")].map((o) => o.value).filter(Boolean), myStatus: [...document.querySelectorAll("#myReportStatusFilter option")].map((o) => o.value).filter(Boolean), near: [...document.querySelectorAll("#nearbyCategoryFilter option")].map((o) => o.value).filter(Boolean), nearStatus: [...document.querySelectorAll("#nearbyStatusFilter option")].map((o) => o.value).filter(Boolean), wizard: [...document.querySelectorAll("#type option")].map((o) => o.value) }))()`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(lists.types.length === 11 && lists.statuses.length === 8 && same(lists.my, lists.types) && same(lists.near, lists.types) && same(lists.wizard, lists.types) && same(lists.myStatus, lists.statuses) && same(lists.nearStatus, lists.statuses), "the wizard and every filter list all 11 types and 8 statuses");
  const filtered = await ev(`(async () => {
    setView("my");
    const pick = async (sel, v) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); s.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 250)); return [...document.querySelectorAll("#myReportList [data-details-local]")].map((b) => b.textContent.trim()); };
    const water = await pick("#myReportCategoryFilter", "Water supply");
    const fire = await pick("#myReportCategoryFilter", "Fire risk");
    await pick("#myReportCategoryFilter", "");
    const open = await pick("#myReportStatusFilter", "Open");
    const blocked = await pick("#myReportStatusFilter", "Blocked");
    await pick("#myReportStatusFilter", "");
    return { water: water.length, fire: fire.length, open: open.length, blocked: blocked.length };
  })()`);
  check(filtered.water === 2 && filtered.fire === 0 && filtered.open === 2 && filtered.blocked === 0, `My reports filters by type and status (${JSON.stringify(filtered)})`);
  const nearby = await ev(`(async () => { setView("nearby"); const s = document.querySelector("#nearbyStatusFilter"); s.value = "Escalated"; s.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 2500)); return document.querySelector("#nearbyResultSummary").innerText + " | " + document.querySelector("#nearbyReportList").innerText.slice(0, 160); })()`);
  check(!/Public feed unavailable/.test(nearby), `Nearby loads with the Escalated filter (${nearby.replace(/\s+/g, " ").slice(0, 120)})`);
  await keep();

  const toasts = await ev("window.__toasts");
  const raw = seen.concat(toasts || []).filter((t) => RAW_ERRORS.test(t)).map((t) => t.match(RAW_ERRORS)[0]);
  check(raw.length === 0, `no screen or message showed a raw error ${raw.join(", ")}`);
  ws.close();
  console.log(failures ? `${failures} Android smoke check(s) failed` : "Android shared-function smoke check passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { serverOn(); console.error("FAILED:", e.message.split("\n")[0]); process.exit(2); });
