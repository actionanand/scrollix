# Scrollix — Android APK Build Guide

This project uses **Capacitor** (installed only in CI) to wrap the Angular web app into a native Android APK. No Android tooling is required locally — everything runs in a GitHub Actions workflow.

> **🔐 This project uses PKCS12 format for keystore signing.**

---

## Architecture

```
Angular App (src/)
    ↓  ng build
Web Assets (dist/scrollix/browser/)
    ↓  cap sync
Capacitor Android Project (generated in CI)
    ↓  gradlew assembleRelease
Unsigned APK
    ↓  zipalign + apksigner
Signed APK → GitHub Artifact / Release
```

**Key files in the repo:**

| File                                  | Purpose                                         |
| ------------------------------------- | ----------------------------------------------- |
| `capacitor.config.ts`                 | Capacitor configuration (app ID, name, web dir) |
| `.github/workflows/android-build.yml` | CI workflow that builds the APK                 |

The `android/` directory is **never committed** — it's generated fresh in every CI run.

---

## How It Works

1. Push to the `main-android` branch triggers the workflow.
2. CI builds the Angular app, installs Capacitor, generates the Android project, builds and signs the APK & AAB.
3. The signed files are **committed to the `releases/` folder** of the `main-android` branch — browse them directly in GitHub.
4. Both files are also uploaded as **GitHub Actions artifacts** (downloadable for 30 days) from the Actions tab.
5. If you push a **git tag**, a GitHub Release is also created with both files attached.

---

## GitHub Secrets Setup

Add these secrets in **Settings → Secrets and variables → Actions**:

| Secret              | Required       | Description                                           |
| ------------------- | -------------- | ----------------------------------------------------- |
| `PASSWORD_HASH`     | Yes            | App password hash (already used by gh-pages workflow) |
| `TOKEN_HASH`        | Yes            | App token (already used by gh-pages workflow)         |
| `KEYSTORE_BASE64`   | For signed APK | Base64-encoded keystore file (`.jks` or `.p12`)       |
| `KEYSTORE_PASSWORD` | For signed APK | Keystore password                                     |
| `KEY_ALIAS`         | For signed APK | Key alias inside the keystore                         |
| `KEY_PASSWORD`      | For signed APK | Key password                                          |

> Without the keystore secrets, the workflow still produces an **unsigned APK** (good for testing).

---

## Keystore Formats: PKCS12 vs JKS

Android signing supports two keystore formats:

| Format     | Type                                                  | Recommended   |
| ---------- | ----------------------------------------------------- | ------------- |
| **PKCS12** | Open industry standard (RFC 7292); default in Java 9+ | ✅ Yes        |
| **JKS**    | Proprietary Oracle format; legacy                     | ⚠️ Deprecated |

**PKCS12** (`.p12` or `.jks`) is the modern standard — it's cross-platform, widely supported, and what Java's `keytool` now defaults to. **JKS** is Oracle-proprietary and deprecated since Java 9; generating a JKS keystore will produce a migration warning. Both formats are supported by `apksigner` and `jarsigner`, so switching to PKCS12 requires **no changes** to your CI workflow.

> **🔐 This project uses PKCS12 format for keystore signing.**

### Why PKCS12 has one password, JKS has two

**JKS** was designed with two separate password layers:

- **`KEYSTORE_PASSWORD`** — unlocks the keystore _container_ (the file itself)
- **`KEY_PASSWORD`** — unlocks the individual _private key entry_ inside it

This separation was intentional — a single JKS file could hold multiple keys owned by different people, each protected by their own key password.

**PKCS12** uses a single passphrase that covers everything — the container and the private key together. Per-entry passwords are not supported in the same way.

**In practice for Android:** `apksigner` and `jarsigner` still accept a `--key-pass` / `-keypass` flag for PKCS12 keystores — they simply expect it to equal the store password. So your CI workflow stays the same; just set `KEY_PASSWORD` to the **same value** as `KEYSTORE_PASSWORD` in GitHub Secrets when using PKCS12.

### Check your keystore type

```bash
keytool -list -v -keystore release-keystore.jks
```

Look for the `Keystore type:` line in the output:

```
Keystore type: PKCS12   ✅ modern format
Keystore type: JKS      ⚠️ legacy format — consider migrating
```

