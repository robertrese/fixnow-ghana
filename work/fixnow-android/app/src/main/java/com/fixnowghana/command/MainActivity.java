package com.fixnowghana.command;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

public class MainActivity extends ComponentActivity {
    private static final int FILE_CHOOSER_REQUEST = 41;
    private static final int LOCATION_REQUEST = 42;
    // Deep green behind the status bar in every theme, with light icons.
    private static final int STATUS_STRIP_COLOR = Color.parseColor("#0d2a22");
    // Matches the tab bar. setBottomAreaColor lets this follow the app's theme.
    private static final int BOTTOM_AREA_LIGHT = Color.parseColor("#fffdf8");
    private static final int BOTTOM_AREA_DARK = Color.parseColor("#1f2720");

    private WebView webView;
    private LinearLayout root;
    private View statusStrip;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> filePathCallback;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private boolean handlingBack;
    private OnBackPressedCallback backCallback;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        // Draw edge to edge on every Android version, so phones behave the same, then keep the page
        // clear of the status bar, the navigation bar, display cutouts and the keyboard ourselves.
        EdgeToEdge.enable(this,
                SystemBarStyle.dark(Color.TRANSPARENT),
                SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT));
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setContentDescription("FixNow Ghana community reporting app");
        webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        statusStrip = new View(this);
        statusStrip.setBackgroundColor(STATUS_STRIP_COLOR);
        root.addView(statusStrip, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0));
        root.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        // Until the page reports its theme, follow the phone setting.
        boolean phoneIsDark = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        applyPageTheme(phoneIsDark);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            statusStrip.getLayoutParams().height = bars.top;
            statusStrip.requestLayout();
            view.setPadding(bars.left, 0, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(root);

        WebSettings settings = webView.getSettings();
        // The bundled application requires JavaScript, but never receives file-origin privileges.
        settings.setJavaScriptEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // The page has its own dark theme: Android must never invert it.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false);
        }
        // The page says "light" or "dark" (Profile > Appearance can differ from the phone), so the area
        // below the tab bar and the navigation-bar icons match it. Only the app's own pages can send this.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "fixnowTheme", LocalServerAccess.appOrigins(),
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        if (isMainFrame) applyPageTheme("dark".equals(message.getData()));
                    });
        }
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setTextZoom(Math.max(100, Math.round(getResources().getConfiguration().fontScale * 100)));
        settings.setMediaPlaybackRequiresUserGesture(true);

        WebViewAssetLoader.Builder assetLoaderBuilder = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this));
        LocalServerAccess.configure(assetLoaderBuilder);
        assetLoader = assetLoaderBuilder.build();
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppWebChromeClient());
        webView.loadUrl(LocalServerAccess.startUrl("https://appassets.androidplatform.net/assets/fixnow-ghana.html"));

        backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dismissEmergencyDialogOrNavigate();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCallback);
    }

    private void applyPageTheme(boolean dark) {
        setBottomAreaColor(dark ? BOTTOM_AREA_DARK : BOTTOM_AREA_LIGHT, !dark);
    }

    /** Paints the area below the tab bar (and beside it in landscape) and picks readable navigation-bar icons. */
    private void setBottomAreaColor(int color, boolean lightSurface) {
        root.setBackgroundColor(color);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightNavigationBars(lightSurface);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightStatusBars(false);
    }

    private void dismissEmergencyDialogOrNavigate() {
        if (handlingBack) return;
        handlingBack = true;
        webView.evaluateJavascript("window.fixNowDismissEmergencyDialog && window.fixNowDismissEmergencyDialog()", result -> {
            handlingBack = false;
            if ("true".equals(result)) return;
            if (webView.canGoBack()) {
                webView.goBack();
                return;
            }
            backCallback.setEnabled(false);
            getOnBackPressedDispatcher().onBackPressed();
            backCallback.setEnabled(true);
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                Uri uri = data.getData();
                if (uri != null) {
                    results = new Uri[] { uri };
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && geoCallback != null) {
            boolean granted = false;
            for (int result : grantResults) {
                if (result == PackageManager.PERMISSION_GRANTED) {
                    granted = true;
                    break;
                }
            }
            geoCallback.invoke(geoOrigin, granted, false);
            geoCallback = null;
            geoOrigin = null;
        }
    }

    private final class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(Uri.parse(url));
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return assetLoader.shouldInterceptRequest(Uri.parse(url));
        }

        private boolean handleUrl(Uri uri) {
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if (("https".equals(scheme) && "appassets.androidplatform.net".equals(uri.getHost())) || LocalServerAccess.isAppPage(uri)) {
                return false;
            }
            if ("tel".equals(scheme)) {
                String number = uri.getSchemeSpecificPart();
                if (!isApprovedEmergencyNumber(number)) return true;
                Intent intent = new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null));
                startActivity(intent);
                return true;
            }
            if ("http".equals(scheme) || "https".equals(scheme) || "mailto".equals(scheme)) {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException ignored) {
                    Intent settingsIntent = new Intent(Settings.ACTION_SETTINGS);
                    startActivity(settingsIntent);
                }
                return true;
            }
            return false;
        }

        private boolean isApprovedEmergencyNumber(String number) {
            return "112".equals(number) || "191".equals(number) || "192".equals(number) || "193".equals(number);
        }
    }

    private final class AppWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;

            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            try {
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
            } catch (ActivityNotFoundException error) {
                filePathCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                callback.invoke(origin, true, false);
                return;
            }

            geoOrigin = origin;
            geoCallback = callback;
            requestPermissions(new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            }, LOCATION_REQUEST);
        }
    }
}
