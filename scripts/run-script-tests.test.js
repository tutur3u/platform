const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
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
  assert.deepEqual(invocation.args, ['--test', 'scripts/space name.test.js']);
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
