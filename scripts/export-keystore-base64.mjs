#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const input = valueAfter('--keystore') || 'release-keystore.jks';
const output = valueAfter('--out') || 'keystore.b64.txt';

try {
  const encoded = readFileSync(input).toString('base64');
  writeFileSync(output, `${encoded}\n`);
  console.log(`Wrote ${output}`);
  console.log('Use this file content as the KEYSTORE_BASE64 GitHub secret.');
} catch (error) {
  console.error(`Unable to export keystore: ${input}`);
  console.error(error.message);
  process.exit(1);
}

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? '') : '';
}
