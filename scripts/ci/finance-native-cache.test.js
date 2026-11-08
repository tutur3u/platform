const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const root = path.resolve(__dirname, '../..');
const actionPath = '.github/actions/cache-finance-native-inputs';
function readAction(file) {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        file,
      ],
      { cwd: root, encoding: 'utf8' }
    )
  );
}
const action = readAction(`${actionPath}/action.yml`);
const bun = readAction('.github/actions/setup-bun-with-retry/action.yml');
const native = readWorkflow('native-start-app.yaml');

function enabled(condition, github, inputs = {}) {
  const code = condition.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  return Function('github', 'inputs', `return (${code})`)(github, inputs);
}

test('only trusted main events can write input caches; all other events restore only', () => {
  const caches = action.runs.steps.filter((step) => step.uses);
  assert.equal(caches.length, 4);
  for (const ref of [
    'refs/heads/main',
    'refs/heads/production',
    'refs/heads/topic',
    'refs/pull/7/merge',
  ]) {
    for (const event_name of [
      'push',
      'workflow_dispatch',
      'pull_request',
      'pull_request_target',
      'workflow_run',
      'schedule',
    ]) {
      for (const actor of ['vhpx', 'dependabot[bot]']) {
        const github = { ref, event_name, actor };
        for (const save of ['true', 'false', '', 'invalid']) {
          const active = caches.filter((step) =>
            enabled(step.if, github, { save })
          );
          assert.equal(active.length, 2);
          const trusted =
            save === 'true' &&
            ref === 'refs/heads/main' &&
            ['push', 'workflow_dispatch'].includes(event_name) &&
            actor !== 'dependabot[bot]';
          for (const step of active) {
            assert.equal(step.uses.startsWith('actions/cache@'), trusted);
            assert.match(step.uses, /@[a-f0-9]{40}$/);
            assert.equal(step.with['restore-keys'], undefined);
          }
        }
      }
    }
  }
});

test('cache identities change with lock, toolchains, OS and architecture; profiles share only inputs', () => {
  const caches = action.runs.steps.filter((step) => step.uses);
  function key(template, values) {
    return template.replace(/\$\{\{ (.*?) \}\}/g, (_, expression) => {
      if (expression === "hashFiles('bun.lock')") return values.lock;
      return values[expression];
    });
  }
  const values = {
    lock: 'a'.repeat(64),
    'runner.os': 'Linux',
    'runner.arch': 'X64',
    'inputs.bun-version': '1.4.4',
    'inputs.node-version': '24.22.0',
  };
  for (const step of caches) {
    const original = key(step.with.key, values);
    assert.ok(!original.includes('undefined'));
    for (const field of Object.keys(values)) {
      assert.notEqual(
        key(step.with.key, { ...values, [field]: 'changed' }),
        original,
        field
      );
    }
    assert.doesNotMatch(
      step.with.path,
      /node_modules|dist|\.output|artifact|\/etc|\/usr/
    );
    assert.doesNotMatch(
      step.with.key,
      /profile|github\.sha|run_id|run_attempt/
    );
  }
  for (const family of ['bun', 'browser']) {
    const pair = caches.filter((step) =>
      step.with.key.startsWith(`finance-${family}-`)
    );
    assert.equal(pair.length, 2);
    assert.deepEqual(pair[0].with, pair[1].with);
  }
});

