package com.fixnowghana.command;

import android.net.Uri;

import androidx.webkit.WebViewAssetLoader;

/**
 * Release build: there is no route to a development server, and this class must stay empty of one.
 * phase12-accessibility-android.test.js fails if that changes.
 */
final class LocalServerAccess {
    private LocalServerAccess() {}

    static void configure(WebViewAssetLoader.Builder builder) {
        // Keeps the secure default origin.
    }

    static String startUrl(String standardUrl) {
        return standardUrl;
    }

    static boolean isAppPage(Uri uri) {
        return false;
    }
}
