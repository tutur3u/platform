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
