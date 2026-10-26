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

for (const file of [
  'product-feedback-causal-controls.test.mjs',
  'product-feedback-causal-controls.mjs',
]) {
  test(`database ${file} stays on node --test`, () => {
    const output = plan([`apps/database/scripts/${file}`]);
    assert.match(
      output,
      /script-tests: node --test .*product-feedback-causal-controls\.test\.mjs/
    );
    assert.doesNotMatch(output, /vitest:apps\/database/);
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

for (const native of [
  "import test from 'node:test';",
  "import type { TestContext } from 'node:test';",
]) {
  test(`explicit Vitest imports take precedence over ${native}`, (t) => {
    const root = fixture(
      t,
      'vitest run',
      `${native}\nimport { test as suite } from 'vitest';`
    );
    const output = plan(['apps/example/native.test.mjs'], { root });
    assert.doesNotMatch(output, /script-tests:/);
    assert.match(output, /vitest:apps\/example:.*native\.test\.mjs/);
  });
}

test('SDK portable-build fixture imports do not override its actual node:test runner', () => {
  const output = plan(['packages/sdk/scripts/portable-build.test.cjs']);
  assert.match(output, /script-tests: node --test .*portable-build\.test\.cjs/);
  assert.doesNotMatch(output, /vitest:packages\/sdk/);
});

const inertImports = (module) => ({
  quoted: `const fixture = "import { test } from '${module}';";`,
  template: `const fixture = \`require('${module}')\`;`,
  comment: `/* import('${module}') */`,
  regex: `const fixture = /from '${module}'/;`,
});
for (const kind of Object.keys(inertImports('vitest'))) {
  test(`${kind} fixture imports cannot route a Node test to Vitest`, (t) => {
    const root = fixture(
      t,
      'vitest run',
      `import test from 'node:test';\n${inertImports('vitest')[kind]}`
    );
    const output = plan(['apps/example/native.test.mjs'], { root });
    assert.match(output, /script-tests: node --test .*native\.test\.mjs/);
    assert.doesNotMatch(output, /vitest:apps\/example/);
  });
  test(`${kind} fixture imports cannot route a Vitest test to Node`, (t) => {
    const root = fixture(
      t,
      'node --test native.test.mjs',
      `import { test } from 'vitest';\n${inertImports('node:test')[kind]}`
    );
    const output = plan(['apps/example/native.test.mjs'], { root });
    assert.match(output, /vitest:apps\/example:.*native\.test\.mjs/);
    assert.doesNotMatch(output, /script-tests:/);
  });
}

for (const [script, module, runner] of [
  ['node --test native.test.mjs', 'vitest', 'node'],
  ['vitest run', 'node:test', 'vitest'],
]) {
  test(`fixture-only mentions preserve the package ${runner} runner`, (t) => {
    const root = fixture(t, script, inertImports(module).template);
    const output = plan(['apps/example/native.test.mjs'], { root });
    if (runner === 'node') {
      assert.match(output, /script-tests: node --test .*native\.test\.mjs/);
      assert.doesNotMatch(output, /vitest:apps\/example/);
    } else {
      assert.match(output, /vitest:apps\/example:.*native\.test\.mjs/);
      assert.doesNotMatch(output, /script-tests:/);
    }
  });
}

for (const typeOnly of [
  "import type { TestContext } from 'vitest';",
  "import { type TestContext } from 'vitest';",
]) {
  test(`type-only imports do not override the runtime Node runner: ${typeOnly}`, (t) => {
    const root = fixture(
      t,
      'vitest run',
      `import test from 'node:test';\n${typeOnly}`
    );
    const output = plan(['apps/example/native.test.mjs'], { root });
    assert.match(output, /script-tests: node --test .*native\.test\.mjs/);
    assert.doesNotMatch(output, /vitest:apps\/example/);
  });
}

test('dynamic imports inside template expressions still select the real runner', (t) => {
  const root = fixture(
    t,
    'vitest run',
    `const runner = \`\${await import('node:test')}\`;\n${inertImports('vitest').template}`
  );
  const output = plan(['apps/example/native.test.mjs'], { root });
  assert.match(output, /script-tests: node --test .*native\.test\.mjs/);
  assert.doesNotMatch(output, /vitest:apps\/example/);
});

test('Bun runtime imports also ignore embedded Vitest fixtures', (t) => {
  const root = fixture(
    t,
    'vitest run',
    `import { test } from 'bun:test';\n${inertImports('vitest').template}`
  );
  const output = plan(['apps/example/native.test.mjs'], { root });
  assert.match(output, /bun-test:apps\/example: bun test .*native\.test\.mjs/);
  assert.doesNotMatch(output, /script-tests:|vitest:apps\/example/);
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
