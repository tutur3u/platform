const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('passive Slot diagnostic regressions use the explicit TypeScript loader', (t) => {
  // Node >=22.13 supports this flag, including releases without automatic
  // stripping. Keep the plain node --test entry point free of .ts imports.
  const childEnv = { ...process.env };
  // The child owns a separate test runner, rather than inheriting the outer
  // runner's context (which can make node --test skip the child fixture).
  delete childEnv.NODE_TEST_CONTEXT;
  const output = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--test',
      '--test-reporter=tap',
      path.join(__dirname, 'fixtures/storefront-slot-diagnostics.cases.mjs'),
    ],
    { encoding: 'utf8', timeout: 10_000, env: childEnv }
  );
  assert.match(output, /^# tests 6$/m);
  assert.match(output, /^# pass 6$/m);
  t.diagnostic('All six child regressions passed with explicit type stripping');
});
