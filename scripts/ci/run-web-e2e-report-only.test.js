const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { plan, argsFor, claim, cleanup } = require('./run-web-e2e-report-only');

const trusted = {
  CI: 'true',
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_WORKFLOW_REF:
    'tutur3u/platform/.github/workflows/e2e-smoke-report-only.yaml@refs/heads/main',
  GITHUB_REF: 'refs/heads/main',
  RUNNER_ENVIRONMENT: 'self-hosted',
  RUNNER_OS: 'macOS',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_WORKSPACE: '/fixture',
  RUNNER_TEMP: '/fixture/tmp',
};

test('entrypoint refuses ordinary local execution before touching Docker', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'run-web-e2e-report-only.js'), 'smoke'],
    {
      env: { ...process.env, CI: 'false' },
      encoding: 'utf8',
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /limited to the trusted main/);
  for (const change of [
    { GITHUB_REF: 'refs/pull/1/merge' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { RUNNER_ENVIRONMENT: 'github-hosted' },
    { GITHUB_REPOSITORY: 'fork/platform' },
    {
      GITHUB_WORKFLOW_REF: trusted.GITHUB_WORKFLOW_REF.replace('main', 'other'),
    },
    { GITHUB_RUN_ID: '../escape' },
  ])
    assert.throws(() => plan({ ...trusted, ...change }), /limited/);
});

test('run plan isolates identities and preserves paused services and smoke limits', async () => {
  const p = plan(trusted, '/fixture');
  assert.notEqual(
    p.project,
    plan({ ...trusted, GITHUB_RUN_ATTEMPT: '2' }, '/fixture').project
  );
  assert.equal(p.env.DOCKER_BACKEND_ENABLED, '0');
  assert.equal(p.env.E2E_REUSE_LOCAL_REDIS, '0');
  assert.equal(p.env.E2E_KEEP_DOCKER_STACK, '0');
  const {
    getReusableWebImageSource,
    resolveReusableLocalRedisRuntime,
    shouldKeepStack,
  } = require('../run-web-e2e-docker');
  assert.equal(getReusableWebImageSource(p.env), null);
  assert.equal(shouldKeepStack(p.env), false);
  assert.equal(
    await resolveReusableLocalRedisRuntime({
      env: p.env,
      fetchImpl: () => {
        throw new Error('Unexpected shared Redis probe');
      },
    }),
    null
  );
  assert.equal(p.env.E2E_DOCKER_WEB_CRON_RUNNER_ENABLED, '0');
  assert.equal(p.env.E2E_DOCKER_BUILDKIT_PRUNE_AFTER_BUILD, '0');
  assert.match(p.env.PORTLESS_STATE_DIR, /ttr-e2e-report-123-1/);
  assert.ok(argsFor('smoke').includes('@smoke'));
  assert.ok(argsFor('smoke').includes('@quarantine'));
  assert.ok(argsFor('smoke').includes('--global-timeout=330000'));
  assert.ok(!argsFor('nightly').includes('@smoke'));
  assert.throws(() => argsFor('compare'));
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-e2e-admission-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'apps/database/supabase/config.toml');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, 'project_id = "fixture-original"\n');
  return {
    p: plan({ ...trusted, GITHUB_WORKSPACE: root, RUNNER_TEMP: root }, root),
    config,
  };
}

test('claim excludes a second run and cleanup only releases its own successful runtime', (t) => {
  const { p, config } = fixture(t);
  const calls = [];
  const run = (_, executable, args) => {
    calls.push([executable, ...args]);
    return '';
  };
  claim(p, run);
  assert.match(fs.readFileSync(config, 'utf8'), /ttr-e2e-report-123-1/);
  assert.throws(() => claim({ ...p, identity: 'other' }, run), /EEXIST/);
  const before = calls.length;
  cleanup({ ...p, identity: 'other' }, run);
  assert.equal(calls.length, before);
  assert.ok(fs.existsSync(p.lock));
  assert.throws(() => cleanup(p, run), /still alive/);
  const ownerFile = path.join(p.lock, 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  owner.pid = 2147483647;
  fs.writeFileSync(ownerFile, JSON.stringify(owner));
  cleanup(p, run);
  assert.equal(fs.existsSync(p.lock), false);
  assert.equal(
    fs.readFileSync(config, 'utf8'),
    'project_id = "fixture-original"\n'
  );
  assert.ok(calls.some((call) => call.join(' ') === 'bun sb:stop'));
  assert.ok(
    calls.some(
      (call) => call.join(' ') === 'bunx --no-install portless proxy stop'
    )
  );
});

test('busy Docker fails before rewriting config and cleanup failure retains the fence', (t) => {
  const { p, config } = fixture(t);
  assert.throws(() => claim(p, () => 'foreign-container'), /busy/);
  assert.equal(fs.existsSync(p.lock), false);
  assert.match(fs.readFileSync(config, 'utf8'), /fixture-original/);
  claim(p, () => '');
  const ownerFile = path.join(p.lock, 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
  owner.pid = 2147483647;
  fs.writeFileSync(ownerFile, JSON.stringify(owner));
  assert.throws(
    () =>
      cleanup(p, () => {
        throw new Error('stop failed');
      }),
    /stop failed/
  );
  assert.ok(fs.existsSync(p.lock));
  assert.throws(() => claim(p, () => ''), /EEXIST/);
});

test('Portless TLS marker stays inside the private runtime directory', () => {
  const privateDir = path.join(os.tmpdir(), 'web-e2e-portless-fixture');
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      "process.stdout.write(require('./scripts/run-web-e2e-docker').DEFAULT_PORTLESS_PROXY_TLS_MARKER)",
    ],
    {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, PORTLESS_STATE_DIR: privateDir },
      encoding: 'utf8',
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, path.join(privateDir, 'proxy.tls'));
});

test('workflow compatibility launcher forwards retained Bun CLI arguments intact', (t) => {
  const { p } = fixture(t);
  const { readWorkflow } = require('./workflow-yaml-test-helper');
  const step = readWorkflow('e2e-smoke-report-only.yaml').jobs.e2e.steps.find(
    (item) => item.name === 'Expose retained E2E CLI compatibility'
  );
  const pathFile = path.join(p.root, 'github-path');
  const result = spawnSync('bash', ['-e', '-c', step.run], {
    env: {
      ...process.env,
      RUNNER_TEMP: p.root,
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_PATH: pathFile,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const bin = fs.readFileSync(pathFile, 'utf8').trim();
  const fakeBin = path.join(p.root, 'fake-bin');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(
    path.join(fakeBin, 'bun'),
    '#!/bin/sh\nprintf \'%s\\n\' "$@"\n',
    { mode: 0o700 }
  );
  const forwarded = spawnSync(
    path.join(bin, 'bunx'),
    ['playwright', 'test', '--grep', 'auth smoke'],
    {
      env: { ...process.env, PATH: [fakeBin, '/bin'].join(path.delimiter) },
      encoding: 'utf8',
    }
  );
  assert.equal(forwarded.status, 0, forwarded.stderr);
  assert.deepEqual(forwarded.stdout.trim().split('\n'), [
    'x',
    'playwright',
    'test',
    '--grep',
    'auth smoke',
  ]);
});
