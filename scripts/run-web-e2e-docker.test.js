const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LOCAL_E2E_AUTH_BYPASS,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD,
  LOCAL_E2E_SUPABASE_URL,
} = require('./e2e-local-environment.js');
const {
  ensureLocalE2EEnvFile,
  getDockerMemoryLimit,
  getE2EComposeProjectName,
  getDockerWebDownArgs,
  getDockerWebUpArgs,
  isE2EComposeProjectName,
  parseE2EProjectImageTags,
  removeE2EProjectImages,
  shouldKeepStack,
} = require('./run-web-e2e-docker.js');

test('getDockerWebUpArgs starts production blue-green Docker with reset local Supabase', () => {
  assert.deepEqual(getDockerWebUpArgs('tmp/e2e/web.env', {}), [
    'up',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--reset-supabase',
    '--build-memory',
    'auto',
    '--build-cpus',
    'auto',
    '--build-max-parallelism',
    'auto',
    '--env-file',
    'tmp/e2e/web.env',
  ]);
  assert.deepEqual(
    getDockerWebUpArgs('tmp/e2e/web.env', {
      E2E_DOCKER_BUILD_CPUS: '2',
      E2E_DOCKER_BUILD_MAX_PARALLELISM: '1',
      E2E_DOCKER_BUILD_MEMORY: '8g',
    }).slice(6, 12),
    [
      '--build-memory',
      '8g',
      '--build-cpus',
      '2',
      '--build-max-parallelism',
      '1',
    ]
  );
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
    '--volumes',
    '--rmi',
    'local',
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
    assert.match(content, new RegExp(LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD));
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

test('getDockerMemoryLimit reads Docker Desktop memory when available', async () => {
  assert.equal(
    await getDockerMemoryLimit({
      env: { PATH: 'test-path' },
      runCommandForOutput: async () => ({
        stderr: '',
        stdout: `${9364279296}\n`,
      }),
    }),
    '9364279296'
  );
  assert.equal(
    await getDockerMemoryLimit({
      env: { PATH: 'test-path' },
      runCommandForOutput: async () => {
        throw new Error('docker unavailable');
      },
    }),
    null
  );
});

test('getE2EComposeProjectName only accepts E2E-scoped projects', () => {
  assert.equal(isE2EComposeProjectName('ttr-e2e-local-123'), true);
  assert.equal(isE2EComposeProjectName('tuturuuu'), false);
  assert.equal(
    getE2EComposeProjectName({
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'ttr-e2e-local-123',
    }),
    'ttr-e2e-local-123'
  );
  assert.equal(
    getE2EComposeProjectName({
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
    }),
    null
  );
});

test('parseE2EProjectImageTags selects only current E2E project images', () => {
  assert.deepEqual(
    parseE2EProjectImageTags(
      [
        'ttr-e2e-local-123-web-blue:latest',
        'ttr-e2e-local-123-web-green:latest',
        'ttr-e2e-local-123-web-cache:abc123',
        'ttr-e2e-local-456-web-blue:latest',
        'postgres:16-alpine',
        '<none>:<none>',
      ].join('\n'),
      'ttr-e2e-local-123'
    ),
    [
      'ttr-e2e-local-123-web-blue:latest',
      'ttr-e2e-local-123-web-cache:abc123',
      'ttr-e2e-local-123-web-green:latest',
    ]
  );
});

test('removeE2EProjectImages removes current project image tags', async () => {
  const calls = [];

  const removed = await removeE2EProjectImages({
    env: { DOCKER_WEB_COMPOSE_PROJECT_NAME: 'ttr-e2e-local-123' },
    runCommand: async (command, args) => {
      calls.push([command, args]);
    },
    runCommandForOutput: async (command, args) => {
      calls.push([command, args]);
      return {
        stderr: '',
        stdout: [
          'ttr-e2e-local-123-web-blue:latest',
          'ttr-e2e-local-456-web-blue:latest',
        ].join('\n'),
      };
    },
  });

  assert.deepEqual(removed, ['ttr-e2e-local-123-web-blue:latest']);
  assert.deepEqual(calls, [
    ['docker', ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']],
    ['docker', ['image', 'rm', 'ttr-e2e-local-123-web-blue:latest']],
  ]);
});

test('removeE2EProjectImages skips non-E2E project names', async () => {
  const removed = await removeE2EProjectImages({
    env: { DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu' },
    runCommand: async () => {
      throw new Error('should not remove images');
    },
    runCommandForOutput: async () => {
      throw new Error('should not list images');
    },
  });

  assert.deepEqual(removed, []);
});
