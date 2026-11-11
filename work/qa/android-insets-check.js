"use strict";
// Android emulator check: nothing under the status or navigation bar, no extra gap, no double padding, and the
// keyboard never covers a field (step 3, step 5, staff sign-in). Gesture and 3-button navigation.
// Usage: node work/qa/android-insets-check.js <label> <screenshot-folder> [gestural,threebutton] [dark]
// Needs: the emulator running, the debug APK installed, and `adb reverse tcp:4180 tcp:4180` (see work/qa/README.md).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ADB = require("path").join(process.env.ANDROID_HOME || "C:/Users/tyres/AppData/Local/Android/Sdk", "platform-tools", "adb.exe");
const [label, outDir, modesArg, theme] = process.argv.slice(2);
const modes = (modesArg || "gestural,threebutton").split(",");
fs.mkdirSync(outDir, { recursive: true });
const adb = (...a) => execFileSync(ADB, a, { encoding: "utf8", timeout: 60000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => fs.writeFileSync(path.join(outDir, `${label}-${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 5e7, timeout: 60000 }));
const frame = (re, text) => { const m = text.match(re); return m ? { top: +m[2], bottom: +m[4] } : null; };

function bars() {
  const w = adb("shell", "dumpsys", "window");
  const pick = (type) => {
    const lines = w.split("\n").filter((l) => new RegExp(`type=(ITYPE_)?${type}\\b`, "i").test(l) && /frame=\[/.test(l));
    const visible = lines.find((l) => /visible=true/.test(l)) || lines[0];
    return visible ? frame(/frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/, visible) && { ...frame(/frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/, visible), visible: /visible=true/.test(visible) } : null;
  };
  return { status: pick("(STATUS_BAR|statusBars)"), nav: pick("(NAVIGATION_BAR|navigationBars)"), ime: pick("(IME|ime)") };
}
function webViewBounds() {
  for (let i = 0; i < 6; i++) {
    try {
      adb("shell", "uiautomator", "dump", "/sdcard/u.xml");
      const xml = adb("shell", "cat", "/sdcard/u.xml");
      const m = xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (m) return { left: +m[1], top: +m[2], right: +m[3], bottom: +m[4] };
    } catch {}
  }
  throw new Error("WebView not found on screen");
}
async function cdp() {
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
  return { ws, ev };
}

async function tapField(ev, selector, name, dpr) {
  await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: "end" }); window.scrollBy(0, 0); return true; })()`);
  await wait(900);
  const wv = webViewBounds();
  const r = await ev(`JSON.stringify(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect())`).then(JSON.parse);
  const x = Math.round(wv.left + (r.x + Math.min(r.width / 2, 120)) * dpr);
  const y = Math.round(wv.top + (r.y + r.height / 2) * dpr);
  adb("shell", "input", "tap", String(x), String(y));
  await wait(3500);
  const b = bars();
  const wv2 = webViewBounds();
  const r2 = await ev(`JSON.stringify({ rect: document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(), focused: document.activeElement && document.activeElement.matches(${JSON.stringify(selector)}) })`).then(JSON.parse);
  const fieldBottom = Math.round(wv2.top + r2.rect.bottom * dpr);
  const fieldTop = Math.round(wv2.top + r2.rect.top * dpr);
  const kbTop = b.ime && b.ime.visible ? b.ime.top : null;
  const ok = r2.focused && kbTop !== null && fieldBottom <= kbTop && fieldTop >= wv2.top;
  shot(`kb-${name}`);
  console.log(`  ${ok ? "PASS" : "FAIL"} keyboard ${name}: field ${fieldTop}-${fieldBottom} px, keyboard top ${kbTop ?? "not shown"}, page area ${wv2.top}-${wv2.bottom}, focused ${r2.focused}`);
  await ev(`document.activeElement && document.activeElement.blur()`);
  await wait(1500);
  return ok;
}

(async () => {
  let failures = 0;
  const density = Number(adb("shell", "wm", "density").match(/(\d+)\s*$/m)[1]);
  const dpr = density / 160;
  if (theme) adb("shell", "cmd", "uimode", "night", theme === "dark" ? "yes" : "no");
  for (const mode of modes) {
    adb("shell", "cmd", "overlay", "enable-exclusive", "--category", `com.android.internal.systemui.navbar.${mode}`);
    await wait(2500);
    adb("shell", "pm", "clear", "com.fixnowghana.command");
    adb("shell", "am", "start", "-n", "com.fixnowghana.command/.MainActivity");
    const { ws, ev } = await cdp();
    for (let i = 0; i < 40 && (await ev("document.readyState")) !== "complete"; i++) await wait(500);
    await wait(2500);
    await ev(`(() => { document.querySelector("#welcomeStartBtn").click(); ["#consentPrivacy", "#consentTerms", "#consentEmergency"].forEach((s) => { const c = document.querySelector(s); if (!c.checked) c.click(); }); document.querySelector("#welcomeAcceptBtn").click(); return true; })()`);
    await wait(3000);
    const b = bars();
    const wv = webViewBounds();
    // Android 11 reports the WebView bottom edge short in the accessibility tree; the page height is exact.
    wv.bottom = wv.top + Math.round((await ev("window.innerHeight")) * dpr);
    shot(`${mode}-home`);
    const tolerance = 3; // the page height converts from CSS pixels, so allow rounding
    const statusOk = b.status ? wv.top >= b.status.bottom - tolerance : true;
    const navOk = b.nav ? wv.bottom <= b.nav.top + tolerance : true;
    const gapTop = b.status ? wv.top - b.status.bottom : 0;
    const gapBottom = b.nav ? b.nav.top - wv.bottom : 0;
    console.log(`${label} ${mode}: status bar 0-${b.status?.bottom}, nav bar ${b.nav?.top}-${b.nav?.bottom}, page ${wv.top}-${wv.bottom}`);
    console.log(`  ${statusOk ? "PASS" : "FAIL"} nothing under the status bar (gap ${gapTop} px)`);
    console.log(`  ${navOk ? "PASS" : "FAIL"} nothing under the navigation bar (gap ${gapBottom} px)`);
    console.log(`  ${Math.abs(gapTop) <= tolerance && Math.abs(gapBottom) <= tolerance ? "PASS" : "FAIL"} no extra gap`);
    failures += [statusOk, navOk, Math.abs(gapTop) <= tolerance && Math.abs(gapBottom) <= tolerance].filter((v) => !v).length;
    const safeArea = await ev(`(() => { const probe = document.createElement("div"); probe.style.cssText = "position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)"; document.body.appendChild(probe); const c = getComputedStyle(probe); const v = [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].join(" "); probe.remove(); return v; })()`);
    const noDouble = safeArea === "0px 0px 0px 0px";
    console.log(`  ${noDouble ? "PASS" : "FAIL"} no double padding: the page sees safe-area insets of ${safeArea}`);
    if (!noDouble) failures++;

    // Step 3 description and step 5 contact.
    await ev(`(() => { document.querySelector(".home-primary").click(); document.querySelector('[data-quick-type="Flooding or drainage"]').click(); document.querySelector('[data-wizard-step="1"] [data-wizard-next]').click(); return true; })()`);
    await wait(800);
    await ev(`(() => { const set = (s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }; set("#community", "Kaneshie Market"); set("#district", "Accra Metropolitan"); document.querySelector('[data-wizard-step="2"] [data-wizard-next]').click(); return true; })()`);
    await wait(1000);
    if (!(await tapField(ev, "#details", `${mode}-step3-description`, dpr))) failures++;
    await ev(`(() => { const set = (s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }; set("#reportTitle", "Blocked drain"); set("#details", "Water reaches the stalls after rain."); document.querySelector('[data-severity="High"]').click(); document.querySelector('[data-wizard-step="3"] [data-wizard-next]').click(); return true; })()`);
    await wait(800);
    await ev(`document.querySelector('[data-wizard-step="4"] [data-wizard-next]').click()`);
    await wait(1000);
    if (!(await tapField(ev, "#contact", `${mode}-step5-contact`, dpr))) failures++;

    // Staff sign-in.
    await ev(`(() => { document.querySelector('.topbar-exit').click(); return true; })()`);
    await wait(800);
    await ev(`(() => { document.querySelector('.nav button[data-app-view="profile"]').click(); return true; })()`);
    await wait(800);
    await ev(`(() => { const row = [...document.querySelectorAll("button, a, [role=button]")].find((e) => /Verified staff access/.test(e.textContent)); row.click(); return true; })()`);
    await wait(1500);
    const staffField = await ev(`["#responderPortalUsername", "#syncUsername", "#staffUsername"].find((s) => { const e = document.querySelector(s); return e && e.getClientRects().length; }) || ""`);
    if (staffField) { if (!(await tapField(ev, staffField, `${mode}-staff-sign-in`, dpr))) failures++; }
    else { console.log("  FAIL staff sign-in field not found"); failures++; }
    ws.close();
  }
  console.log(failures ? `${label}: ${failures} check(s) failed` : `${label}: all checks passed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("INSETS TEST FAILED:", e.message.split("\n")[0]); process.exit(2); });
