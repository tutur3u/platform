'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { runStep } = require('../check-changed.js');

const passing = { id: 'src/passing.test.ts', ok: true, passed: true };
const changed = { id: 'src/changed.test.ts', ok: true, passed: false };

function runVitest({ report, explicitTests = [], stdout = '', status = 0 }) {
  let resultFile;
  const result = runStep(
    {
      id: 'vitest:packages/meet-core',
      cwd: 'packages/meet-core',
      command: 'bun',
      args: ['x', 'vitest', 'related', ...explicitTests],
      explicitVitestTests: explicitTests,
    },
    {
      root: process.cwd(),
      pinVitestTsconfig: (step) => ({ args: step.args, cleanup() {} }),
      spawn(command, args, { env }) {
        assert.equal(command, 'bun');
        assert.ok(
          args.some((arg) => path.basename(arg) === 'vitest-reporter.mjs')
        );
        resultFile = env.CHECK_CHANGED_VITEST_RESULT;
        if (report !== undefined)
          fs.writeFileSync(resultFile, JSON.stringify(report));
        return { status, stdout };
      },
    }
  );
  assert.equal(fs.existsSync(path.dirname(resultFile)), false);
  return result;
}

function finished(modules, overrides = {}) {
  return { reason: 'passed', unhandledErrors: 0, modules, ...overrides };
}

test('the Vitest runner accepts ordinary logs from a passing changed test', () => {
  assert.equal(
    runVitest({
      report: finished([passing]),
      explicitTests: [passing.id],
      stdout: 'Failed to load session, using fallback',
    }).status,
    'pass'
  );
});

test('a passing run that logs load or transform failure text is not a failure', () => {
  for (const stdout of [
    'stderr | src/a.test.ts > x\nFailed to load settings Error: boom\n\n Tests  3 passed (3)',
    'stderr | src/a.test.ts > x\nError: Failed to transform fixture\n\n Tests  3 passed (3)',
  ]) {
    assert.equal(
      runVitest({
        report: finished([passing]),
        explicitTests: [passing.id],
        stdout,
      }).status,
      'pass'
    );
  }
});

test('a genuine Vitest load or transform failure is still reported', () => {
  for (const stdout of [
    'FAIL src/a.test.ts\nError: Failed to load url ./missing (resolved id: ./missing)',
    'FAIL src/a.test.ts\nError: Failed to transform src/a.test.ts',
  ]) {
    assert.equal(
      runVitest({
        report: finished([{ ...passing, ok: false }]),
        explicitTests: [passing.id],
        stdout,
      }).status,
      'fail'
    );
  }
});

test('non-Vitest steps receive no reporter flags or result environment', () => {
  const calls = [];
  const result = runStep(
    { id: 'oxlint', command: 'bun', args: ['x', 'oxlint'] },
    {
      root: process.cwd(),
      env: { KEEP: '1' },
      pinVitestTsconfig: (step) => ({ args: step.args, cleanup() {} }),
      spawn(command, args, options) {
        calls.push({ command, args, env: options.env });
        return { status: 0, stdout: 'Failed to load settings' };
      },
    }
  );
  assert.equal(result.status, 'pass');
  assert.equal(calls[0].env.CHECK_CHANGED_VITEST_RESULT, undefined);
  assert.equal(
    calls[0].args.some((arg) => /vitest-reporter|--reporter/.test(arg)),
    false
  );
});

test('a passing related suite cannot mask skipped, empty, or missing changed suites', () => {
  for (const modules of [[passing, changed], [passing]]) {
    assert.match(
      runVitest({
        report: finished(modules),
        explicitTests: [passing.id, changed.id, 'src/missing.test.ts'],
      }).detail,
      /src\/changed\.test\.ts, src\/missing\.test\.ts/
    );
  }
});

test('source-only runs with zero related tests require a successful structured result', () => {
  assert.equal(runVitest({ report: finished([]) }).status, 'pass');
  for (const report of [
    undefined,
    null,
    finished([], { reason: 'failed' }),
    finished([], { unhandledErrors: 1 }),
    finished([{ ...changed, ok: false }]),
  ]) {
    assert.equal(runVitest({ report }).status, 'fail');
  }
  assert.equal(runVitest({ report: finished([]), status: 1 }).status, 'fail');
});
