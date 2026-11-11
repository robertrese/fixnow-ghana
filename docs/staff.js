"use strict";
// FixNow Ghana staff area. Every list, count and action comes from the FixNow API, which checks the signed-in
// account's role and area on each request. Contact details and exact locations appear only on a case page, and
// only when the server sends them (moderators, admins and the assigned responder see contact details).
(function () {
  const params = new URLSearchParams(window.location.search);
  const IS_DEMO = true; // Public demo build.
  const STAFF_KEY = "fixnow-gh-v3-staff";
  const OUTBOX_KEY = "fixnow-gh-v3-staff-outbox";
  const DEFAULT_SERVER = params.get("api") || "https://api.fixnowghana.org";
  const LOCAL_HOSTS = ["localhost", "127.0.0.1", "10.0.2.2", "[::1]", "::1"];
  const PAGE_LOCAL_HOSTS = ["localhost", "127.0.0.1"];
  const NEXT_STATUSES = {
    Open: ["Acknowledged", "In Progress", "Blocked", "Escalated"],
    Acknowledged: ["Dispatched", "In Progress", "Blocked", "Escalated"],
    Dispatched: ["In Progress", "Blocked", "Escalated"],
    "In Progress": ["Blocked", "Resolved", "Escalated"],
    Blocked: ["In Progress", "Escalated"],
    Escalated: ["In Progress", "Blocked", "Resolved"],
    Reopened: ["Acknowledged", "In Progress", "Escalated"],
    Resolved: []
  };
  const ROLES = ["Moderator", "District Assembly", "NADMO", "Utility Desk", "Field Responder", "Admin"];

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.prototype.slice.call((root || document).querySelectorAll(selector));
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let session = loadJson(STAFF_KEY, {});
  let summary = null;
  let currentTab = "";
  let casesQueue = "institutional";
  let pageOpen = false;
  let dialogReturnFocus = null;
  let lastCases = [];
  let adminConfig = null;
  let usersCache = null;
  let auditShown = 40;

  // ---------- small helpers ----------
  function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch (e) { return fallback; } }
  function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function makeUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }
  function role() { return String((session.user && session.user.role) || "").toLowerCase(); }
  function canModerate() { return role() === "admin" || role() === "moderator"; }
  function isAdmin() { return role() === "admin"; }
  function canAssign() { return /admin|moderator|lead|coordinator|supervisor|manager/.test(role()); }
  function myId() { return Number((session.user && session.user.id) || 0); }
  function plural(count, word, many) { return count + " " + (count === 1 ? word : (many || word + "s")); }
  function when(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (isNaN(date.valueOf())) return "";
    return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function waited(iso) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).valueOf()) / 60000));
    if (!iso || isNaN(minutes)) return "";
    if (minutes < 1) return "Waiting less than a minute";
    if (minutes < 60) return "Waiting " + plural(minutes, "minute");
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return "Waiting " + plural(hours, "hour");
    return "Waiting " + plural(Math.floor(hours / 24), "day");
  }
  function shortWait(iso) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).valueOf()) / 60000));
    if (minutes < 60) return minutes < 1 ? "Under 1 min" : minutes + " min";
    const hours = Math.floor(minutes / 60);
    return hours < 48 ? hours + " h" : Math.floor(hours / 24) + " days";
  }
  function isUrgent(report) { return Boolean(report.immediateDanger) || String(report.severity || "").toLowerCase() === "critical"; }
  function titleOf(report) { return report.title || report.type || "Report"; }
  function placeOf(report) { return report.publicLocationLabel || (report.location && report.location.label) || [report.community, report.district].filter(Boolean).join(", ") || "Area not given"; }
  function yesNo(value) { return value ? "Yes" : "No"; }
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function validateServer(value) {
    const raw = String(value || DEFAULT_SERVER).trim();
    let url;
    try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw); } catch (e) { throw new Error("Enter a valid server address"); }
    const local = LOCAL_HOSTS.indexOf(url.hostname) >= 0 || /\.localhost$/.test(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("The server address must use HTTPS");
    if (url.protocol === "http:" && local && PAGE_LOCAL_HOSTS.indexOf(window.location.hostname) < 0 && window.location.protocol !== "http:") throw new Error("A local server works only from a local page");
    return url.origin + url.pathname.replace(/\/+$/, "");
  }

  async function api(path, options) {
    if (IS_DEMO) throw new Error("The public demo does not connect to a FixNow server");
    const opts = options || {};
    const headers = { "Content-Type": "application/json" };
    if (session.token) headers.Authorization = "Bearer " + session.token;
    let response;
    try {
      response = await fetch(validateServer(session.server) + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" });
    } catch (e) {
      const error = new Error(navigator.onLine ? "The FixNow server could not be reached" : "You are offline");
      error.network = true;
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && session.token && path !== "/api/login") {
      endSession("Your session has ended. Sign in again.", true);
      throw new Error("Sign in again");
    }
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "The server refused this (" + response.status + ")");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  // ---------- sign in and out ----------
  function showSignIn(message) {
    $("#staffTopbar").hidden = true;
    $("#staffTabs").hidden = true;
    $("#staffView").hidden = true;
    $("#signInView").hidden = false;
    $("#signInServer").value = session.server || DEFAULT_SERVER;
    $("#signInStatus").textContent = message || (IS_DEMO ? "The public demo has no staff accounts. Run FixNow with its server to try the staff area." : "");
    $("#residentLink").href = "fixnow-ghana.html" + window.location.search;
    document.title = "Staff sign in: FixNow Ghana";
    $("#signInTitle").focus();
  }

  $("#signInForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#signInStatus");
    const username = $("#signInUsername").value.trim();
    const password = $("#signInPassword").value;
    if (!username || !password) { status.textContent = "Enter your username and password."; return; }
    try {
      session = { server: validateServer($("#signInServer").value || DEFAULT_SERVER) };
      status.textContent = "";
      const data = await api("/api/login", { method: "POST", body: { username: username, password: password } });
      session.token = data.token;
      session.user = data.user;
      saveJson(STAFF_KEY, session);
      // Unsent updates belong to the account that wrote them; a different person never inherits them.
      saveJson(OUTBOX_KEY, outbox().filter((item) => item.actorId === Number(data.user.id)));
      removeLegacyStaffData();
      $("#signInPassword").value = "";
      await startStaff();
    } catch (error) { status.textContent = error.message; }
  });

  function endSession(message, keepOutbox) {
    session = { server: session.server };
    saveJson(STAFF_KEY, session);
    if (!keepOutbox) { try { localStorage.removeItem(OUTBOX_KEY); } catch (e) {} }
    summary = null; adminConfig = null; usersCache = null; lastCases = [];
    closeDialog(); closePage(true);
    // Nothing from the last account stays in the page either.
    ["#staffView", "#pageBody", "#dialogBody", "#tabButtons", "#sideWho"].forEach((selector) => { $(selector).innerHTML = ""; });
    $("#topbarWho").textContent = "Staff";
    $("#toast").hidden = true;
    removeLegacyStaffData();
    showSignIn(message);
  }

  // Older versions of the resident page kept a staff session and staff cases on the device. Remove them.
  function removeLegacyStaffData() {
    ["fixnow-gh-v3", "fixnow-gh-demo-v1"].forEach((space) => {
      try {
        localStorage.removeItem(space + "-responder-reports");
        const sync = JSON.parse(localStorage.getItem(space + "-sync") || "null");
        if (sync && (sync.token || sync.user)) localStorage.setItem(space + "-sync", JSON.stringify({ server: sync.server || "", token: "", user: null, lastSync: "" }));
      } catch (e) {}
    });
    try { if (window.indexedDB) indexedDB.deleteDatabase("fixnow-responder-update-queue"); } catch (e) {}
  }

  async function signOut() {
    const waiting = outbox().length;
    const finish = async () => {
      try { await api("/api/logout", { method: "POST", body: {} }); } catch (e) {}
      endSession("You are signed out. Nothing from your account is left on this device.");
    };
    if (!waiting) return finish();
    openDialog("Sign out now?", "<p>" + esc(plural(waiting, "update")) + " on this phone " + (waiting === 1 ? "is" : "are") + " not sent yet. Signing out deletes " + (waiting === 1 ? "it" : "them") + ".</p>", [
      { label: "Sign out and delete", className: "btn-danger", action: finish },
      { label: "Stay signed in", action: closeDialog }
    ]);
  }
  $$("[data-sign-out]").forEach((button) => button.addEventListener("click", signOut));

  // ---------- shell and tabs ----------
  function tabsForRole() {
    const tabs = [];
    if (canModerate()) tabs.push({ id: "review", label: "Review", count: summary && summary.review });
    tabs.push({ id: "cases", label: "Cases", count: summary && summary.area });
    if (isAdmin()) tabs.push({ id: "routing", label: "Routing" }, { id: "accounts", label: "Staff" }, { id: "audit", label: "Audit log" });
    return tabs;
  }

  function renderShell() {
    const user = session.user || {};
    $("#signInView").hidden = true;
    $("#staffTopbar").hidden = false;
    $("#staffTabs").hidden = false;
    $("#staffView").hidden = false;
    $("#topbarWho").textContent = user.name || user.username;
    $("#sideWho").innerHTML = "<b>" + esc(user.name || user.username) + "</b>" + esc(user.role || "Staff") + "<br />" + esc(user.agency || "No office set") + "<br />" + esc(user.district || user.region || "All areas");
    $("#tabButtons").innerHTML = tabsForRole().map((tab) => '<button type="button" data-tab="' + tab.id + '"' + (tab.id === currentTab ? ' aria-current="page"' : "") + "><span>" + esc(tab.label) + "</span>" + (typeof tab.count === "number" ? '<span class="count">' + tab.count + '<span class="visually-hidden"> ' + (tab.id === "review" ? "waiting" : "cases") + "</span></span>" : "") + "</button>").join("");
    $$("[data-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.tab, true)));
  }

  async function refreshSummary() {
    try { const data = await api("/api/staff/summary"); summary = data.summary; session.user = data.user; saveJson(STAFF_KEY, session); } catch (e) { if (!e.network) throw e; }
    renderShell();
  }

  async function startStaff() {
    if (!session.token || !session.user) return showSignIn();
    renderShell();
    await refreshSummary().catch((error) => showToast(error.message));
    const first = canModerate() ? "review" : "cases";
    await showTab(currentTab && tabsForRole().some((tab) => tab.id === currentTab) ? currentTab : first, false);
    processOutbox();
  }

  async function showTab(id, focus) {
    currentTab = id;
    renderShell();
    const view = $("#staffView");
    view.innerHTML = '<p class="s-note">Loading...</p>';
    try {
      if (id === "review") await renderReview(view);
      else if (id === "cases") await renderCases(view);
      else if (id === "routing") await renderRouting(view);
      else if (id === "accounts") await renderAccounts(view);
      else if (id === "audit") await renderAudit(view);
    } catch (error) {
      view.innerHTML = '<div class="s-empty"><h1 tabindex="-1">Could not load this</h1><p>' + esc(error.message) + '</p><div class="s-actions"><button class="btn" type="button" id="retryTab">Try again</button></div></div>';
      $("#retryTab").addEventListener("click", () => showTab(id, true));
    }
    const heading = $("h1", view);
    document.title = (heading ? heading.textContent : "Staff") + ": FixNow Ghana staff";
    if (focus && heading) heading.focus();
  }

  function offlineNote() {
    return navigator.onLine ? "" : '<div class="s-offline"><b>You are offline.</b> Lists show what the server sent last time you were online. Updates you post are kept on this phone and sent when you are back online.</div>';
  }

  // ---------- moderator review queue ----------
  async function renderReview(view) {
    const data = await api("/api/reports?queue=review");
    const reports = data.reports || [];
    const urgent = reports.filter(isUrgent).length;
    const oldest = reports.length ? reports.reduce((a, b) => (String(a.createdAt) < String(b.createdAt) ? a : b)) : null;
    view.innerHTML = offlineNote() + '<div class="s-head"><h1 tabindex="-1">Waiting for review</h1><p>New reports stay private until a moderator verifies them. Reports with immediate danger or Critical severity are at the top, then the ones waiting longest.</p></div>' +
      '<div class="s-stats"><div class="s-stat"><b>' + reports.length + '</b><span>waiting</span></div><div class="s-stat' + (urgent ? " is-urgent" : "") + '"><b>' + urgent + '</b><span>urgent</span></div><div class="s-stat"><b>' + (oldest ? esc(shortWait(oldest.createdAt)) : "None") + '</b><span>longest wait</span></div></div>' +
      (reports.length ? '<div class="s-list two">' + reports.map((report) => itemHtml(report, "review")).join("") + "</div>" : '<div class="s-empty"><h2>Nothing is waiting</h2><p>Every report has been verified, rejected or hidden. New reports appear here as they arrive.</p></div>');
    bindItems(view);
  }

  function itemHtml(report, kind) {
    const operations = report.operations || {};
    const assignee = operations.assignment && operations.assignment.assignee;
    const pending = outbox().some((item) => item.reportId === report.id && item.actorId === myId());
    const tags = [];
    if (report.immediateDanger) tags.push('<span class="tag tag-urgent">Immediate danger</span>');
    if (report.severity) tags.push('<span class="tag' + (String(report.severity).toLowerCase() === "critical" && !report.immediateDanger ? " tag-urgent" : "") + '">' + esc(report.severity) + "</span>");
    if (kind === "cases") tags.push('<span class="tag tag-quiet">' + esc(report.status || "Open") + "</span>");
    if (kind === "cases" && !report.publicVerified) tags.push('<span class="tag tag-warn">Not verified yet</span>');
    if (kind === "cases" && operations.overdue) tags.push('<span class="tag tag-warn">Overdue</span>');
    if (kind === "cases" && canModerate() && (report.publicVerified || report.status === "Escalated") && !report.routedOffice) tags.push('<span class="tag tag-urgent">No office can see this</span>');
    if (pending) tags.push('<span class="tag tag-warn">Not sent yet</span>');
    const meta = kind === "review"
      ? "<span>" + esc(report.type || "") + "</span><span>" + esc(waited(report.createdAt)) + "</span>"
      : "<span>" + esc(assignee ? "Assigned to " + (assignee.name || assignee.username) : "Not assigned") + "</span>" + (operations.slaDueAt ? "<span>" + esc((operations.overdue ? "Was due " : "Due ") + when(operations.slaDueAt)) + "</span>" : "");
    return '<button type="button" class="s-item' + (isUrgent(report) ? " is-urgent" : "") + '" data-open="' + esc(report.id) + '" data-kind="' + kind + '">' +
      '<span class="tags">' + tags.join("") + "</span><h3>" + esc(titleOf(report)) + '</h3><span class="where">' + esc(placeOf(report)) + '</span><span class="meta">' + meta + '</span><span class="ref">Reference ' + esc(report.id) + "</span></button>";
  }

  function bindItems(root) {
    $$("[data-open]", root).forEach((button) => button.addEventListener("click", () => openCase(button.dataset.open, button.dataset.kind, button)));
  }

  // ---------- cases ----------
  async function renderCases(view) {
    const search = view.dataset.search || "";
    const category = view.dataset.category || "";
    const status = view.dataset.status || "";
    const query = new URLSearchParams({ queue: casesQueue === "overdue" ? "institutional" : casesQueue });
    if (casesQueue === "overdue") query.set("overdue", "1");
    if (category) query.set("category", category);
    if (status) query.set("status", status);
    const data = await api("/api/reports?" + query.toString());
    lastCases = data.reports || [];
    const term = search.toLowerCase();
    const shown = lastCases.filter((report) => !term || [report.id, report.title, report.type, report.community, report.district, report.details].some((value) => String(value || "").toLowerCase().indexOf(term) >= 0));
    const user = session.user || {};
    const queues = [["institutional", canModerate() ? "All cases" : "My office"], ["assigned", "Assigned to me"], ["overdue", "Overdue"], ["escalated", "Escalated"]];
    const categories = ["Flooding or drainage", "Road or bridge", "Waste or sanitation", "Water supply", "Electricity", "Public safety", "Clinic access", "School access", "Market facilities", "Public toilet", "Streetlight", "Other"];
    const statuses = ["Open", "Acknowledged", "Dispatched", "In Progress", "Blocked", "Escalated", "Resolved", "Rejected"];
    view.innerHTML = offlineNote() + '<div class="s-head"><h1 tabindex="-1">Cases</h1><p>' + (canModerate() ? "Every case in every area." : "Cases a moderator has verified or escalated and routed to " + esc(user.agency || "your office") + ", or assigned to you, in " + esc(user.district || user.region || "your area") + ".") + " Exact locations and contact details are on each case page, not in this list.</p></div>" +
      (summary ? '<div class="s-stats"><div class="s-stat"><b>' + summary.area + '</b><span>' + (canModerate() ? "all cases" : "for my office") + '</span></div><div class="s-stat"><b>' + summary.assigned + '</b><span>assigned to me</span></div><div class="s-stat' + (summary.overdue ? " is-urgent" : "") + '"><b>' + summary.overdue + '</b><span>overdue</span></div><div class="s-stat"><b>' + summary.escalated + "</b><span>escalated</span></div></div>" : "") +
      '<div class="s-seg" role="group" aria-label="Which cases">' + queues.map((q) => '<button type="button" data-queue="' + q[0] + '" aria-pressed="' + (q[0] === casesQueue) + '">' + q[1] + "</button>").join("") + "</div>" +
      '<div class="s-filters"><label>Search<input id="caseSearch" type="search" value="' + esc(search) + '" placeholder="Reference, place or words" /></label>' +
      '<label>Problem type<select id="caseCategory"><option value="">All types</option>' + categories.map((c) => "<option" + (c === category ? " selected" : "") + ">" + c + "</option>").join("") + "</select></label>" +
      '<label>Status<select id="caseStatus"><option value="">All statuses</option>' + statuses.map((s) => "<option" + (s === status ? " selected" : "") + ">" + s + "</option>").join("") + "</select></label></div>" +
      '<p class="hint" role="status" id="casesCount">' + esc(plural(shown.length, "case")) + " shown</p>" +
      (shown.length ? '<div class="s-list two">' + shown.map((report) => itemHtml(report, "cases")).join("") + "</div>" : '<div class="s-empty"><h2>No cases here</h2><p>Try another list or filter. Only cases in your area are ever shown.</p></div>');
    bindItems(view);
    $$("[data-queue]", view).forEach((button) => button.addEventListener("click", () => { casesQueue = button.dataset.queue; reloadCases(view, "[data-queue=\"" + casesQueue + "\"]"); }));
    $("#caseCategory").addEventListener("change", (event) => { view.dataset.category = event.target.value; reloadCases(view, "#caseCategory"); });
    $("#caseStatus").addEventListener("change", (event) => { view.dataset.status = event.target.value; reloadCases(view, "#caseStatus"); });
    $("#caseSearch").addEventListener("change", (event) => { view.dataset.search = event.target.value; reloadCases(view, "#caseSearch"); });
  }

  async function reloadCases(view, focusSelector) {
    try { await renderCases(view); } catch (error) { showToast(error.message); }
    const target = $(focusSelector, view);
    if (target) target.focus();
  }

  // ---------- case and review page ----------
  function openPageShell(trigger) {
    dialogReturnFocus = trigger || document.activeElement;
    const page = $("#staffPage");
    page.hidden = false;
    page.scrollTop = 0;
    document.body.style.overflow = "hidden";
    if (!pageOpen) { try { history.pushState({ staffPage: true }, ""); } catch (e) {} }
    pageOpen = true;
  }

  function closePage(fromHistory) {
    if (!pageOpen) return;
    pageOpen = false;
    $("#staffPage").hidden = true;
    document.body.style.overflow = "";
    if (!fromHistory && history.state && history.state.staffPage) history.back();
    if (dialogReturnFocus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus();
  }
  $("#pageBack").addEventListener("click", () => { closePage(false); showTab(currentTab, false); });
  window.addEventListener("popstate", () => { if (pageOpen) { closePage(true); showTab(currentTab, false); } });
  // The Android app calls this on Back first (same contract as the resident page): close an open dialog or case page
  // and report true, or report false so the app goes back a page.
  window.fixNowDismissEmergencyDialog = function () {
    if (!$("#dialogBackdrop").hidden) { closeDialog(); return true; }
    if (pageOpen) { closePage(false); showTab(currentTab, false); return true; }
    return false;
  };

  async function openCase(id, kind, trigger) {
    openPageShell(trigger);
    const body = $("#pageBody");
    body.innerHTML = '<h1 id="pageTitle" tabindex="-1">Loading case</h1>';
    try {
      const data = await api("/api/reports/" + encodeURIComponent(id) + "/case");
      renderCasePage(data.report, kind);
    } catch (error) {
      body.innerHTML = '<h1 id="pageTitle" tabindex="-1">Could not open this case</h1><p class="s-note">' + esc(error.message) + (error.network ? " Case pages need a connection, because exact locations and contact details are never kept on the phone." : "") + "</p>";
    }
    $("#pageTitle").focus();
  }

  function privateDetailsHtml(report) {
    const location = report.location || {};
    const hasExact = location.exactLatitude !== null && location.exactLatitude !== undefined;
    const exact = hasExact ? Number(location.exactLatitude).toFixed(6) + ", " + Number(location.exactLongitude).toFixed(6) + (location.accuracyMetres != null ? " (accurate to about " + Math.round(location.accuracyMetres) + " m)" : "") : "The resident did not share an exact location";
    let contact;
    if (report.contactAccess !== "shown") contact = report.hasContact ? "Only moderators and the responder assigned to this case can see contact details." : "The resident gave no contact details";
    else contact = [report.contact, report.trustedContact ? "Trusted contact: " + report.trustedContact : ""].filter(Boolean).join(". ") || "The resident gave no contact details";
    return '<section class="s-private s-section" aria-labelledby="privateTitle"><h2 id="privateTitle">Private details, staff only</h2><dl class="s-dl wide">' +
      "<div><dt>Exact location</dt><dd>" + esc(exact) + "</dd></div>" +
      (report.digitalAddress ? "<div><dt>GhanaPostGPS</dt><dd>" + esc(report.digitalAddress) + "</dd></div>" : "") +
      "<div><dt>Contact</dt><dd>" + esc(contact) + "</dd></div>" +
      "<div><dt>Public area shown to residents</dt><dd>" + esc(placeOf(report)) + "</dd></div></dl>" +
      '<p class="hint s-gap">Opening this page is recorded in the audit log. Never copy these details into a public update.</p></section>';
  }

  function factsHtml(report) {
    return '<section class="s-section" aria-labelledby="factsTitle"><h2 id="factsTitle">What the resident reported</h2><div class="s-card"><p>' + esc(report.details || "No description given") + '</p></div><dl class="s-dl facts s-gap">' +
      "<div><dt>Problem type</dt><dd>" + esc([report.type, report.subcategory].filter(Boolean).join(", ") || "Not given") + "</dd></div>" +
      "<div><dt>Severity</dt><dd>" + esc(report.severity || "Not given") + "</dd></div>" +
      "<div><dt>Anyone in immediate danger</dt><dd>" + yesNo(report.immediateDanger) + "</dd></div>" +
      "<div><dt>People affected</dt><dd>" + esc(report.affected ? String(report.affected) : "Not given") + "</dd></div>" +
      "<div><dt>Road or access blocked</dt><dd>" + yesNo(report.accessBlocked) + "</dd></div>" +
      "<div><dt>Getting worse</dt><dd>" + yesNo(report.worsening) + "</dd></div></dl></section>";
  }

  function photosHtml(report) {
    const evidence = (report.operations && report.operations.evidence) || [];
    if (!evidence.length) return '<section class="s-section"><h2>Photos</h2><p class="s-note">No photos with this report.</p></section>';
    const stateLabel = { clean: "Checked, clean", rejected: "Rejected", quarantined: "Not checked yet", pending: "Not checked yet" };
    return '<section class="s-section"><h2>Photos</h2><div class="s-rows">' + evidence.map((item) => '<div class="s-row"><div><b>' + esc(item.kind === "citizen" ? "From the resident" : "From a responder") + '</b><div class="sub">' + esc(stateLabel[item.state] || "Not checked yet") + (item.publicImageId ? ", shown publicly" : "") + '</div></div><button class="btn" type="button" data-photo="' + esc(item.id) + '">' + (canModerate() ? "Review photo" : "View photo") + "</button></div>").join("") + "</div></section>";
  }

  function timelineHtml(report) {
    const history = report.history || [];
    if (!history.length) return "";
    return '<section class="s-section"><h2>History</h2><ol class="s-timeline">' + history.slice().reverse().map((entry) => "<li><b>" + esc(entry.toStatus || "Update") + '</b><span class="when">' + esc(when(entry.createdAt)) + "</span>" +
      (entry.publicUpdate ? '<div class="public">Public update: ' + esc(entry.publicUpdate) + "</div>" : "") +
      (entry.privateNote ? '<div class="internal">Internal note, staff only: ' + esc(entry.privateNote) + "</div>" : "") + "</li>").join("") + "</ol></section>";
  }

  function renderCasePage(report, kind) {
    const body = $("#pageBody");
    const operations = report.operations || {};
    const assignee = operations.assignment && operations.assignment.assignee;
    const review = kind === "review" && report.awaitingReview && canModerate();
    const tags = [];
    if (report.immediateDanger) tags.push('<span class="tag tag-urgent">Immediate danger</span>');
    if (report.severity) tags.push('<span class="tag">' + esc(report.severity) + "</span>");
    tags.push('<span class="tag tag-quiet">' + esc(report.status || "Open") + "</span>");
    tags.push(report.publicVerified ? '<span class="tag tag-ok">Verified, public</span>' : '<span class="tag tag-warn">Not verified yet</span>');
    let html = '<div class="tags">' + tags.join("") + '</div><h1 id="pageTitle" tabindex="-1">' + esc(titleOf(report)) + '</h1><p class="hint">Reference ' + esc(report.id) + ". Sent " + esc(when(report.createdAt)) + (report.awaitingReview ? ". " + esc(waited(report.createdAt)) : "") + "</p>";
    html += factsHtml(report) + privateDetailsHtml(report) + photosHtml(report);
    if (review) {
      const route = report.routePreview || {};
      html += '<section class="s-section" aria-labelledby="previewTitle"><h2 id="previewTitle">What residents will see</h2><div class="s-preview"><p class="label">Public preview</p><div class="tags"><span class="tag">' + esc(report.type || "Report") + '</span><span class="tag tag-ok">Moderator verified</span></div><h3 class="s-preview-title">' + esc(titleOf(report)) + '</h3><p class="hint">' + esc(placeOf(report)) + '</p><p class="s-gap">' + esc(report.details || "") + '</p></div><p class="hint s-gap">Residents see the approximate area only. Contact details, the exact location and photos that have not been checked are never public.</p></section>' +
        '<section class="s-section"><h2>Where it goes after verification</h2><div class="s-card">' + (route.matched ? "<p><b>" + esc(route.office || "An office without a name") + "</b></p><p class=\"hint\">Routing rule: " + esc(route.rule) + ". When you verify or escalate, the report goes straight to this office's case list. Until then no office can see it. Nothing is sent outside FixNow.</p>" : '<p class="s-warn"><b>No office will see this report.</b> No routing rule matches it, so after you verify or escalate it only moderators and admins can see it. If it is urgent, escalate it, then assign it to someone from the Cases tab, and ask an administrator to add a rule.</p>') + "</div></section>" +
        '<div class="s-actions stack"><button class="btn btn-primary" type="button" data-act="verify">Verify and publish</button><button class="btn" type="button" data-act="escalate-review">Escalate</button><button class="btn" type="button" data-act="hide">Hide</button><button class="btn btn-danger" type="button" data-act="reject">Reject</button></div>';
    } else {
      const assignedToMe = assignee && Number(assignee.id) === myId();
      const canUpdate = assignedToMe || canModerate();
      html += '<section class="s-section"><h2>Response</h2><dl class="s-dl"><div><dt>Status</dt><dd>' + esc(report.status || "Open") + "</dd></div><div><dt>Assigned to</dt><dd>" + esc(assignee ? (assignee.name || assignee.username) + (assignee.institution ? ", " + assignee.institution : "") : "Not assigned") + "</dd></div>" +
        "<div><dt>Routed to</dt><dd>" + esc(report.routedOffice || "No office yet") + "</dd></div><div><dt>Due</dt><dd>" + esc(operations.slaDueAt ? when(operations.slaDueAt) + (operations.overdue ? ", overdue" : "") : "No target set") + "</dd></div><div><dt>Responsible office shown publicly</dt><dd>" + esc(report.responsibleInstitution || "Not set") + "</dd></div></dl>" +
        '<div class="s-actions stack">' + (!assignee ? '<button class="btn btn-primary" type="button" data-act="accept">Accept case</button>' : "") +
        (canUpdate ? '<button class="btn' + (assignee ? " btn-primary" : "") + '" type="button" data-act="update">Post an update</button>' : "") +
        (canAssign() ? '<button class="btn" type="button" data-act="assign">' + (assignee ? "Reassign" : "Assign") + "</button>" : "") +
        (canUpdate || !assignee ? '<button class="btn" type="button" data-act="escalate">Escalate</button><button class="btn" type="button" data-act="photo">Add a field photo</button>' : "") +
        '<button class="btn" type="button" data-act="routing">Routing</button></div>' +
        (!canUpdate && assignee ? '<p class="hint s-gap">Only the assigned responder or a moderator can post updates on this case.</p>' : "") + "</section>";
    }
    html += timelineHtml(report);
    body.innerHTML = html;
    const reopen = () => openCase(report.id, kind);
    $$("[data-photo]", body).forEach((button) => button.addEventListener("click", () => openPhoto(report, button.dataset.photo, reopen)));
    $$("[data-act]", body).forEach((button) => button.addEventListener("click", () => {
      const act = button.dataset.act;
      if (act === "verify") verifyDialog(report);
      else if (act === "reject" || act === "hide" || act === "escalate-review") moderationDialog(report, act);
      else if (act === "accept") fieldDialog(report, "accept", reopen);
      else if (act === "escalate") fieldDialog(report, "escalate", reopen);
      else if (act === "assign") assignDialog(report, reopen);
      else if (act === "update") updateDialog(report, reopen);
      else if (act === "photo") fieldPhotoDialog(report, reopen);
      else if (act === "routing") routingDialog(report);
    }));
  }

  // ---------- dialogs ----------
  function openDialog(title, html, actions) {
    if (!$("#dialogBackdrop").hidden) closeDialog(true);
    openDialog.returnTo = document.activeElement;
    $("#dialogTitle").textContent = title;
    $("#dialogBody").innerHTML = html;
    $("#dialogStatus").textContent = "";
    const holder = $("#dialogActions");
    holder.innerHTML = "";
    actions.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn " + (item.className || "");
      button.textContent = item.label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await item.action(); } catch (error) { $("#dialogStatus").textContent = error.message; } finally { button.disabled = false; }
      });
      holder.appendChild(button);
    });
    $("#dialogBackdrop").hidden = false;
    syncChecks();
    $("#dialogTitle").focus();
  }
  function closeDialog(keepFocus) {
    if ($("#dialogBackdrop").hidden) return;
    $("#dialogBackdrop").hidden = true;
    $("#dialogBody").innerHTML = "";
    if (!keepFocus && openDialog.returnTo && document.contains(openDialog.returnTo)) openDialog.returnTo.focus();
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#dialogBackdrop").hidden) closeDialog();
    if (event.key === "Tab" && !$("#dialogBackdrop").hidden) {
      const focusable = $$("button:not([disabled]), input, select, textarea, a[href], [tabindex='-1']", $(".s-dialog")).filter((el) => el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  function syncChecks() { $$(".check").forEach((line) => { const box = $("input", line); line.classList.toggle("is-checked", Boolean(box && box.checked)); }); }
  document.addEventListener("change", (event) => { if (event.target && event.target.type === "checkbox") syncChecks(); });
  function need(selector, message) {
    const field = $(selector);
    const value = field ? String(field.value || "").trim() : "";
    if (!value) { if (field) field.focus(); throw new Error(message); }
    return value;
  }
  function textField(id, label, hint, required, multiline) {
    return "<label>" + esc(label) + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + (multiline === false ? '<input id="' + id + '" maxlength="160"' + (required ? " required" : "") + " />" : '<textarea id="' + id + '" maxlength="1000"' + (required ? " required" : "") + "></textarea>") + "</label>";
  }

  async function afterModeration(message) {
    closeDialog(true);
    closePage(false);
    showToast(message);
    await refreshSummary().catch(() => {});
    await showTab(currentTab, true);
  }

  function verifyDialog(report) {
    openDialog("Verify and publish", "<p>The report will appear on Nearby at its approximate area. The exact location and contact details stay private.</p>" +
      '<label class="check"><input type="checkbox" id="verifyPrivacy" /><span>I read the title and description. They show no names, phone numbers, exact addresses, or anything else that identifies a person.</span></label>' +
      textField("verifyNote", "Verification note", "Staff only. What you checked.", true) +
      textField("verifyOffice", "Responsible office shown publicly (optional)", "Leave empty until an office has accepted the case.", false, false), [
      { label: "Verify and publish", className: "btn-primary", action: async () => {
        if (!$("#verifyPrivacy").checked) { $("#verifyPrivacy").focus(); throw new Error("Confirm the privacy check first."); }
        const note = need("#verifyNote", "Add a verification note.");
        const data = await api("/api/reports/" + encodeURIComponent(report.id) + "/moderation", { method: "POST", body: { action: "approve", privacyChecked: true, note: note, responsibleInstitution: $("#verifyOffice").value.trim() } });
        await afterModeration(data.report.routedOffice ? "Verified. It is on Nearby and in the case list of " + data.report.routedOffice + "." : "Verified and on Nearby, but no office can see it: no routing rule matches.");
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  function moderationDialog(report, act) {
    const copy = {
      reject: ["Reject this report", "Use this for reports that are not real, are duplicates or are outside FixNow. The report leaves the queue and is never public.", "Reason for rejecting", "Reject report", "btn-danger", "reject", "Report rejected."],
      hide: ["Hide this report", "Use this for abusive, harmful or offensive content. The report leaves the queue and is never public.", "Reason for hiding", "Hide report", "btn-danger", "hide", "Report hidden."],
      "escalate-review": ["Escalate this report", "Use this when someone may be in danger and the case needs senior attention now. If life is at risk, call 112 first. Escalating records the case as Escalated; it does not contact anyone by itself.", "Reason for escalating", "Escalate", "btn-primary", "escalate", "Report escalated. No outside office has been contacted by FixNow."]
    }[act];
    openDialog(copy[0], "<p>" + esc(copy[1]) + "</p>" + textField("moderationReason", copy[2], "Staff only. Kept in the audit log.", true), [
      { label: copy[3], className: copy[4], action: async () => {
        const note = need("#moderationReason", "Add a reason.");
        const data = await api("/api/reports/" + encodeURIComponent(report.id) + "/moderation", { method: "POST", body: { action: copy[5], note: note } });
        await afterModeration(act !== "escalate-review" ? copy[6] : data.report.routedOffice ? "Escalated and sent to the case list of " + data.report.routedOffice + ". No outside office has been contacted by FixNow." : "Escalated, but no office can see it: no routing rule matches. Assign it from the Cases tab.");
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  async function fieldAction(report, action, values, done) {
    await api("/api/reports/" + encodeURIComponent(report.id) + "/field-action", { method: "POST", body: Object.assign({ action: action, actionKey: makeUuid() }, values) });
    closeDialog(true);
    await refreshSummary().catch(() => {});
    done();
  }

  function fieldDialog(report, action, done) {
    const accept = action === "accept";
    openDialog(accept ? "Accept this case" : "Escalate this case",
      "<p>" + (accept ? "The case is assigned to you. Residents following it see your public update." : "Escalating records the case as Escalated and keeps the reason. It does not contact any office by itself. If life is at risk, call 112 first.") + "</p>" +
      (accept ? "" : textField("fieldReason", "Reason for escalating", "Staff only.", true) + textField("fieldTarget", "Who should take it (optional)", "", false, false)) +
      textField("fieldPublic", "Public update", "Residents following this report see this.", true) + textField("fieldPrivate", "Internal note (optional)", "Staff only.", false), [
      { label: accept ? "Accept case" : "Escalate", className: "btn-primary", action: async () => {
        const values = {};
        if (!accept) { values.reason = need("#fieldReason", "Add a reason."); values.target = $("#fieldTarget").value.trim(); }
        values.publicUpdate = need("#fieldPublic", "Add a public update.");
        values.privateNote = $("#fieldPrivate").value.trim();
        await fieldAction(report, action, values, done);
        showToast(accept ? "Case accepted. It is assigned to you." : "Escalation recorded. No outside office has been contacted by FixNow.");
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  async function assignDialog(report, done) {
    const data = await api("/api/responders?reportId=" + encodeURIComponent(report.id)).catch((error) => { showToast(error.message); return null; });
    if (!data) return;
    const assignee = report.operations && report.operations.assignment && report.operations.assignment.assignee;
    const people = data.responders || [];
    openDialog(assignee ? "Reassign this case" : "Assign this case", "<p>Only active staff whose area covers this case are listed.</p>" +
      '<label>Assign to<select id="assignTo"><option value="">Choose a person</option>' + people.map((p) => '<option value="' + p.id + '">' + esc(p.name || p.username) + (p.agency ? ", " + esc(p.agency) : "") + "</option>").join("") + "</select></label>" +
      textField("assignPublic", "Public update", "Residents following this report see this.", true) + textField("assignPrivate", "Internal note (optional)", "Staff only.", false), [
      { label: "Save", className: "btn-primary", action: async () => {
        const target = Number($("#assignTo").value || 0);
        if (!target) { $("#assignTo").focus(); throw new Error("Choose a person."); }
        await fieldAction(report, assignee ? "reassign" : "assign", { targetUserId: target, publicUpdate: need("#assignPublic", "Add a public update."), privateNote: $("#assignPrivate").value.trim() }, done);
        showToast("Assignment saved.");
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  function updateDialog(report, done) {
    const next = NEXT_STATUSES[report.status] || [];
    const clean = ((report.operations && report.operations.evidence) || []).filter((item) => item.kind === "responder" && item.state === "clean");
    openDialog("Post an update", "<p>Choose a new status or keep the current one. The public update is shown to residents; the internal note is for staff only.</p>" +
      '<label>Status<select id="updateStatus"><option value="' + esc(report.status) + '">Keep as ' + esc(report.status) + "</option>" + next.map((s) => '<option value="' + esc(s) + '">' + esc(s) + "</option>").join("") + "</select></label>" +
      textField("updatePublic", "Public update", "Residents following this report see this. Never include names, numbers or exact addresses.", true) +
      textField("updatePrivate", "Internal note (optional)", "Staff only.", false) +
      '<div id="resolutionFields" hidden><label>Photo that shows the fix<select id="updateEvidence"><option value="">No checked photo</option>' + clean.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.fileName || "Field photo") + ", " + esc(when(item.createdAt)) + "</option>").join("") + "</select></label>" +
      textField("updateException", "Or explain how the fix was confirmed", "Needed when there is no checked photo. At least 20 characters.", false) + "</div>", [
      { label: "Post update", className: "btn-primary", action: async () => {
        const status = $("#updateStatus").value;
        const body = { status: status, publicUpdate: need("#updatePublic", "Add a public update."), privateNote: $("#updatePrivate").value.trim(), resolutionEvidenceId: status === "Resolved" ? $("#updateEvidence").value : "", resolutionException: status === "Resolved" ? $("#updateException").value.trim() : "", updateKey: makeUuid() };
        if (status === "Resolved" && !body.resolutionEvidenceId && body.resolutionException.length < 20) { $("#updateException").focus(); throw new Error("Choose a checked photo or explain how the fix was confirmed (20 characters or more)."); }
        const sent = await sendUpdate({ reportId: report.id, actorId: myId(), body: body, queuedAt: new Date().toISOString() });
        closeDialog(true);
        showToast(sent ? "Update posted." : "Saved on this phone. Not sent yet. It will be sent when you are back online.");
        if (sent) { await refreshSummary().catch(() => {}); done(); }
      } },
      { label: "Cancel", action: closeDialog }
    ]);
    $("#updateStatus").addEventListener("change", (event) => { $("#resolutionFields").hidden = event.target.value !== "Resolved"; });
  }

  // ---------- offline outbox for status updates ----------
  function outbox() { return loadJson(OUTBOX_KEY, []); }
  async function sendUpdate(item) {
    try {
      await api("/api/reports/" + encodeURIComponent(item.reportId), { method: "PATCH", body: item.body });
      return true;
    } catch (error) {
      if (!error.network) throw error;
      saveJson(OUTBOX_KEY, outbox().concat([item]));
      return false;
    }
  }
  let outboxBusy = false;
  async function processOutbox() {
    if (outboxBusy || !navigator.onLine || !session.token) return;
    outboxBusy = true;
    let sent = 0;
    try {
      for (const item of outbox().filter((entry) => entry.actorId === myId())) {
        try {
          await api("/api/reports/" + encodeURIComponent(item.reportId), { method: "PATCH", body: item.body });
          sent++;
        } catch (error) {
          if (error.network) break;
          showToast("An update to " + item.body.status + " was refused: " + error.message);
        }
        saveJson(OUTBOX_KEY, outbox().filter((entry) => entry.body.updateKey !== item.body.updateKey));
      }
    } finally { outboxBusy = false; }
    if (sent) { showToast(plural(sent, "saved update") + " sent."); await refreshSummary().catch(() => {}); if (!pageOpen) showTab(currentTab, false); }
  }
  window.addEventListener("online", processOutbox);

  // ---------- photos ----------
  async function openPhoto(report, attachmentId, done) {
    const item = ((report.operations && report.operations.evidence) || []).find((entry) => String(entry.id) === String(attachmentId));
    if (!item) return;
    let objectUrl = "";
    try {
      const signed = await api("/api/reports/" + encodeURIComponent(report.id) + "/attachments/" + encodeURIComponent(attachmentId) + "/signed-url", { method: "POST", body: {} });
      const response = await fetch(validateServer(session.server) + signed.attachment.url, { cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error("The private photo link expired. Try again.");
      objectUrl = URL.createObjectURL(await response.blob());
    } catch (error) { showToast(error.message); return; }
    const close = () => { URL.revokeObjectURL(objectUrl); closeDialog(); };
    const actions = [];
    let html = '<img class="s-photo" src="' + objectUrl + '" alt="Private photo sent with this report" /><p class="hint s-gap">This private copy is not saved on the phone.</p>';
    if (canModerate()) {
      const reviewPath = item.kind === "citizen" ? "/api/admin/citizen-attachments/" : "/api/admin/responder-evidence/";
      if (item.state !== "clean" && item.state !== "rejected") {
        html += textField("photoNote", "Check note", "Staff only. What you looked for.", true);
        actions.push({ label: "Mark as checked and clean", className: "btn-primary", action: async () => { await api(reviewPath + encodeURIComponent(item.id) + "/review", { method: "POST", body: { action: "clean", note: need("#photoNote", "Add a check note.") } }); close(); done(); showToast("Photo marked as checked."); } });
        actions.push({ label: "Reject photo", className: "btn-danger", action: async () => { await api(reviewPath + encodeURIComponent(item.id) + "/review", { method: "POST", body: { action: "rejected", note: need("#photoNote", "Add a check note.") } }); close(); done(); showToast("Photo rejected."); } });
      } else if (item.kind === "citizen" && item.state === "clean" && !item.publicImageId) {
        html += report.publicVerified
          ? '<label class="check"><input type="checkbox" id="photoPrivacy" /><span>I checked this photo: no faces, number plates, house numbers or other identifying details are visible.</span></label>' + textField("photoPublicNote", "Note", "Staff only.", true)
          : '<p class="s-note">Verify the report first. Photos can be shown publicly only on verified reports.</p>';
        if (report.publicVerified) actions.push({ label: "Show photo publicly", className: "btn-primary", action: async () => {
          if (!$("#photoPrivacy").checked) { $("#photoPrivacy").focus(); throw new Error("Confirm the photo check first."); }
          await api("/api/reports/" + encodeURIComponent(report.id) + "/attachments/" + encodeURIComponent(item.id) + "/public", { method: "POST", body: { action: "approve", privacyChecked: true, note: need("#photoPublicNote", "Add a note.") } });
          close(); done(); showToast("Photo published with its metadata removed.");
        } });
      } else if (item.publicImageId) {
        html += '<p class="s-note"><b>This photo is public.</b> It appears on the Nearby report with its metadata removed. Withdraw it if anything identifying was missed.</p>';
        actions.push({ label: "Withdraw public photo", className: "btn-danger", action: async () => { await api("/api/reports/" + encodeURIComponent(report.id) + "/attachments/" + encodeURIComponent(item.id) + "/public", { method: "POST", body: { action: "withdraw" } }); close(); done(); showToast("Public photo withdrawn."); } });
      }
    }
    actions.push({ label: "Close", action: close });
    openDialog(item.kind === "citizen" ? "Photo from the resident" : "Photo from a responder", html, actions);
  }

  function fieldPhotoDialog(report, done) {
    openDialog("Add a field photo", "<p>The photo is made smaller and its location data is removed before upload. It stays private until a moderator checks it.</p>" +
      '<label>Photo<input id="fieldPhoto" type="file" accept="image/jpeg,image/png,image/webp" /></label>', [
      { label: "Upload photo", className: "btn-primary", action: async () => {
        const file = $("#fieldPhoto").files && $("#fieldPhoto").files[0];
        if (!file) { $("#fieldPhoto").focus(); throw new Error("Choose a photo."); }
        $("#dialogStatus").textContent = "Preparing the photo...";
        const photo = await compressImage(file);
        await api("/api/reports/" + encodeURIComponent(report.id) + "/responder-evidence", { method: "POST", body: { clientAttachmentId: makeUuid(), fileName: photo.name, mimeType: "image/jpeg", dataBase64: photo.data } });
        closeDialog(true); done(); showToast("Photo uploaded. It stays private until a moderator checks it.");
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  async function compressImage(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
    if (file.size > 12000000) throw new Error("This photo is larger than 12 MB.");
    let source;
    if ("createImageBitmap" in window) source = await createImageBitmap(file, { imageOrientation: "from-image" });
    else { const url = URL.createObjectURL(file); source = new Image(); source.src = url; await source.decode(); URL.revokeObjectURL(url); }
    const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
    let scale = Math.min(1, 1600 / Math.max(width, height));
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
      if (blob && blob.size <= 750000) {
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
        return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", data: data };
      }
      scale *= 0.75;
    }
    throw new Error("This photo could not be made small enough.");
  }

  // ---------- routing ----------
  async function routingDialog(report) {
    let data;
    try { data = await api("/api/reports/" + encodeURIComponent(report.id) + "/routing"); } catch (error) { showToast(error.message); return; }
    const routing = data.routing || {};
    const rec = routing.recommendation;
    const actions = [];
    if (!rec) actions.push({ label: "Create a recommendation", className: "btn-primary", action: async () => { await api("/api/reports/" + encodeURIComponent(report.id) + "/routing/recommend", { method: "POST", body: {} }); closeDialog(true); showToast("Recommendation recorded. Nothing has been sent."); routingDialog(report); } });
    if (rec && canAssign()) actions.push({ label: "Choose a different office", action: () => overrideDialog(report) });
    if (rec && isAdmin()) actions.push({ label: "Record a delivery", action: () => deliveryDialog(report, routing) });
    actions.push({ label: "Close", action: closeDialog });
    openDialog("Routing", (rec
      ? "<p><b>Recommended office:</b> " + esc(rec.agencyName || rec.agencyId || "Not named") + "</p><p class=\"hint\">Rule version " + esc(rec.ruleVersion) + ". " + esc(rec.rationale || "") + "</p>"
      : "<p>No recommendation yet. Creating one checks the active routing rules and records which office they suggest.</p>") +
      '<p class="s-note s-gap"><b>Delivery: ' + esc(routing.deliveryState || "Not sent") + ".</b> FixNow does not send reports to offices automatically. " + (routing.deliveries && routing.deliveries.length ? plural(routing.deliveries.length, "delivery outcome") + " recorded." : "No delivery has been recorded.") + "</p>", actions);
  }

  // Records what really happened when an office was contacted. Sent, Delivered and Acknowledged need the name of the
  // system used and its own reference, so FixNow never claims a delivery that did not happen.
  function deliveryDialog(report, routing) {
    const states = ["Not sent", "Queued", "Sent", "Delivered", "Failed", "Acknowledged"];
    openDialog("Record a delivery", "<p>Record what happened when this report was passed to the office. Sent, Delivered and Acknowledged need the system used and its external outcome ID.</p>" +
      '<label>What happened<select id="deliveryState">' + states.map((state) => "<option>" + state + "</option>").join("") + "</select></label>" +
      textField("deliveryChannel", "How it was passed on", "For example phone call or email.", true, false) +
      textField("deliveryIntegration", "System used (needed for Sent, Delivered or Acknowledged)", "", false, false) +
      textField("deliveryExternalId", "External outcome ID", "The reference the other system gave.", false, false) +
      textField("deliveryNote", "Note (optional)", "Staff only.", false), [
      { label: "Record delivery outcome", className: "btn-primary", action: async () => {
        await api("/api/admin/reports/" + encodeURIComponent(report.id) + "/deliveries", { method: "POST", body: { state: $("#deliveryState").value, channel: need("#deliveryChannel", "Say how it was passed on."), integrationName: $("#deliveryIntegration").value.trim(), externalOutcomeId: $("#deliveryExternalId").value.trim(), outcomeNote: $("#deliveryNote").value.trim(), targetId: (routing.recommendation && routing.recommendation.responseTargetId) || "" } });
        closeDialog(true); showToast("Delivery outcome recorded.");
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  async function overrideDialog(report) {
    const config = await loadAdminConfig().catch(() => null);
    const offices = ((config && config.items) || []).filter((item) => item.kind === "agency" && item.active);
    openDialog("Choose a different office", "<p>The original recommendation stays in the history with your reason.</p>" +
      '<label>Office<select id="overrideOffice"><option value="">Choose an office</option>' + offices.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.name) + "</option>").join("") + "</select></label>" + textField("overrideReason", "Reason", "Staff only.", true), [
      { label: "Save", className: "btn-primary", action: async () => {
        const agencyId = $("#overrideOffice").value;
        if (!agencyId) { $("#overrideOffice").focus(); throw new Error("Choose an office."); }
        await api("/api/reports/" + encodeURIComponent(report.id) + "/routing/override", { method: "POST", body: { agencyId: agencyId, reason: need("#overrideReason", "Add a reason.") } });
        closeDialog(true); showToast("Office changed. The reason is in the audit log.");
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  async function loadAdminConfig() {
    const data = await api("/api/admin/config");
    adminConfig = data.configuration;
    return adminConfig;
  }

  const KIND_LABELS = { "agency": "Office", "region": "Region", "mmda": "MMDA", "jurisdiction": "Jurisdiction", "category": "Problem type", "subcategory": "Problem subtype", "contact-channel": "Contact channel", "escalation-path": "Escalation path", "response-target": "Response target", "role-scope": "Role scope", "retention-policy": "Data retention rule", "emergency-info": "Emergency information", "environment-control": "Environment setting" };

  async function renderRouting(view) {
    const config = await loadAdminConfig();
    const items = config.items || [];
    const nameOf = (id) => { const item = items.find((entry) => entry.id === id); return item ? item.name : "Unknown office"; };
    view.innerHTML = '<div class="s-head"><h1 tabindex="-1">Routing</h1><p>Rules suggest which office should handle a report. They never send anything: staff record each real delivery.</p></div>' +
      '<div class="s-stats"><div class="s-stat"><b>' + (config.rules || []).length + '</b><span>routing rules</span></div><div class="s-stat"><b>' + items.filter((i) => i.kind === "agency").length + '</b><span>offices</span></div><div class="s-stat"><b>' + (config.boundaries || []).length + "</b><span>boundary data sets</span></div></div>" +
      '<section class="s-section"><h2>Routing rules</h2>' + ((config.rules || []).length ? '<div class="s-rows">' + config.rules.map((rule) => '<div class="s-row"><div><b>' + esc(rule.name) + '</b><div class="sub">' + esc([rule.category || "Any problem type", rule.district || rule.region || "anywhere"].join(" in ")) + '</div><div class="sub">Goes to ' + esc(nameOf(rule.agencyId)) + ". Priority " + esc(rule.priority) + (rule.active ? "" : ". Inactive") + "</div></div></div>").join("") + "</div>" : '<div class="s-empty"><p>No routing rules yet, so no report has a suggested office.</p></div>') +
      '<div class="s-actions"><button class="btn btn-primary" type="button" id="addRule">Add a routing rule</button></div></section>' +
      '<section class="s-section"><h2>Offices and settings</h2>' + (items.length ? '<div class="s-rows">' + items.map((item) => '<div class="s-row"><div><b>' + esc(item.name) + '</b><div class="sub">' + esc(KIND_LABELS[item.kind] || item.kind) + ". Version " + esc(item.version) + (item.active ? "" : ". Inactive") + "</div></div></div>").join("") + "</div>" : '<div class="s-empty"><p>No offices or settings added yet.</p></div>') +
      '<div class="s-actions"><button class="btn" type="button" id="addItem">Add an office or setting</button></div></section>' +
      '<section class="s-section"><h2>Checks</h2><div class="s-actions"><button class="btn" type="button" id="readiness">Production readiness</button><button class="btn" type="button" id="retention">Data retention preview</button></div></section>';
    $("#addRule").addEventListener("click", () => ruleDialog(items));
    $("#addItem").addEventListener("click", () => itemDialog(items));
    $("#readiness").addEventListener("click", readinessDialog);
    $("#retention").addEventListener("click", retentionDialog);
  }

  function ruleDialog(items) {
    const options = (kind, empty) => '<option value="">' + empty + "</option>" + items.filter((i) => i.kind === kind && i.active).map((i) => '<option value="' + esc(i.id) + '">' + esc(i.name) + "</option>").join("");
    openDialog("Add a routing rule", "<p>A rule suggests an office for matching reports. It does not send anything.</p>" +
      textField("ruleName", "Rule name", "", true, false) + textField("ruleCategory", "Problem type (optional)", "Leave empty for every type.", false, false) +
      textField("ruleRegion", "Region (optional)", "", false, false) + textField("ruleDistrict", "MMDA (optional)", "", false, false) +
      '<label>Office<select id="ruleAgency">' + options("agency", "Choose an office") + "</select></label>" +
      '<label>Response target (optional)<select id="ruleTarget">' + options("response-target", "None") + "</select></label>" +
      '<label>Escalation path (optional)<select id="ruleEscalation">' + options("escalation-path", "None") + "</select></label>" +
      '<label>Priority<span class="hint">Lower numbers are checked first.</span><input id="rulePriority" type="number" min="1" max="10000" value="100" /></label>' +
      textField("ruleVersion", "Rule version", "For example routing-2026-11.", true, false) + textField("ruleRationale", "Why this office", "In plain words.", true), [
      { label: "Save rule", className: "btn-primary", action: async () => {
        const body = { name: need("#ruleName", "Add a rule name."), category: $("#ruleCategory").value.trim(), region: $("#ruleRegion").value.trim(), district: $("#ruleDistrict").value.trim(), agencyId: $("#ruleAgency").value, responseTargetId: $("#ruleTarget").value, escalationPathId: $("#ruleEscalation").value, priority: Number($("#rulePriority").value || 100), ruleVersion: need("#ruleVersion", "Add a rule version."), rationale: need("#ruleRationale", "Say why this office.") };
        if (!body.agencyId) { $("#ruleAgency").focus(); throw new Error("Choose an office. Add one first under Offices and settings."); }
        await api("/api/admin/routing-rules", { method: "POST", body: body });
        closeDialog(true); showToast("Routing rule saved."); showTab("routing", true);
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  function itemDialog(items) {
    openDialog("Add an office or setting", "<p>Changes are versioned and recorded in the audit log.</p>" +
      '<label>Type<select id="itemKind">' + Object.keys(KIND_LABELS).map((k) => '<option value="' + k + '">' + esc(KIND_LABELS[k]) + "</option>").join("") + "</select></label>" +
      textField("itemName", "Name", "", true, false) +
      '<label>Belongs to (optional)<select id="itemParent"><option value="">Nothing</option>' + items.map((i) => '<option value="' + esc(i.id) + '">' + esc(i.name) + "</option>").join("") + "</select></label>" +
      '<label>Settings (JSON)<span class="hint">Leave as {} for an office. A data retention rule needs a number of days.</span><textarea id="itemConfig" spellcheck="false">{}</textarea></label>', [
      { label: "Save", className: "btn-primary", action: async () => {
        let configuration;
        try { configuration = JSON.parse($("#itemConfig").value || "{}"); } catch (e) { $("#itemConfig").focus(); throw new Error("The settings are not valid JSON."); }
        await api("/api/admin/directory", { method: "POST", body: { kind: $("#itemKind").value, name: need("#itemName", "Add a name."), parentId: $("#itemParent").value, configuration: configuration } });
        closeDialog(true); showToast("Saved."); showTab("routing", true);
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  async function readinessDialog() {
    try {
      const data = await api("/api/ready");
      openDialog("Production readiness", "<p><b>" + (data.ready ? "Ready" : "Not ready") + "</b> for the " + esc(data.environment) + " environment.</p>" + '<div class="s-rows">' + (data.checks || []).map((check) => '<div class="s-row"><div><b>' + esc(check.name) + '</b></div><span class="tag ' + (check.ok ? "tag-ok" : "tag-warn") + '">' + (check.ok ? "Passes" : "Needs setting up") + "</span></div>").join("") + "</div>", [{ label: "Close", action: closeDialog }]);
    } catch (error) { showToast(error.message); }
  }

  async function retentionDialog() {
    try {
      const data = await api("/api/admin/maintenance/retention", { method: "POST", body: { execute: false } });
      const r = data.retention.result;
      openDialog("Data retention preview", "<p>Nothing has been changed. This shows what the current retention rule would remove.</p>" + '<dl class="s-dl"><div><dt>Reports with contact details past the limit</dt><dd>' + r.contactReportsEligible + "</dd></div><div><dt>Expired sign-in sessions</dt><dd>" + r.expiredSessions + "</dd></div><div><dt>Expired security codes</dt><dd>" + r.expiredChallenges + "</dd></div><div><dt>Expired invitations</dt><dd>" + r.expiredInvitations + "</dd></div></dl>", [
        { label: "Run it now", className: "btn-danger", action: async () => { await api("/api/admin/maintenance/retention", { method: "POST", body: { execute: true, confirmation: "RUN RETENTION" } }); closeDialog(); showToast("Retention run finished and recorded in the audit log."); } },
        { label: "Close", action: closeDialog }
      ]);
    } catch (error) { showToast(error.message); }
  }

  // ---------- staff accounts ----------
  async function loadUsers() { const data = await api("/api/users"); usersCache = data.users || []; return usersCache; }

  async function renderAccounts(view) {
    const users = await loadUsers();
    const config = await loadAdminConfig().catch(() => ({ invitations: [] }));
    const active = users.filter((u) => u.status === "active").length;
    view.innerHTML = '<div class="s-head"><h1 tabindex="-1">Staff accounts</h1><p>Each account sees only its own area. Moderators and admins see every area.</p></div>' +
      '<div class="s-stats"><div class="s-stat"><b>' + users.length + '</b><span>accounts</span></div><div class="s-stat"><b>' + active + '</b><span>active</span></div><div class="s-stat"><b>' + (config.invitations || []).filter((i) => i.status === "pending").length + "</b><span>open invitations</span></div></div>" +
      '<div class="s-actions s-actions-top"><button class="btn btn-primary" type="button" id="addUser">Add a staff account</button><button class="btn" type="button" id="inviteUser">Invite with a code</button></div>' +
      '<div class="s-rows">' + users.map((u) => '<div class="s-row"><div><b>' + esc(u.name || u.username) + '</b><div class="sub">' + esc(u.role) + ", " + esc(u.agency || "no office") + '</div><div class="sub">Area: ' + esc(u.district || u.region || "all areas") + '</div><div class="sub">Username ' + esc(u.username) + ". " + (u.lastLoginAt ? "Last signed in " + esc(when(u.lastLoginAt)) : "Never signed in") + '</div></div><div><span class="tag ' + (u.status === "active" ? "tag-ok" : "tag-warn") + '">' + (u.status === "active" ? "Active" : "Turned off") + "</span>" +
        (Number(u.id) !== myId() ? '<br /><button class="btn" type="button" data-toggle-user="' + u.id + '" data-status="' + esc(u.status) + '">' + (u.status === "active" ? "Turn off" : "Turn on") + "</button>" : "") + "</div></div>").join("") + "</div>" +
      ((config.invitations || []).length ? '<section class="s-section"><h2>Invitations</h2><div class="s-rows">' + config.invitations.map((i) => '<div class="s-row"><div><b>' + esc(i.agency) + '</b><div class="sub">' + esc(i.role) + ", " + esc(i.district || i.region || "all areas") + '</div></div><span class="tag">' + esc(i.status === "pending" ? "Waiting" : i.status === "accepted" ? "Accepted" : i.status) + "</span></div>").join("") + "</div></section>" : "");
    $("#addUser").addEventListener("click", userDialog);
    $("#inviteUser").addEventListener("click", inviteDialog);
    $$("[data-toggle-user]", view).forEach((button) => button.addEventListener("click", () => {
      const turningOff = button.dataset.status === "active";
      openDialog(turningOff ? "Turn off this account?" : "Turn this account on?", "<p>" + (turningOff ? "The person can no longer sign in. Their past actions stay in the audit log." : "The person can sign in again with their existing password.") + "</p>", [
        { label: turningOff ? "Turn off" : "Turn on", className: turningOff ? "btn-danger" : "btn-primary", action: async () => {
          await api("/api/users/" + encodeURIComponent(button.dataset.toggleUser), { method: "PATCH", body: { status: turningOff ? "disabled" : "active" } });
          closeDialog(true); showToast(turningOff ? "Account turned off." : "Account turned on."); showTab("accounts", true);
        } },
        { label: "Cancel", action: closeDialog }
      ]);
    }));
  }

  function userDialog() {
    openDialog("Add a staff account", "<p>Give the person their username and temporary password in person or by phone. They must change the password when they first sign in.</p>" +
      textField("userName", "Full name", "", true, false) + textField("userUsername", "Username", "Lowercase letters, numbers, dots and dashes.", true, false) +
      '<label>Temporary password<span class="hint">At least 12 characters.</span><input id="userPassword" type="text" autocomplete="off" minlength="12" /></label>' +
      '<label>Role<select id="userRole">' + ROLES.map((r) => "<option>" + r + "</option>").join("") + "</select></label>" +
      textField("userAgency", "Office", "For example Accra Metropolitan Assembly.", true, false) + textField("userRegion", "Region", "", false, false) + textField("userDistrict", "MMDA", "Leave Region and MMDA empty only for moderators and admins.", false, false), [
      { label: "Create account", className: "btn-primary", action: async () => {
        const password = $("#userPassword").value;
        if (password.length < 12) { $("#userPassword").focus(); throw new Error("Use at least 12 characters for the temporary password."); }
        const roleValue = $("#userRole").value;
        const region = $("#userRegion").value.trim(), district = $("#userDistrict").value.trim();
        if (!/admin|moderator/i.test(roleValue) && (!region || !district)) { $("#userRegion").focus(); throw new Error("Responders need a region and an MMDA, so they only see their own area."); }
        await api("/api/users", { method: "POST", body: { name: need("#userName", "Add a name."), username: need("#userUsername", "Add a username."), password: password, role: roleValue, agency: need("#userAgency", "Add an office."), region: region, district: district, mustChangePassword: true } });
        closeDialog(true); showToast("Account created."); showTab("accounts", true);
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  function inviteDialog() {
    openDialog("Invite with a code", "<p>The code is shown once. The server keeps only a scrambled copy (a hash) and when it expires.</p>" +
      textField("inviteContact", "Phone or email of the person", "", true, false) + textField("inviteAgency", "Office", "", true, false) +
      '<label>Role<select id="inviteRole">' + ROLES.filter((r) => r !== "Admin").map((r) => "<option>" + r + "</option>").join("") + "</select></label>" +
      textField("inviteRegion", "Region", "", false, false) + textField("inviteDistrict", "MMDA", "", false, false) +
      '<label>Expires after (days)<input id="inviteDays" type="number" min="1" max="30" value="7" /></label>', [
      { label: "Create code", className: "btn-primary", action: async () => {
        const data = await api("/api/admin/invitations", { method: "POST", body: { contact: need("#inviteContact", "Add a phone or email."), agency: need("#inviteAgency", "Add an office."), role: $("#inviteRole").value, region: $("#inviteRegion").value.trim(), district: $("#inviteDistrict").value.trim(), expiresDays: Number($("#inviteDays").value || 7) } });
        openDialog("Invitation code", '<p>Share this code through a channel you trust. It will not be shown again.</p><p class="s-card s-code"><b>' + esc(data.inviteCode) + "</b></p>", [
          { label: "Copy code", className: "btn-primary", action: async () => { try { await navigator.clipboard.writeText(data.inviteCode); showToast("Code copied."); } catch (e) { showToast("Copy did not work. Select the code and copy it."); } } },
          { label: "Done", action: () => { closeDialog(true); showTab("accounts", true); } }
        ]);
      } },
      { label: "Cancel", action: closeDialog }
    ]);
  }

  // ---------- audit log ----------
  const ACTION_LABELS = {
    login: "Signed in", login_failed: "Failed sign-in", logout: "Signed out", case_viewed: "Opened a case page", report_moderated: "Moderation decision",
    public_report_created: "Resident report received", routing_recommended: "Routing recommended", routing_overridden: "Office changed", user_created: "Staff account created",
    user_updated: "Staff account changed", responder_invitation_created: "Invitation created", responder_invitation_accepted: "Invitation accepted",
    citizen_attachment_clean: "Resident photo marked clean", citizen_attachment_rejected: "Resident photo rejected", public_image_approved: "Photo made public", public_image_withdrawn: "Public photo withdrawn"
  };
  function actionLabel(action) {
    if (ACTION_LABELS[action]) return ACTION_LABELS[action];
    const text = String(action || "Action").replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  async function renderAudit(view) {
    const [audit, users] = await Promise.all([api("/api/audit"), usersCache ? Promise.resolve(usersCache) : loadUsers()]);
    const people = {};
    users.forEach((u) => { people[u.id] = u.name || u.username; });
    const events = audit.events || [];
    const filter = view.dataset.filter || "";
    const shown = events.filter((e) => !filter || (filter === "moderation" ? /moderat|case_viewed|public_image|attachment/.test(e.action) : filter === "signin" ? /^login|logout/.test(e.action) : filter === "accounts" ? /^user_|invitation/.test(e.action) : filter === "cases" ? /report|routing|field|status|assign|escalat/.test(e.action) : true));
    view.innerHTML = '<div class="s-head"><h1 tabindex="-1">Audit log</h1><p>Every staff action, newest first (the latest 500). Network addresses are stored as a keyed hash, except for staff sign-in attempts, which keep the address for security review.</p></div>' +
      '<label class="s-narrow">Show<select id="auditFilter"><option value="">Everything</option><option value="moderation"' + (filter === "moderation" ? " selected" : "") + '>Moderation and photos</option><option value="cases"' + (filter === "cases" ? " selected" : "") + '>Cases and routing</option><option value="accounts"' + (filter === "accounts" ? " selected" : "") + '>Staff accounts</option><option value="signin"' + (filter === "signin" ? " selected" : "") + ">Sign-ins</option></select></label>" +
      '<p class="hint s-count" role="status">' + esc(plural(shown.length, "entry", "entries")) + "</p>" +
      '<div class="s-rows compact">' + shown.slice(0, auditShown).map((e) => {
        const ip = String(e.ip || "");
        const network = !ip ? "No network address" : ip.indexOf("iphash:") === 0 ? "Network address stored as a hash" : "Network address " + ip;
        const item = e.entityId ? (e.entityType === "report" ? "Report " : e.entityType === "user" ? "Account " : "Item ") + e.entityId + ". " : "";
        return '<div class="s-row"><div><b>' + esc(actionLabel(e.action)) + '</b><div class="sub">' + esc((e.actorUserId ? "By " + (people[e.actorUserId] || "account " + e.actorUserId) : "By a resident or the system") + ", " + when(e.createdAt) + ".") + '</div><div class="sub">' + esc(item + network + ".") + "</div></div></div>";
      }).join("") + "</div>" +
      (shown.length > auditShown ? '<div class="s-actions"><button class="btn" type="button" id="auditMore">Show more</button></div>' : "");
    $("#auditFilter").addEventListener("change", (event) => { view.dataset.filter = event.target.value; auditShown = 40; renderAudit(view).then(() => $("#auditFilter").focus()); });
    const more = $("#auditMore");
    if (more) more.addEventListener("click", () => { auditShown += 40; renderAudit(view); });
  }

  // ---------- start ----------
  // The staff page works offline once the service worker has cached it (case pages still need a connection).
  if ("serviceWorker" in navigator && !IS_DEMO) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  if (session.token && session.user && !IS_DEMO) startStaff().catch((error) => showSignIn(error.message));
  else showSignIn();
})();
