#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const file = process.argv[2];

if (!file) {
  console.error('Usage: node detect-keystore-format.mjs <keystore>');
  process.exit(1);
}

if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

function isPkcs12() {
  try {
    execSync(`openssl pkcs12 -info -in "${file}" -passin pass:dummy -noout`, { stdio: 'pipe' });

    return true;
  } catch (err) {
    const stderr = err.stderr?.toString() || '';

    // Wrong password but valid PKCS12
    if (stderr.includes('Mac verify error') || stderr.includes('invalid password')) {
      return true;
    }

    return false;
  }
}

console.log(`Keystore type: ${isPkcs12() ? 'PKCS12' : 'JKS (or unknown)'}`);
