# Signing release APKs

Release builds are no longer signed with the public React Native debug key (anyone could sign a
malicious "update" with that key and take over the installed app's data). `assembleRelease` now
fails until a private release key is configured.

## One-time setup

1. Create a key (keep the file and passwords somewhere safe and backed up — if you lose it you can
   never ship an update to existing installs):

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore moneypot-release.keystore -alias moneypot -keyalg RSA -keysize 4096 -validity 10000
   ```

   Store the keystore **outside this repository** (e.g. `C:/Users/<you>/keys/moneypot-release.keystore`).

2. Add to `~/.gradle/gradle.properties` (your user folder, not the project):

   ```properties
   MONEYPOT_UPLOAD_STORE_FILE=C:/Users/<you>/keys/moneypot-release.keystore
   MONEYPOT_UPLOAD_STORE_PASSWORD=...
   MONEYPOT_UPLOAD_KEY_ALIAS=moneypot
   MONEYPOT_UPLOAD_KEY_PASSWORD=...
   ```

3. Build: `cd android && ./gradlew assembleRelease`

## Note for existing users

APKs up to v0.9.6 were signed with the debug key. Android will refuse to install the first
release-signed APK over them, so users must uninstall the old app once and then install the new
one. Their budget data is stored in Firebase and comes back after signing in again.