test('isolated directories reach later install/runtime steps and missing lock identity refuses setup', () => {
  const step = action.runs.steps[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-cache-'));
  try {
    fs.writeFileSync(path.join(dir, 'bun.lock'), '{}');
    for (const lockHash of ['abc123', '']) {
      const envFile = path.join(dir, `env-${lockHash || 'empty'}`);
      const result = spawnSync(
        'bash',
        ['-e', '-o', 'pipefail', '-c', step.run],
        {
          cwd: dir,
          env: {
            ...process.env,
            RUNNER_TEMP: dir,
            GITHUB_ENV: envFile,
            LOCK_HASH: lockHash,
          },
          encoding: 'utf8',
          timeout: 5000,
        }
      );
      assert.equal(result.status === 0, Boolean(lockHash), result.stderr);
      if (lockHash) {
        assert.equal(
          fs.readFileSync(envFile, 'utf8'),
          `BUN_INSTALL_CACHE_DIR=${dir}/finance-native-bun\nPLAYWRIGHT_BROWSERS_PATH=${dir}/finance-native-playwright\n`
        );
      } else assert.equal(fs.existsSync(envFile), false);
    }
    fs.unlinkSync(path.join(dir, 'bun.lock'));
    const missing = spawnSync(
      'bash',
      ['-e', '-o', 'pipefail', '-c', step.run],
      {
        cwd: dir,
        env: {
          ...process.env,
          RUNNER_TEMP: dir,
          GITHUB_ENV: path.join(dir, 'missing-env'),
          LOCK_HASH: 'abc123',
        },
        timeout: 5000,
      }
    );
    assert.notEqual(missing.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Finance bypasses the global package archive while runtime caching and other callers retain defaults', () => {
  assert.equal(bun.inputs['package-cache-enabled'].default, 'true');
  const github = { ref: 'refs/heads/main', event_name: 'push', actor: 'vhpx' };
  for (const job of Object.values(native.jobs)) {
    const cacheIndex = job.steps.findIndex(
      (step) => step.uses === `./${actionPath}`
    );
    assert.ok(cacheIndex > 0);
    const cache = job.steps[cacheIndex];
    const setup = job.steps[cacheIndex + 1];
    const node = job.steps[cacheIndex + 2];
    assert.equal(setup.uses, './.github/actions/setup-bun-with-retry');
    assert.equal(cache.with['bun-version'], setup.with['bun-version']);
    assert.equal(cache.with['node-version'], node.with['node-version']);
    for (const app of ['finance', 'pay', 'shortener']) {
      assert.equal(enabled(cache.if, github, { app }), app === 'finance');
      const packageEnabled = enabled(
        setup.with['package-cache-enabled'],
        github,
        { app }
      );
      for (const step of bun.runs.steps.filter((s) => s.uses)) {
        const active = enabled(step.if, github, {
          'cache-enabled': 'true',
          'package-cache-enabled': packageEnabled,
        });
        const writer = step.uses.startsWith('actions/cache@');
        assert.equal(
          active,
          writer &&
            (step.with.key.startsWith('bun-runtime-') || app !== 'finance')
        );
        assert.equal(
          enabled(step.if, github, {
            'cache-enabled': 'false',
            'package-cache-enabled': 'true',
          }),
          false
        );
      }
    }
  }
});

test('cache hits cannot bypass installation, either profile, or runtime acceptance', () => {
  const finance = readWorkflow('finance-cloudflare.yaml');
  assert.equal(finance.jobs.native.with['profile-env'], undefined);
  assert.equal(
    finance.jobs['native-production'].with['profile-env'],
    'VITE_FINANCE_NATIVE_PROFILE=production'
  );
  for (const job of Object.values(native.jobs)) {
    assert.equal(job.permissions, undefined);
    const install = job.steps.find(
      (step) => step.run === 'bun install --frozen-lockfile --ignore-scripts'
    );
    assert.ok(install);
    assert.equal(install.if, undefined);
    const prereqs = job.steps.find(
      (step) => step.name === 'Install runtime prerequisites'
    );
    assert.equal(prereqs.if, "env.RUNTIME_SETUP_COMMAND != ''");
    assert.equal(prereqs['continue-on-error'], undefined);
    const runtime = job.steps.find(
      (step) => step.run === 'bash -c "$RUNTIME_COMMAND"'
    );
    assert.equal(runtime.if, undefined);
    assert.equal(runtime['continue-on-error'], undefined);
  }
  for (const event of ['push', 'pull_request']) {
    assert.ok(finance.on[event].paths.includes(`${actionPath}/**`));
    assert.ok(finance.on[event].paths.includes('scripts/ci/finance-native-*'));
  }
});

test('only the staging validation job seeds caches; sibling and restore jobs never duplicate uploads', () => {
  assert.equal(action.inputs.save.default, 'false');
  const validateCache = native.jobs.validate.steps.find(
    (step) => step.uses === `./${actionPath}`
  );
  for (const profile of ['', 'VITE_FINANCE_NATIVE_PROFILE=production']) {
    assert.equal(
      enabled(validateCache.with.save, {}, { 'profile-env': profile }),
      profile ? 'false' : 'true'
    );
  }
  const restore = native.jobs['restore-acceptance'].steps.find(
    (step) => step.uses === `./${actionPath}`
  );
  assert.equal(restore.with.save, 'false');
});
