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

// Edge to edge (Android 15 and newer): the page must stay clear of the system bars, cutouts and the keyboard.
assert(activity.includes("EdgeToEdge.enable(") && activity.includes("ViewCompat.setOnApplyWindowInsetsListener(") && activity.includes("WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()") && activity.includes("WindowInsetsCompat.Type.ime()"), "MainActivity must apply system-bar, cutout and keyboard insets");
assert(activity.includes('Color.parseColor("#0d2a22")') && activity.includes("setAppearanceLightStatusBars(false)"), "the status bar strip must be deep green with light icons");
assert(manifest.includes('android:windowSoftInputMode="adjustResize"'), "the window must make room for the keyboard");

// Dark mode on Android: a dark night theme (the WebView follows it), no automatic inversion, and a narrow theme channel.
const nightStyles = fs.readFileSync(path.join(root, "work", "fixnow-android", "app", "src", "main", "res", "values-night", "styles.xml"), "utf8");
assert(/parent="android:style\/Theme\.Material\.NoActionBar"/.test(nightStyles) && nightStyles.includes("#131914"), "the night theme must be dark so the WebView reports dark mode to the page");
assert(activity.includes("WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)"), "Android must never invert the page by itself");
assert(activity.includes('WebViewCompat.addWebMessageListener(webView, "fixnowTheme", LocalServerAccess.appOrigins()') && !activity.includes("addJavascriptInterface"), "the page reports its theme through a web message listener limited to the app's origins, never a JavaScript interface");

assert(activity.includes('themeReply.postMessage(phoneIsDark(config) ? "phone:dark" : "phone:light")') && activity.includes("public void onConfigurationChanged("), "the app must tell older WebViews the phone's dark setting, including when it changes");
assert(html.includes('event.data === "phone:dark" || event.data === "phone:light"'), "the page must follow the phone setting the app reports");

// The local-server route is for the debug build only. The release build must refuse plain HTTP.
const androidSource = path.join(root, "work", "fixnow-android", "app", "src");
const javaPackage = path.join("java", "com", "fixnowghana", "command");
const releaseAccess = fs.readFileSync(path.join(androidSource, "release", javaPackage, "LocalServerAccess.java"), "utf8");
const debugAccess = fs.readFileSync(path.join(androidSource, "debug", javaPackage, "LocalServerAccess.java"), "utf8");
const mainNetworkConfig = fs.readFileSync(path.join(androidSource, "main", "res", "xml", "network_security_config.xml"), "utf8");
const debugNetworkConfig = fs.readFileSync(path.join(androidSource, "debug", "res", "xml", "network_security_config.xml"), "utf8");
const gradleBuildType = (name) => gradle.match(new RegExp(`\\b${name}\\s*\\{[^}]*\\}`))[0];
assert(!/localhost|127\.0\.0\.1|10\.0\.2\.2|http:|setHttpAllowed|setDomain/.test(releaseAccess), "the release build must have no route to a local or plain-HTTP server");
assert(releaseAccess.includes('return Collections.singleton("https://appassets.androidplatform.net");'), "in the release build only the app's own origin may message the app");
assert(releaseAccess.includes("return standardUrl;") && /isAppPage\(Uri uri\) \{\s*return false;/.test(releaseAccess), "the release build must start on the secure app origin and treat no other page as the app");
assert(!/localhost|setHttpAllowed|http:\/\//.test(activity), "code shared with the release build must not mention a local or plain-HTTP server");
assert(!fs.existsSync(path.join(androidSource, "main", javaPackage, "LocalServerAccess.java")), "the local-server class must live in the build-specific folders, never in shared code");
assert(!fs.existsSync(path.join(androidSource, "release", "res")), "the release build must not override the locked-down network settings");
assert(mainNetworkConfig.includes('<base-config cleartextTrafficPermitted="false"') && !mainNetworkConfig.includes('cleartextTrafficPermitted="true"') && !mainNetworkConfig.includes("<domain"), "release network settings must refuse plain HTTP everywhere");
assert(/cleartextTrafficPermitted="true"/.test(debugNetworkConfig) && !debugNetworkConfig.includes("<base-config") && /<domain[^>]*>localhost<\/domain>/.test(debugNetworkConfig), "debug plain HTTP must be limited to named local addresses");
assert(/usesCleartextTraffic: "false"/.test(gradleBuildType("release")) && /usesCleartextTraffic: "false"/.test(gradleBuildType("defaultConfig")) && /usesCleartextTraffic: "true"/.test(gradleBuildType("debug")), "only the debug build may allow plain HTTP");
assert(!/debuggable\s+true/.test(gradle), "the release build must not be debuggable");
assert(debugAccess.includes('"http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort() == -1'), "the debug build must treat only its own bundled pages as the app");

console.log(`Phase 12 accessibility and Android release gate passed (${compressedBytes} compressed / ${rawBytes} raw bytes)`);
