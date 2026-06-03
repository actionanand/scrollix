// scripts/generate-keystore.mjs
import forge from 'node-forge';
import fs from 'fs';

// ── Config — edit these ───────────────────────────────────────────────────────
const STORE_PASSWORD = 'YOUR_STORE_PASSWORD'; // single passphrase for PKCS12 (covers store + key)
const KEY_PASSWORD = 'YOUR_KEY_PASSWORD'; // PKCS12 uses a single password; KEY_PASSWORD is ignored by most tools but kept for parity
const ALIAS = 'scrollix';
const OUTPUT_FILE = 'release-keystore.jks'; // .jks extension kept for workflow compatibility
// const VALIDITY_YEARS  = 27;                      // ~10000 days
const VALIDITY_YEARS = 100; // 100 years — cannot renew Android signing keys
const DNAME = {
  CN: 'Scrollix', // Common Name  (app name)
  O: 'Scrollix', // Organization (app/company name)
  C: 'IN', // Country code (ISO 3166-1 alpha-2)
};
// ─────────────────────────────────────────────────────────────────────────────

console.log('🔑 Generating 2048-bit RSA key pair...');
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();

cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + VALIDITY_YEARS);

const attrs = [
  { name: 'commonName', value: DNAME.CN },
  { name: 'organizationName', value: DNAME.O },
  { name: 'countryName', value: DNAME.C },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

console.log('📦 Assembling PKCS12 bundle...');

// Pass cert directly (not in an array) so node-forge ≥1.3 correctly sets a
// matching localKeyId on both the private-key bag and the certificate bag.
// Java's PKCS12KeyStore uses localKeyId to resolve alias → private key;
// without it jarsigner throws "key associated with <alias> not a private key".
//
// algorithm: 'aes256' → PBES2 + AES-256-CBC, which Java 11–21 parses correctly.
// '3des' uses a node-forge PBE scheme that diverges from Java's strict PKCS#5 v2
// implementation and causes BadPaddingException / "wrong password" at signing time.
const p12 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  cert, // ← single cert object, NOT an array
  STORE_PASSWORD,
  {
    algorithm: 'aes256', // Java 11+ compatible; do NOT use '3des'
    friendlyName: ALIAS,
    generateLocalKeyId: true, // links key bag ↔ cert bag by localKeyId
  },
);

const der = forge.asn1.toDer(p12).getBytes();
const buf = Buffer.from(der, 'binary');
fs.writeFileSync(OUTPUT_FILE, buf);

console.log(`✅  Written ${buf.length} bytes → ${OUTPUT_FILE}`);
console.log(`    Alias    : ${ALIAS}`);
console.log(`    Valid    : ${VALIDITY_YEARS} years`);
console.log(`    Format   : PKCS12 / AES-256`);
console.log();
console.log('Verify with:');
console.log(`  keytool -list -v -keystore ${OUTPUT_FILE} -storepass 'YOUR_STORE_PASSWORD'`);
console.log('  Look for → Keystore type: PKCS12 | Entry type: PrivateKeyEntry');
console.log();
console.log('Next — encode for GitHub Secrets:');
console.log(`  base64 -w 0 ${OUTPUT_FILE} > keystore.b64.txt`);
