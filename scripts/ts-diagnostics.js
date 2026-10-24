// Shared helpers for running a TypeScript checker (tsc, tsgo or tsrs) without
// emitting, parsing its --pretty false output and comparing diagnostic sets.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// No emit and no incremental state, so runs never write build info or output.
const CHECK_FLAGS = [
  '--noEmit',
  '--pretty',
  'false',
  '--incremental',
  'false',
  '--composite',
  'false',
];
const DIAGNOSTIC_LINE =
  /^(?<file>.+?)\((?<line>\d+),(?<column>\d+)\): (?<category>error|warning|message) TS(?<code>\d+): (?<message>.*)$/;
const GLOBAL_LINE =
  /^(?<category>error|warning|message) TS(?<code>\d+): (?<message>.*)$/;

// One diagnostic per line; indented continuation lines extend the previous
// message chain.
function parseDiagnostics(output) {
  const diagnostics = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) continue;
    const match = DIAGNOSTIC_LINE.exec(line) ?? GLOBAL_LINE.exec(line);
    if (match) {
      diagnostics.push({
        file: match.groups.file?.split(path.sep).join('/') ?? null,
        line: match.groups.line ? Number(match.groups.line) : null,
        column: match.groups.column ? Number(match.groups.column) : null,
        category: match.groups.category,
        code: Number(match.groups.code),
        message: match.groups.message,
      });
      continue;
    }
    const previous = diagnostics.at(-1);
    if (previous && /^\s/.test(rawLine)) {
      previous.message += `\n${line.trim()}`;
    }
  }
  return diagnostics;
}

// Keys reuse the checker's own line format so they stay parseable.
function diagnosticKey(diagnostic) {
  const location = diagnostic.file
    ? `${diagnostic.file}(${diagnostic.line},${diagnostic.column}): `
    : '';
  return `${location}${diagnostic.category} TS${diagnostic.code}: ${diagnostic.message}`;
}

// Location parity ignores message text, which differs when TypeScript versions
// print the same type differently.
function locationKey(diagnostic) {
  return `${diagnostic.file ?? ''}(${diagnostic.line},${diagnostic.column}) TS${diagnostic.code}`;
}

// Order-insensitive multiset comparison: membership and multiplicity only.
function compareDiagnostics(expected, actual, keyOf = diagnosticKey) {
  const counts = new Map();
  const byKey = new Map();
  for (const diagnostic of expected) {
    const key = keyOf(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    byKey.set(key, diagnostic);
  }
  const onlyActual = [];
  for (const diagnostic of actual) {
    const key = keyOf(diagnostic);
    const remaining = counts.get(key) ?? 0;
    if (remaining > 0) counts.set(key, remaining - 1);
    else onlyActual.push(diagnostic);
  }
  const onlyExpected = [];
  for (const [key, remaining] of counts) {
    for (let index = 0; index < remaining; index++) {
      onlyExpected.push(byKey.get(key));
    }
  }
  return {
    equal: onlyExpected.length === 0 && onlyActual.length === 0,
    onlyExpected,
    onlyActual,
  };
}

// BSD time (-l) reports bytes; GNU time (-v) reports kilobytes.
function parseMaxRssBytes(stderr) {
  const bsd = /^\s*(\d+)\s+maximum resident set size/m.exec(stderr);
  if (bsd) return Number(bsd[1]);
  const gnu = /Maximum resident set size \(kbytes\):\s*(\d+)/.exec(stderr);
  if (gnu) return Number(gnu[1]) * 1024;
  return null;
}

function timeCommand(platform = process.platform, exists = fs.existsSync) {
  if (!exists('/usr/bin/time')) return null;
  return {
    binary: '/usr/bin/time',
    args: platform === 'darwin' ? ['-l'] : ['-v'],
  };
}

/**
 * Run a checker on one project from the repository root. `checker` is a binary
 * path or a [command, ...prefixArgs] array (for example a ttr queue wrapper).
 */
function runChecker(checker, project, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const timer = options.timer === undefined ? timeCommand() : options.timer;
  const [binary, ...prefix] = Array.isArray(checker) ? checker : [checker];
  const args = [...prefix, '-p', project, ...CHECK_FLAGS];
  const [command, commandArgs] = timer
    ? [timer.binary, [...timer.args, binary, ...args]]
    : [binary, args];
  const started = process.hrtime.bigint();
  const result = spawn(command, commandArgs, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 256 * 1024 * 1024,
  });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  const stdout = result.stdout ?? '';
  const diagnostics = parseDiagnostics(stdout);
  return {
    exitCode: result.status,
    signal: result.signal ?? null,
    wallMs: Math.round(wallMs),
    maxRssBytes: parseMaxRssBytes(result.stderr ?? ''),
    diagnostics,
    // A crash prints no parseable diagnostics but exits non-zero.
    crashed:
      result.signal != null || (result.status !== 0 && !diagnostics.length),
    output: diagnostics.length ? '' : `${stdout}${result.stderr ?? ''}`,
  };
}

module.exports = {
  CHECK_FLAGS,
  DIAGNOSTIC_LINE,
  compareDiagnostics,
  diagnosticKey,
  locationKey,
  parseDiagnostics,
  parseMaxRssBytes,
  runChecker,
  timeCommand,
};
