const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COMPOSE_FILE,
  DOCKER_HOST_ALIAS,
  PROD_COMPOSE_FILE,
  WEB_ENV_FILE,
  getComposeFile,
  getComposeEnvironment,
  parseArgs,
  parseEnvFile,
  rewriteLocalhostUrl,
  runDockerWebWorkflow,
} = require('./docker-web.js');

function createFsStub({ envFileContent = '', hasEnvFile = true } = {}) {
  return {
    existsSync(targetPath) {
      if (targetPath === WEB_ENV_FILE) {
        return hasEnvFile;
      }

      return false;
    },
    readFileSync(targetPath) {
      if (targetPath !== WEB_ENV_FILE) {
        throw new Error(`Unexpected read for ${targetPath}`);
      }

      return envFileContent;
    },
  };
}

test('parseArgs keeps redis profile before the compose action', () => {
  assert.deepEqual(parseArgs(['up', '--profile', 'redis', '-d']), {
    action: 'up',
    composeArgs: ['-d'],
    composeGlobalArgs: ['--profile', 'redis'],
    mode: 'dev',
    resetSupabase: false,
    withSupabase: false,
  });
});

test('parseArgs accepts prod mode', () => {
  assert.deepEqual(parseArgs(['up', '--mode', 'prod']), {
    action: 'up',
    composeArgs: [],
    composeGlobalArgs: [],
    mode: 'prod',
    resetSupabase: false,
    withSupabase: false,
  });
});

test('parseEnvFile ignores comments and unquotes values', () => {
  const fsStub = createFsStub({
    envFileContent: [
      '# Comment',
      'NEXT_PUBLIC_SUPABASE_URL="http://localhost:8001"',
      'SUPABASE_SECRET_KEY=test-secret',
    ].join('\n'),
  });

  assert.deepEqual(parseEnvFile(WEB_ENV_FILE, fsStub), {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:8001',
    SUPABASE_SECRET_KEY: 'test-secret',
  });
});

test('rewriteLocalhostUrl maps local URLs to the Docker host alias', () => {
  assert.equal(
    rewriteLocalhostUrl('http://localhost:8001'),
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(
    rewriteLocalhostUrl('http://[::1]:8001'),
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(
    rewriteLocalhostUrl('https://127.0.0.1:9999/path'),
    `https://${DOCKER_HOST_ALIAS}:9999/path`
  );
  assert.equal(
    rewriteLocalhostUrl('https://example.supabase.co'),
    'https://example.supabase.co'
  );
});

test('getComposeEnvironment derives a server-side Supabase URL for Docker', () => {
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001',
  });

  const env = getComposeEnvironment({
    baseEnv: { PATH: 'test-path' },
    envFilePath: WEB_ENV_FILE,
    fsImpl: fsStub,
  });

  assert.equal(env.PATH, 'test-path');
  assert.equal(env.COMPOSE_DOCKER_CLI_BUILD, '1');
  assert.equal(
    env.DOCKER_INTERNAL_SUPABASE_URL,
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(env.DOCKER_BUILDKIT, '1');
});

test('getComposeFile resolves the expected compose file for each mode', () => {
  assert.equal(getComposeFile('dev'), COMPOSE_FILE);
  assert.equal(getComposeFile('prod'), PROD_COMPOSE_FILE);
});

test('runDockerWebWorkflow only runs docker compose for dev:web:docker', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({
      args,
      command,
      env: options.env,
      stdio: options.stdio ?? 'inherit',
    });

    return { code: 0, signal: null };
  };

  await runDockerWebWorkflow(parseArgs(['up']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ['docker', ['compose', 'version']],
      [
        'docker',
        ['compose', '-f', COMPOSE_FILE, 'up', '--build', '--remove-orphans'],
      ],
    ]
  );
  assert.equal(calls[0].stdio, 'ignore');
  assert.equal(
    calls[1].env.DOCKER_INTERNAL_SUPABASE_URL,
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(calls[1].env.COMPOSE_DOCKER_CLI_BUILD, '1');
  assert.equal(calls[1].env.DOCKER_BUILDKIT, '1');
});

test('runDockerWebWorkflow uses the production compose file when requested', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({
      args,
      command,
      env: options.env,
      stdio: options.stdio ?? 'inherit',
    });

    return { code: 0, signal: null };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--mode', 'prod']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ['docker', ['compose', 'version']],
      [
        'docker',
        [
          'compose',
          '-f',
          PROD_COMPOSE_FILE,
          'up',
          '--build',
          '--remove-orphans',
        ],
      ],
    ]
  );
});

test('runDockerWebWorkflow starts and resets Supabase before Docker when requested', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  });
  const runCommand = async (command, args) => {
    calls.push([command, args]);
    return { code: 0, signal: null };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--reset-supabase']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(calls, [
    ['docker', ['compose', 'version']],
    ['bun', ['sb:start']],
    ['bun', ['sb:reset']],
    [
      'docker',
      ['compose', '-f', COMPOSE_FILE, 'up', '--build', '--remove-orphans'],
    ],
  ]);
});

test('runDockerWebWorkflow throws a clear error when apps/web/.env.local is missing', async () => {
  await assert.rejects(
    () =>
      runDockerWebWorkflow(parseArgs(['up']), {
        env: { PATH: 'test-path' },
        fsImpl: createFsStub({ hasEnvFile: false }),
        runCommand: async () => ({ code: 0, signal: null }),
      }),
    /Missing required env file/
  );
});

test('runDockerWebWorkflow requires SRH_TOKEN for the production redis profile', async () => {
  await assert.rejects(
    () =>
      runDockerWebWorkflow(
        parseArgs(['up', '--mode', 'prod', '--profile', 'redis']),
        {
          env: { PATH: 'test-path' },
          fsImpl: createFsStub({
            envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
          }),
          runCommand: async () => ({ code: 0, signal: null }),
        }
      ),
    /SRH_TOKEN must be set/
  );
});
