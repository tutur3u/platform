#!/usr/bin/env node

/**
 * Visible loading-text guard. Loading states render layout-matched skeletons
 * from `@tuturuuu/ui/skeleton` with screen-reader-only text, not visible
 * "Loading..." copy. Existing occurrences are listed per file in the baseline.
 * The check fails when a file has more occurrences than its baseline entry
 * (new files have none); removals only print a notice, so parallel work never
 * turns main red. `--write-baseline` rewrites the baseline when the repo-wide
 * total does not grow, which also covers moving or splitting a file.
 *
 * Lines that keep the text for assistive tech (`aria-label`, `sr-only`,
 * `srLabel`, `aria-valuetext`, `<title>`) are allowed, as is a line marked
 * `loading-text-allowed: <reason>` on it or the line above (for text that is
 * real content, such as a "still loading, check your network" notice).
 *
 * Known limits (heuristic, line based): only tracked `.tsx`/`.jsx` files are
 * scanned; JSX text split across lines and bare 'Loading' strings without an
 * ellipsis are not detected; `.ts` label maps are out of scope.
 *
 *   node scripts/check-visible-loading-text.js                  # check
 *   node scripts/check-visible-loading-text.js --write-baseline # rewrite
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(
  __dirname,
  'visible-loading-text-baseline.json'
);
const SEARCH_ROOTS = ['apps', 'packages'];
const EXCLUDED_PREFIXES = [
  'apps/backend/',
  'apps/docs/',
  'apps/mobile/',
  'apps/tanstack-web/',
];
const EXCLUDED_FRAGMENTS = ['.test.', '.spec.', '.stories.', '/__tests__/'];

const SCREEN_READER_ONLY = /aria-label|aria-valuetext|sr-only|srLabel|<title>/;
const LITERAL_JSX_TEXT = />\s*(?:Loading|Đang tải)\b[^<{]*</;
const LITERAL_STRING = /(['"`])(?:Loading|Đang tải)[^'"`]{0,40}?(?:\.\.\.|…)\1/;
// Translator calls: t(), tc(), tCommon(), commonT(), common(), translate().
const TRANSLATED_CALL =
  /\b(t|tc|t[A-Z]\w*|\w+T|common|translate)\(\s*['"]([\w.-]+)['"]\s*[,)]/g;
const LOADING_KEY =
  /(?:(?:^|[._-])(?:loading|fetching)(?:[A-Z_-]\w*)?|[a-z](?:Loading|Fetching))$/;
const NOT_A_LOADING_STATE = /error|fail/i;
const ALLOW_MARKER = /loading-text-allowed:/;

function isScannedPath(filePath) {
  return (
    /\.(tsx|jsx)$/.test(filePath) &&
    SEARCH_ROOTS.some((root) => filePath.startsWith(`${root}/`)) &&
    !EXCLUDED_PREFIXES.some((prefix) => filePath.startsWith(prefix)) &&
    !EXCLUDED_FRAGMENTS.some((fragment) => filePath.includes(fragment))
  );
}

function hasTranslatedLoadingKey(line) {
  for (const match of line.matchAll(TRANSLATED_CALL)) {
    const key = match[2];
    if (LOADING_KEY.test(key) && !NOT_A_LOADING_STATE.test(key)) return true;
  }
  return false;
}

/** Returns 1-based line numbers that render visible loading text. */
function findVisibleLoadingText(source) {
  const lines = [];
  const sourceLines = source.split(/\r?\n/);
  sourceLines.forEach((line, index) => {
    if (SCREEN_READER_ONLY.test(line)) return;
    if (
      ALLOW_MARKER.test(line) ||
      ALLOW_MARKER.test(sourceLines[index - 1] ?? '')
    )
      return;
    if (
      LITERAL_JSX_TEXT.test(line) ||
      LITERAL_STRING.test(line) ||
      hasTranslatedLoadingKey(line)
    ) {
      lines.push(index + 1);
    }
  });
  return lines;
}

function listScannedFiles(rootDir = ROOT_DIR) {
  return execFileSync(
    'git',
    // Tracked files only: untracked work from other agents in a shared
    // checkout must not fail this check.
    ['ls-files', '--cached', ...SEARCH_ROOTS],
    { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
    .split('\n')
    .filter(isScannedPath);
}

function collectCounts({ rootDir = ROOT_DIR, files } = {}) {
  const counts = {};
  for (const file of files ?? listScannedFiles(rootDir)) {
    let source;
    try {
      source = fs.readFileSync(path.join(rootDir, file), 'utf8');
    } catch {
      continue; // Deleted in the working tree but still in the index.
    }
    const hits = findVisibleLoadingText(source);
    if (hits.length > 0) counts[file] = hits.length;
  }
  return counts;
}

function compareToBaseline(counts, baseline) {
  const regressions = [];
  const improvements = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) regressions.push({ file, count, allowed });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const count = counts[file] ?? 0;
    if (count < allowed) improvements.push({ file, count, allowed });
  }
  return { regressions, improvements };
}

function readBaseline(baselinePath = BASELINE_PATH) {
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function writeBaseline(counts, baselinePath = BASELINE_PATH) {
  const sorted = Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [file, counts[file]])
  );
  fs.writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
}

function total(counts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function main(argv = process.argv.slice(2)) {
  const counts = collectCounts();
  if (argv.includes('--write-baseline')) {
    const baseline = readBaseline();
    if (total(counts) > total(baseline)) {
      const { regressions } = compareToBaseline(counts, baseline);
      console.error(
        `Refusing to grow the baseline (${total(baseline)} -> ${total(counts)}). New visible loading text:`
      );
      for (const r of regressions) {
        console.error(`  ${r.file}: ${r.count} (allowed ${r.allowed})`);
      }
      return 1;
    }
    writeBaseline(counts);
    console.log(`Baseline now lists ${Object.keys(counts).length} files.`);
    return 0;
  }

  const { regressions, improvements } = compareToBaseline(
    counts,
    readBaseline()
  );
  if (regressions.length > 0) {
    console.error(
      'Visible loading text found. Render a layout-matched skeleton from ' +
        '@tuturuuu/ui/skeleton inside <LoadingRegion srLabel={...}> instead. ' +
        'If you only moved existing text between files, run --write-baseline:'
    );
    for (const r of regressions) {
      const where = findVisibleLoadingText(
        fs.readFileSync(path.join(ROOT_DIR, r.file), 'utf8')
      ).join(', ');
      console.error(`  ${r.file} lines ${where} (allowed ${r.allowed})`);
    }
    return 1;
  }
  if (improvements.length > 0) {
    console.log(
      `${improvements.length} file(s) now have less loading text than the ` +
        'baseline; tighten it with ' +
        '`node scripts/check-visible-loading-text.js --write-baseline`.'
    );
  }
  console.log('No new visible loading text.');
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  collectCounts,
  total,
  compareToBaseline,
  findVisibleLoadingText,
  isScannedPath,
  main,
};
