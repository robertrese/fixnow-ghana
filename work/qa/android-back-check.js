"use strict";

// Android emulator check: the phone's Back button or gesture closes a full-screen page (report detail and the like)
// and stays in the app, instead of leaving FixNow. Needs the same setup as android-insets-check.js.
const { execFileSync } = require("child_process");
const path = require("path");
const ADB = path.join(process.env.ANDROID_HOME || "C:/Users/tyres/AppData/Local/Android/Sdk", "platform-tools", "adb.exe");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", timeout: 60000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };

(async () => {
  try { adb("shell", "am", "force-stop", "com.fixnowghana.command"); } catch {}
  adb("shell", "am", "start", "-n", "com.fixnowghana.command/.MainActivity");
  let pid = "";
  for (let i = 0; i < 40; i++) {
    try { pid = adb("shell", "pidof", "com.fixnowghana.command").trim(); } catch {}
    if (pid && adb("exec-out", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) break;
    await wait(1500);
  }
  try { adb("forward", "--remove", "tcp:9334"); } catch {}
  adb("forward", "tcp:9334", `localabstract:webview_devtools_remote_${pid}`);
  let targets = [];
  for (let i = 0; i < 20 && !targets.length; i++) { try { targets = (await (await fetch("http://localhost:9334/json")).json()).filter((t) => t.type === "page"); } catch {} if (!targets.length) await wait(1000); }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d); };
  const ev = (expression) => new Promise((resolve) => { const i = ++id; pending.set(i, (d) => resolve(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true } })); });
  for (let i = 0; i < 40 && (await ev("document.readyState")) !== "complete"; i++) await wait(500);
  await wait(2500);
  await ev(`(() => { const b = document.querySelector("#welcomeStartBtn"); if (b && b.getClientRects().length) { b.click(); ["#consentPrivacy", "#consentTerms", "#consentEmergency"].forEach((s) => { const c = document.querySelector(s); if (!c.checked) c.click(); }); document.querySelector("#welcomeAcceptBtn").click(); } setView("profile"); return true; })()`);
  await wait(1500);
  await ev(`openPage("Report progress", "<p>Test page</p>", [{ label: "Close", className: "primary", action: closeModal }])`);
  await wait(1000);
  check(await ev(`!document.querySelector("#modalBackdrop").hidden`), "a full page is open");
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  await wait(2000);
  const top = adb("shell", "dumpsys", "activity", "activities").split("\n").find((line) => /topResumedActivity|mResumedActivity/.test(line)) || "";
  check(top.includes("com.fixnowghana.command"), "Back keeps FixNow open");
  check(await ev(`document.querySelector("#modalBackdrop").hidden && document.body.dataset.view === "profile"`), "Back closed the page and returned to the screen underneath");
  check(await ev(`!(history.state && history.state.fixnowPage)`), "the page's history entry is gone");
  ws.close();
  console.log(failures ? `${failures} check(s) failed` : "Android Back closes full pages");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(2); });
