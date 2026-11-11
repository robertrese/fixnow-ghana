"use strict";

// Android emulator check for the staff area: in the installed debug app, Profile > Verified staff access opens
// staff.html from the app's own files, staff can sign in through `adb reverse tcp:4180 tcp:4180`, open a case and sign
// out, Back returns to the app, and the staff page still opens with the network switched off. Needs the same setup as
// android-insets-check.js (emulator running, debug APK installed, local API with demo data).
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const ADB = path.join(process.env.ANDROID_HOME || "C:/Users/tyres/AppData/Local/Android/Sdk", "platform-tools", "adb.exe");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", timeout: 60000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const out = process.argv[2] || path.join(__dirname, "screenshots", "android-staff");
fs.mkdirSync(out, { recursive: true });
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };
const shot = (name) => { fs.writeFileSync(path.join(out, `${name}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 50 * 1024 * 1024 })); };

async function connect() {
  let pid = "";
  for (let i = 0; i < 40; i++) {
    try { pid = adb("shell", "pidof", "com.fixnowghana.command").trim(); } catch {}
    if (pid && adb("exec-out", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) break;
    await wait(1500);
  }
  adb("forward", "tcp:9335", `localabstract:webview_devtools_remote_${pid}`);
  let targets = [];
  for (let i = 0; i < 20 && !targets.length; i++) { try { targets = (await (await fetch("http://localhost:9335/json")).json()).filter((t) => t.type === "page"); } catch {} if (!targets.length) await wait(1000); }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) pending.get(d.id)(d); };
  const ev = (expression) => new Promise((resolve) => { const i = ++id; pending.set(i, (d) => resolve(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } })); });
  return { ws, ev };
}
const until = async (ev, expression, tries = 30) => { for (let i = 0; i < tries; i++) { if (await ev(expression)) return true; await wait(500); } return false; };

(async () => {
  const setNetwork = (on) => { adb("shell", "svc", "wifi", on ? "enable" : "disable"); adb("shell", "svc", "data", on ? "enable" : "disable"); };
  setNetwork(true);
  adb("reverse", "tcp:4180", "tcp:4180");
  try { adb("shell", "am", "force-stop", "com.fixnowghana.command"); } catch {}
  adb("shell", "am", "start", "-n", "com.fixnowghana.command/.MainActivity");
  let { ws, ev } = await connect();
  await until(ev, `document.readyState === "complete"`);
  await wait(2500);
  await ev(`(() => { const b = document.querySelector("#welcomeStartBtn"); if (b && b.getClientRects().length) { b.click(); ["#consentPrivacy", "#consentTerms", "#consentEmergency"].forEach((s) => { const c = document.querySelector(s); if (!c.checked) c.click(); }); document.querySelector("#welcomeAcceptBtn").click(); } setView("profile"); return true; })()`);
  await wait(1200);
  await ev(`document.querySelector("#responderAccessBtn").click()`);
  check(await until(ev, `location.pathname.endsWith("/staff.html") && !!document.querySelector("#signInForm")`), "Verified staff access opens staff.html inside the app");
  check(await ev(`location.href.indexOf("/assets/") > 0 || location.host === "appassets.androidplatform.net"`), "staff.html is loaded from the app's own files");
  await ev(`document.querySelector("#signInUsername").value = "assembly"; document.querySelector("#signInPassword").value = "assembly123"; document.querySelector("#signInForm").requestSubmit(); true`);
  check(await until(ev, `!document.querySelector("#staffView").hidden && /Cases/.test(document.querySelector("#staffView h1")?.textContent || "")`), "staff sign-in works through the strict content security policy");
  await wait(800);
  shot("1-cases");
  await ev(`document.querySelector("[data-open]").click()`);
  check(await until(ev, `!document.querySelector("#staffPage").hidden && /Private details/.test(document.querySelector("#pageBody").textContent)`), "a case page opens with private details");
  await wait(600);
  shot("2-case-page");
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  await wait(1500);
  check(await ev(`document.querySelector("#staffPage").hidden && location.pathname.endsWith("/staff.html")`), "Android Back closes the case page and stays on the staff list");
  await ev(`document.querySelector(".s-topbar [data-sign-out]").click()`);
  check(await until(ev, `!document.querySelector("#signInView").hidden`), "sign out returns to the sign-in screen");
  check(await ev(`(() => { const s = JSON.parse(localStorage.getItem("fixnow-gh-v3-staff") || "{}"); return !s.token && !s.user && !localStorage.getItem("fixnow-gh-v3-staff-outbox") && !document.querySelector("#staffView").innerHTML; })()`), "sign out leaves no session, unsent updates or case data on the phone");
  shot("3-signed-out");

  // Offline: switch the network off and open the staff page again from the resident app.
  // The emulator reaches the local server through adb reverse, which ignores Wi-Fi, so remove that link too.
  setNetwork(false);
  try { adb("reverse", "--remove", "tcp:4180"); } catch {}
  await wait(2000);
  await ev(`location.href = location.href.replace(/staff\\.html.*$/, "fixnow-ghana.html")`);
  ws.close();
  await wait(3000);
  ({ ws, ev } = await connect());
  await until(ev, `document.readyState === "complete"`);
  await ev(`(() => { setView("profile"); document.querySelector("#responderAccessBtn").click(); return true; })()`);
  check(await until(ev, `location.pathname.endsWith("/staff.html") && !!document.querySelector("#signInForm") && getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)"`), "offline, the staff page still opens with its styles");
  await ev(`document.querySelector("#signInUsername").value = "assembly"; document.querySelector("#signInPassword").value = "assembly123"; document.querySelector("#signInForm").requestSubmit(); true`);
  await wait(2500);
  // The emulator still reaches this PC's server through its host address (10.0.2.2) with Wi-Fi off, so whether the
  // server is reachable cannot be simulated here. Report what happened instead of passing or failing on it.
  const offlineMessage = await ev(`document.querySelector("#signInStatus").textContent`);
  const signedIn = await ev(`!document.querySelector("#staffView").hidden`);
  console.log(`NOTE: with Wi-Fi and data off, sign-in ${signedIn ? "still reached the local server through the emulator's host link" : `showed: "${offlineMessage}"`}.`);
  if (signedIn) await ev(`document.querySelector(".s-topbar [data-sign-out]").click()`);
  shot("4-offline");
  setNetwork(true);
  adb("reverse", "tcp:4180", "tcp:4180");
  ws.close();
  console.log(failures ? `${failures} check(s) failed` : "Android staff area checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { try { adb("shell", "svc", "wifi", "enable"); adb("shell", "svc", "data", "enable"); } catch {} console.error("FAILED:", e.message.split("\n")[0]); process.exit(2); });
