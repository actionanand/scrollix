// scripts/generate-keystore.mjs
import forge from 'node-forge';
import fs from 'fs';

// ── Config — edit these ───────────────────────────────────────────────────────
const STORE_PASSWORD = 'YOUR_STORE_PASSWORD'; // used for both store & key (PKCS12 single-passphrase)
const KEY_PASSWORD = 'YOUR_KEY_PASSWORD'; // PKCS12 uses a single password; KEY_PASSWORD is ignored by most tools but kept for parity
const ALIAS = 'scrollix';
const OUTPUT_FILE = 'release-keystore.jks'; // .jks extension kept for workflow compatibility
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
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

console.log('📦 Assembling PKCS12 bundle...');

// ── localKeyId: ties the private key bag to the certificate bag ──────────────
// Java's PKCS12KeyStore REQUIRES matching localKeyId on both bags to correctly
// resolve the alias → private key mapping. Without this, jarsigner sees the
// alias but cannot retrieve the private key and throws "not a private key".
const localKeyId = forge.util.hexToBytes('01'); // any consistent non-empty value

// ── Safe bag 1: encrypted private key (shroudedKeyBag) ───────────────────────
// aes256 = PBES2 + AES-256-CBC, which Java 11+ (including 21) reads correctly.
// '3des' uses a node-forge-specific PBE scheme that diverges from Java's strict
// PKCS#5 v2 parser and causes BadPaddingException on decryption.
const keyBag = forge.pkcs12.generateKey(STORE_PASSWORD, '', 1, 2048, 1, forge.md.sha256.create());
const shroudedKeyBag = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey));
const encryptedKeyBag = forge.pkcs12.createPfx(
  forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, []),
  null,
  null,
).safeContents; // not used — we build manually below

// Build bags manually for full control over localKeyId attributes
const p12 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  cert, // single cert, not array — triggers correct localKeyId linking in forge ≥1.3
  STORE_PASSWORD,
  {
    algorithm: 'aes256', // PBES2/AES-256 — Java 11+ compatible; avoids 3DES PBE mismatch
    friendlyName: ALIAS,
    generateLocalKeyId: true, // explicitly request localKeyId generation on both bags
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
console.log();
console.log('Next step — encode for GitHub secret:');
console.log(`  base64 -w 0 ${OUTPUT_FILE} > keystore.b64.txt`);
