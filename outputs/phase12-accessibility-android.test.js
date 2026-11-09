"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const gradle = fs.readFileSync(path.join(root, "work", "fixnow-android", "app", "build.gradle"), "utf8");
const activity = fs.readFileSync(path.join(root, "work", "fixnow-android", "app", "src", "main", "java", "com", "fixnowghana", "command", "MainActivity.java"), "utf8");
const manifest = fs.readFileSync(path.join(root, "work", "fixnow-android", "app", "src", "main", "AndroidManifest.xml"), "utf8");

assert(html.includes(":focus-visible") && html.includes("prefers-reduced-motion: reduce"), "keyboard focus and reduced motion must remain explicit");
assert(html.includes("forced-colors: active") && html.includes("body.large-text"), "OS high contrast and large text modes must be supported");
assert(html.includes("min-height: 44px") && html.includes('input[type="checkbox"]'), "interactive controls need inclusive target sizes");
assert(html.includes("env(safe-area-inset-bottom)"), "mobile controls must respect device safe areas");
assert(!/font-size\s*:[^;{}]*vw/i.test(html), "font size must not vary continuously with viewport width");
assert(html.includes('setAttribute("aria-invalid"') && html.includes('window.addEventListener("storage"'), "validation and multi-tab changes need accessible, durable behavior");
assert(html.includes("reportSubmissionActive") && html.includes("writeLocalValue"), "duplicate taps and unavailable local storage need explicit handling");
assert(html.includes('const INITIAL_VIEW = new URLSearchParams') && html.includes('setView(INITIAL_VIEW, false)'), "citizen screens should support safe deep links for review and sharing");

assert(gradle.includes('androidx.webkit:webkit:1.15.0') && gradle.includes("minSdk 23"), "secure app assets must retain Android 6 support");
assert(gradle.includes('include "map-foundation.js"') && gradle.includes('include "vendor/**"'), "the native bundle must include every map runtime asset");
assert(activity.includes("WebViewAssetLoader") && activity.includes("https://appassets.androidplatform.net/assets/fixnow-ghana.html"), "Android assets must use a secure HTTPS-style origin");
assert(!activity.includes("file:///android_asset") && activity.includes("setAllowFileAccess(false)"), "Android must not grant file-origin access");
assert(activity.includes("MIXED_CONTENT_NEVER_ALLOW") && activity.includes("setTextZoom"), "Android must block mixed content and honor system font scale");
assert(activity.includes("ACCESS_COARSE_LOCATION") && activity.includes("for (int result : grantResults)"), "approximate location permission must remain usable without precise permission");
assert(manifest.includes('android:enableOnBackInvokedCallback="true"') && manifest.includes('android:allowBackup="false"'), "predictive back and private backup behavior must be explicit");
assert(/fixnow-ghana-static-v(?:2[2-9]|[3-9]\d)/.test(worker) && worker.includes('url.pathname.startsWith("/api/")'), "Phase 12 or later assets should be refreshed without caching API responses");

// Bandwidth is measured as the compressed bytes a phone downloads; the raw cap bounds on-device storage.
const zlib = require("zlib");
const coreFiles = ["fixnow-ghana.html", "map-foundation.js", path.join("vendor", "markerclusterer-2.6.2.min.js")];
const rawBytes = coreFiles.reduce((total, file) => total + fs.statSync(path.join(__dirname, file)).size, 0);
const compressedBytes = coreFiles.reduce((total, file) => total + zlib.gzipSync(fs.readFileSync(path.join(__dirname, file)), { level: 9 }).length, 0);
assert(compressedBytes < 120 * 1024, `core static assets exceed the 120 KiB compressed low-bandwidth budget: ${compressedBytes} bytes`);
assert(rawBytes < 600 * 1024, `core static assets exceed the 600 KiB on-device budget: ${rawBytes} bytes`);

console.log(`Phase 12 accessibility and Android release gate passed (${compressedBytes} compressed / ${rawBytes} raw bytes)`);
