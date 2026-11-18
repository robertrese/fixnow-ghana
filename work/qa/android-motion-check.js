"use strict";

// Android check of the V4 polish motion in the installed debug app (run it on Android 11, WebView 83, the worst case).
// It drives the app over the WebView's DevTools connection and, because WebView 83 has no document.getAnimations(),
// listens for each animation's start and end events. It checks that the view entrance, the tile entrance, the report
// steps (forward and back), the dialog (open, and the fading copy on close) and the Report submitted tick really run;
// that each one is declared as 150 to 250 ms and ends about on time; that focus moves at once to the page title, the
// step heading and the dialog title; that a closed dialog gives the page back at once; and that the page logs no errors.
// It runs twice: once as the phone is set, and once with the opposite "reduce motion" preference, set for the page
// only over the DevTools connection (the phone's own settings are never changed). With reduced motion nothing may move
// and focus must behave the same. Then it takes screenshots of the menu bar on the four tabs and checks that the
// capsule sits behind each icon. Needs a running emulator or phone with the debug app installed. It never contacts a
// server.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ADB = path.join(process.env.ANDROID_HOME || "C:/Users/tyres/AppData/Local/Android/Sdk", "platform-tools", "adb.exe");
const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8", timeout: 60000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const out = path.join(__dirname, "screenshots", "android-motion");
fs.mkdirSync(out, { recursive: true });
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };

// Runs in the page: records every animation's declared duration when it starts, and the time from start to end.
const RECORDER = `(() => {
  window.__errors = [];
  window.addEventListener("error", (e) => window.__errors.push(e.message));
  window.__anims = [];
  const open = new Map();
  const key = (e) => e.animationName + "|" + (e.target.getAttribute("class") || "");
  document.addEventListener("animationstart", (e) => {
    const declared = getComputedStyle(e.target).animationDuration.split(",").map((s) => Math.round(parseFloat(s) * 1000));
    open.set(key(e), { name: e.animationName, on: e.target.getAttribute("class") || e.target.tagName, declared: Math.max.apply(null, declared), start: performance.now() });
  }, true);
  document.addEventListener("animationend", (e) => {
    const a = open.get(key(e));
    if (!a) return;
    open.delete(key(e));
    a.took = Math.round(performance.now() - a.start);
    window.__anims.push(a);
  }, true);
})()`;
const legendStep = `(document.activeElement.tagName === "LEGEND" ? document.activeElement.closest("[data-wizard-step]").dataset.wizardStep : "")`;

