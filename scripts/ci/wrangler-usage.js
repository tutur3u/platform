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

// Publish calls: Wrangler (and adapter) invocations that write to Cloudflare.
// Unlike the token allowlist, no admission can raise these counts; new
// publication uses cf (see cf-cli-wrangler-parity.mdx).
// Commands that print an invocation instead of running it.
const PRINTERS = new Set(['echo', 'printf']);
// Keep quoted shell arguments and argv string literals whole.
const ARGUMENT =
  /(?:'[^']*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[^\s'"`,[\](){}])+/gu;
const QUOTED_SCRIPT =
  /^(?:[\w$.]+=?|=)?('([^']*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/u;
const YAML_RUN = /^\s*(?:-\s+)?run:\s*(["'])(.*)\1\s*$/u;
const JSON_PROPERTY = /^\s*"(?:\\.|[^"\\])*":\s*("(?:\\.|[^"\\])*"),?\s*$/u;
const VALUE_FLAGS = new Set([
  '-c',
  '--config',
  '-e',
  '--env',
  '--name',
  '--cwd',
  '--script-name',
  '--message',
  '--tag',
]);
const PUBLISH_COMMANDS = [
  ['deploy'],
  ['publish'],
  ['rollback'],
  ['versions', 'upload'],
  ['versions', 'deploy'],
  ['versions', 'secret', 'put'],
  ['versions', 'secret', 'bulk'],
  ['versions', 'secret', 'delete'],
  ['secret', 'put'],
  ['secret', 'bulk'],
  ['secret', 'delete'],
  ['triggers', 'deploy'],
  ['d1', 'migrations', 'apply'],
  ['d1', 'execute'],
  ['r2', 'object', 'put'],
  ['r2', 'object', 'delete'],
  ['kv', 'key', 'put'],
  ['kv', 'key', 'delete'],
  ['kv', 'bulk', 'put'],
  ['kv', 'bulk', 'delete'],
  ['pages', 'deploy'],
  ['pages', 'publish'],
];
const ADAPTER_PUBLISH = new Set(['deploy', 'upload']);

function isWranglerToken(token) {
  return /(?:^|\/)wrangler(?:@[^/]*)?(?:\.js)?$/iu.test(token);
}

function isAdapterToken(token) {
  return /(?:^|\/)opennextjs-cloudflare(?:@[^/]*)?$/u.test(token);
}

/**
 * Join continued lines (shell `\` and open argv brackets) and split each
 * logical line into invocations at shell separators.
 */
function invocations(content) {
  const logical = [];
  let current = '';
  let depth = 0;
  for (const line of content.split(/\r?\n/u)) {
    const continued = /\\\s*$/u.test(line);
    current += ` ${continued ? line.replace(/\\\s*$/u, '') : line}`;
    depth += (line.match(/[[(]/gu) ?? []).length;
    depth -= (line.match(/[\])]/gu) ?? []).length;
    depth = Math.max(depth, 0);
    if (continued || depth > 0) continue;
    logical.push(current);
    current = '';
  }
  if (current) logical.push(current);
  return logical.flatMap((line) => tokenizedCommands(unwrapScript(line)));
}

/** Inspect embedded shell scripts, keeping the values of publisher flags whole. */
function tokenizedCommands(line) {
  const commands = [];
  for (const part of splitCommands(line)) {
    const words = [];
    let seenPublisher = false;
    for (const argument of part.match(ARGUMENT) ?? []) {
      const quoted = QUOTED_SCRIPT.exec(argument);
      const script = quoted?.[2] ?? quoted?.[3] ?? quoted?.[4];
      const word = quoted?.[1] === argument ? script : argument;
      const flagValue = seenPublisher && VALUE_FLAGS.has(words.at(-1));
      if (
        script &&
        !flagValue &&
        /\s/u.test(script) &&
        /wrangler|opennextjs-cloudflare/iu.test(script) &&
        !words.some((token) => PRINTERS.has(token))
      )
        commands.push(...tokenizedCommands(script));
      if (!flagValue && (isWranglerToken(word) || isAdapterToken(word)))
        seenPublisher = true;
      words.push(word);
    }
    commands.push(words);
  }
  return commands;
}

function unwrapScript(line) {
  const property = JSON_PROPERTY.exec(line);
  const yaml = YAML_RUN.exec(line);
  if (yaml?.[1] === "'") return yaml[2].replaceAll("''", "'");
  const json = property?.[1] ?? (yaml ? `"${yaml[2]}"` : null);
  if (!json) return line;
  try {
    return JSON.parse(json);
  } catch {
    return yaml?.[2] ?? line;
  }
}

/** Split at `&&`, `||`, `;`, `|` and `&` outside single, double or back quotes. */
function splitCommands(line) {
  const parts = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote && line[index - 1] !== '\\') quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ';' || char === '|' || char === '&') {
      parts.push(current);
      current = '';
      if (line[index + 1] === char) index += 1;
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function commandWords(tokens) {
  const words = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (isWranglerToken(token) || isAdapterToken(token)) break;
    if (token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) index += 1;
      continue;
    }
    words.push(token);
  }
  return words;
}

