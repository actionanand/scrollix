// generate-keystore.mjs
import forge from 'node-forge';
import fs from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────
const STORE_PASSWORD = 'YOUR_STORE_PASSWORD';
const KEY_PASSWORD = 'YOUR_KEY_PASSWORD'; // PKCS12 uses a single password; KEY_PASSWORD is ignored by most tools but kept for parity
const ALIAS = 'scrollix';
const OUTPUT_FILE = 'release-keystore.jks'; // name kept for workflow compatibility
// const VALIDITY_YEARS  = 27;                      // ~10000 days
const VALIDITY_YEARS = 100;
const DNAME = {
  CN: 'Scrollix',
  O: 'Scrollix',
  C: 'IN',
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
cert.setIssuer(attrs); // self-signed
cert.sign(keys.privateKey, forge.md.sha256.create());

console.log('📦 Assembling PKCS12 bundle...');
const p12 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  [cert],
  STORE_PASSWORD, // single passphrase covers both bag types
  {
    algorithm: '3des', // widely compatible; use 'aes256' if your Java is 11+
    friendlyName: ALIAS, // sets the alias visible to keytool / apksigner
  },
);

const der = forge.asn1.toDer(p12).getBytes();
const buf = Buffer.from(der, 'binary');
fs.writeFileSync(OUTPUT_FILE, buf);

console.log(`✅  Written ${buf.length} bytes → ${OUTPUT_FILE}`);
console.log(`    Alias    : ${ALIAS}`);
console.log(`    Valid    : ${VALIDITY_YEARS} years`);
console.log();
console.log('Next step — encode for GitHub secret:');
console.log(`  base64 -w 0 ${OUTPUT_FILE} > keystore.b64.txt`);
