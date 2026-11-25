'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

const reporterPath = path.join(__dirname, 'vitest-reporter.mjs');

// Fake TestModule shaped like Vitest 5.0.5: moduleId, ok(), state() and
// children.allTests(state?). Anything else the reporter touches throws.
function fakeModule(moduleId, states, { ok, state } = {}) {
  return {
    moduleId,
    ok: () => ok ?? !states.includes('failed'),
    state: () => state ?? 'passed',
    children: {
      *allTests(filter) {
        for (const testState of states) {
          if (!filter || filter === testState) yield { state: testState };
        }
      },
    },
  };
}

async function report(modules, { errors = [], reason = 'passed', file } = {}) {
  const { default: Reporter } = await import(
    `${pathToFileURL(reporterPath).href}?${Math.random()}`
  );
  const previous = process.env.CHECK_CHANGED_VITEST_RESULT;
  if (file === undefined) delete process.env.CHECK_CHANGED_VITEST_RESULT;
  else process.env.CHECK_CHANGED_VITEST_RESULT = file;
  try {
    new Reporter().onTestRunEnd(modules, errors, reason);
  } finally {
    if (previous === undefined) delete process.env.CHECK_CHANGED_VITEST_RESULT;
    else process.env.CHECK_CHANGED_VITEST_RESULT = previous;
  }
  return file ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-reporter-'));
  return { dir, file: path.join(dir, 'result.json') };
}

async function written(modules, options) {
  const { dir, file } = tempFile();
  try {
    return await report(modules, { ...options, file });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the reporter records counts for passed, failed, skipped and todo modules', async () => {
  const result = await written([
    fakeModule('/a.test.ts', ['passed', 'passed']),
    fakeModule('/b.test.ts', ['passed', 'failed'], { state: 'failed' }),
    fakeModule('/c.test.ts', ['skipped', 'skipped'], { state: 'skipped' }),
    // Vitest reports todo tests with the skipped state.
    fakeModule('/d.test.ts', ['passed', 'skipped', 'skipped']),
    fakeModule('/e.test.ts', [], { state: 'passed' }),
  ]);
  assert.deepEqual(result, {
    reason: 'passed',
    unhandledErrors: 0,
    modules: [
      {
        id: '/a.test.ts',
        ok: true,
        state: 'passed',
        total: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
      },
      {
        id: '/b.test.ts',
        ok: false,
        state: 'failed',
        total: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
      },
      {
        id: '/c.test.ts',
        ok: true,
        state: 'skipped',
        total: 2,
        passed: 0,
        failed: 0,
        skipped: 2,
      },
      {
        id: '/d.test.ts',
        ok: true,
        state: 'passed',
        total: 3,
        passed: 1,
        failed: 0,
        skipped: 2,
      },
      {
        id: '/e.test.ts',
        ok: true,
        state: 'passed',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
    ],
  });
});

test('the reporter records unhandled errors and the run reason', async () => {
  const result = await written([], {
    errors: [new Error('boom'), new Error('bang')],
    reason: 'failed',
  });
  assert.equal(result.unhandledErrors, 2);
  assert.equal(result.reason, 'failed');
});

test('the reporter fails clearly when the result file is not configured', async () => {
  await assert.rejects(
    () => report([]),
    /CHECK_CHANGED_VITEST_RESULT is not set/
  );
});

test('the reporter fails when the Vitest module API shape changes', async () => {
  const { dir, file } = tempFile();
  try {
    for (const broken of [
      { moduleId: '/a', ok: () => true, state: () => 'passed' },
      { moduleId: '/a', ok: () => true, children: { allTests: () => [] } },
      { moduleId: '/a', ok: () => true, state: () => 'passed', children: {} },
    ]) {
      await assert.rejects(() => report([broken], { file }), TypeError);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the reporter matches the installed Vitest TestModule API end to end', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-contract-'));
  const file = path.join(dir, 'result.json');
  try {
    fs.writeFileSync(
      path.join(dir, 'vitest.config.mjs'),
      "export default { test: { globals: true, include: ['*.test.mjs'] } };\n"
    );
    fs.writeFileSync(
      path.join(dir, 'a.test.mjs'),
      "test('ok', () => {});\ntest.todo('later');\ntest.skip('off', () => {});\n"
    );
    fs.writeFileSync(
      path.join(dir, 'b.test.mjs'),
      "describe.skipIf(true)('all skipped', () => {\n  test('x', () => {});\n  test('y', () => {});\n});\n"
    );
    fs.writeFileSync(path.join(dir, 'c.test.mjs'), "test.todo('only todo');\n");
    const vitest = require.resolve('vitest/package.json', {
      paths: [path.join(__dirname, '..', '..')],
    });
    const result = spawnSync(
      process.execPath,
      [
        path.join(path.dirname(vitest), 'vitest.mjs'),
        'run',
        '--root',
        dir,
        '--config',
        path.join(dir, 'vitest.config.mjs'),
        '--reporter',
        reporterPath,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CHECK_CHANGED_VITEST_RESULT: file },
      }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const byName = Object.fromEntries(
      json.modules.map((module) => [path.basename(module.id), module])
    );
    assert.equal(json.reason, 'passed');
    assert.equal(json.unhandledErrors, 0);
    assert.deepEqual(
      { ...byName['a.test.mjs'], id: undefined },
      {
        id: undefined,
        ok: true,
        state: 'passed',
        total: 3,
        passed: 1,
        failed: 0,
        skipped: 2,
      }
    );
    assert.deepEqual(
      { ...byName['b.test.mjs'], id: undefined },
      {
        id: undefined,
        ok: true,
        state: 'skipped',
        total: 2,
        passed: 0,
        failed: 0,
        skipped: 2,
      }
    );
    assert.equal(byName['c.test.mjs'].passed, 0);
    assert.equal(byName['c.test.mjs'].state, 'skipped');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
