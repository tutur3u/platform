#!/usr/bin/env node

// Ratchet for the mobile shadcn_flutter migration.
//
// Every Dart file under apps/mobile/{lib,test} that imports shadcn_flutter
// (directly or through the in-repo shims) must be listed in the allowlist.
// New imports fail; allowlisted files that no longer import it also fail, so
// the list can only shrink. `--prune` rewrites the list to the current subset
// (it never adds entries). See
// apps/docs/build/development-tools/mobile-shadcn-migration.mdx.

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_DIR = 'apps/mobile';
const SCAN_DIRS = ['lib', 'test'];
const EXCLUDED = [/^lib\/l10n\/gen\//u];
const ALLOWLIST = 'apps/mobile/tool/shadcn_import_allowlist.txt';
const PUBSPEC = 'apps/mobile/pubspec.yaml';

// The shims wrap or re-export shadcn_flutter; importing them is equivalent.
const SHIM_IMPORTS = [
  'package:mobile/core/widgets/shadcn_flutter_compat.dart',
  'package:mobile/core/widgets/shadcn_material_bridge.dart',
  'package:mobile/core/widgets/shadcn_localizations_fallback.dart',
  'package:mobile/core/theme/mobile_shad_theme.dart',
];

const DIRECTIVE = /^\s*(?:import|export)\s+['"]([^'"]+)['"]/gmu;

function importsShadcn(source) {
  for (const match of source.matchAll(DIRECTIVE)) {
    const uri = match[1];
    if (uri.startsWith('package:shadcn_flutter/')) return true;
    if (SHIM_IMPORTS.includes(uri)) return true;
  }
  return false;
}

function walk(directory, output) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(entryPath, output);
    else if (entry.name.endsWith('.dart')) output.push(entryPath);
  }
  return output;
}

function collectShadcnImporters({ rootDir = ROOT_DIR } = {}) {
  const mobileDir = path.join(rootDir, MOBILE_DIR);
  const importers = [];
  for (const scan of SCAN_DIRS) {
    for (const file of walk(path.join(mobileDir, scan), [])) {
      const relative = path.relative(mobileDir, file).split(path.sep).join('/');
      if (EXCLUDED.some((pattern) => pattern.test(relative))) continue;
      if (importsShadcn(fs.readFileSync(file, 'utf8'))) {
        importers.push(relative);
      }
    }
  }
  return importers.sort();
}

function parseAllowlist(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function formatAllowlist(entries) {
  return [
    '# Files still allowed to import shadcn_flutter (directly or via shims).',
    '# This list may only shrink. Remove a path once its file is migrated;',
    '# `node scripts/check-mobile-shadcn-imports.js --prune` does it for you.',
    ...entries,
    '',
  ].join('\n');
}

function validate({ importers, allowlist, pubspec }) {
  const errors = [];
  const allowed = new Set(allowlist);
  const sorted = [...allowlist].sort();
  if (allowlist.some((entry, index) => entry !== sorted[index])) {
    errors.push('Allowlist entries must be sorted.');
  }
  if (allowed.size !== allowlist.length) {
    errors.push('Allowlist entries must be unique.');
  }
  const current = new Set(importers);
  const added = importers.filter((file) => !allowed.has(file));
  const stale = allowlist.filter((file) => !current.has(file));
  for (const file of added) {
    errors.push(
      `${file} imports shadcn_flutter; use package:mobile/core/ui/ui.dart instead.`
    );
  }
  for (const file of stale) {
    errors.push(
      `${file} no longer imports shadcn_flutter; remove it from the allowlist.`
    );
  }
  if (allowlist.length === 0 && /^\s+shadcn_flutter:/mu.test(pubspec ?? '')) {
    errors.push(
      'No file imports shadcn_flutter; remove it with `flutter pub remove shadcn_flutter`.'
    );
  }
  return { errors, added, stale };
}

function main(argv = process.argv.slice(2)) {
  const allowlistPath = path.join(ROOT_DIR, ALLOWLIST);
  const importers = collectShadcnImporters();
  const allowlist = fs.existsSync(allowlistPath)
    ? parseAllowlist(fs.readFileSync(allowlistPath, 'utf8'))
    : [];
  if (argv.includes('--prune')) {
    const current = new Set(importers);
    const pruned = allowlist.filter((file) => current.has(file)).sort();
    fs.writeFileSync(allowlistPath, formatAllowlist([...new Set(pruned)]));
    console.log(
      `Pruned shadcn allowlist: ${allowlist.length} -> ${pruned.length}.`
    );
    return 0;
  }
  const pubspec = fs.readFileSync(path.join(ROOT_DIR, PUBSPEC), 'utf8');
  const { errors } = validate({ importers, allowlist, pubspec });
  if (errors.length > 0) {
    console.error('Mobile shadcn_flutter ratchet failed:');
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(
    `shadcn_flutter ratchet: ${importers.length} allowlisted importers remain.`
  );
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  ALLOWLIST,
  collectShadcnImporters,
  formatAllowlist,
  importsShadcn,
  parseAllowlist,
  validate,
};
