/* FixNow Ghana public demo only: sample Nearby reports, the similar-report match and a simulated report journey.
 *
 * This file is copied into docs/ by npm run build:demo and loaded only by the public demo page. The real app
 * (outputs/fixnow-ghana.html), its offline cache and the Android app never load it; outputs/v2-design.test.js and
 * work/qa/resident-outcomes-check.js check that. The page calls it through window.fixNowDemo, and only in demo mode.
 *
 * Honesty rules for everything here:
 * - every simulated step says "Simulated", and anything the real app cannot do yet says "Planned";
 * - only sample offices appear: no real agency uses FixNow yet;
 * - no statistics, response times, dates or durations are invented: steps are numbered, not timed;
 * - sample reports name general areas only, never real businesses, schools, clinics or people;
 * - nothing is sent anywhere: the journey lives in this browser's demo storage.
 */
(function () {
  "use strict";
  if (typeof IS_DEMO_MODE === "undefined" || !IS_DEMO_MODE) return; // never active outside demo mode

  var SAMPLE_NOTE = "Sample offices. No real agency uses FixNow yet.";
  var OFFICES = {
    assembly: "Sample District Assembly",
    utility: "Sample Water and Power Desk",
    safety: "Sample Safety Desk"
  };
  function sampleOffice(type) {
    if (type === "Water supply" || type === "Electricity") return OFFICES.utility;
    if (type === "Public safety" || type === "Fire risk") return OFFICES.safety;
    return OFFICES.assembly;
  }

  // Sample verified reports for Nearby: one for each problem type, every status at least once, general areas only.
  var SAMPLES = [
    { id: "SAMPLE-01", category: "Flooding or drainage", status: "In Progress", title: "Blocked drain floods the road after rain", region: "Greater Accra", district: "Accra Metropolitan", area: "Odaw drain area", summary: "The roadside drain fills with plastic waste and water spreads across the road after rain.", update: "A team is clearing the drain." },
    { id: "SAMPLE-02", category: "Road or bridge", status: "Acknowledged", title: "Deep pothole in the middle lane", region: "Greater Accra", district: "Ayawaso West", area: "Main road area", summary: "A wide pothole fills with water when it rains, and vehicles swerve around it.", update: "The office has received this report." },
    { id: "SAMPLE-03", category: "Waste or sanitation", status: "Open", title: "Refuse piling up at the collection point", region: "Greater Accra", district: "La Dade-Kotopon", area: "Residential lanes", summary: "Refuse bags have piled up at the collection point and spill into the lane.", update: "" },
    { id: "SAMPLE-04", category: "Water supply", status: "Dispatched", title: "No water from the public standpipe", region: "Ashanti", district: "Kumasi Metropolitan", area: "Standpipe near the lorry park area", summary: "The public standpipe has been dry and families are buying water.", update: "A team has been sent to check the supply line." },
    { id: "SAMPLE-05", category: "Electricity", status: "Resolved", title: "Streetlights out along the junction", region: "Northern", district: "Tamale Metropolitan", area: "Junction area", summary: "Streetlights at the junction were off at night, so the crossing was dark.", update: "The streetlights are working again." },
    { id: "SAMPLE-06", category: "Public safety", status: "Escalated", title: "Broken railing beside the footpath", region: "Central", district: "Cape Coast Metropolitan", area: "Footpath by the lagoon", summary: "A railing is broken where the footpath runs close to the water.", update: "This report needs another office and has been passed on." },
    { id: "SAMPLE-07", category: "Fire risk", status: "Open", title: "Dry bush burning near houses", region: "Volta", district: "Ho Municipal", area: "Edge of a residential area", summary: "Dry bush close to houses has been set alight more than once.", update: "" },
    { id: "SAMPLE-08", category: "Clinic access", status: "Blocked", title: "Road to the health post cut off by erosion", region: "Eastern", district: "New Juaben South", area: "Feeder road area", summary: "Erosion has cut the feeder road, so people walk a long way round to reach care.", update: "Work is waiting for the rains to stop." },
    { id: "SAMPLE-09", category: "Food or market price", status: "Acknowledged", title: "Market stalls flooded after rain", region: "Western", district: "Sekondi-Takoradi Metropolitan", area: "Market area", summary: "Rainwater runs into the stalls because the gutter outside is blocked.", update: "The office has received this report." },
    { id: "SAMPLE-10", category: "School facility", status: "Reopened", title: "School roof leaking into classrooms", region: "Bono", district: "Sunyani Municipal", area: "School area", summary: "Water leaks through the roof into classrooms when it rains.", update: "A resident says the leak is back, so the report is open again." },
    { id: "SAMPLE-11", category: "Other", status: "In Progress", title: "Fallen tree blocking a side street", region: "Greater Accra", district: "Tema Metropolitan", area: "Side street area", summary: "A fallen tree blocks a side street, so vehicles cannot pass.", update: "A team has started removing the tree." }
  ].map(function (sample) {
    return {
      id: sample.id, title: sample.title, category: sample.category, status: sample.status, region: sample.region,
      district: sample.district, summary: sample.summary, sampleUpdate: sample.update,
      publicLocationLabel: sample.area + ", " + sample.district + ", " + sample.region,
      responsibleInstitution: sampleOffice(sample.category)
    };
  });

  function esc(value) { return escapeHtml(value); }
  var SAMPLE_TAG = '<span class="tag demo-sample-tag">Sample</span>';
  var SIMULATED_TAG = '<span class="tag demo-sim-tag">Simulated</span>';
  var PLANNED_TAG = '<span class="tag demo-planned-tag">Planned: the real app doesn\'t show this yet</span>';

  // ---------- Nearby ----------
  function filteredSamples() {
    var value = function (id) { var el = document.querySelector(id); return el ? el.value.trim() : ""; };
    var category = value("#nearbyCategoryFilter"), status = value("#nearbyStatusFilter"), region = value("#nearbyRegionFilter");
    var district = value("#nearbyDistrictFilter").toLowerCase();
    return SAMPLES.filter(function (r) {
      return (!category || r.category === category) && (!status || r.status === status) && (!region || r.region === region) &&
        (!district || r.district.toLowerCase().indexOf(district) !== -1);
    });
  }

  function showNearby() {
    setNearbyMode("list");
    var list = document.querySelector("#nearbyReportList");
    var summary = document.querySelector("#nearbyResultSummary");
    var visible = filteredSamples();
    summary.innerHTML = "<span><b>" + visible.length + "</b> sample " + (visible.length === 1 ? "report" : "reports") + "</span><span>Sample reports for the demo. The map is switched off in the demo.</span>";
    if (!visible.length) {
      list.innerHTML = '<div class="honest-state"><strong>No verified reports match these filters.</strong><p>Try clearing a filter.</p></div>';
      return;
    }
    list.innerHTML = visible.map(function (r) {
      var art = categoryArt(r.category);
      return '<article class="public-report-card demo-sample-card" data-sample-report="' + esc(r.id) + '">' +
        '<div class="public-report-media ' + art.tint + '"><img src="' + art.src + '" alt="" /></div>' +
        '<div class="public-report-body">' +
        '<div class="public-report-heading"><h3><button class="card-link" type="button" data-view-sample="' + esc(r.id) + '">' + esc(r.title) + '</button></h3>' + statusPill(r.status) + '</div>' +
        '<p class="public-report-meta"><span>' + esc(r.publicLocationLabel) + '</span></p>' +
        '<div class="tags">' + SAMPLE_TAG + '<span class="tag">' + esc(r.category) + '</span><span class="tag">' + esc(r.responsibleInstitution) + '</span></div>' +
        '<p class="public-report-update">' + (r.sampleUpdate ? "<b>Sample update:</b> " + esc(r.sampleUpdate) : "No update yet.") + '</p>' +
        '</div></article>';
    }).join("");
    list.querySelectorAll("[data-view-sample]").forEach(function (button) {
      button.addEventListener("click", function () { openSample(button.getAttribute("data-view-sample")); });
    });
  }

  function openSample(id) {
    var r = SAMPLES.filter(function (s) { return s.id === id; })[0];
    if (!r) return;
    var art = categoryArt(r.category);
    openPage(r.title, '<div class="public-issue-detail">' +
      '<div class="issue-pills">' + SAMPLE_TAG + '<span class="tag">' + esc(r.category) + '</span>' + statusPill(r.status) + '</div>' +
      '<p class="issue-location"><b>' + esc(r.publicLocationLabel) + '</b><small>Approximate area only</small></p>' +
      '<div class="issue-photos empty ' + art.tint + '" role="img" aria-label="No photo for this sample report"><img src="' + art.src + '" alt="" /><small>No photo</small></div>' +
      '<p>' + esc(r.summary) + '</p>' +
      '<div class="issue-facts"><span>Office</span><b>' + esc(r.responsibleInstitution) + '</b></div>' +
      '<p class="demo-note">' + SAMPLE_NOTE + ' This sample report shows what a verified public report looks like.</p>' +
      (r.sampleUpdate ? '<h4>Latest update</h4><p>' + SAMPLE_TAG + ' ' + esc(r.sampleUpdate) + '</p>' : "") +
      '</div>', [{ label: "Close", className: "primary", action: closeModal }]);
  }

  // ---------- Similar report found nearby ----------
  // A new report of the same problem type in the same region and district as a sample report is a possible match.
  function duplicates(draft) {
    var district = String(draft.district || "").trim().toLowerCase();
    var suggestions = SAMPLES.filter(function (r) {
      return district && r.category === draft.type && r.region === draft.region && r.district.toLowerCase() === district;
    }).map(function (r) {
      return { report: r, reasons: ["same problem type", "same district"] };
    });
    return { ok: true, suggestions: suggestions };
  }

  // ---------- The simulated journey ----------
  var TOTAL = 7;
  var STEP_TITLES = ["Report saved", "Moderator check", "Sent to an office", "The office accepts it", "Progress update", "Work done", "Your answer"];
  // Status after each step (step 1 is the demo report itself).
  var STEP_STATUS = [null, "Open", "Open", "Acknowledged", "In Progress", "Resolved", "Resolved"];

  // A plain drawing, never a photo of a real place.
  var SAMPLE_DRAWING = '<svg class="demo-sample-drawing" viewBox="0 0 240 150" role="img" aria-label="Sample drawing of finished work: a clear road and drain with a check mark">' +
    '<rect width="240" height="150" fill="#dfe9e3"/><rect y="96" width="240" height="54" fill="#9aa5a0"/><rect y="88" width="240" height="10" fill="#6d7a74"/>' +
    '<path d="M0 122h240" stroke="#f3eee1" stroke-width="4" stroke-dasharray="18 14"/><rect x="18" y="40" width="54" height="48" fill="#f3eee1" stroke="#0d2a22" stroke-width="2"/>' +
    '<rect x="160" y="30" width="62" height="58" fill="#f3eee1" stroke="#0d2a22" stroke-width="2"/><circle cx="120" cy="52" r="24" fill="#0a7a52"/>' +
    '<path d="M108 52l9 9 16-18" fill="none" stroke="#fffdf8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function stepBody(step, report) {
    var office = sampleOffice(report.type);
    switch (step) {
      case 1: return '<p>Your report is kept only in this browser. In the real app it goes to the FixNow server, and you get a reference number and a private tracking secret.</p>';
      case 2: return '<p>A moderator reads every report before anything is public. To verify it, they confirm that the title and description show no names, phone numbers or exact addresses. Only an approximate area is ever shown publicly.</p><p><b>Result:</b> verified.</p>';
      case 3: return '<p>Routing rules send verified ' + esc(String(report.type || "").toLowerCase()) + ' reports to <b>' + esc(office) + '</b>. Only that office can open the full case.</p><p class="demo-note">' + SAMPLE_NOTE + '</p>';
      case 4: return '<p><b>' + esc(office) + '</b> accepted the report.</p>';
      case 5: return '<p>Public update from ' + esc(office) + ': "A team has started work at the site."</p>';
      case 6: return '<p>' + esc(office) + ' marked the report resolved: "The work is done."</p>' +
        '<figure class="demo-sample-photo">' + SAMPLE_DRAWING + '<figcaption><span class="tag demo-sample-tag">Sample photo</span> ' + PLANNED_TAG + '</figcaption></figure>' +
        '<p class="demo-note">Planned: showing residents an approved photo of the finished work. When it is built, a moderator will check each photo before residents see it.</p>';
      case 7:
        if (report.demoOutcome === "confirmed") return '<p>You confirmed it is fixed. ' + esc(office) + ' sees your confirmation.</p>';
        if (report.demoOutcome === "reopened") return '<p>You reopened the report. It is open again for ' + esc(office) + '.</p>';
        return '<p>Is it fixed? Confirm the fix, or reopen the report if the problem is still there.</p>' +
          '<div class="case-actions demo-answer"><button class="primary" type="button" data-demo-answer="confirmed">Confirm it is fixed</button><button class="secondary" type="button" data-demo-answer="reopened">Still a problem? Reopen</button></div>';
    }
    return "";
  }

  function stepStatus(step, report) {
    if (step === 1) return "";
    if (step === 7 && report.demoOutcome === "reopened") return "Reopened";
    return STEP_STATUS[step - 1];
  }

  function journeyHtml(report) {
    var step = Math.max(1, Math.min(TOTAL, Number(report.demoJourneyStep) || 1));
    var current = stepStatus(step, report);
    var items = [];
    for (var i = 1; i <= step; i++) {
      var tag = i === 1 ? '<span class="tag demo-sample-tag">Demo</span>' : SIMULATED_TAG;
      items.push('<li class="demo-step' + (i === step ? " current" : "") + '"><h3 id="demoStep' + i + '" tabindex="-1">Step ' + i + ' of ' + TOTAL + ': ' + STEP_TITLES[i - 1] + ' ' + tag + '</h3>' + stepBody(i, report) + '</li>');
    }
    var art = categoryArt(report.type);
    return '<div class="demo-journey">' +
      '<p class="demo-journey-lead">' + SIMULATED_TAG + ' A simulated journey for your demo report. Each step is something the real app does today, unless it says Planned. Nothing is sent anywhere.</p>' +
      '<div class="report-detail-summary"><span class="review-art ' + art.tint + '"><img src="' + art.src + '" alt="" /></span><div>' +
      '<small class="detail-ref">Demo report</small><h3>' + esc(report.title || report.type || "Your report") + '</h3>' +
      '<p>' + esc([report.community, report.district, report.region].filter(Boolean).join(", ")) + '</p>' +
      (current ? statusPill(current) + ' ' + SIMULATED_TAG : '<span class="status-pill status-waiting">Demo only</span>') + '</div></div>' +
      '<p class="demo-progress" aria-live="polite">Simulated step ' + step + ' of ' + TOTAL + '</p>' +
      '<ol class="demo-steps">' + items.join("") + '</ol></div>';
  }

  function stored(report) {
    return reports.filter(function (r) { return String(r.id) === String(report.id); })[0] || report;
  }

  function setStep(report, step) {
    var r = stored(report);
    r.demoJourneyStep = step;
    if (step < TOTAL) delete r.demoOutcome;
    // Simulated public updates are stored on the demo report only, marked simulated (the real app ignores them).
    r.updates = [];
    for (var i = 2; i <= step; i++) r.updates.push({ status: stepStatus(i, r), note: "Simulated: " + STEP_TITLES[i - 1], simulated: true });
    r.demoStatus = stepStatus(step, r) || "";
    save();
    return r;
  }

  function openJourney(report, focusStep) {
    var r = stored(report);
    if (!r.demoJourneyStep) r = setStep(r, 1);
    var step = Number(r.demoJourneyStep) || 1;
    var done = step === TOTAL && r.demoOutcome;
    var actions = [];
    if (step < TOTAL) actions.push({ label: "Show next step", className: "primary", action: function () { var next = setStep(r, step + 1); openJourney(next, step + 1); announce("Simulated step " + (step + 1) + " of " + TOTAL + ": " + STEP_TITLES[step]); } });
    if (done) actions.push({ label: "Report another problem", className: "primary", action: function () { closeModal(); setView("report"); } });
    actions.push({ label: "Restart", className: "secondary", action: function () { var first = setStep(r, 1); openJourney(first, 1); announce("Journey restarted at step 1"); } });
    actions.push({ label: "Close", className: "secondary", action: function () { closeModal(); renderMyReports(); } });
    openPage("Follow your report", journeyHtml(r), actions);
    modalBody.querySelectorAll("[data-demo-answer]").forEach(function (button) {
      button.addEventListener("click", function () {
        var s = stored(r);
        s.demoOutcome = button.getAttribute("data-demo-answer");
        setStep(s, TOTAL);
        s.demoOutcome = button.getAttribute("data-demo-answer");
        s.demoStatus = s.demoOutcome === "reopened" ? "Reopened" : "Resolved";
        save();
        openJourney(s, TOTAL);
        announce(s.demoOutcome === "reopened" ? "You reopened the report (simulated)" : "You confirmed the fix (simulated)");
      });
    });
    if (focusStep) {
      var heading = document.querySelector("#demoStep" + focusStep);
      if (heading) {
        heading.focus({ preventScroll: true });
        if (heading.scrollIntoView) heading.scrollIntoView({ block: "start", behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    }
  }

  function officeHint(report) {
    return { label: "Sample office", office: sampleOffice(report && report.type), note: SAMPLE_NOTE + " No response time is promised." };
  }

  window.fixNowDemo = { showNearby: showNearby, openSample: openSample, duplicates: duplicates, openJourney: openJourney, officeHint: officeHint, samples: SAMPLES };
  // This file loads after the page's own script, so refresh anything that page already drew.
  if (document.body.dataset.view === "nearby") showNearby();
  if (typeof updateTriagePreview === "function") updateTriagePreview();
})();
