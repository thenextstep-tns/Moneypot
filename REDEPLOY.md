# Redeploy Moneypot v0.9.7 (security & correctness release)

Paste everything below the line into Antigravity.

---

You are redeploying **Moneypot** from this repository (`C:\Users\Lenovo\Documents\Budget`, GitHub remote
`thenextstep-tns/Moneypot`, branch `main`). The code changes are already done and tested. Your job is to verify them,
bump the version, build a properly signed Android APK, deploy the Firebase backend, and publish the website.
Do **not** rewrite application code. If any step fails, stop and report the exact error instead of working around it.

## How this project is hosted
- **Website**: static files on **GitHub Pages**. Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs
  `npm ci` and `npm run build` on GitHub's servers and publishes `dist/`. Do **not** run `firebase deploy` for hosting.
- **Database rules + Discord login function**: live in the Firebase project **`honeypot-834a1`** and are deployed with the
  Firebase CLI. GitHub does not deploy these.
- **Android app**: an APK downloaded from the website (`public/moneypot-v<version>.apk`).

## 0. What changed (context only)
- New Firestore security model (`firestore.rules`): personal data is private; sharing uses `shared_items/{id}` with
  member-only access and one-time, email-bound invites (`invites/{sha256(code)}`). The old `invites`, `shared_stashes`,
  `shared_payments`, `shared_transfers` collections are locked.
- New balance engine, frozen exchange rates on new records, mobile sign-in hardening, a hardened Discord function,
  and release APKs must now be signed with a private key (no more debug key).

## 1. Prerequisites — check, don't guess
1. Node.js 20+ (`node -v`).
2. Java: **21+** for the current Firebase CLI. With Java 17 use `npx firebase-tools@13 …` instead of `firebase …`
   (the repo's `npm run test:rules` already does that).
3. Firebase CLI logged in to an account with access to `honeypot-834a1`: run `npx firebase-tools@13 login` and let the
   **user** complete the browser login. Never ask for or type their password.
4. GitHub push access to `thenextstep-tns/Moneypot` (`git remote -v`, `gh auth status`).
5. **Release signing key.** Check that `~/.gradle/gradle.properties` defines `MONEYPOT_UPLOAD_STORE_FILE`,
   `MONEYPOT_UPLOAD_STORE_PASSWORD`, `MONEYPOT_UPLOAD_KEY_ALIAS`, `MONEYPOT_UPLOAD_KEY_PASSWORD` (only check that the
   names exist; do not print the values). If they are missing, **stop and ask the user** to follow
   `MoneypotMobile/README-signing.md`. Do not create a key yourself, and never commit a keystore or passwords.

## 2. Verify before shipping
From the repo root:
```
npm ci
npm test                 # money-logic tests + checks the mobile copy of the shared logic is in sync
npm run test:rules       # Firestore rules tests in the local emulator (needs Java)
npx tsc --noEmit
```
Then in `MoneypotMobile/`:
```
npm ci
npx tsc --noEmit
npm test
```
All must pass (expected: 17 logic tests, 8 rules tests, mobile suite with no "FAIL" lines).

## 3. Bump the version to 0.9.7
Change `0.9.6` → `0.9.7` in exactly these places:
- `package.json` (`"version"`)
- `src/version.ts` (`APP_VERSION`) — the website's download link uses it
- `MoneypotMobile/package.json` (`"version"`)
- `MoneypotMobile/app.json` (`expo.version`)
- `MoneypotMobile/src/version.ts` (`APP_VERSION`)
- `MoneypotMobile/android/app/build.gradle`: `versionName "0.9.7"` and `versionCode 6` (was 5)

## 4. Build the signed APK
```
cd MoneypotMobile/android
./gradlew clean assembleRelease        # on Windows: gradlew.bat clean assembleRelease
```
- The build intentionally fails if release signing isn't configured. In that case go back to step 1.5.
- Verify the signature is **not** the debug key:
  `apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk` must not show `CN=Android Debug`.
- Copy `app/build/outputs/apk/release/app-release.apk` to `public/moneypot-v0.9.7.apk` (repo root `public/`).
- Remove the old file from git: `git rm public/moneypot-v0.9.6.apk`.
- Don't put APKs anywhere else in the repo (the root `*.apk` is git-ignored).

## 5. Publish the website and the backend together
Old browsers and old APKs stop syncing shared items once the new rules are live, so run these back to back:

1. Commit and push:
   ```
   git add -A
   git status            # make sure no *.keystore, *.jks, .env.local or gradle.properties is staged
   git commit -m "v0.9.7: secure sharing model, private-data rules, balance engine fixes, signed APK"
   git push origin main
   ```
2. Deploy the Firestore rules right away:
   ```
   npx firebase-tools@13 use honeypot-834a1
   npx firebase-tools@13 deploy --only firestore:rules
   ```
3. Only if Discord login is used (needs the Blaze plan and the `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` secrets
   that are already set): `npx firebase-tools@13 deploy --only functions`. If asked for `DISCORD_ALLOWED_REDIRECTS`,
   use `https://thenextstep-tns.github.io/Moneypot/,http://localhost:5173/`. Then tell the user to set the Discord
   developer portal OAuth2 redirect to `https://thenextstep-tns.github.io/Moneypot/` (it used to end in `/auth/discord`).
4. Watch the GitHub Actions run until it is green: `gh run watch` (or the Actions tab). If it fails, report the log.
   Do not force-push or re-run with tests disabled.

## 6. Check it worked
1. Open https://thenextstep-tns.github.io/Moneypot/ in a private window: the login page loads, and
   "Download Android App (v0.9.7)" downloads the new APK (not a 404).
2. Sign in with Google: existing accounts, pots and plans appear; no "Couldn't sync a change" banner.
3. Sharing (needs two Google accounts): A opens a stash → Share → invites B's email → copies the code. B signs in,
   uses "Join shared stash" with the code, and sees the stash. Using the same code again must fail.
4. In the Firebase console → Firestore → Rules, the published rules start with `// Moneypot security model`.
5. Install the APK on an Android phone: Google sign-in returns to the app and the data loads.

## 7. Tell the user to pass on to their users
- **Android**: the signing key changed, so the old app must be **uninstalled once** before installing v0.9.7. Their
  data is in the cloud and comes back after signing in.
- **Shared pots/stashes from before** must be **re-shared once**: the owner opens it → Share → invites the partner
  again. Personal data is not affected.

## Do not
- Do not edit `firestore.rules`, `src/sharedSync.ts` or the balance logic to make something work. Report it instead.
- Do not edit files in `MoneypotMobile/src/domain/` by hand (they are generated by `npm run sync:domain`), except
  `fx.ts` and `emojis.ts`.
- Do not commit secrets, keystores, `.env.local`, or `gradle.properties` with passwords.
- Do not run a plain `firebase deploy` (it would also try to deploy hosting).
