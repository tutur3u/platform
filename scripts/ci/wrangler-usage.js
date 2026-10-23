#!/usr/bin/env node
// Inventory of repository-owned Wrangler usage for the cf + Void migration.
// The guard test compares this scan with wrangler-usage-allowlist.json, which
// may only shrink. Run `node scripts/ci/wrangler-usage.js` for a report.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = 'scripts/ci/wrangler-usage-allowlist.json';
const WRANGLER_PATTERN = /wrangler/i;
// Executable usage: CLI subcommands, module imports and dependency entries.
// Counted separately so a mention cannot be swapped for an invocation.
const WRANGLER_USE_PATTERNS = [
  /\bwrangler\s+(?:ai|build|cert|check|containers|d1|delete|deploy|deployments|dev|dispatch-namespace|docs|hyperdrive|init|kv|login|logout|mtls-certificate|pages|pipelines|publish|queues|r2|rollback|secret|secrets-store|setup|tail|triggers|types|vectorize|versions|whoami|workflows)\b/i,
  /\bfrom\s+['"]wrangler(?:\/[^'"]*)?['"]|\b(?:require|import)\(\s*['"]wrangler(?:\/[^'"]*)?['"]\s*\)/,
  /["']wrangler["']\s*:\s*["'][^"']*\d/,
];

// Documentation explains the migration; lockfiles and generated references are
// owned by the package manager or generators, not authored Wrangler usage.
const EXCLUDED_PREFIXES = ['.agents/', 'apps/docs/', 'plugins/', 'tmp/'];
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
  if (EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) return false;
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

function countWranglerLines(content) {
  return countWranglerUsage(content).lines;
}

/** Count lines mentioning Wrangler and the subset that execute or depend on it. */
function countWranglerUsage(content) {
  let lines = 0;
  let uses = 0;
  for (const line of content.split('\n')) {
    if (!WRANGLER_PATTERN.test(line)) continue;
    lines += 1;
    if (WRANGLER_USE_PATTERNS.some((pattern) => pattern.test(line))) uses += 1;
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
    if (lines > 0) usage[file] = { kind: classify(file), lines, uses };
  }
  return usage;
}

function readAllowlist(repoRoot = REPO_ROOT) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, ALLOWLIST_PATH), 'utf8')
  );
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
};

if (require.main === module) main();