(async () => {
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
  const send = (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = (expression) => send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }).then((d) => d.result && d.result.result ? d.result.result.value : undefined);
  for (let i = 0; i < 40 && (await ev("document.readyState")) !== "complete"; i++) await wait(500);
  await wait(2500);
  const version = await ev("(navigator.userAgent.match(/Chrome.(\\d+)/) || [])[1]");
  const phoneReduces = await ev("matchMedia('(prefers-reduced-motion: reduce)').matches");
  // Without overflow-x: clip (Chrome 90) a step rises in instead of sliding sideways, so the page never scrolls sideways.
  const clip = await ev("CSS.supports('overflow-x', 'clip')");
  const stepNext = clip ? "fn-step-next" : "fn-view-in";
  const stepBack = clip ? "fn-step-back" : "fn-view-in";
  console.log(`WebView ${version}; the phone asks for reduced motion: ${phoneReduces}; overflow-x: clip ${clip ? "supported" : "not supported, so steps rise in"}`);
  await ev(`(() => { const b = document.querySelector("#welcomeStartBtn"); if (b && b.getClientRects().length) { b.click(); ["#consentPrivacy", "#consentTerms", "#consentEmergency"].forEach((s) => { const c = document.querySelector(s); if (!c.checked) c.click(); }); document.querySelector("#welcomeAcceptBtn").click(); } })()`);
  await wait(1200);
  await ev(RECORDER);
  const take = () => ev("(() => { const a = window.__anims; window.__anims = []; return a; })()");
  const ran = (list, name, on) => list.some((a) => a.name === name && (!on || on.test(a.on)));

  for (const reduce of [phoneReduces, !phoneReduces]) {
    if (reduce !== phoneReduces) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
    const how = `${reduce ? "reduced motion" : "motion on"} (${reduce === phoneReduces ? "as the phone is set" : "set for the page"})`;
    check((await ev("matchMedia('(prefers-reduced-motion: reduce)').matches")) === reduce, `${how}: the page sees the preference`);
    const moves = (ok, label) => { if (!reduce) check(ok, `${how}: ${label}`); };
    const all = [];
    await ev("setView('home')"); await wait(700); await take();

    // A tab change, then back to Home.
    const focusTab = await ev(`(() => { document.activeElement.blur(); document.querySelector('.nav button[data-app-view="nearby"]').click(); return document.activeElement.id; })()`);
    await wait(800);
    let list = await take(); all.push(...list);
    check(focusTab === "viewTitle", `${how}: the page title gets focus at once when the tab changes`);
    moves(ran(list, "fn-view-in"), `the view fades and rises in (${list.map((a) => a.name).join(", ")})`);
    await ev(`document.querySelector('.nav button[data-app-view="home"]').click()`);
    await wait(800);
    list = await take(); all.push(...list);
    moves(ran(list, "fn-item-in", /home-tile/), "the problem tiles ease in");

    // Report steps, forward and back.
    const nextFocus = await ev(`(() => {
      document.querySelector('.nav button[data-app-view="report"]').click();
      document.querySelector('[data-quick-type="Flooding or drainage"]').click();
      document.querySelector('[data-wizard-step="1"] [data-wizard-next]').click();
      return ${legendStep};
    })()`);
    await wait(800);
    list = await take(); all.push(...list);
    check(nextFocus === "2", `${how}: Continue focuses the next step's heading at once`);
    moves(ran(list, stepNext, /wizard-step/), `Continue brings the next step in (${stepNext})`);
    const backFocus = await ev(`(() => { document.querySelector('[data-wizard-step="2"] [data-wizard-back]').click(); return ${legendStep}; })()`);
    await wait(800);
    list = await take(); all.push(...list);
    check(backFocus === "1", `${how}: Back focuses the step heading at once`);
    moves(ran(list, stepBack, /wizard-step/), `Back brings the step in (${stepBack})`);

    // A dialog: open, then close.
    const dialogFocus = await ev(`(() => { setView("home"); openModal("Motion check", "<p>Test</p>"); return document.activeElement.id; })()`);
    await wait(800);
    list = await take(); all.push(...list);
    check(dialogFocus === "modalTitle", `${how}: a dialog's title gets focus at once`);
    moves(ran(list, "fn-fade-in", /modal-backdrop/) && ran(list, "fn-sheet-in", /modal/), "a dialog fades in and its sheet rises");
    const closed = await ev(`(() => { closeModal(); const g = document.querySelector(".modal-ghost"); return { atOnce: document.querySelector("#modalBackdrop").hidden && !document.querySelector(".app").inert, ghost: Boolean(g), ghostSafe: Boolean(g && g.getAttribute("aria-hidden") === "true" && getComputedStyle(g).pointerEvents === "none" && !g.querySelector("[id]")) }; })()`);
    await wait(800);
    list = await take(); all.push(...list);
    check(closed.atOnce, `${how}: closing a dialog gives the page back at once`);
    if (reduce) check(!closed.ghost, `${how}: no fading copy is made`);
    moves(closed.ghostSafe && ran(list, "fn-fade-out", /modal-ghost/), "an unclickable copy of the dialog, without ids, fades out");
    check(await ev(`!document.querySelector(".modal-ghost")`), `${how}: no fading copy is left behind`);

    // Report submitted.
    await ev(`showSubmittedResult({ id: "FN-MOTION1", trackingSecret: "motion-check-secret" })`);
    await wait(800);
    list = await take(); all.push(...list);
    moves(ran(list, "fn-tick-pop", /result-icon/) && ran(list, "fn-tick-mark"), "the Report submitted tick pops in");
    if (!reduce) {
      adb("shell", "screencap", "-p", "/sdcard/fixnow-motion-tick.png");
      adb("pull", "/sdcard/fixnow-motion-tick.png", path.join(out, "report-submitted.png"));
    }
    await ev("closeModal()");
    await wait(500);
    await take();

    const ours = all.filter((a) => /^fn-/.test(a.name));
    if (reduce) check(ours.length === 0, `${how}: nothing moves (${ours.map((a) => a.name).join(", ")})`);
    else {
      const declaredWrong = ours.filter((a) => a.declared < 150 || a.declared > 250);
      check(ours.length >= 8 && declaredWrong.length === 0, `${how}: every animation is declared as 150 to 250 ms (${ours.length} ran${declaredWrong.map((a) => `; ${a.name} ${a.declared} ms`).join("")})`);
      // Frames add a little on a slow emulator; anything far over means an animation is holding things up.
      const slow = ours.filter((a) => a.took > a.declared + 150);
      check(slow.length === 0, `${how}: each one ends about on time (longest ${Math.max(...ours.map((a) => a.took))} ms${slow.map((a) => `; ${a.name} took ${a.took} ms`).join("")})`);
    }
    const errors = await ev("window.__errors");
    check(!errors || errors.length === 0, `${how}: no page errors ${(errors || []).join("; ")}`);
  }

  // The menu bar on the four tabs.
  for (const view of ["home", "nearby", "my", "profile"]) {
    await ev(`document.querySelector('.nav button[data-app-view="${view}"]').click()`);
    await wait(900);
    adb("shell", "screencap", "-p", `/sdcard/fixnow-menu-${view}.png`);
    adb("pull", `/sdcard/fixnow-menu-${view}.png`, path.join(out, `menu-${view}.png`));
    const pill = await ev(`(() => { const p = document.querySelector(".nav-capsule i").getBoundingClientRect(); const i = document.querySelector('.nav button[data-app-view="${view}"] .nav-icon').getBoundingClientRect(); return { dx: Math.round(p.left + p.width / 2 - i.left - i.width / 2), dy: Math.round(p.top + p.height / 2 - i.top - i.height / 2), w: Math.round(p.width), h: Math.round(p.height) }; })()`);
    check(Math.abs(pill.dx) <= 1 && Math.abs(pill.dy) <= 1 && pill.w === 56 && pill.h === 32, `${view}: the 56 x 32 px capsule sits behind the icon (${JSON.stringify(pill)})`);
  }
  try { adb("shell", "rm", "-f", "/sdcard/fixnow-motion-tick.png", "/sdcard/fixnow-menu-home.png", "/sdcard/fixnow-menu-nearby.png", "/sdcard/fixnow-menu-my.png", "/sdcard/fixnow-menu-profile.png"); } catch {}
  ws.close();
  console.log(failures ? `${failures} Android motion check(s) failed` : "Android motion check passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(2); });
