// REV-6456-15: the Security review classifier (security-paths.js) must cover
// every path that CODEOWNERS assigns to the security reviewer, so native
// code-owner review and the Security review check cannot drift apart. Each
// owned pattern is expanded into representative paths (wildcard segments and
// name globs filled in, directories given a nested file) that must classify
// as required. The live .github/CODEOWNERS is checked when present; the
// pinned copy of #6491's file keeps the check meaningful before it merges.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { classifyReview } = require('./security-paths.js');

const repoRoot = path.resolve(__dirname, '../..');

function ownedPatterns(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/u))
    .filter((fields) => fields.length > 1)
    .map(([pattern]) => pattern);
}

function samplePaths(pattern) {
  let sample = pattern.replace(/^\//u, '');
  if (sample.startsWith('**/'))
    sample = `apps/sample/src/lib/${sample.slice(3)}`;
  if (sample.endsWith('/')) sample = `${sample}nested/route.ts`;
  // A whole-segment `*` is a directory name; a partial `*` is a name glob.
  sample = sample.replace(/(^|\/)\*(?=\/)/gu, '$1sample');
  return [
    ...new Set([sample.replaceAll('*', ''), sample.replaceAll('*', '-sample')]),
  ];
}

function uncovered(text) {
  return ownedPatterns(text).flatMap((pattern) =>
    samplePaths(pattern)
      .filter((sample) => !classifyReview([sample]).required)
      .map((sample) => `${pattern} -> ${sample}`)
  );
}

test('every CODEOWNERS security path requires a Security review', () => {
  const sources = [
    path.join(__dirname, 'fixtures/codeowners-sensitive-paths.txt'),
  ];
  const live = path.join(repoRoot, '.github/CODEOWNERS');
  if (fs.existsSync(live)) sources.push(live);
  for (const source of sources) {
    const text = fs.readFileSync(source, 'utf8');
    assert.ok(ownedPatterns(text).length > 20, `${source} lists owned paths`);
    assert.deepEqual(uncovered(text), [], source);
  }
});

test('the cross-check catches a path the classifier misses', () => {
  assert.deepEqual(uncovered('/apps/sample-unclassified/  @owner\n'), [
    '/apps/sample-unclassified/ -> apps/sample-unclassified/nested/route.ts',
  ]);
  assert.deepEqual(samplePaths('/apps/*/src/lib/sepay*.ts'), [
    'apps/sample/src/lib/sepay.ts',
    'apps/sample/src/lib/sepay-sample.ts',
  ]);
});
