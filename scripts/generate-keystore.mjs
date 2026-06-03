#!/usr/bin/env node
// scripts/generate-keystore.mjs
//
// Generates a Java-compatible PKCS12 keystore for Android APK/AAB signing.
// Uses openssl instead of node-forge (node-forge's PKCS12 writer is incompatible
// with Java 21's strict PKCS12 parser regardless of algorithm choice).
//
// Password is never hardcoded — pass it via CLI arg or env var:
//   npm run generate-keystore -- --password 'Admin@123'
//   KEYSTORE_PASSWORD='Admin@123' npm run generate-keystore
//
// Prerequisites: openssl must be installed.
//   Check: openssl version

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import * as readline from 'readline/promises';

// ── Config ────────────────────────────────────────────────────────────────────
const ALIAS = 'scrollix';
const OUTPUT_FILE = 'release-keystore.jks'; // .jks extension kept for workflow compatibility
// const VALIDITY_YEARS  = 27;                      // ~10000 days
const VALIDITY_DAYS = 36500; // ~100 years — Android signing keys cannot be renewed
const DNAME = 'CN=Scrollix,O=Scrollix,C=IN';
// ─────────────────────────────────────────────────────────────────────────────

const KEY_PEM = 'key.pem';
const CERT_PEM = 'cert.pem';

// ── Resolve password — CLI arg → env var → interactive prompt ─────────────────
// Priority:
//   1. --password 'xxx'  passed after with single quote --  e.g. npm run generate-keystore -- --password 'xxx'
//   2. KEYSTORE_PASSWORD env var          e.g. KEYSTORE_PASSWORD='xxx' npm run generate-keystore
//   3. Interactive prompt                 (input hidden, never echoed to terminal)
//
// Never hardcode the password here — this file is committed to the repo.
async function resolvePassword() {
  // 1. CLI arg: node script.mjs --password 'xxx'
  const argIdx = process.argv.indexOf('--password');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    console.log('🔑 Password source: --password argument');
    return process.argv[argIdx + 1];
  }

  // 2. Env var: KEYSTORE_PASSWORD='xxx' npm run generate-keystore
  if (process.env.KEYSTORE_PASSWORD) {
    console.log('🔑 Password source: KEYSTORE_PASSWORD env var');
    return process.env.KEYSTORE_PASSWORD;
  }

  // 3. Interactive prompt — input is hidden (no echo)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Hide input by overriding _writeToOutput
  rl._writeToOutput = (str) => {
    // Only write the prompt itself, not the typed characters
    if (!str.trim() || str.endsWith('? ') || str.endsWith(': ')) {
      rl.output.write(str);
    }
  };

  console.log('🔑 Password source: interactive prompt (input hidden)');
  const password = await rl.question('Enter keystore password: ');
  rl.output.write('\n'); // newline after hidden input
  rl.close();

  if (!password) {
    console.error('❌ Password cannot be empty.');
    process.exit(1);
  }
  return password;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd, env = {}) {
  // Passwords are always passed via env vars, never interpolated into the
  // command string — shell would expand $VAR sequences inside the value,
  // silently corrupting passwords like 'Admin$g@123' → 'Admin@123'.
  execSync(cmd, { stdio: 'pipe', env: { ...process.env, ...env } });
}

function cleanup() {
  for (const f of [KEY_PEM, CERT_PEM]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
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

const STORE_PASSWORD = await resolvePassword();

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
  // with Java 11–21's PKCS12KeyStore, apksigner, and jarsigner.
  //
  // -passout "env:OPENSSL_PASS" reads the password from an env var instead of
  // the command string — the only safe method for passwords with $ or other
  // shell-special characters.
  console.log('📦 Assembling PKCS12 bundle...');
  if (existsSync(OUTPUT_FILE)) unlinkSync(OUTPUT_FILE);
  run(
    `openssl pkcs12 -export \
      -in ${CERT_PEM} \
      -inkey ${KEY_PEM} \
      -out ${OUTPUT_FILE} \
      -name "${ALIAS}" \
      -passout "env:OPENSSL_PASS"`,
    { OPENSSL_PASS: STORE_PASSWORD }, // ← raw value, no shell interpolation
  );

  cleanup();

  console.log(`\n✅  Written → ${OUTPUT_FILE}`);
  console.log(`    Alias  : ${ALIAS}`);
  console.log(`    Valid  : ${VALIDITY_DAYS} days (~${Math.round(VALIDITY_DAYS / 365)} years)`);
  console.log(`    Format : PKCS12 / PBES2 / AES-256-CBC (Java 11–21 compatible)`);
  console.log(`\nVerify (always use single quotes around the password):`);
  console.log(`  keytool -list -v -keystore ${OUTPUT_FILE} -storepass '<your-password>'`);
  console.log(`  Look for → Keystore type: PKCS12 | Entry type: PrivateKeyEntry`);
  console.log(`\nEncode for GitHub Secrets:`);
  console.log(`  base64 -w 0 ${OUTPUT_FILE} > keystore.b64.txt`);
} catch (err) {
  cleanup();
  console.error('\n❌ Keystore generation failed:');
  console.error(err.message);
  process.exit(1);
}
