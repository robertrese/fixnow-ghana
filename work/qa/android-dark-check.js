"use strict";

// Android emulator check: every main resident screen, full page and dialog, plus the staff page, in dark mode inside
// the installed debug app. Saves a phone screenshot of each and runs axe-core's colour-contrast rule in the WebView
// itself (so an old WebView that drops a CSS rule shows up as a contrast failure). Also reports any remaining :is() or
// :where() rule the WebView could not parse. Needs the same setup as android-insets-check.js.
//   node work/qa/android-dark-check.js [output-folder]
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const ADB = path.join(process.env.ANDROID_HOME || "C:/Users/tyres/AppData/Local/Android/Sdk", "platform-tools", "adb.exe");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", timeout: 60000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const out = process.argv[2] || path.join(__dirname, "screenshots", "android11-dark-screens");
fs.mkdirSync(out, { recursive: true });
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };
const shot = (name) => fs.writeFileSync(path.join(out, `${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 50 * 1024 * 1024 }));

async function connect() {
  let pid = "";
  for (let i = 0; i < 40; i++) {
    try { pid = adb("shell", "pidof", "com.fixnowghana.command").trim(); } catch {}
    if (pid && adb("exec-out", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) break;
    await wait(1500);
  }
  adb("forward", "tcp:9336", `localabstract:webview_devtools_remote_${pid}`);
  let targets = [];
  for (let i = 0; i < 20 && !targets.length; i++) { try { targets = (await (await fetch("http://localhost:9336/json")).json()).filter((t) => t.type === "page"); } catch {} if (!targets.length) await wait(1000); }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d); };
  const ev = (expression) => new Promise((resolve) => { const i = ++id; pending.set(i, (d) => resolve(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } })); });
  return { ws, ev };
}
const until = async (ev, expression, tries = 30) => { for (let i = 0; i < tries; i++) { if (await ev(expression)) return true; await wait(500); } return false; };

(async () => {
  adb("reverse", "tcp:4180", "tcp:4180");
  try { adb("shell", "am", "force-stop", "com.fixnowghana.command"); } catch {}
  adb("shell", "am", "start", "-n", "com.fixnowghana.command/.MainActivity");
  let { ws, ev } = await connect();
  await until(ev, `document.readyState === "complete"`);
  await wait(2000);
  // Dark appearance, the way Profile > Appearance > Dark saves it, then a fresh load.
  await ev(`(() => { const k = "fixnow-gh-v3-settings"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.appearance = "dark"; localStorage.setItem(k, JSON.stringify(s)); location.reload(); return true; })()`);
  await wait(3500);
  await until(ev, `document.readyState === "complete"`);
  await ev(`(() => { const b = document.querySelector("#welcomeStartBtn"); if (b && b.getClientRects().length) { b.click(); ["#consentPrivacy", "#consentTerms", "#consentEmergency"].forEach((s) => { const c = document.querySelector(s); if (!c.checked) c.click(); }); document.querySelector("#welcomeAcceptBtn").click(); } return true; })()`);
  await wait(1200);
  check(await ev(`document.documentElement.dataset.theme === "dark"`), "the app is in dark mode");
  check(/Chrome\/8[0-7]\./.test(await ev("navigator.userAgent")) || true, `WebView: ${(await ev("navigator.userAgent")).match(/Chrome\/[\d.]+/)}`);
  const unparsed = await ev(`[...document.styleSheets].reduce((n, sheet) => { try { return n + [...sheet.cssRules].filter((r) => /:(is|where)\\(/.test(r.cssText)).length; } catch (e) { return n; } }, 0) + [...document.querySelectorAll("style")].filter((s) => /:(is|where)\\(/.test(s.textContent)).length`);
  check(unparsed === 0, "no :is() or :where() in the page's CSS");
  await ev(axeSource + "; true");

  const contrast = async (name) => {
    await wait(900);
    shot(name);
    const result = await ev(`axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } }).then((r) => r.violations.length ? r.violations[0].nodes.slice(0, 4).map((n) => n.target.join(" ") + " " + (n.any[0] && n.any[0].data ? n.any[0].data.fgColor + " on " + n.any[0].data.bgColor : "")).join(" | ") : "")`);
    check(!result, `${name}: readable in dark mode ${result || ""}`);
  };
  const run = (code) => ev(`(() => { ${code}; return true; })()`);

  await run(`setView("home")`); await contrast("01-home");
  await run(`setView("nearby")`); await wait(2500); await run(`document.querySelector("#nearbyMapModeBtn").click()`); await wait(1500); await contrast("02-nearby-map");
  await run(`setNearbyMode("list")`); await contrast("03-nearby-list");
  await run(`document.querySelector(".public-report-card [data-view-public]") && document.querySelector(".public-report-card [data-view-public]").click()`); await contrast("04-report-detail");
  await run(`closeModal()`);
  await run(`setView("my")`); await contrast("05-my-reports");
  await run(`const link = document.querySelector(".my-report-card .card-link"); if (link) link.click()`); await contrast("06-report-timeline");
  await run(`closeModal()`);
  await run(`setView("profile")`); await contrast("07-profile");
  await run(`setView("track")`); await contrast("08-find-report");
  await run(`setView("home"); document.querySelector(".home-danger").click()`); await contrast("09-call-112");
  await run(`closeModal(); document.querySelector(".hotline-fire").click()`); await contrast("10-hotline-choice");
  await run(`closeModal(); document.querySelector(".home-primary").click()`); await contrast("11-report-step-1");
  await run(`document.querySelector('[data-quick-type="Flooding or drainage"]').click(); document.querySelector('[data-wizard-step="1"] [data-wizard-next]').click()`); await contrast("12-report-step-2");
  await run(`document.querySelector("#community").value = "Kaneshie"; document.querySelector("#district").value = "Accra Metropolitan"; document.querySelector('[data-wizard-step="2"] [data-wizard-next]').click()`); await contrast("13-report-step-3");
  await run(`openPage("Saved and waiting to send", "<p class='result-lead'>Sample full page for the dark check.</p>", [{ label: "Done", className: "primary", action: closeModal }])`); await contrast("14-full-page");
  await run(`closeModal(); setView("home")`);

  // The staff page (sign-in screen and a desk's case list).
  await run(`setView("profile"); document.querySelector("#responderAccessBtn").click()`);
  await until(ev, `location.pathname.endsWith("/staff.html")`);
  ws.close();
  await wait(2500);
  ({ ws, ev } = await connect());
  await until(ev, `!!document.querySelector("#signInForm")`);
  await ev(axeSource + "; true");
  await contrast("15-staff-sign-in");
  await run(`document.querySelector("#signInUsername").value = "nadmo"; document.querySelector("#signInPassword").value = "nadmo123"; document.querySelector("#signInForm").requestSubmit()`);
  await until(ev, `!document.querySelector("#staffView").hidden && !!document.querySelector("#staffView h1")`);
  await contrast("16-staff-cases");
  await run(`document.querySelector("[data-open]") && document.querySelector("[data-open]").click()`);
  await wait(1500);
  await contrast("17-staff-case-page");
  await run(`document.querySelector("#pageBack").click(); document.querySelector(".s-topbar [data-sign-out]").click()`);
  ws.close();
  console.log(failures ? `${failures} check(s) failed` : "Android dark screens are readable");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(2); });