/** Count non-dry-run Wrangler and OpenNext publish invocations. */
function countPublishCalls(content) {
  if (!/wrangler|opennextjs-cloudflare/iu.test(content)) return 0;
  let calls = 0;
  for (const tokens of invocations(content)) {
    for (let index = 0; index < tokens.length; index += 1) {
      const wrangler = isWranglerToken(tokens[index]);
      if (!wrangler && !isAdapterToken(tokens[index])) continue;
      const end = tokens.findIndex(
        (token, at) =>
          at > index && (isWranglerToken(token) || isAdapterToken(token))
      );
      if (tokens.slice(0, index).some((token) => PRINTERS.has(token))) continue;
      const rest = tokens.slice(index + 1, end === -1 ? undefined : end);
      const words = commandWords(rest);
      // Flag values (for example a `--message` text) are never flags.
      const flags = new Set(
        rest.filter(
          (token, at) =>
            token.startsWith('-') && !VALUE_FLAGS.has(rest[at - 1] ?? '')
        )
      );
      if (flags.has('--dry-run') || flags.has('--local')) continue;
      const publishes = wrangler
        ? PUBLISH_COMMANDS.some((command) =>
            command.every((word, at) => words[at] === word)
          )
        : ADAPTER_PUBLISH.has(words[0]);
      if (publishes) calls += 1;
    }
  }
  return calls;
}

/**
 * Tests and fixtures quote commands as data; the token allowlist still covers
 * them. Executable sources, workflows, manifests and scripts are scanned.
 */
function isPublishExempt(file) {
  return (
    /\.test\.[cm]?[jt]sx?$|\.test\.py$|\.runtime\.mjs$/u.test(file) ||
    file.split('/').includes('fixtures')
  );
}

function manifestScripts(file, content) {
  if (file !== 'package.json' && !file.endsWith('/package.json'))
    return content;
  try {
    return Object.values(JSON.parse(content).scripts ?? {}).join('\n');
  } catch {
    return content;
  }
}

/** Return `{ [file]: count }` for scanned files with publish calls. */
function scanPublishCalls({
  repoRoot = REPO_ROOT,
  files = listTrackedFiles(repoRoot),
  readFile = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'),
} = {}) {
  const calls = {};
  for (const file of [...files].sort()) {
    if (!isScanned(file) || isPublishExempt(file)) continue;
    let content;
    try {
      content = readFile(file);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EISDIR') continue;
      throw error;
    }
    const count = countPublishCalls(manifestScripts(file, content));
    if (count > 0) calls[file] = count;
  }
  return calls;
}

/**
 * Publish calls in a base revision's tracked files, for a base allowlist that
 * predates `publishCalls`.
 */
function scanPublishCallsAt(ref, repoRoot = REPO_ROOT) {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  let files = [];
  try {
    files = git([
      'grep',
      '-l',
      '-i',
      '-E',
      'wrangler|opennextjs-cloudflare',
      ref,
      '--',
      '.',
    ])
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(ref.length + 1));
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if (error?.status !== 1) throw error;
  }
  return scanPublishCalls({
    repoRoot,
    files,
    readFile: (file) => git(['show', `${ref}:${file}`]),
  });
}

/** Publish calls may only fall; admission never authorizes growth. */
function validatePublishTransition(previous, current) {
  if (!previous?.publishCalls) return [];
  const problems = [];
  for (const [file, count] of Object.entries(current.publishCalls ?? {})) {
    const before = previous.publishCalls[file] ?? 0;
    if (count > before)
      problems.push(
        `${file}: Wrangler publish calls grew ${before} -> ${count}; publish with cf instead`
      );
  }
  return problems;
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
    // D353: direct ff-only main pushes have no PR, so a full 40-hex commit URL
    // on this repository is an equally durable decision reference.
    (/^https:\/\/github\.com\/tutur3u\/platform\/pull\/[1-9]\d*$/.test(
      admitted.decision
    ) ||
      /^https:\/\/github\.com\/tutur3u\/platform\/commit\/[0-9a-f]{40}$/.test(
        admitted.decision
      )) &&
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
        `${file}: admitted needs a repository PR or commit decision and reason`
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
  console.log('## publish calls (non-dry-run)');
  for (const [file, count] of Object.entries(scanPublishCalls()))
    console.log(`${String(count).padStart(4)}  ${file}`);
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
  countPublishCalls,
  countWranglerLines,
  countWranglerUsage,
  isScanned,
  readAllowlist,
  scanPublishCalls,
  scanPublishCallsAt,
  scanWranglerUsage,
  validateAllowlistTransition,
  validatePublishTransition,
  usageDigest,
};

if (require.main === module) main();
