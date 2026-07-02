import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_PACKAGE_NAME = 'com.actionanand.scrollix.app';
const DEFAULT_OUT = 'public/.well-known/assetlinks.json';
const PLACEHOLDER_FINGERPRINT = 'REPLACE_WITH_RELEASE_CERT_SHA256_FINGERPRINT';

const args = process.argv.slice(2);
const outArg = valueAfter('--out');
const packageArg = valueAfter('--package');
const fingerprintsArg = valueAfter('--fingerprints');

const packageName = packageArg || readPackageName() || DEFAULT_PACKAGE_NAME;
const configuredFingerprints = parseFingerprints(
  fingerprintsArg ||
    process.env.ASSETLINKS_SHA256_CERT_FINGERPRINTS ||
    process.env.SHA256_FINGERPRINT ||
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS ||
    process.env.RELEASE_CERT_SHA256 ||
    '',
);
const fingerprints =
  configuredFingerprints.length > 0 ? configuredFingerprints : deriveFingerprintsFromKeystore();

const assetLinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints.length > 0 ? fingerprints : [PLACEHOLDER_FINGERPRINT],
    },
  },
];

const outPath = resolve(outArg || DEFAULT_OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(assetLinks, null, 2)}\n`);

if (fingerprints.length === 0) {
  console.warn(
    'Generated assetlinks.json with a placeholder fingerprint. Set SHA256_FINGERPRINT or KEYSTORE_BASE64 + KEYSTORE_PASSWORD for release builds.',
  );
}
console.log(`Generated ${outPath}`);

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function parseFingerprints(value) {
  return value
    .split(',')
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);
}

function readPackageName() {
  try {
    const config = readFileSync('capacitor.config.ts', 'utf8');
    return config.match(/appId:\s*['"]([^'"]+)['"]/)?.[1] ?? '';
  } catch {
    return '';
  }
}

function deriveFingerprintsFromKeystore() {
  const encodedKeystore = process.env.KEYSTORE_BASE64?.trim();
  const password = process.env.KEYSTORE_PASSWORD ?? '';
  if (!encodedKeystore || !password) return [];

  const alias = process.env.KEY_ALIAS || 'scrollix';
  const tempDir = mkdtempSync(join(tmpdir(), 'scrollix-assetlinks-'));
  const keystorePath = join(tempDir, 'release-keystore.jks');

  try {
    writeFileSync(keystorePath, Buffer.from(encodedKeystore, 'base64'));
    const keytoolOutput = execFileSync(
      'keytool',
      [
        '-list',
        '-v',
        '-keystore',
        keystorePath,
        '-alias',
        alias,
        '-storepass:env',
        'KEYSTORE_PASSWORD',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, KEYSTORE_PASSWORD: password },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const fingerprint = keytoolOutput.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1]?.toUpperCase();
    return fingerprint ? [fingerprint] : [];
  } catch (error) {
    console.warn('Unable to derive SHA-256 fingerprint from KEYSTORE_BASE64.');
    const stderr = error.stderr?.toString?.().trim();
    if (stderr) console.warn(stderr);
    return [];
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
