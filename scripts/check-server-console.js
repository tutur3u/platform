#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SEARCH_ROOTS = ['apps', 'packages'];
const ALLOWED_FRAGMENTS = [
  '/lib/infrastructure/log-drain.ts:',
  '.test.',
  '.spec.',
  '/__tests__/',
];

function normalizePathSeparators(line) {
  return line.replace(/\\/g, '/');
}

function filterServerLoggingPolicyViolations(lines) {
  return lines
    .filter(Boolean)
    .map(normalizePathSeparators)
    .filter(
      (line) => !ALLOWED_FRAGMENTS.some((fragment) => line.includes(fragment))
    );
}

function collectServerLoggingPolicyViolations({
  rootDir = ROOT_DIR,
  searchRoots = DEFAULT_SEARCH_ROOTS,
  spawn = spawnSync,
} = {}) {
  const result = spawn(
    'rg',
    [
      '-n',
      '\\b(serverLogger|installConsoleLogDrain)\\b',
      ...searchRoots,
      '-g',
      '*.{ts,tsx,js}',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  if (result.status === 1) {
    return [];
  }

  if (result.error) {
    throw result.error;
  }

  return filterServerLoggingPolicyViolations(result.stdout.split(/\r?\n/));
}

function main() {
  const violations = collectServerLoggingPolicyViolations();

  if (violations.length > 0) {
    console.error(
      [
        'Server runtime logs must use native console methods.',
        'Do not import or call serverLogger or installConsoleLogDrain in runtime code.',
        '',
        ...violations,
      ].join('\n')
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collectServerLoggingPolicyViolations,
  filterServerLoggingPolicyViolations,
};
