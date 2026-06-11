const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  COMPOSE_FILE,
  WEB_ENV_FILE,
  parseArgs,
  runDockerWebWorkflow,
} = require('./docker-web.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOCAL_SUPABASE_TEST_ENV = {
  DOCKER_WEB_ALLOW_LOCAL_SUPABASE: '1',
  PATH: 'test-path',
};

function createFsStub({ envFileContent = '', hasEnvFile = true } = {}) {
  return {
    existsSync(targetPath) {
      if (targetPath === WEB_ENV_FILE) {
        return hasEnvFile;
      }

      return false;
    },
    mkdirSync() {},
    readFileSync(targetPath) {
      if (targetPath !== WEB_ENV_FILE) {
        throw new Error(`Unexpected read for ${targetPath}`);
      }

      return envFileContent;
    },
    rmSync() {},
    writeFileSync() {},
  };
}

test('runDockerWebWorkflow starts and resets Supabase before Docker when requested', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push([command, args, options.cwd]);
    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--reset-supabase']), {
    env: LOCAL_SUPABASE_TEST_ENV,
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(calls, [
    ['docker', ['compose', 'version'], undefined],
    ['docker', ['info', '--format', '{{json .MemTotal}}'], undefined],
    ['bun', ['sb:start'], ROOT_DIR],
    ['bun', ['sb:reset'], ROOT_DIR],
    [
      'docker',
      [
        'compose',
        '-f',
        COMPOSE_FILE,
        '--profile',
        'redis',
        'up',
        '--build',
        '--remove-orphans',
      ],
      undefined,
    ],
  ]);
});

test('runDockerWebWorkflow retries transient Supabase reset failures with backoff', async () => {
  const calls = [];
  const delays = [];
  let resetAttempts = 0;
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({ args, command, cwd: options.cwd });

    if (command === 'bun' && args[0] === 'sb:reset') {
      resetAttempts += 1;

      if (resetAttempts < 3) {
        return {
          code: 1,
          signal: null,
          stderr:
            'Error status 502: An invalid response was received from the upstream server',
          stdout: '',
        };
      }
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--reset-supabase']), {
    env: {
      DOCKER_WEB_SUPABASE_RESET_RETRY_INITIAL_DELAY_MS: '10',
      DOCKER_WEB_SUPABASE_RESET_RETRY_MAX_ATTEMPTS: '4',
      DOCKER_WEB_SUPABASE_RESET_RETRY_MAX_DELAY_MS: '20',
      PATH: 'test-path',
    },
    fsImpl: fsStub,
    runCommand,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  assert.equal(resetAttempts, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.deepEqual(
    calls
      .filter(({ args, command }) => command === 'bun' && args[0] === 'sb:stop')
      .map(({ cwd }) => cwd),
    [ROOT_DIR, ROOT_DIR]
  );
  assert.deepEqual(
    calls
      .filter(
        ({ args, command }) => command === 'bun' && args[0] === 'sb:reset'
      )
      .map(({ cwd }) => cwd),
    [ROOT_DIR, ROOT_DIR, ROOT_DIR]
  );
  assert.ok(
    calls.some(
      ({ args, command }) => command === 'docker' && args.includes('up')
    )
  );
});

test('runDockerWebWorkflow does not retry non-transient Supabase reset failures', async () => {
  const calls = [];
  const delays = [];
  let resetAttempts = 0;
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({ args, command, cwd: options.cwd });

    if (command === 'bun' && args[0] === 'sb:reset') {
      resetAttempts += 1;

      return {
        code: 1,
        signal: null,
        stderr: 'ERROR: relation "workspace_quizzes" does not exist',
        stdout: '',
      };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await assert.rejects(
    runDockerWebWorkflow(parseArgs(['up', '--reset-supabase']), {
      env: {
        DOCKER_WEB_SUPABASE_RESET_RETRY_MAX_ATTEMPTS: '4',
        PATH: 'test-path',
      },
      fsImpl: fsStub,
      runCommand,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    }),
    /Command failed \(1\): bun sb:reset/u
  );

  assert.equal(resetAttempts, 1);
  assert.deepEqual(delays, []);
  assert.deepEqual(
    calls
      .filter(({ args, command }) => command === 'bun' && args[0] === 'sb:stop')
      .map(({ cwd }) => cwd),
    []
  );
  assert.deepEqual(
    calls
      .filter(
        ({ args, command }) => command === 'bun' && args[0] === 'sb:reset'
      )
      .map(({ cwd }) => cwd),
    [ROOT_DIR]
  );
  assert.ok(
    !calls.some(
      ({ args, command }) => command === 'docker' && args.includes('up')
    )
  );
});
