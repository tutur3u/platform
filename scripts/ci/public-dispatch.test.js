const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exactSha, appName, testCounts, command } = require('./public-ci');
const { collect, contract, emittedWorker } = require('./public-build');
const { plan } = require('./public-test-shard');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const workflows = ['public-merged-main-tests', 'public-build-artifact'];
const source = 'a'.repeat(40),
  control = 'b'.repeat(40),
  main = 'c'.repeat(40);
function workflow(name) {
  return fs.readFileSync(
    path.join(__dirname, '../../.github/workflows', name + '.yaml'),
    'utf8'
  );
}
function admission(name, overrides = {}) {
  const script = workflow(name).match(
    /\/\/ admission:start\n([\s\S]*?)\/\/ admission:end/
  )[1];
  const output = {};
  let calls = 0;
  const run = new AsyncFunction('github', 'context', 'core', 'process', script);
  return {
    output,
    calls: () => calls,
    run: () =>
      run(
        {
          rest: {
            repos: {
              getBranch: async () => {
                calls++;
                return { data: { commit: { sha: main } } };
              },
              compareCommitsWithBasehead: async ({ basehead }) => {
                calls++;
                const ref = basehead.split('...')[0];
                assert.equal(basehead.split('...')[1], main);
                return {
                  data: {
                    status: overrides.status || 'ahead',
                    merge_base_commit: { sha: overrides.mergeBase || ref },
                  },
                };
              },
            },
          },
        },
        overrides.context || {
          repo: { owner: 'tutur3u', repo: 'platform' },
          ref: 'refs/heads/main',
        },
        {
          setOutput: (key, value) => {
            output[key] = value;
          },
        },
        { env: { REQUEST_SHA: source, CONTROL_SHA: control, ...overrides.env } }
      ),
  };
}
for (const name of workflows) {
  test(`${name}: exact immutable merged-main source and control are admitted`, async () => {
    const f = admission(name, {
      env: name === 'public-build-artifact' ? { REQUEST_APP: 'meet' } : {},
    });
    await f.run();
    assert.deepEqual(f.output, { sha: source, main });
    assert.equal(f.calls(), 3);
  });
  for (const value of [
    '',
    'main',
    '../main',
    source + '\n',
    'A'.repeat(40),
    '${{ secrets.X }}',
    ';echo fixture',
  ]) {
    test(`${name}: malformed SHA ${JSON.stringify(value)} fails before API or checkout`, async () => {
      const f = admission(name, { env: { REQUEST_SHA: value } });
      await assert.rejects(f.run());
      assert.equal(f.calls(), 0);
      assert.deepEqual(f.output, {});
    });
  }
  for (const overrides of [
    { status: 'behind' },
    { status: 'diverged' },
    { mergeBase: 'd'.repeat(40) },
    { env: { REQUEST_APP: 'meet;echo fixture' } },
    { env: { CONTROL_SHA: 'main' } },
    {
      context: {
        repo: { owner: 'fixture', repo: 'fork' },
        ref: 'refs/heads/main',
      },
    },
    {
      context: {
        repo: { owner: 'tutur3u', repo: 'platform' },
        ref: 'refs/heads/fixture',
      },
    },
  ])
    test(`${name}: rejects unmerged, fork, ref or app injection ${JSON.stringify(overrides)}`, async () => {
      const f = admission(name, overrides);
      await assert.rejects(f.run());
      assert.deepEqual(f.output, {});
    });
  test(`${name}: public dispatch has pinned read-only actions and no secret/provider execution`, () => {
    const text = workflow(name);
    assert.match(text, /permissions:\n  contents: read/);
    assert.ok(
      !/secrets[.:]|secrets: inherit|pull_request_target|environment:|self-hosted/.test(
        text
      )
    );
    for (const match of text.matchAll(/uses: ([^\n ]+)/g))
      assert.match(match[1], /^[\w/-]+@[a-f0-9]{40}$/);
    assert.ok(
      text.indexOf('// admission:start') <
        text.indexOf('uses: actions/checkout@')
    );
    assert.match(text, /ref: \$\{\{ needs.admit.outputs.sha \}\}/);
    assert.match(text, /ref: \$\{\{ github.workflow_sha \}\}/);
    assert.ok(!/run:.*\$\{\{ inputs\./.test(text));
    assert.match(text, /cancel-in-progress: false/);
    assert.match(text, /if: always\(\)/);
  });
}
test('choice helpers reject SHA/ref/app injection and exact SHA terminators', () => {
  assert.equal(exactSha(source), source);
  for (const value of ['main', source + '\n', ';echo fixture', null])
    assert.throws(() => exactSha(value));
  for (const value of ['../web', 'web;echo fixture', 'WEB', 'meet-realtime'])
    assert.throws(() => appName(value));
  for (const app of ['finance', 'web'])
    assert.throws(() => contract(app), /missing committed public Vercel/);
  assert.equal(contract('meet').deployAcceptance, false);
});
test('test accounting never treats zero, skipped or failing execution as clean', () => {
  assert.deepEqual(testCounts('# tests 0\n# skipped 0\n# fail 0'), {
    tests: 0,
    skipped: 0,
    failed: 0,
  });
  assert.deepEqual(
    testCounts(
      'Tests 12 passed | 2 skipped (14)\n# tests 3\n# fail 1\n# skipped 0'
    ),
    { tests: 15, skipped: 2, failed: 1 }
  );
});
test('unsupported shard kinds and indices fail closed', () => {
  for (const index of [-1, 4, NaN]) assert.throws(() => plan('unit', index));
  assert.throws(() => plan('deploy', 0));
});
test('artifact boundary includes hidden output files but refuses source, dependencies, env files and symlink escape', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-artifact-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = 'apps/meet/dist';
  fs.mkdirSync(path.join(root, base), { recursive: true });
  fs.writeFileSync(path.join(root, base, '.required'), 'emitted fixture');
  const files = collect(root, base);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, base + '/.required');
  assert.equal(files[0].bytes, 15);
  assert.match(files[0].sha256, /^[a-f0-9]{64}$/);
  for (const prefix of [
    'apps/web/.next',
    'apps/meet/src',
    'apps/meet/dist/../../private',
  ])
    assert.throws(() => collect(root, prefix));
  for (const name of ['.env', '.env.production', 'node_modules', 'bad\nfile']) {
    const file = path.join(root, base, name);
    fs.writeFileSync(file, 'fixture');
    assert.throws(() => collect(root, base));
    fs.unlinkSync(file);
  }
  fs.symlinkSync(path.join(root, 'outside'), path.join(root, base, 'link'));
  assert.throws(() => collect(root, base));
});
test('each Meet output requires its own emitted Worker entry inside the artifact', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-pair-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = 'apps/meet-realtime/dist/worker';
  fs.mkdirSync(path.join(root, directory), { recursive: true });
  const config = path.join(root, directory, 'wrangler.json');
  fs.writeFileSync(config, JSON.stringify({ main: '../outside.js' }));
  assert.throws(() => emittedWorker(root, directory));
  fs.writeFileSync(config, JSON.stringify({ main: 'index.js' }));
  assert.throws(() => emittedWorker(root, directory));
  fs.writeFileSync(
    path.join(root, directory, 'index.js'),
    'export default {};'
  );
  assert.equal(emittedWorker(root, directory), directory + '/index.js');
});

