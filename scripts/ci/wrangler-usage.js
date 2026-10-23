#!/usr/bin/env node
// Inventory of repository-owned Wrangler usage for the cf + Void migration.
// The guard test compares this scan with wrangler-usage-allowlist.json, which
// may only shrink. Run `node scripts/ci/wrangler-usage.js` for a report.

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = 'scripts/ci/wrangler-usage-allowlist.json';
const WRANGLER_PATTERN = /wrangler/i;

// Documentation explains the migration; lockfiles and generated references are
// owned by the package manager or generators, not authored Wrangler usage.
const EXCLUDED_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'bun.lock',
  ALLOWLIST_PATH,
  'scripts/ci/wrangler-usage.js',
  'scripts/ci/wrangler-usage-guard.test.js',
]);
const EXCLUDED_EXTENSIONS = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.lock',
  '.md',
  '.mdx',
  '.png',
  '.svg',
  '.txt',
  '.webp',
  '.woff',
  '.woff2',
]);

function classify(file) {
  if (/(^|\/)wrangler[^/]*\.(?:json|jsonc|toml)$/.test(file)) return 'config';
  if (file.startsWith('.github/workflows/')) return 'workflow';
  if (file.endsWith('package.json')) return 'manifest';
  if (file.startsWith('scripts/') || /(^|\/)scripts\//.test(file))
    return 'script';
  return 'source';
}

function isScanned(file) {
  if (EXCLUDED_FILES.has(file)) return false;
  if (file.split('/').includes('node_modules')) return false;
  return !EXCLUDED_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function listTrackedFiles(repoRoot = REPO_ROOT) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

function usageDigest(content, config = false) {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => config || WRANGLER_PATTERN.test(line))
    .map((line) => line.trim());
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

function countWranglerLines(content) {
  return countWranglerUsage(content).lines;
}

/**
 * Count mention lines and every case-insensitive token occurrence, including
 * strings, identifiers and paths. Comments count conservatively too: across
 * shell/YAML/JS/Python, a comment-looking line can be multiline string content.
 * No command vocabulary or quoting style can turn an occurrence into zero uses.
 */
function countWranglerUsage(content) {
  let lines = 0;
  let uses = 0;
  for (const line of content.split('\n')) {
    if (!WRANGLER_PATTERN.test(line)) continue;
    lines += 1;
    uses += [...line.matchAll(/wrangler/gi)].length;
  }
  return { lines, uses };
}

/** Return `{ [file]: { kind, lines, uses } }` for tracked files mentioning Wrangler. */
function scanWranglerUsage({
  repoRoot = REPO_ROOT,
  files = listTrackedFiles(repoRoot),
  readFile = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'),
} = {}) {
  const usage = {};
  for (const file of [...files].sort()) {
    if (!isScanned(file)) continue;
    // Configuration file names are usage even when their content is not.
    const isConfig = classify(file) === 'config';
    let content;
    try {
      content = readFile(file);
    } catch (error) {
      // Deleted paths and gitlinks (submodules) are not current file usage.
      if (error?.code === 'ENOENT' || error?.code === 'EISDIR') continue;
      throw error;
    }
    const counted = countWranglerUsage(content);
    // A Wrangler configuration file is itself one executable use.
    const lines = counted.lines + (isConfig ? 1 : 0);
    const uses = counted.uses + (isConfig ? 1 : 0);
    if (lines > 0)
      usage[file] = {
        kind: classify(file),
        lines,
        uses,
        digest: usageDigest(content, isConfig),
      };
  }
  return usage;
}

function readAllowlist(repoRoot = REPO_ROOT) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, ALLOWLIST_PATH), 'utf8')
  );
}

function validAdmission(admitted) {
  return (
    admitted !== null &&
    typeof admitted === 'object' &&
    !Array.isArray(admitted) &&
    isDeepStrictEqual(Object.keys(admitted).sort(), ['decision', 'reason']) &&
    typeof admitted.decision === 'string' &&
    /^https:\/\/github\.com\/tutur3u\/platform\/pull\/[1-9]\d*$/.test(
      admitted.decision
    ) &&
    typeof admitted.reason === 'string' &&
    admitted.reason.trim().length > 0
  );
}

/** Pure transition check; equal structured admissions never authorize growth. */
function validateAllowlistTransition(previous, current) {
  const problems = [];
  for (const [file, entry] of Object.entries(current.files)) {
    const admissionValid = validAdmission(entry.admitted);
    if (entry.admitted !== undefined && !admissionValid)
      problems.push(
        `${file}: admitted needs a repository PR decision and reason`
      );
    if (!previous) continue;
    const before = previous.files[file];
    const changes = [];
    if (!before) changes.push('new allowlist entry');
    else {
      for (const count of ['lines', 'uses'])
        if (entry[count] > (before[count] ?? 0))
          changes.push(
            `${count} allowance grew ${before[count] ?? 0} -> ${entry[count]}`
          );
      if (entry.digest !== before.digest)
        changes.push('Wrangler lines changed');
      if (
        entry.gap !== before.gap ||
        !isDeepStrictEqual(current.gaps[entry.gap], previous.gaps[before.gap])
      )
        changes.push('gap changed');
    }
    if (
      changes.length &&
      (!admissionValid || isDeepStrictEqual(entry.admitted, before?.admitted))
    )
      problems.push(
        `${file}: ${changes.join('; ')} needs a fresh admitted decision and reason`
      );
  }
  return problems;
}

function main() {
  const usage = scanWranglerUsage();
  const byKind = {};
  for (const [file, { kind, lines, uses }] of Object.entries(usage)) {
    byKind[kind] ??= [];
    byKind[kind].push(
      `${String(lines).padStart(4)} ${String(uses).padStart(4)}  ${file}`
    );
  }
  for (const [kind, rows] of Object.entries(byKind).sort()) {
    console.log(`\n## ${kind} (${rows.length} files; lines, uses)`);
    for (const row of rows) console.log(row);
  }
}

module.exports = {
  ALLOWLIST_PATH,
  REPO_ROOT,
  classify,
  countWranglerLines,
  countWranglerUsage,
  isScanned,
  readAllowlist,
  scanWranglerUsage,
  validateAllowlistTransition,
  usageDigest,
};

if (require.main === module) main();
