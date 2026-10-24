const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('./check-changed.js');

function git(branch = 'fix/routing', upstream = '') {
  return (_command, args) => {
    if (args[0] === 'merge-base') return 'base';
    if (args[0] === 'branch') return branch;
    if (args[0] === 'for-each-ref') return upstream;
    throw new Error(`Unexpected Git arguments: ${args.join(' ')}`);
  };
}

function plan(files, deps = {}) {
  const logs = [];
  assert.equal(
    main(['--dry-run', '--files', ...files], {
      execFile: git(),
      log: (line) => logs.push(line),
      ...deps,
    }),
    0
  );
  return logs.join('\n');
}

for (const file of ['worker.test.mjs', 'worker.ts']) {
  test(`coordination ${file} selects the native runner exactly once`, () => {
    const output = plan([`apps/coordination/src/${file}`]);
    assert.match(output, /script-tests: node --test .*worker\.test\.mjs/);
    assert.doesNotMatch(output, /vitest:apps\/coordination/);
  });
}

function fixture(t, script, source) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'changed-runners-'))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'apps/example');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'example', scripts: { test: script } })
  );
  fs.writeFileSync(path.join(dir, 'vitest.config.mjs'), '');
  fs.writeFileSync(path.join(dir, 'native.test.mjs'), source);
  return root;
}

test('the package native test script selects related files and propagates failures', (t) => {
  const root = fixture(
    t,
    'node --test native.test.mjs',
    'throw Error("native failure");'
  );
  const files = ['apps/example/native.test.mjs'];
  const output = plan(files, { root });
  assert.match(output, /script-tests: node --test .*native\.test\.mjs/);
  assert.doesNotMatch(output, /vitest:apps\/example/);
  const logs = [];
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = () =>
    main(['--no-ttr', '--only', 'script-tests', '--files', ...files], {
      root,
      env,
      execFile: git(),
      log: (line) => logs.push(line),
    });
  assert.equal(run(), 1);
  assert.match(logs.join('\n'), /native failure/);
  fs.writeFileSync(path.join(root, files[0]), 'console.log("native success");');
  assert.equal(run(), 0);
});

test('a mixed package partitions node:test imports from Vitest files', (t) => {
  const root = fixture(
    t,
    'vitest run',
    "import test from 'node:test'; test('native', () => {});"
  );
  fs.writeFileSync(
    path.join(root, 'apps/example/browser.test.js'),
    "import { test } from 'vitest';"
  );
  const output = plan(
    ['apps/example/native.test.mjs', 'apps/example/browser.test.js'],
    { root }
  );
  const node = output
    .split('\n')
    .find((line) => line.includes('script-tests:'));
  const vitest = output
    .split('\n')
    .find((line) => line.includes('vitest:apps/example:'));
  assert.match(node, /native\.test\.mjs/);
  assert.doesNotMatch(node, /browser\.test\.js/);
  assert.match(vitest, /browser\.test\.js/);
  assert.doesNotMatch(vitest, /native\.test\.mjs/);
});

test('explicit Vitest imports override a native package default', (t) => {
  const root = fixture(
    t,
    'node --test native.test.mjs',
    "import { test } from 'vitest';"
  );
  const output = plan(['apps/example/native.test.mjs'], { root });
  assert.doesNotMatch(output, /script-tests:/);
  assert.match(output, /vitest:apps\/example:.*native\.test\.mjs/);
});

for (const { branch, upstream, expected } of [
  { branch: 'tmp/agent', upstream: 'refs/heads/fix/routing', expected: 0 },
  { branch: 'tmp/agent', upstream: '', expected: 1 },
  { branch: 'tmp/agent', upstream: 'refs/heads/tmp/published', expected: 1 },
  { branch: 'ci/invalid', upstream: 'refs/heads/fix/routing', expected: 1 },
  { branch: 'fix/routing', upstream: 'refs/heads/tmp/published', expected: 0 },
]) {
  test(`branch policy ${branch} tracking ${upstream || 'nothing'} returns ${expected}`, () => {
    const logs = [];
    assert.equal(
      main(['--no-ttr', '--only', 'branch-name', '--files', 'README.md'], {
        execFile: git(branch, upstream),
        log: (line) => logs.push(line),
      }),
      expected
    );
    if (branch.startsWith('tmp/') && upstream) {
      assert.match(logs.join('\n'), /tracking/);
    }
  });
}
