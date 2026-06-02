#!/usr/bin/env node
/**
 * bump-android-version.js
 *
 * Reads android-version.json, increments versionCode by 1,
 * optionally bumps versionName (semver patch), and writes back.
 *
 * Usage:
 *   node scripts/bump-android-version.js          # bump versionCode only
 *   node scripts/bump-android-version.js --patch  # bump versionCode + patch of versionName
 *   node scripts/bump-android-version.js --minor  # bump versionCode + minor of versionName
 *   node scripts/bump-android-version.js --major  # bump versionCode + major of versionName
 */

const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '..', 'android-version.json');

// Create file with defaults if missing
if (!fs.existsSync(VERSION_FILE)) {
  fs.writeFileSync(
    VERSION_FILE,
    JSON.stringify({ versionCode: 1, versionName: '1.0.0' }, null, 2) + '\n',
  );
  console.log('Created android-version.json with defaults.');
}

const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
const arg = process.argv[2];

// Always increment versionCode
data.versionCode = (data.versionCode ?? 0) + 1;

// Optionally bump semver versionName
if (arg === '--patch' || arg === '--minor' || arg === '--major') {
  const [major, minor, patch] = (data.versionName ?? '1.0.0').split('.').map(Number);
  if (arg === '--patch') data.versionName = `${major}.${minor}.${patch + 1}`;
  if (arg === '--minor') data.versionName = `${major}.${minor + 1}.0`;
  if (arg === '--major') data.versionName = `${major + 1}.0.0`;
}

fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`✅ versionCode: ${data.versionCode}  versionName: ${data.versionName}`);
