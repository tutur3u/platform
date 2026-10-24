#!/usr/bin/env node

// Fails when the web's lucide-react or @lucide/lab (resolved in bun.lock)
// changes without regenerating the mobile icon fonts and Dart classes, or
// when a generated file was edited by hand. See
// apps/docs/build/development-tools/mobile-design-system.mdx#icons.

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { PACKAGES, lockEntry } = require('./mobile-lucide/sources.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE = 'apps/mobile';
const MANIFEST = `${MOBILE}/lib/core/ui/icons/generated/lucide_manifest.json`;
const REGENERATE =
  'Regenerate on a remote lane: cd scripts/mobile-lucide && npm ci && node generate.mjs --repo ../..';

function validate({ lockText, manifest, readFile }) {
  const errors = [];
  for (const [kind, spec] of Object.entries(PACKAGES)) {
    const entry = lockEntry(lockText, spec.name);
    const set = manifest.sets?.[kind];
    if (!entry) {
      errors.push(`${spec.name} is missing from bun.lock.`);
    } else if (!set) {
      errors.push(`The icon manifest has no ${kind} set for ${spec.name}.`);
    } else if (
      set.version !== entry.version ||
      set.integrity !== entry.integrity
    ) {
      errors.push(
        `Web uses ${spec.name}@${entry.version} but mobile icons were generated from ${set.version}.`
      );
    }
  }
  for (const [file, expected] of Object.entries(manifest.files ?? {})) {
    const data = readFile(file);
    if (data == null) {
      errors.push(`Generated file ${file} is missing.`);
    } else if (createHash('sha256').update(data).digest('hex') !== expected) {
      errors.push(`Generated file ${file} differs from the manifest.`);
    }
  }
  return errors;
}

function main({ rootDir = ROOT_DIR } = {}) {
  const lockText = fs.readFileSync(path.join(rootDir, 'bun.lock'), 'utf8');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, MANIFEST), 'utf8')
  );
  const readFile = (file) => {
    const full = path.join(rootDir, MOBILE, file);
    return fs.existsSync(full) ? fs.readFileSync(full) : null;
  };
  const errors = validate({ lockText, manifest, readFile });
  if (errors.length > 0) {
    console.error('Mobile Lucide icons are out of sync with the web:');
    for (const error of errors) console.error(`- ${error}`);
    console.error(REGENERATE);
    return 1;
  }
  console.log(
    `Mobile Lucide icons match the web: lucide-react ${manifest.sets.base.version} (${manifest.sets.base.icons} icons), @lucide/lab ${manifest.sets.lab.version} (${manifest.sets.lab.icons} icons).`
  );
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { main, validate };
