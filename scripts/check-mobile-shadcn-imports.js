#!/usr/bin/env node

// Ratchet for the mobile shadcn_flutter migration.
//
// Every Dart file under apps/mobile/{lib,test} that imports shadcn_flutter
// (directly or through the in-repo shims) must be listed in the allowlist.
// New imports fail; allowlisted files that no longer import it also fail, and
// entries absent from the base revision's allowlist fail (`--base <rev>` or
// the merge base with origin/main), so the list can
// only shrink. Every URI of every import/export directive is checked,
// including conditional alternatives and relative shim paths. `--prune`
// rewrites the list to the current subset (it never adds entries). See
// apps/docs/build/development-tools/mobile-shadcn-migration.mdx.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { UNDECODABLE_URI, directiveUris } = require('./dart-directive-uris.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_DIR = 'apps/mobile';
const SCAN_DIRS = ['lib', 'test'];
const EXCLUDED = [/^lib\/l10n\/gen\//u];
const ALLOWLIST = 'apps/mobile/tool/shadcn_import_allowlist.txt';
const PUBSPEC = 'apps/mobile/pubspec.yaml';

// The shims wrap or re-export shadcn_flutter; importing them is equivalent.
// Paths are relative to apps/mobile.
const SHIM_FILES = new Set([
  'lib/core/widgets/shadcn_flutter_compat.dart',
  'lib/core/widgets/shadcn_material_bridge.dart',
  'lib/core/widgets/shadcn_localizations_fallback.dart',
  'lib/core/theme/mobile_shad_theme.dart',
]);

/** Resolves a URI to an apps/mobile-relative path, or null if external. */
function resolveUri(uri, fromFile) {
  if (uri.startsWith('package:mobile/')) {
    // Normalise `./` and `../` segments inside package paths too.
    return path.posix.normalize(`lib/${uri.slice('package:mobile/'.length)}`);
  }
  if (/^[a-z][a-z0-9+.-]*:/u.test(uri) || fromFile == null) return null;
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(fromFile), uri)
  );
}

/**
 * Whether [source] (the apps/mobile-relative [file]) imports or exports
 * shadcn_flutter or one of its shims through any directive URI.
 */
function importsShadcn(source, file = null) {
  return directiveUris(source).some((uri) => {
    // Fail closed on a URI with no static value.
    if (uri === UNDECODABLE_URI) return true;
    if (/^package:shadcn_flutter(\/|$)/u.test(uri)) return true;
    const resolved = resolveUri(uri, file);
    return resolved != null && SHIM_FILES.has(resolved);
  });
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
      if (importsShadcn(fs.readFileSync(file, 'utf8'), relative)) {
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

function validate({ importers, allowlist, pubspec, baseAllowlist = null }) {
  const errors = [];
  // Shrink-only: nothing may be added relative to the base revision.
  const grown =
    baseAllowlist == null
      ? []
      : allowlist.filter((entry) => !baseAllowlist.includes(entry));
  for (const entry of grown) {
    errors.push(
      `${entry} was added to the allowlist; the list may only shrink. Migrate the file to package:mobile/core/ui/ui.dart instead.`
    );
  }
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
  return { errors, added, stale, grown };
}

/**
 * The allowlist at [base] (a git revision). Returns null when the base has
 * no allowlist yet (the ratchet's first introduction) and throws when the
 * revision itself cannot be read, so a missing base never passes silently.
 */
function readBaseAllowlist(
  base,
  { rootDir = ROOT_DIR, run = execFileSync } = {}
) {
  const git = (...args) =>
    run('git', args, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe' });
  git('rev-parse', '--verify', `${base}^{commit}`);
  try {
    return parseAllowlist(git('show', `${base}:${ALLOWLIST}`));
  } catch {
    return null;
  }
}

function defaultBase({ rootDir = ROOT_DIR, run = execFileSync } = {}) {
  try {
    return run('git', ['merge-base', 'HEAD', 'origin/main'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return null;
  }
}

function main(argv = process.argv.slice(2), { rootDir = ROOT_DIR } = {}) {
  const allowlistPath = path.join(rootDir, ALLOWLIST);
  const importers = collectShadcnImporters({ rootDir });
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
  const pubspec = fs.readFileSync(path.join(rootDir, PUBSPEC), 'utf8');
  const baseFlag = argv.indexOf('--base');
  if (baseFlag >= 0 && !argv[baseFlag + 1]) {
    console.error('shadcn_flutter ratchet: --base needs a revision.');
    return 1;
  }
  const base = baseFlag >= 0 ? argv[baseFlag + 1] : defaultBase({ rootDir });
  let baseAllowlist = null;
  if (base) {
    try {
      baseAllowlist = readBaseAllowlist(base, { rootDir });
    } catch {
      console.error(`Cannot read base revision ${base} for the shrink check.`);
      return 1;
    }
  } else {
    // Fail closed: without a base the shrink-only rule cannot be enforced.
    console.error(
      'shadcn_flutter ratchet: cannot determine the base revision for the shrink-only check. Pass --base <rev> (for example `git fetch origin main` then `--base FETCH_HEAD`), or make origin/main available so its merge base resolves.'
    );
    return 1;
  }
  const { errors } = validate({ importers, allowlist, pubspec, baseAllowlist });
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
  main,
  parseAllowlist,
  readBaseAllowlist,
  validate,
};
