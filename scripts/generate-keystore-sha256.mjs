#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as readline from 'node:readline/promises';

const DEFAULT_KEYSTORE = 'release-keystore.jks';
const DEFAULT_ALIAS = 'scrollix';

const keystore = valueAfter('--keystore') || DEFAULT_KEYSTORE;
const alias = valueAfter('--alias') || DEFAULT_ALIAS;

if (!existsSync(keystore)) {
  console.error(`Keystore not found: ${keystore}`);
  process.exit(1);
}

const password = await resolvePassword();
const output = runKeytool();
const fingerprint = output.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1]?.toUpperCase() ?? '';

if (!fingerprint) {
  console.error('Unable to find SHA256 fingerprint in keytool output.');
  process.exit(1);
}

console.log('\nSHA-256 certificate fingerprint:');
console.log(fingerprint);
console.log('\nUse this as the GitHub secret value:');
console.log('SHA256_FINGERPRINT');

function runKeytool() {
  try {
    return execFileSync(
      'keytool',
      [
        '-list',
        '-v',
        '-keystore',
        keystore,
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
  } catch (error) {
    const stderr = error.stderr?.toString?.() ?? '';
    console.error('Unable to read keystore fingerprint.');
    if (stderr.trim()) console.error(stderr.trim());
    process.exit(1);
  }
}

async function resolvePassword() {
  const passwordArg = valueAfter('--password');
  if (passwordArg) {
    console.log('Password source: --password argument');
    return passwordArg;
  }

  if (process.env.KEYSTORE_PASSWORD) {
    console.log('Password source: KEYSTORE_PASSWORD env var');
    return process.env.KEYSTORE_PASSWORD;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl._writeToOutput = (value) => {
    if (!value.trim() || value.endsWith(': ')) {
      rl.output.write(value);
    }
  };

  console.log('Password source: interactive prompt');
  const prompted = await rl.question('Enter keystore password: ');
  rl.output.write('\n');
  rl.close();

  if (!prompted) {
    console.error('Password cannot be empty.');
    process.exit(1);
  }
  return prompted;
}

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? '') : '';
}
