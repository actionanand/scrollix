#!/usr/bin/env node
// scripts/generate-keystore.mjs
//
// Generates a Java-compatible PKCS12 keystore for Android APK/AAB signing.
// Uses openssl (available on Linux, macOS, WSL) instead of node-forge, because
// node-forge's PKCS12 writer is not compatible with Java 21's strict PKCS12
// parser — it causes BadPaddingException / "wrong password" at apksigner time
// regardless of algorithm choice (3des or aes256).
//
// Prerequisites: openssl must be installed (it is on all CI runners and most dev machines).
// Check with: openssl version

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';

// ── Config — edit these ───────────────────────────────────────────────────────
const STORE_PASSWORD = 'YOUR_STORE_PASSWORD'; // single passphrase (PKCS12: store = key password)
const KEY_PASSWORD = 'YOUR_KEY_PASSWORD'; // PKCS12 uses a single password; KEY_PASSWORD is ignored by most tools but kept for parity
const ALIAS = 'scrollix';
const OUTPUT_FILE = 'release-keystore.jks'; // .jks extension kept for workflow compatibility
// const VALIDITY_YEARS  = 27;                      // ~10000 days
const VALIDITY_DAYS = 36500; // ~100 years — Android signing keys cannot be renewed
const DNAME = 'CN=Scrollix,O=Scrollix,C=IN';
// ─────────────────────────────────────────────────────────────────────────────

const KEY_PEM = 'key.pem';
const CERT_PEM = 'cert.pem';

function run(cmd) {
  execSync(cmd, { stdio: 'pipe' });
}

function cleanup() {
  for (const f of [KEY_PEM, CERT_PEM]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

// Verify openssl is available
try {
  const ver = execSync('openssl version', { stdio: 'pipe' }).toString().trim();
  console.log(`🔍 Using ${ver}`);
} catch {
  console.error('❌ openssl not found. Install it and try again.');
  console.error('   macOS : brew install openssl');
  console.error('   Ubuntu: sudo apt-get install openssl');
  process.exit(1);
}

try {
  // Step 1 — RSA private key
  console.log('🔑 Generating 2048-bit RSA private key...');
  run(`openssl genrsa -out ${KEY_PEM} 2048`);

  // Step 2 — Self-signed certificate
  console.log('📄 Generating self-signed certificate...');
  run(
    `openssl req -new -x509 \
      -key ${KEY_PEM} \
      -out ${CERT_PEM} \
      -days ${VALIDITY_DAYS} \
      -subj "/${DNAME.replace(/,/g, '/')}"`,
  );

  // Step 3 — Pack into PKCS12
  // openssl pkcs12 -export produces PBES2/PBKDF2/AES-256-CBC — fully compatible
  // with Java 11–21's PKCS12KeyStore and apksigner / jarsigner.
  console.log('📦 Assembling PKCS12 bundle...');
  if (existsSync(OUTPUT_FILE)) unlinkSync(OUTPUT_FILE);
  run(
    `openssl pkcs12 -export \
      -in ${CERT_PEM} \
      -inkey ${KEY_PEM} \
      -out ${OUTPUT_FILE} \
      -name "${ALIAS}" \
      -passout "pass:${STORE_PASSWORD}"`,
  );

  cleanup();

  console.log(`\n✅  Written → ${OUTPUT_FILE}`);
  console.log(`    Alias    : ${ALIAS}`);
  console.log(`    Valid    : ${VALIDITY_DAYS} days (~${Math.round(VALIDITY_DAYS / 365)} years)`);
  console.log(`    Format   : PKCS12 / PBES2 / AES-256-CBC (Java 11–21 compatible)`);
  console.log(`\nVerify:`);
  console.log(`  keytool -list -v -keystore ${OUTPUT_FILE} -storepass 'YOUR_STORE_PASSWORD'`);
  console.log(`  Look for → Keystore type: PKCS12 | Entry type: PrivateKeyEntry`);
  console.log(`\nNext — encode for GitHub Secrets:`);
  console.log(`  base64 -w 0 ${OUTPUT_FILE} > keystore.b64.txt`);
} catch (err) {
  cleanup();
  console.error('\n❌ Keystore generation failed:');
  console.error(err.message);
  process.exit(1);
}
