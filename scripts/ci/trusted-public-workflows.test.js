const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { admitDispatch } = require('./trusted-public-admission');
const {
  dispatchFixture,
  source,
  control,
  main,
} = require('./fixtures/public-dispatch-fixture.cjs');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function job(text, name) {
  const match = text.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z]+:|$(?![\\s\\S]))`, 'm')
  );
  assert.ok(match, `job ${name}`);
  return match[1];
}
function ordered(text, tokens) {
  let position = -1;
  for (const token of tokens) {
    const next = text.indexOf(token, position + 1);
    assert.ok(next > position, `expected ordered boundary: ${token}`);
    position = next;
  }
}
function guardedStep(text, token) {
  const steps =
    text.match(/^      - [\s\S]*?(?=^      - |$(?![\s\S]))/gm) || [];
  const matches = steps.filter((step) => step.includes(token));
  assert.equal(matches.length, 1, `unique step for ${token}`);
  assert.match(
    matches[0],
    /^        if: .*steps\.revalidate\.outcome == 'success'/m
  );
}
function trustScript(text) {
  const match = job(text, 'trust').match(/          script: \|\n([\s\S]*)/);
  assert.ok(match);
  return match[1]
    .split('\n')
    .map((line) => (line.startsWith('            ') ? line.slice(12) : line))
    .join('\n');
}

for (const [stem, executor] of [
  ['public-build-artifact', 'build'],
  ['public-merged-main-tests', 'shards'],
]) {
  const text = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows', `${stem}.yaml`),
    'utf8'
  );
  test(`${stem}: trusted setup precedes admitted source and cache access`, () => {
    const execution = job(text, executor);
    ordered(execution, [
      'path: control',
      'actions/setup-node@',
      'package-manager-cache: false',
      'Revalidate dispatch before source execution',
      'Setup pinned Bun without shared caches',
      'Checkout admitted source',
      'Verify admitted source before execution',
      'working-directory: source',
    ]);
    assert.match(execution, /TURBO_CACHE: 'local:rw'/);
    assert.doesNotMatch(
      execution,
      /actions\/cache@|cache: ['"]?(bun|npm|pnpm|yarn)/
    );
    assert.doesNotMatch(
      text,
      /self-hosted|persist-credentials: true|secrets\./
    );
    assert.equal((text.match(/runs-on: ubuntu-latest/g) || []).length, 4);
    assert.doesNotMatch(text, /(?:contents|actions|id-token): write/);
    if (executor === 'shards') {
      assert.ok(
        execution.indexOf('NODE_PATH:') >
          execution.indexOf('working-directory: source')
      );
    }
  });

  test(`${stem}: artifact consumers use controls only and gate reads on revalidation`, () => {
    const consumer = job(text, 'summary');
    assert.doesNotMatch(
      consumer,
      /path: source|working-directory: source|setup-bun|bun install/
    );
    ordered(consumer, [
      'Checkout immutable consumer controls',
      'Revalidate dispatch before artifact consumption',
      'actions/download-artifact@',
      'git -C control diff',
      'node control/scripts/ci/trusted-public-receipts.js',
    ]);
    for (const token of [
      'actions/download-artifact@',
      'node control/scripts/ci/trusted-public-receipts.js',
    ]) {
      guardedStep(consumer, token);
      const missingGuards = consumer.replace(
        /^        if:.*steps\.revalidate\.outcome.*\n/gm,
        ''
      );
      assert.throws(
        () => guardedStep(missingGuards, token),
        assert.AssertionError
      );
    }
    assert.match(consumer, /github\.run_attempt/);
    assert.match(consumer, /needs\.admit\.outputs\.sha/);
    assert.doesNotMatch(consumer, /tar -|unzip|exec.*receipt/);
  });

  for (const allowed of [true, false]) {
    test(`${stem}: workflow publishes main output only after actual admission (${allowed})`, async () => {
      const fixture = dispatchFixture(stem);
      if (!allowed) fixture.state.permissions.rerunner.permission = 'read';
      const outputs = [];
      const failures = [];
      const script = new AsyncFunction(
        'require',
        'process',
        'github',
        'context',
        'core',
        trustScript(text)
      );
      const fakeRequire = (name) => {
        if (name === 'node:child_process')
          return { execFileSync: () => `${control}\n` };
        assert.match(
          name,
          /control\/scripts\/ci\/trusted-public-admission\.js$/
        );
        return { admitDispatch };
      };
      await script(
        fakeRequire,
        {
          env: {
            SOURCE_SHA: source,
            CONTROL_SHA: control,
            GITHUB_RUN_ATTEMPT: '2',
            GITHUB_WORKSPACE: '/fixture',
          },
        },
        fixture.github,
        fixture.context,
        {
          setOutput: (...args) => outputs.push(args),
          info: () => {},
          setFailed: (value) => failures.push(JSON.parse(value)),
        }
      );
      assert.deepEqual(outputs, allowed ? [['main', main]] : []);
      assert.deepEqual(
        failures,
        allowed
          ? []
          : [
              {
                phase: 'dispatch-admission',
                code: 'PUBLIC_DISPATCH_PERMISSION',
              },
            ]
      );
    });
  }
}
