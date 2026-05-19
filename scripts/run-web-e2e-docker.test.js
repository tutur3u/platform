const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LOCAL_E2E_AUTH_BYPASS,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_SUPABASE_URL,
} = require('./e2e-local-environment.js');
const {
  ensureLocalE2EEnvFile,
  getDockerWebDownArgs,
  getDockerWebUpArgs,
  shouldKeepStack,
} = require('./run-web-e2e-docker.js');

test('getDockerWebUpArgs starts production blue-green Docker with reset local Supabase', () => {
  assert.deepEqual(getDockerWebUpArgs('tmp/e2e/web.env'), [
    'up',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--reset-supabase',
    '--build-memory',
    process.env.E2E_DOCKER_BUILD_MEMORY ?? '12g',
    '--build-cpus',
    process.env.E2E_DOCKER_BUILD_CPUS ?? '4',
    '--build-max-parallelism',
    process.env.E2E_DOCKER_BUILD_MAX_PARALLELISM ?? '1',
    '--env-file',
    'tmp/e2e/web.env',
  ]);
});

test('getDockerWebDownArgs stops the same production blue-green Docker stack', () => {
  assert.deepEqual(getDockerWebDownArgs('tmp/e2e/web.env'), [
    'down',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--env-file',
    'tmp/e2e/web.env',
  ]);
});

test('ensureLocalE2EEnvFile writes a local-only web env file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-e2e-env-'));
  const envFilePath = path.join(tempDir, 'web.env');

  try {
    ensureLocalE2EEnvFile(envFilePath);
    const content = fs.readFileSync(envFilePath, 'utf8');

    assert.match(content, new RegExp(`BASE_URL=${LOCAL_E2E_BASE_URL}`));
    assert.match(
      content,
      new RegExp(`NEXT_PUBLIC_APP_URL=${LOCAL_E2E_BASE_URL}`)
    );
    assert.match(
      content,
      new RegExp(`NEXT_PUBLIC_WEB_APP_URL=${LOCAL_E2E_BASE_URL}`)
    );
    assert.match(
      content,
      new RegExp(`NEXT_PUBLIC_SUPABASE_URL=${LOCAL_E2E_SUPABASE_URL}`)
    );
    assert.match(
      content,
      new RegExp(`TUTURUUU_LOCAL_E2E_AUTH_BYPASS=${LOCAL_E2E_AUTH_BYPASS}`)
    );
    assert.match(content, new RegExp(`WEB_APP_URL=${LOCAL_E2E_BASE_URL}`));
    assert.doesNotMatch(content, /supabase\.(co|in)/iu);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('shouldKeepStack supports explicit local debugging opt-in', () => {
  assert.equal(shouldKeepStack({}), false);
  assert.equal(shouldKeepStack({ E2E_KEEP_DOCKER_STACK: '1' }), true);
  assert.equal(shouldKeepStack({ E2E_KEEP_DOCKER_STACK: 'true' }), true);
});
