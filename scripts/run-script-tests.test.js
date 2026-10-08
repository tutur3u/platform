const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  DEFAULT_SUPPLEMENTAL_PATHS,
  discoverScriptTests,
  runScriptTests,
} = require('./run-script-tests.js');

function createFixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'script tests '));
  t.after(() => fs.rmSync(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

function write(repoRoot, relativePath, contents = '') {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

test('discovers recursive JS and MJS tests in deterministic order', (t) => {
  const repoRoot = createFixture(t);
  write(repoRoot, 'scripts/z.test.mjs');
  write(repoRoot, 'scripts/nested/a.test.js');
  write(repoRoot, 'scripts/not-a-test.js');

  assert.deepEqual(discoverScriptTests({ repoRoot, supplementalPaths: [] }), [
    'scripts/nested/a.test.js',
    'scripts/z.test.mjs',
  ]);
});

test('applies explicit directory exclusions', (t) => {
  const repoRoot = createFixture(t);
  write(repoRoot, 'scripts/kept.test.js');
  write(repoRoot, 'scripts/fixtures/ignored.test.js');
  write(repoRoot, 'scripts/generated/ignored.test.mjs');
  write(repoRoot, 'scripts/node_modules/package/ignored.test.js');

  assert.deepEqual(discoverScriptTests({ repoRoot, supplementalPaths: [] }), [
    'scripts/kept.test.js',
  ]);
});

test('includes supplemental files and roots without duplicates', (t) => {
  const repoRoot = createFixture(t);
  write(repoRoot, 'scripts/main.test.js');
  write(repoRoot, 'outside/action.test.js');
  write(repoRoot, 'outside/nested/database.test.mjs');

  assert.deepEqual(
    discoverScriptTests({
      repoRoot,
      supplementalPaths: [
        'outside',
        'outside/action.test.js',
        'scripts/main.test.js',
      ],
    }),
    [
      'outside/action.test.js',
      'outside/nested/database.test.mjs',
      'scripts/main.test.js',
    ]
  );
});

test('fails with the configured path when a root is missing', (t) => {
  const repoRoot = createFixture(t);

  assert.throws(
    () =>
      discoverScriptTests({
        repoRoot,
        roots: ['missing-root'],
        supplementalPaths: [],
      }),
    /missing-root/
  );
});

test('fails observably when configured roots discover no tests', (t) => {
  const repoRoot = createFixture(t);
  fs.mkdirSync(path.join(repoRoot, 'empty'));

  assert.throws(
    () =>
      discoverScriptTests({
        repoRoot,
        roots: ['empty'],
        supplementalPaths: [],
      }),
    /zero files.*empty/
  );
});

test('list mode reports a positive count and sorted paths', (t) => {
  const repoRoot = createFixture(t);
  write(repoRoot, 'scripts/b.test.js');
  write(repoRoot, 'scripts/a.test.mjs');
  const output = [];
  const originalLog = console.log;
  console.log = (line) => output.push(line);
  t.after(() => {
    console.log = originalLog;
  });

  const exitCode = runScriptTests({
    listOnly: true,
    repoRoot,
    supplementalPaths: [],
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(output, [
    'Discovered 2 script test files.',
    'scripts/a.test.mjs',
    'scripts/b.test.js',
  ]);
});

test('passes spaced paths as arguments and propagates the child exit code', (t) => {
  const repoRoot = createFixture(t);
  write(repoRoot, 'scripts/space name.test.js');
  let invocation;

  const exitCode = runScriptTests({
    repoRoot,
    spawnImpl(command, args, options) {
      invocation = { args, command, options };
      return { status: 7 };
    },
    supplementalPaths: [],
  });

  assert.equal(exitCode, 7);
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [
    '--experimental-strip-types',
    '--test',
    'scripts/space name.test.js',
  ]);
  assert.equal(invocation.options.cwd, repoRoot);
  assert.equal(invocation.options.stdio, 'inherit');
});

test('new tests are discovered without changing runner configuration', (t) => {
  const repoRoot = createFixture(t);
  write(repoRoot, 'scripts/existing.test.js');
  assert.deepEqual(discoverScriptTests({ repoRoot, supplementalPaths: [] }), [
    'scripts/existing.test.js',
  ]);

  write(repoRoot, 'scripts/newly-added.test.mjs');
  assert.deepEqual(discoverScriptTests({ repoRoot, supplementalPaths: [] }), [
    'scripts/existing.test.js',
    'scripts/newly-added.test.mjs',
  ]);
});

test('missing-root subprocesses exit nonzero and name the root', (t) => {
  const repoRoot = createFixture(t);
  const runnerPath = path.join(__dirname, 'run-script-tests.js');
  const source = `require(${JSON.stringify(runnerPath)}).runScriptTests({ repoRoot: ${JSON.stringify(repoRoot)}, roots: ['missing-child-root'], supplementalPaths: [] })`;

  const result = spawnSync(process.execPath, ['-e', source], {
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing-child-root/);
});

const employeeTests = [
  'apps/database/scripts/employee-validation-source-contract.test.mjs',
  'apps/database/scripts/employee-validation-stage-cleanup.test.mjs',
];

function defaultFixture(t) {
  const repoRoot = createFixture(t);
  for (const file of DEFAULT_SUPPLEMENTAL_PATHS) write(repoRoot, file);
  write(repoRoot, 'scripts/ordinary.test.js');
  write(repoRoot, 'apps/database/scripts/runtime-gate.test.mjs');
  return repoRoot;
}

test('default discovery admits only the selected employee sources and list mode never spawns', (t) => {
  const repoRoot = defaultFixture(t);
  const files = discoverScriptTests({ repoRoot });
  for (const file of employeeTests) {
    assert.equal(files.filter((candidate) => candidate === file).length, 1);
  }
  assert.deepEqual(
    files,
    [...new Set(files)].sort((a, b) => a.localeCompare(b))
  );
  assert.equal(
    files.includes('apps/database/scripts/runtime-gate.test.mjs'),
    false
  );
  assert.equal(
    runScriptTests({
      repoRoot,
      listOnly: true,
      spawnImpl() {
        assert.fail('list mode must never execute a test');
      },
    }),
    0
  );
});

test('default execution separates the employee pair into one bounded serial process', (t) => {
  const repoRoot = defaultFixture(t);
  const calls = [];
  assert.equal(
    runScriptTests({
      repoRoot,
      spawnImpl(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    }),
    0
  );
  assert.equal(calls.length, 2);
  const [legacy, employee] = calls;
  assert.equal(legacy.command, process.execPath);
  assert.deepEqual(legacy.options, { cwd: repoRoot, stdio: 'inherit' });
  assert.deepEqual(legacy.args.slice(0, 2), [
    '--experimental-strip-types',
    '--test',
  ]);
  assert.deepEqual(
    legacy.args.slice(2),
    discoverScriptTests({ repoRoot }).filter(
      (file) => !employeeTests.includes(file)
    )
  );
  assert.equal(employee.command, process.execPath);
  assert.ok(employee.args.includes('--max-old-space-size=64'));
  assert.ok(employee.args.includes('--test-isolation=none'));
  assert.ok(employee.args.includes('--test-concurrency=1'));
  assert.deepEqual(
    employee.args.slice(employee.args.indexOf('--test') + 1),
    employeeTests
  );
  assert.equal(employee.options.cwd, repoRoot);
  assert.equal(employee.options.stdio, 'inherit');
  assert.equal(employee.options.timeout, 60000);
  assert.equal(employee.options.killSignal, 'SIGKILL');
});

test('a legacy failure stops before any employee source execution', (t) => {
  const repoRoot = defaultFixture(t);
  let calls = 0;
  assert.equal(
    runScriptTests({
      repoRoot,
      spawnImpl() {
        calls++;
        return { status: 7 };
      },
    }),
    7
  );
  assert.equal(calls, 1);
});

for (const [label, result, expected] of [
  ['nonzero exit', { status: 4 }, 4],
  ['signal', { status: 0, signal: 'SIGKILL' }, 1],
  ['missing status', { status: null }, 1],
]) {
  test(`employee-only execution fails closed on ${label} without a legacy process`, (t) => {
    const repoRoot = createFixture(t);
    for (const file of employeeTests) write(repoRoot, file);
    let calls = 0;
    assert.equal(
      runScriptTests({
        repoRoot,
        roots: [],
        supplementalPaths: employeeTests,
        spawnImpl() {
          calls++;
          return result;
        },
      }),
      expected
    );
    assert.equal(calls, 1);
  });
}

for (const code of ['ETIMEDOUT', 'ENOENT']) {
  test(`employee batch preserves ${code} as the primary spawn error`, (t) => {
    const repoRoot = defaultFixture(t);
    const failure = Object.assign(new Error(code), { code });
    let calls = 0;
    assert.throws(
      () =>
        runScriptTests({
          repoRoot,
          spawnImpl() {
            calls++;
            return calls === 1
              ? { status: 0 }
              : { error: failure, status: null, signal: 'SIGKILL' };
          },
        }),
      (error) => error === failure
    );
    assert.equal(calls, 2);
  });
}

test('a missing default employee source fails before spawning any batch', (t) => {
  const repoRoot = defaultFixture(t);
  fs.unlinkSync(path.join(repoRoot, employeeTests[0]));
  assert.throws(
    () =>
      runScriptTests({
        repoRoot,
        spawnImpl() {
          assert.fail('missing registration must not run tests');
        },
      }),
    /employee-validation-source-contract\.test\.mjs/
  );
});