```bash
openssl pkcs12 -info -in release-keystore.jks -noout
```

Look for the `MAC: sha256` line in the output:

```
MAC: sha256, Iteration 2048
PKCS7 Data
```

If you get error, then it's JKS

or

```bash
npm run keystore:type
```

---

## How to Create & Sign a Keystore

### Method 1 — `keytool` (Java, PKCS12) ✅ Recommended

**> 🔐 This project uses PKCS12. Use `-storetype PKCS12` as shown below.**

```bash
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keyalg RSA \
  -keysize 2048 \
  -validity 36500 \
  -storepass 'YOUR_STORE_PASSWORD' \
  -keypass 'YOUR_KEY_PASSWORD' \
  -alias scrollix \
  -keystore release-keystore.jks \
  -dname "CN=Scrollix, OU=Mobile, O=Scrollix, L=City, ST=State, C=IN"
```

> The file can be named `.jks` or `.p12` — the extension doesn't affect the format. Keeping `.jks` means no changes are needed anywhere else in the workflow.

> **Important:** Always wrap passwords in **single quotes** (`'...'`) in bash. Double quotes allow `$`, `!`, `@` etc. to be interpreted as special characters, which silently changes the password.

---

### Method 2 — `keytool` (Java, legacy JKS)

> ⚠️ This will generate a deprecation warning. Prefer Method 1 (PKCS12).

```bash
keytool -genkeypair \
  -v \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 36500 \
  -storepass 'YOUR_STORE_PASSWORD' \
  -keypass 'YOUR_KEY_PASSWORD' \
  -alias scrollix \
  -keystore release-keystore.jks \
  -dname "CN=Scrollix, OU=Mobile, O=Scrollix, L=City, ST=State, C=IN"
```

---

### Method 3 — Node.js script (`scripts/generate-keystore.mjs`)

A Node.js alternative — no Java required. Uses openssl, which is typically available on Ubuntu/WSL.

This runs `node scripts/generate-keystore.mjs` (configured in `package.json` as `"generate-keystore": "node generate-keystore.mjs"`). It generates a PKCS12 keystore saved as `release-keystore.jks`.

There are three ways to generate PKCS12 keystore

- Method 1 — CLI arg (most explicit, single quotes around password in the terminal to protect the $)

```bash
`npm run generate-keystore -- --password 'YOUR_STORE_PASSWORD'`
```

Say `YOUR_STORE_PASSWORD` is `Admin@123`

```bash
`npm run generate-keystore -- --password 'Admin@123'`
```

- Method 2 — env var (useful in scripts)

```bash
KEYSTORE_PASSWORD='Admin@123' npm run generate-keystore
```

- Method 3 — interactive prompt (input is hidden, nothing echoed)

```bash
npm run generate-keystore
# Enter keystore password: ← type here, nothing shown
```

Verify generated keystore (must use single quotes around password)

```bash
keytool -list -v -keystore release-keystore.jks -storepass 'Admin@123'
```

```bash
openssl pkcs12 -info -in release-keystore.jks -passin pass:'Admin@123' -clcerts  -nokeys
```

- `-passin` → keystore password
- `-nokeys` → do not output private key (avoids PEM handling)
- `-clcerts` → show certificate only
- `-nodes` → don't try to encrypt PEM output

---

### Migrate existing JKS → PKCS12

If you already have a `release-keystore.jks` in JKS format, convert it in-place:

```bash
keytool -importkeystore \
  -srckeystore release-keystore.jks \
  -destkeystore release-keystore.jks \
  -deststoretype pkcs12 \
  -srcstorepass 'YOUR_STORE_PASSWORD' \
  -deststorepass 'YOUR_STORE_PASSWORD'
```

`keytool` handles this safely via a temp file. Verify the result afterwards:

```bash
keytool -list -v -keystore release-keystore.jks
# Should show: Keystore type: PKCS12
```

---

### Step 2: Base64-encode for GitHub Secrets

```bash
# Option A — save to a file (easier to copy)
base64 -w 0 release-keystore.jks > keystore.b64.txt

# Option B — print directly to terminal
base64 -w 0 release-keystore.jks
```

Open `keystore.b64.txt` (or copy terminal output) and save it as the `KEYSTORE_BASE64` secret.

---

