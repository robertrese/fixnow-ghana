# FixNow Ghana Android Signing Notes

Updated: August 10, 2026

## Created

Signed Android App Bundle candidate:

`outputs/fixnow-ghana-release.aab`

Unsigned owner-signing bundle:

`outputs/fixnow-ghana-release-unsigned.aab`

Upload-key candidate:

`work/fixnow-secrets/fixnow-upload-key-candidate.p12`

Password file:

`work/fixnow-secrets/ANDROID_UPLOAD_KEY_CANDIDATE_SECRETS.txt`

## Verification

The bundle was signed with:

- Alias: `fixnow-upload`
- RSA 4096-bit key
- Certificate name: `CN=FixNow Ghana Upload, O=FixNow Ghana, L=Accra, C=GH`

The Phase 12 bundle was freshly signed and `jarsigner` returned `jar verified` with SHA-384 and a 4096-bit RSA upload certificate. The self-signed certificate-chain warning is expected for an Android upload key and does not mean the bundle is unsigned.

SHA-256 checksums are stored in `outputs/release-checksums.sha256`.

## Important

Do not publish the keystore or password file. Move them to a secure password manager or organization vault before using this key in Google Play Console.

If you do not want this candidate key to become the real upload key, delete it and generate a new one before enrolling the app in Play App Signing.
