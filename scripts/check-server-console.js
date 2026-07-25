#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SEARCH_ROOTS = ['apps', 'packages'];
const SEARCH_PATTERN = '\\b(serverLogger|installConsoleLogDrain)\\b';
const SEARCH_EXTENSIONS = ['.ts', '.tsx', '.js'];
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

function hasSearchableExtension(line) {
  const separatorIndex = line.indexOf(':');
  const filePath = separatorIndex === -1 ? line : line.slice(0, separatorIndex);

  return SEARCH_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

function collectServerLoggingPolicyViolations({
  rootDir = ROOT_DIR,
  searchRoots = DEFAULT_SEARCH_ROOTS,
  spawn = spawnSync,
} = {}) {
  const spawnOptions = { cwd: rootDir, encoding: 'utf8' };
  let result = spawn(
    'rg',
    ['-n', SEARCH_PATTERN, ...searchRoots, '-g', '*.{ts,tsx,js}'],
    spawnOptions
  );

  // Ripgrep is not installed on GitHub runners, and is only ever optional
  // locally, so fall back to git grep — every checkout running this already has
  // it. `--untracked` keeps the file set close to ripgrep's default, which
  // searches new files but still skips anything gitignored.
  if (result.error?.code === 'ENOENT') {
    result = spawn(
      'git',
      ['grep', '-n', '--untracked', '-E', SEARCH_PATTERN, '--', ...searchRoots],
      spawnOptions
    );
  }

  // Both tools report "nothing matched" as exit code 1.
  if (result.status === 1) {
    return [];
  }

  if (result.error) {
    throw result.error;
  }

  // git grep has no extension filter, so narrow to the same files ripgrep's
  // `-g` glob would have matched.
  return filterServerLoggingPolicyViolations(
    result.stdout.split(/\r?\n/).filter(hasSearchableExtension)
  );
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
  hasSearchableExtension,
};