### Step 3: Add remaining secrets

| Secret              | Value                 |
| ------------------- | --------------------- |
| `KEYSTORE_PASSWORD` | `YOUR_STORE_PASSWORD` |
| `KEY_ALIAS`         | `scrollix`            |
| `KEY_PASSWORD`      | `YOUR_KEY_PASSWORD`   |

---

### Verify & decode `KEYSTORE_BASE64` locally

Load the secret from the encoded file and verify it decodes correctly:

```bash
# Load into an environment variable
export KEYSTORE_BASE64="$(cat keystore.b64.txt)"

# Shorthand
export KEYSTORE_BASE64=$(<keystore.b64.txt)

# Check it's non-empty (prints character count)
echo "${#KEYSTORE_BASE64}"

# Print the raw base64 string
echo "$KEYSTORE_BASE64"

# Decode back to the keystore file — produces identical bytes regardless of JKS or PKCS12
echo "$KEYSTORE_BASE64" | base64 -d > release-keystore.p12
```

> Decoding always produces the same bytes as the original file. Whether the source was `.jks` or `.p12`, the round-trip `base64 encode → decode` is lossless.

---

### Important

- **Never commit** `release-keystore.jks` or `release-keystore.p12` to the repo.
- **Back up** the keystore file securely. Losing it means you can never update your Play Store app.
- The key should be valid for a long time — **36500 days (~100 years)** is a safe choice. Android signing keys **cannot be renewed or replaced** once your app is published.

---

## Changing the App ID / Name

Edit `capacitor.config.ts`:

```ts
const config: CapacitorConfig = {
  appId: 'com.yourname.scrollix', // Unique ID on Play Store
  appName: 'Scrollix', // Display name on device
  webDir: 'dist/scrollix/browser',
  // ...
};
```

> The `appId` must follow reverse domain format and **cannot be changed** after publishing to the Play Store.

---

## When a New Android Version Is Released

When Google releases a new Android version (e.g. Android 16), you need to update `targetSdkVersion` to maintain Play Store compliance. Google typically requires apps to target the latest SDK within 12 months of release.

### Steps

