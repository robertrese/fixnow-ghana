"use strict";
// Runs in <head> before the first paint of staff.html.
// Same theme rules as the resident app: the saved Appearance choice, otherwise the phone setting; print in light.
(function () {
  var root = document.documentElement, query = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null, choice = "system", phoneDark = null, settings = {};
  try { settings = JSON.parse(localStorage.getItem("fixnow-gh-v3-settings") || "{}"); choice = settings.appearance || "system"; } catch (e) {}
  if (settings.largeText) root.classList.add("large-text-root");
  function apply(printing) {
    var dark = !printing && (choice === "dark" || (choice === "system" && (phoneDark !== null ? phoneDark : !!query && query.matches)));
    root.setAttribute("data-theme", dark ? "dark" : "light");
    try { if (window.fixnowTheme) window.fixnowTheme.postMessage(dark ? "dark" : "light"); } catch (e) {}
  }
  if (window.fixnowTheme) window.fixnowTheme.onmessage = function (event) {
    if (event.data === "phone:dark" || event.data === "phone:light") { phoneDark = event.data === "phone:dark"; apply(); }
  };
  apply();
  if (query && query.addEventListener) query.addEventListener("change", function () { apply(); });
  addEventListener("beforeprint", function () { apply(true); });
  addEventListener("afterprint", function () { apply(); });
})();
