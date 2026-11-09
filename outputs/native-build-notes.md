# FixNow Ghana Native Build Notes

Updated: August 10, 2026

## Android

Package: `com.fixnowghana.command`

The native project is in `work/fixnow-android`. Gradle synchronises the web app, policies, map runtime, manifest, icon, and service worker into every build.

The wrapper loads bundled assets from `https://appassets.androidplatform.net/assets/` using `WebViewAssetLoader`. File-origin privileges and mixed content are disabled. Release networking is HTTPS-only; debug builds may use localhost for API testing.

Native behavior includes:

- Foreground coarse or precise location requested only after the GPS action
- Android document picker for images; no broad storage permission
- System font-scale support through WebView text zoom
- Predictive back integration, including modal dismissal and web history
- Optional location hardware, disabled backups, Java 17, target SDK 36, and minimum SDK 23

Build products:

- `outputs/fixnow-ghana-debug.apk`
- `outputs/fixnow-ghana-release.aab`
- `outputs/fixnow-ghana-release-unsigned.aab`
- `outputs/fixnow-android-source.zip`

Release signing credentials must remain in an owner-controlled vault. Upload the unsigned/external-signing release bundle only through the approved Play signing process.

## iOS

Windows cannot produce an App Store archive. A macOS/Xcode owner must create the `WKWebView` wrapper, keep the same HTTPS-only API/privacy contract, add permission purpose strings, test VoiceOver and Dynamic Type, sign the archive, and upload through App Store Connect.

## Remaining Device Gates

Run the release build on physical low-end Android devices with TalkBack, 200% font scaling, approximate-location-only permission, permission denial, low storage, process restart, multiple tabs, poor connectivity, offline queue recovery, and repeated taps. Store submission follows only after these results and production operations are approved.
