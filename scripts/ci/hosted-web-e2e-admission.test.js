const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  BUILD_CONTEXT_KEY,
  admissionContext,
  buildAdmissionContext,
} = require('./hosted-web-e2e-admission');
const { getBuildWebDockerArgs } = require('../build-web-docker');
const { plan } = require('./run-web-e2e-report-only');
const { createLocalE2EEnvFileContent } = require('../e2e-local-environment');
const trusted = {
  CI: 'true',
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_WORKFLOW_REF:
    'tutur3u/platform/.github/workflows/e2e-smoke-report-only.yaml@refs/heads/main',
  GITHUB_REF: 'refs/heads/main',
  RUNNER_ENVIRONMENT: 'github-hosted',
  RUNNER_OS: 'Linux',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
};
const buildEnv = (context = trusted) => ({
  [BUILD_CONTEXT_KEY]: JSON.stringify(context),
});
test('exact admitted command includes Web dependency orchestration and bounded concurrency', () => {
  assert.deepEqual(
    getBuildWebDockerArgs({
      ...buildEnv(),
      DOCKER_WEB_TURBO_CONCURRENCY: '999',
    }),
    [
      'x',
      '--no-install',
      'turbo',
      'run',
      'build:docker',
      '--filter=@tuturuuu/web',
      '--concurrency=1',
    ]
  );
  const turbo = JSON.parse(fs.readFileSync('turbo.json', 'utf8'));
  assert.deepEqual(turbo.tasks['build:docker'].dependsOn, ['^build']);
});
test('ordinary builds retain paused alias', () => {
  for (const env of [{}, { CI: 'true' }, { ALLOW_DOCKER: '1' }, trusted])
    assert.deepEqual(getBuildWebDockerArgs(env), [
      'run',
      'build:web:docker',
      '--',
      '--concurrency=1',
    ]);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts['build:web:docker'], /paused-runtimes/);
});
test('missing, hostile and malformed context fails before command selection', () => {
  for (const key of Object.keys(trusted)) {
    for (const value of [undefined, '', 'wrong', trusted[key] + '\n'])
      assert.throws(
        () => getBuildWebDockerArgs(buildEnv({ ...trusted, [key]: value })),
        /limited|Invalid hosted/
      );
  }
  for (const value of ['pull_request', 'pull_request_target'])
    assert.throws(
      () => admissionContext({ ...trusted, GITHUB_EVENT_NAME: value }),
      /limited/
    );
});
test('builder rejects malformed and non-allowlisted envelopes', () => {
  for (const raw of ['', null, 'not-json', '[]', '{}', '{"CI":"true"}'])
    assert.throws(
      () => getBuildWebDockerArgs({ [BUILD_CONTEXT_KEY]: raw }),
      /Invalid hosted/
    );
  assert.throws(
    () =>
      getBuildWebDockerArgs(buildEnv({ ...trusted, GITHUB_TOKEN: 'fixture' })),
    /Invalid hosted/
  );
});
test('allowlisted context round trips through synthetic web_env without credentials', () => {
  const context = admissionContext({
    ...trusted,
    GITHUB_TOKEN: 'fixture',
    PRIVATE_VALUE: 'fixture',
  });
  assert.deepEqual(context, trusted);
  const content = createLocalE2EEnvFileContent(buildEnv(context));
  const restored = Object.fromEntries(
    content
      .trim()
      .split('\n')
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1)];
      })
  );
  assert.deepEqual(buildAdmissionContext(restored), trusted);
  assert.ok(!content.includes('GITHUB_TOKEN'));
  assert.ok(!content.includes('PRIVATE_VALUE'));
  assert.match(
    fs.readFileSync('apps/web/Dockerfile', 'utf8'),
    /bun --env-file=\/tmp\/web.env .\/scripts\/build-web-docker.js/
  );
});
test('admitted wrapper preserves disabled services', () => {
  const p = plan({
    ...trusted,
    GITHUB_WORKSPACE: '/fixture',
    RUNNER_TEMP: '/tmp',
  });
  for (const key of [
    'DOCKER_BACKEND_ENABLED',
    'E2E_DOCKER_WEB_CRON_RUNNER_ENABLED',
    'DOCKER_WEB_CRON_RUNNER_ENABLED',
    'E2E_DOCKER_NATIVE_BUILD',
    'E2E_DOCKER_NATIVE_SUPPORT_BUILD',
  ])
    assert.equal(p.env[key], '0');
});

test('env writer propagates validated context and rejects invalid context before writing', () => {
  const os = require('node:os');
  const path = require('node:path');
  const { ensureLocalE2EEnvFile } = require('./hosted-web-e2e-admission');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-e2e-admission-'));
  const file = path.join(dir, 'web.env');
  try {
    ensureLocalE2EEnvFile(file, {}, { ...trusted, GITHUB_TOKEN: 'fixture' });
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      content.includes(`${BUILD_CONTEXT_KEY}=${JSON.stringify(trusted)}\n`)
    );
    for (const key of Object.keys(trusted))
      assert.ok(!content.includes(`\n${key}=`));
    assert.ok(!content.includes('GITHUB_TOKEN'));
    assert.throws(
      () =>
        ensureLocalE2EEnvFile(
          file,
          {},
          { ...trusted, GITHUB_RUN_ID: '1\nINJECT=1' }
        ),
      /limited/
    );
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('BuildKit ambient CI=1 preserves admitted context through Bun env-file loading', (t) => {
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const { ensureLocalE2EEnvFile } = require('./hosted-web-e2e-admission');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-e2e-builder-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'web.env');
  ensureLocalE2EEnvFile(file, {}, trusted);
  const env = { ...process.env, CI: '1' };
  for (const key of Object.keys(trusted)) {
    if (key !== 'CI') delete env[key];
  }
  const helper = JSON.stringify(require.resolve('../build-web-docker'));
  const result = spawnSync(
    'bun',
    [
      `--env-file=${file}`,
      '--eval',
      `const { getBuildWebDockerArgs } = require(${helper}); process.stdout.write(JSON.stringify(getBuildWebDockerArgs(process.env)));`,
    ],
    { env, encoding: 'utf8', timeout: 10000 }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout),
    getBuildWebDockerArgs(buildEnv())
  );
});
