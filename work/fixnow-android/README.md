# FixNow Ghana Android Wrapper

This is a native Android WebView wrapper for the offline FixNow Ghana web app in `outputs/`.

Package name: `com.fixnowghana.command`

Build debug APK:

```powershell
$env:ANDROID_HOME="C:\Users\tyres\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\gradlew.bat :app:assembleDebug
```

Build release bundle:

```powershell
$env:ANDROID_HOME="C:\Users\tyres\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\gradlew.bat :app:bundleRelease
```

The `syncWebAssets` build task copies the source web files from `outputs/` into the Android assets during every build. Generated assets and build outputs are not source of truth and are excluded from Git.

For Play Store submission, configure release signing from an external secret manager or local secure path. Keep the upload keystore and all signing passwords outside this repository. Do not remove the existing local signing material until the owner confirms a secure backup.