test('real command seam refuses zero/skipped summaries and nonzero exits', () => {
  for (const [summary, exit, accepted] of [
    ['# tests 0\n# fail 0\n# skipped 0', 0, false],
    ['# tests 2\n# fail 0\n# skipped 1', 0, false],
    ['# tests 2\n# fail 0\n# skipped 0', 1, false],
    ['# tests 2\n# fail 0\n# skipped 0', 0, true],
  ]) {
    const receipt = { commands: [], sourceSHA: source };
    const argv = [
      process.execPath,
      '-e',
      `console.log(${JSON.stringify(summary)}); process.exitCode=${exit}`,
    ];
    if (accepted) command(argv, receipt, { tests: true });
    else assert.throws(() => command(argv, receipt, { tests: true }));
    assert.equal(receipt.commands[0].qualified, accepted);
    assert.equal(receipt.commands[0].exit, exit);
  }
});

test('canonical unit and root plans cover every target exactly once across four shards', () => {
  const root = path.resolve(__dirname, '../..');
  const { discoverPackages } = require('./test-shards');
  const { discoverScriptTests } = require('../run-script-tests');
  const units = [0, 1, 2, 3].map((i) => plan('unit', i, root));
  for (const [i, p] of units.entries())
    assert.deepEqual(p.commands[0].argv, [
      process.execPath,
      'scripts/ci/run-test-shard.js',
      String(i),
      '4',
      '--coverage',
    ]);
  assert.match(
    fs.readFileSync(
      path.join(root, '.github/workflows/turbo-unit-tests.yaml'),
      'utf8'
    ),
    /command: node scripts\/ci\/run-test-shard\.js \$\{\{ matrix\.shard \}\} 4 --coverage/
  );
  const names = units.flatMap((p) => p.targets);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    names.sort(),
    discoverPackages(root)
      .map((p) => p.name)
      .sort()
  );
  const files = [0, 1, 2, 3].flatMap((i) => plan('root', i, root).targets);
  assert.equal(new Set(files).size, files.length);
  assert.deepEqual(files.sort(), discoverScriptTests().sort());
});