1. Check the new API level at [developer.android.com/tools/releases/platforms](https://developer.android.com/tools/releases/platforms).

2. Open `.github/workflows/android-build.yml` and find the `env:` block near the top of the file:

   ```yaml
   env:
     MIN_SDK_VERSION: 22 # Android 5.1 Lollipop (~99% devices)
     TARGET_SDK_VERSION: 35 # Android 15 — update this value
   ```

   Change `TARGET_SDK_VERSION` to the new API level, e.g. `36` for Android 16.

3. Also update the Capacitor Android dependency in the workflow to ensure it supports the new SDK:

   Change the install line to use `@capacitor/android@latest`:

   ```bash
   npm install --no-save @capacitor/cli @capacitor/core @capacitor/android@latest
   ```

4. Push to `main-android` — CI will build with the new target.

### Android API Level Reference

| API Level | Android Version | Release Year |
| --------- | --------------- | ------------ |
| 34        | 14              | 2023         |
| 35        | 15              | 2024         |
| 36        | 16              | 2025         |

---

## Changing Supported Android Versions

The current targets are configured as workflow-level environment variables in `.github/workflows/android-build.yml`:

```yaml
env:
  MIN_SDK_VERSION: 22 # Android 5.1 Lollipop (~99% devices)
  TARGET_SDK_VERSION: 35 # Android 15
```

Edit these two values and push — CI applies them automatically via `sed` to `variables.gradle` during the build.

Common `minSdkVersion` values:

| minSdkVersion | Android Version | Device coverage |
| ------------- | --------------- | --------------- |
| 22            | 5.1 Lollipop    | ~99%            |
| 24            | 7.0 Nougat      | ~97%            |
| 26            | 8.0 Oreo        | ~93%            |
| 28            | 9.0 Pie         | ~85%            |

---

## App Version (versionCode & versionName)

Versions are stored in `android-version.json` at the repo root:

```json
{ "versionCode": 1, "versionName": "1.0.0" }
```

- **versionCode** — integer, must increase with every Play Store upload.
- **versionName** — human-readable string shown in device app info.

### How versionCode works

The CI workflow **auto-increments `versionCode` by 1 on every build** and commits the updated file back to `main-android`. This means:

- On the `main` branch, `versionCode` stays at its initial value (e.g. `1`) — this is **normal**. The `main` branch doesn't build APKs.
- On `main-android`, the value increases with every push (1 → 2 → 3 → ...).
- If you **manually edit** `versionCode` in `android-version.json` on `main-android`, CI will increment from your new value on the next build.
- You should **never need to edit versionCode manually** — CI handles it.
- Only edit `versionName` when you want to mark a release (e.g. `1.0.0` → `1.1.0`).

### Auto-increment (npm scripts)

Use these only when you also want to bump the human-readable **versionName** (semver):

```bash
npm run android:version:patch   # versionCode +1, patch (1.0.0 → 1.0.1)
npm run android:version:minor   # versionCode +1, minor (1.0.0 → 1.1.0)
npm run android:version:major   # versionCode +1, major (1.0.0 → 2.0.0)
```

Then commit and push:

```bash
git add android-version.json
git commit -m "chore: bump android version to 1.1.0"
git push origin main-android
```

### Manual update

Open `android-version.json`, edit `versionName` (the CI handles `versionCode` automatically), commit and push to `main-android`.

---

## App Icon

The icon is sourced from `public/scrollix.png`. During the CI build, ImageMagick resizes it to all required densities:

| Density    | Size    | Location                    |
| ---------- | ------- | --------------------------- |
| mdpi       | 48×48   | mipmap-mdpi/                |
| hdpi       | 72×72   | mipmap-hdpi/                |
| xhdpi      | 96×96   | mipmap-xhdpi/               |
| xxhdpi     | 144×144 | mipmap-xxhdpi/              |
| xxxhdpi    | 192×192 | mipmap-xxxhdpi/             |
| Play Store | 512×512 | releases/playstore-icon.png |

To change the icon, replace `public/scrollix.png` with a square PNG (≥512×512 px) and push.

---

## Triggering a Build

### Regular build

```bash
git checkout main-android
git merge main        # or cherry-pick changes
git push origin main-android
```

After the workflow finishes, the files are available in **two places**:

- `releases/scrollix-release.apk` and `releases/scrollix-release.aab` — committed directly to the `main-android` branch (browse in GitHub → download)
- **Actions → Android APK & AAB Build → Artifacts** — downloadable for 30 days

### Tagged release (creates GitHub Release)

```bash
git checkout main-android
git tag v1.0.0
git push origin v1.0.0
```

---

## Publishing to Google Play Store

### First-time setup

1. Create a [Google Play Developer account](https://play.google.com/console/) ($25 one-time fee).
2. Go to **All apps → Create app** and fill in the details.
3. Complete the **Store listing** (screenshots, description, etc.).
4. Complete the **Content rating** questionnaire.
5. Set up **Pricing & distribution**.

### Upload the AAB (Play Store)

1. Go to **Production → Create new release** (or use Internal/Closed testing first).
2. Upload the signed `scrollix-release.aab` (download from `releases/` folder in `main-android`).
3. Use `releases/playstore-icon.png` as the store listing icon.
4. Add release notes and submit for review.

### Subsequent updates

1. Run `npm run android:version:patch` (or minor/major as needed).
2. Commit `android-version.json`.
3. Push to `main-android` — CI builds and signs automatically.
4. Download the new AAB from `releases/` and upload to Play Console.

### Play Store requirements

- APK must be **signed** with the same keystore every time.
- `versionCode` must **increase** with each upload.
- Google now recommends **AAB (Android App Bundle)** over APK. To switch, change `assembleRelease` to `bundleRelease` in the workflow and upload the `.aab` file instead.

---

## Switching to AAB (App Bundle) for Play Store

Edit the workflow's Gradle step:

```yaml
- name: Build AAB with Gradle
  working-directory: android
  run: ./gradlew bundleRelease
```

The output will be at `android/app/build/outputs/bundle/release/app-release.aab`. Update the upload/artifact paths accordingly.

---

## Local Development (Optional)

If you want to test locally with Capacitor:

```bash
npm install @capacitor/cli @capacitor/core @capacitor/android
npm run build
npx cap add android
npx cap sync
npx cap open android   # Opens in Android Studio
```

This is **not required** — the CI workflow handles everything.
