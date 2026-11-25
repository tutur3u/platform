'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { runStep } = require('../check-changed.js');

const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };
const passing = {
  ...counts,
  id: 'src/passing.test.ts',
  ok: true,
  state: 'passed',
  total: 1,
  passed: 1,
};
const changed = {
  ...counts,
  id: 'src/changed.test.ts',
  ok: true,
  state: 'skipped',
  total: 1,
  skipped: 1,
};

function runVitest({
  report,
  explicitTests = [],
  stdout = '',
  status = 0,
  env,
  root = process.cwd(),
  cwd = 'packages/meet-core',
}) {
  let resultFile;
  const result = runStep(
    {
      id: 'vitest:packages/meet-core',
      cwd,
      command: 'bun',
      args: ['x', 'vitest', 'related', ...explicitTests],
      explicitVitestTests: explicitTests,
    },
    {
      root,
      env,
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

function skippedSuite(source, name = 'src/conditional.test.ts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-skip-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, name), source);
  return root;
}

const skippedModule = {
  ...counts,
  id: 'src/conditional.test.ts',
  ok: true,
  state: 'skipped',
  total: 2,
  skipped: 2,
};

function runSkipped({ source, module = skippedModule, env = {} }) {
  const root = skippedSuite(source);
  try {
    return runVitest({
      report: finished([module]),
      explicitTests: ['src/conditional.test.ts'],
      env,
      root,
      cwd: '',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('an entirely skipped suite passes only when it declares skipIf or runIf', () => {
  for (const source of [
    "describe.skipIf(!process.env.URL)('integration', () => {});",
    "describe.runIf(process.env.RUN)('integration', () => {});",
    "it.skipIf(true)('x', () => {});",
  ]) {
    assert.equal(runSkipped({ source }).status, 'pass');
  }
  for (const source of [
    "describe.skip('x', () => {});",
    "// describe.skipIf(!ok)('x', () => {});\n/* it.runIf(a)('y') */",
    "describe('x', () => {});",
  ]) {
    assert.equal(runSkipped({ source }).status, 'fail');
  }
});

test('the allow-list env accepts an unconditional skipped suite by path', () => {
  const source = "describe.skip('x', () => {});";
  assert.equal(
    runSkipped({
      source,
      env: { CHECK_CHANGED_ALLOW_SKIPPED_SUITES: 'src/conditional.test.ts' },
    }).status,
    'pass'
  );
  assert.equal(
    runSkipped({
      source,
      env: { CHECK_CHANGED_ALLOW_SKIPPED_SUITES: 'src/other.test.ts' },
    }).status,
    'fail'
  );
});

test('the skipped-suite escape never accepts empty, failed, or errored files', () => {
  const source = "describe.skipIf(!x)('x', () => {});";
  const env = { CHECK_CHANGED_ALLOW_SKIPPED_SUITES: 'src/conditional.test.ts' };
  for (const module of [
    { ...skippedModule, total: 0, skipped: 0 },
    { ...skippedModule, state: 'failed', ok: false, failed: 1, skipped: 1 },
    { ...skippedModule, ok: false },
    { ...skippedModule, state: 'failed' },
    { ...skippedModule, total: 3, skipped: 2, failed: 1 },
    { ...skippedModule, state: 'pending' },
  ]) {
    assert.equal(runSkipped({ source, module, env }).status, 'fail');
  }
});
