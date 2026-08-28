#!/usr/bin/env node
// Vendor patch-tracking tool for vendor/pi.
//
// vendor/pi carries local modifications but has no upstream git metadata, so we
// track a content baseline instead: a SHA-256 manifest of every tracked file.
// Any future edit to vendored code is surfaced by `node scripts/vendor-pi.cjs check`.
//
// Usage:
//   node scripts/vendor-pi.cjs generate   # (re)baseline the manifest
//   node scripts/vendor-pi.cjs check      # exit 1 when vendored files drifted

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'pi');
const MANIFEST = path.join(VENDOR, 'manifest.json');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
const SKIP_FILES = new Set(['manifest.json']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (!SKIP_FILES.has(entry.name)) out.push(full);
  }
  return out;
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function currentManifest() {
  const files = {};
  for (const f of walk(VENDOR)) {
    files[path.relative(VENDOR, f).split(path.sep).join('/')] = hash(f);
  }
  return files;
}

const mode = process.argv[2] || 'check';

if (mode === 'generate') {
  const files = currentManifest();
  fs.writeFileSync(MANIFEST, JSON.stringify({
    _comment: 'Baseline SHA-256 manifest of vendored pi sources. Regenerate ONLY when intentionally absorbing upstream changes: node scripts/vendor-pi.cjs generate',
    generatedAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    files
  }, null, 2));
  console.log(`manifest written: ${Object.keys(files).length} files`);
  process.exit(0);
}

if (mode === 'check') {
  if (!fs.existsSync(MANIFEST)) {
    console.error('manifest missing — run: node scripts/vendor-pi.cjs generate');
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).files;
  const current = currentManifest();
  const modified = [], added = [], removed = [];
  for (const [f, h] of Object.entries(current)) {
    if (!(f in baseline)) added.push(f);
    else if (baseline[f] !== h) modified.push(f);
  }
  for (const f of Object.keys(baseline)) {
    if (!(f in current)) removed.push(f);
  }
  for (const [label, list] of [['MODIFIED', modified], ['ADDED', added], ['REMOVED', removed]]) {
    for (const f of list) console.log(`${label}: ${f}`);
  }
  if (modified.length || added.length || removed.length) {
    console.error(`\nvendor/pi drifted from baseline (${modified.length} modified, ${added.length} added, ${removed.length} removed).`);
    console.error('If intentional, re-baseline with: node scripts/vendor-pi.cjs generate');
    process.exit(1);
  }
  console.log(`vendor/pi matches baseline (${Object.keys(current).length} files).`);
  process.exit(0);
}

console.error('unknown mode:', mode);
process.exit(1);
