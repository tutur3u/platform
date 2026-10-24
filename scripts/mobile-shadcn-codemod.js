#!/usr/bin/env node

// Mechanical shadcn_flutter -> core/ui renames for apps/mobile.
//
//   node scripts/mobile-shadcn-codemod.js [--dry-run] <file-or-dir>...
//
// Rewrites prefixed uses only:
//   <p>.Gap(                -> AppGap(
//   <p>.Theme.of(           -> AppTokens.of(
//   <p>.LucideIcons.<brand> -> AppIcons.<brand>   (marks missing upstream)
//   <p>.LucideIcons.<name>  -> LucideIcons.<name> (lucide_icons_flutter)
// adds `package:mobile/core/ui/ui.dart` to each touched library, and drops
// the shadcn import once neither the library nor its parts use the prefix.
// Run `dart format` and `flutter analyze` afterwards, then prune the ratchet:
// `node scripts/check-mobile-shadcn-imports.js --prune`.

const fs = require('node:fs');
const path = require('node:path');

const UI_IMPORT = "import 'package:mobile/core/ui/ui.dart';";
const SHADCN_URIS = [
  'package:shadcn_flutter/shadcn_flutter.dart',
  'package:mobile/core/widgets/shadcn_flutter_compat.dart',
];
const BRAND_ICONS = new Set([
  'codepen',
  'codesandbox',
  'dribbble',
  'facebook',
  'figma',
  'framer',
  'github',
  'gitlab',
  'instagram',
  'linkedin',
  'pocket',
  'railSymbol',
  'slack',
  'trello',
  'twitch',
  'twitter',
  'youtube',
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function shadcnPrefixes(source) {
  const prefixes = [];
  for (const match of source.matchAll(
    /^import\s+'([^']+)'\s+as\s+(\w+)\s*;/gmu
  )) {
    if (SHADCN_URIS.includes(match[1])) prefixes.push(match[2]);
  }
  return prefixes;
}

function rewriteUses(source, prefixes) {
  let next = source;
  for (const prefix of prefixes) {
    const p = escapeRegExp(prefix);
    next = next
      .replace(new RegExp(`\\b${p}\\.Gap\\(`, 'gu'), 'AppGap(')
      .replace(new RegExp(`\\b${p}\\.Theme\\.of\\(`, 'gu'), 'AppTokens.of(')
      .replace(new RegExp(`\\b${p}\\.LucideIcons\\.(\\w+)`, 'gu'), (_, name) =>
        BRAND_ICONS.has(name) ? `AppIcons.${name}` : `LucideIcons.${name}`
      );
  }
  return next;
}

function addUiImport(source) {
  if (source.includes(UI_IMPORT)) return source;
  const imports = [...source.matchAll(/^import\s+'([^']+)'.*;$/gmu)];
  const after = imports.filter(
    (match) => match[1] < 'package:mobile/core/ui/ui.dart'
  );
  const anchor = after.at(-1) ?? null;
  if (!anchor) return `${UI_IMPORT}\n${source}`;
  const end = anchor.index + anchor[0].length;
  return `${source.slice(0, end)}\n${UI_IMPORT}${source.slice(end)}`;
}

function usesPrefix(source, prefixes) {
  return prefixes.some((prefix) =>
    new RegExp(`\\b${escapeRegExp(prefix)}\\.`, 'u').test(
      source.replace(/^import .*$/gmu, '')
    )
  );
}

function dropShadcnImports(source) {
  return source.replace(
    /^import\s+'([^']+)'\s+as\s+\w+\s*;\n/gmu,
    (line, uri) => (SHADCN_URIS.includes(uri) ? '' : line)
  );
}

// `package:mobile/x.dart` resolves against the app's lib/ directory.
function resolveUri(file, uri) {
  if (!uri.startsWith('package:mobile/')) {
    return path.resolve(path.dirname(file), uri);
  }
  const marker = file.match(/^(.*)[/\\](lib|test)[/\\]/u);
  const appRoot = marker ? marker[1] : path.dirname(file);
  return path.join(appRoot, 'lib', uri.slice('package:mobile/'.length));
}

function partsOf(file, source) {
  return [...source.matchAll(/^part\s+'([^']+)'\s*;/gmu)].map((match) =>
    resolveUri(file, match[1])
  );
}

function libraryOf(file, source) {
  const match = source.match(/^part\s+of\s+'([^']+)'\s*;/mu);
  return match ? resolveUri(file, match[1]) : file;
}

function collect(target, output = new Set()) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      collect(path.join(target, entry), output);
    }
  } else if (target.endsWith('.dart') && !target.includes('/l10n/gen/')) {
    output.add(path.resolve(target));
  }
  return output;
}

/** Applies the codemod to whole libraries; returns changed file contents. */
function codemod(files, read = (file) => fs.readFileSync(file, 'utf8')) {
  const libraries = new Set(
    [...files].map((file) => libraryOf(file, read(file)))
  );
  const changes = new Map();
  for (const library of libraries) {
    const librarySource = read(library);
    const prefixes = shadcnPrefixes(librarySource);
    if (prefixes.length === 0) continue;
    const members = [library, ...partsOf(library, librarySource)];
    const rewritten = new Map(
      members.map((file) => [file, rewriteUses(read(file), prefixes)])
    );
    let libraryNext = rewritten.get(library);
    const touched = members.some((file) => rewritten.get(file) !== read(file));
    if (!touched) continue;
    libraryNext = addUiImport(libraryNext);
    if (![...rewritten.values()].some((src) => usesPrefix(src, prefixes))) {
      libraryNext = dropShadcnImports(libraryNext);
    }
    rewritten.set(library, libraryNext);
    for (const [file, next] of rewritten) {
      if (next !== read(file)) changes.set(file, next);
    }
  }
  return changes;
}

function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const targets = argv.filter((arg) => !arg.startsWith('--'));
  if (targets.length === 0) {
    console.error('Usage: mobile-shadcn-codemod.js [--dry-run] <path>...');
    return 2;
  }
  const files = new Set();
  for (const target of targets) collect(target, files);
  const changes = codemod(files);
  for (const [file, next] of changes) {
    if (!dryRun) fs.writeFileSync(file, next);
    console.log(`${dryRun ? 'would update' : 'updated'} ${file}`);
  }
  console.log(`${changes.size} file(s) ${dryRun ? 'to change' : 'changed'}.`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { addUiImport, codemod, rewriteUses, shadcnPrefixes };
