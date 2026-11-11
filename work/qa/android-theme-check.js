"use strict";
// Android emulator check: dark mode follows the phone (also when it changes while the app is open), the in-app
// Light and Dark choices override it, and the area below the tab bar matches the page. Usage:
// node work/qa/android-theme-check.js [screenshot-folder]   (needs the same setup as android-insets-check.js)
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ADB = require("path").join(process.env.ANDROID_HOME || "C:/Users/tyres/AppData/Local/Android/Sdk", "platform-tools", "adb.exe");
const root = path.join(__dirname, "..", "..");
const { chromium } = require(path.join(root, "node_modules", "playwright"));
const out = process.argv[2] || path.join(root, "work/qa/screenshots/android-dark");
fs.mkdirSync(out, { recursive: true });
const adb = (...a) => execFileSync(ADB, a, { encoding: "utf8", timeout: 60000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const grab = () => execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 5e7, timeout: 60000 });
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };

let pixelPage;
async function pixel(png, x, y) {
  await pixelPage.setContent(`<canvas id=c></canvas><img id=i src="data:image/png;base64,${png.toString("base64")}">`);
  return pixelPage.evaluate(([x, y]) => new Promise((res) => { const i = document.getElementById("i"); const go = () => { const c = document.getElementById("c"); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext("2d"); g.drawImage(i, 0, 0); const d = g.getImageData(x, y, 1, 1).data; res("#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")); }; i.complete ? go() : (i.onload = go); }), [x, y]);
}
async function connect() {
  let pid = "";
  for (let i = 0; i < 40; i++) {
    try { pid = adb("shell", "pidof", "com.fixnowghana.command").trim(); } catch {}
    if (pid && adb("exec-out", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) break;
    await wait(1500);
  }
  try { adb("forward", "--remove", "tcp:9333"); } catch {}
  adb("forward", "tcp:9333", `localabstract:webview_devtools_remote_${pid}`);
  let list = [];
  for (let i = 0; i < 20 && !list.length; i++) { try { list = (await (await fetch("http://localhost:9333/json")).json()).filter((t) => t.type === "page"); } catch {} if (!list.length) await wait(1000); }
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("ws failed")); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d); };
  const ev = (expression) => new Promise((r) => { const i = ++id; pending.set(i, (d) => r(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } })); });
  for (let i = 0; i < 40 && (await ev("document.readyState")) !== "complete"; i++) await wait(500);
  await wait(2000);
  return { ws, ev };
}
const state = (ev) => ev(`JSON.stringify({ theme: document.documentElement.dataset.theme, phoneDark: matchMedia("(prefers-color-scheme: dark)").matches })`).then(JSON.parse);
async function startApp(clear) {
  try { adb("shell", "am", "force-stop", "com.fixnowghana.command"); } catch {}
  if (clear) adb("shell", "pm", "clear", "com.fixnowghana.command");
  adb("shell", "am", "start", "-n", "com.fixnowghana.command/.MainActivity");
  return connect();
}
const passWelcome = (ev) => ev(`(() => { const b = document.querySelector("#welcomeStartBtn"); if (!b || !b.getClientRects().length) return false; b.click(); ["#consentPrivacy", "#consentTerms", "#consentEmergency"].forEach((s) => { const c = document.querySelector(s); if (!c.checked) c.click(); }); document.querySelector("#welcomeAcceptBtn").click(); return true; })()`);
const view = (ev, v) => ev(`(() => { setView(${JSON.stringify(v)}); window.scrollTo(0, 0); return true; })()`);
async function shots(ev, theme) {
  await view(ev, "home"); await wait(2500); fs.writeFileSync(path.join(out, `${theme}-1-home.png`), grab());
  await ev(`(() => { document.querySelector(".home-primary").click(); return true; })()`); await wait(1500);
  fs.writeFileSync(path.join(out, `${theme}-2-report-step1.png`), grab());
  await ev(`document.querySelector(".topbar-exit").click()`); await wait(800);
  await view(ev, "nearby"); await wait(4000); fs.writeFileSync(path.join(out, `${theme}-3-nearby.png`), grab());
  await view(ev, "profile"); await wait(1500); fs.writeFileSync(path.join(out, `${theme}-4-profile.png`), grab());
  await ev(`document.querySelector(".appearance-field").scrollIntoView({ block: "center" })`); await wait(800);
  fs.writeFileSync(path.join(out, `${theme}-5-appearance.png`), grab());
}

(async () => {
  const browser = await chromium.launch();
  pixelPage = await browser.newPage();
  const screenHeight = Number(adb("shell", "wm", "size").match(/x(\d+)/)[1]);
  const bottomPixel = async () => pixel(grab(), 120, screenHeight - 12);

  adb("shell", "cmd", "uimode", "night", "no");
  await wait(2000);
  let { ws, ev } = await startApp(true);
  await passWelcome(ev); await wait(2500);
  let s = await state(ev);
  check(s.theme === "light" && !s.phoneDark, `phone light: page is ${s.theme}`);
  check((await bottomPixel()) === "#fffdf8", `phone light: area below the tab bar is paper (${await bottomPixel()})`);
  await shots(ev, "light");

  adb("shell", "cmd", "uimode", "night", "yes");
  await wait(4000);
  s = await state(ev);
  check(s.theme === "dark", `phone switched to dark while the app is open: page is ${s.theme} (WebView reports dark: ${s.phoneDark})`);
  ws.close();

  ({ ws, ev } = await startApp(false));
  s = await state(ev);
  check(s.theme === "dark", `phone dark, app reopened: page is ${s.theme}`);
  await view(ev, "home"); await wait(2000);
  check((await bottomPixel()) === "#1f2720", `phone dark: area below the tab bar is dark (${await bottomPixel()})`);
  await shots(ev, "dark");

  // Appearance overrides the phone.
  await ev(`(() => { const r = document.querySelector('input[name="appearance"][value="light"]'); r.click(); return true; })()`);
  await wait(1500);
  s = await state(ev);
  check(s.theme === "light", `phone dark, Appearance Light: page is ${s.theme}`);
  await view(ev, "home"); await wait(1500);
  check((await bottomPixel()) === "#fffdf8", `phone dark, Appearance Light: area below the tab bar is paper (${await bottomPixel()})`);
  fs.writeFileSync(path.join(out, "override-phone-dark-app-light.png"), grab());
  adb("shell", "cmd", "uimode", "night", "no");
  await wait(3000);
  await ev(`(() => { setView("profile"); document.querySelector('input[name="appearance"][value="dark"]').click(); setView("home"); return true; })()`);
  await wait(2000);
  s = await state(ev);
  check(s.theme === "dark", `phone light, Appearance Dark: page is ${s.theme}`);
  check((await bottomPixel()) === "#1f2720", `phone light, Appearance Dark: area below the tab bar is dark (${await bottomPixel()})`);
  fs.writeFileSync(path.join(out, "override-phone-light-app-dark.png"), grab());
  await ev(`(() => { setView("profile"); document.querySelector('input[name="appearance"][value="system"]').click(); return true; })()`);
  ws.close();
  await browser.close();
  console.log(failures ? `${failures} check(s) failed` : "all theme checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("THEME TEST FAILED:", e.message.split("\n")[0]); process.exit(2); });
