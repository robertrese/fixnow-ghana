package com.fixnowghana.command;

import android.net.Uri;

import androidx.webkit.WebViewAssetLoader;

/**
 * DEBUG BUILD ONLY. Lets a test phone reach the developer's local API over USB.
 *
 * The bundled pages are served from the APK under the name "localhost", which the app already
 * trusts for development. Run "adb reverse tcp:4180 tcp:4180" so that port 4180 on the phone
 * reaches the API on the computer. The release build has its own, empty version of this class.
 */
final class LocalServerAccess {
    private static final String LOCAL_START_URL =
            "http://localhost/assets/fixnow-ghana.html?api=http%3A%2F%2Flocalhost%3A4180";

    private LocalServerAccess() {}

    static void configure(WebViewAssetLoader.Builder builder) {
        builder.setDomain("localhost").setHttpAllowed(true);
    }

    static String startUrl(String standardUrl) {
        return LOCAL_START_URL;
    }

    static boolean isAppPage(Uri uri) {
        return "http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort() == -1;
    }
}
