const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BACKEND_CONTAINER,
  DEFAULT_COMPOSE_FILE,
  DEFAULT_TANSTACK_WEB_PORT,
  HEALTH_CONTAINERS,
  HELP_TEXT,
  TANSTACK_WEB_CONTAINER,
  buildCommandPlan,
  getBackendPort,
  getComposeDownArgs,
  getComposeLogsArgs,
  getComposePsArgs,
  getComposeUpArgs,
  getHealthInspectDetailArgs,
  getHealthInspectArgs,
  getPlaywrightArgs,
  getTanStackWebPort,
  isHealthyStatus,
  parseArgs,
  resolveBaseUrl,
  runTanStackE2EDocker,
  waitForContainersHealthy,
} = require('./run-tanstack-e2e-docker.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const TANSTACK_WEB_DIR = path.join(ROOT_DIR, 'apps', 'tanstack-web');

test('parseArgs returns dual-stack defaults', () => {
  assert.deepEqual(parseArgs([]), {
    baseUrl: null,
    build: true,
    composeFile: DEFAULT_COMPOSE_FILE,
    help: false,
    keepUp: false,
    playwrightArgs: [],
  });
  assert.equal(DEFAULT_COMPOSE_FILE, 'docker-compose.tanstack-dual.yml');
  assert.match(
    HELP_TEXT,
    /apps\/docs\/build\/devops\/tanstack-rust-cutover-runbook\.mdx/u
  );
  assert.doesNotMatch(HELP_TEXT, /docs\/CUTOVER-RUNBOOK\.md/u);
});

test('parseArgs handles each flag', () => {
  assert.equal(parseArgs(['--no-build']).build, false);
  assert.equal(parseArgs(['--keep-up']).keepUp, true);
  assert.equal(
    parseArgs(['--base-url', 'http://localhost:9999']).baseUrl,
    'http://localhost:9999'
  );
  assert.equal(
    parseArgs(['--base-url=http://localhost:9999']).baseUrl,
    'http://localhost:9999'
  );
  assert.equal(
    parseArgs(['--compose-file', 'custom.yml']).composeFile,
    'custom.yml'
  );
  assert.equal(
    parseArgs(['--compose-file=custom.yml']).composeFile,
    'custom.yml'
  );
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('parseArgs forwards trailing args verbatim to Playwright', () => {
  assert.deepEqual(
    parseArgs(['--no-build', '--', '--project', 'chromium', 'foo.spec.ts'])
      .playwrightArgs,
    ['--project', 'chromium', 'foo.spec.ts']
  );
});

test('parseArgs rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown argument: --nope/u);
});

test('getTanStackWebPort and getBackendPort fall back to defaults', () => {
  assert.equal(getTanStackWebPort({}), DEFAULT_TANSTACK_WEB_PORT);
  assert.equal(getTanStackWebPort({ TANSTACK_WEB_PORT: '17824' }), '17824');
  assert.equal(getTanStackWebPort({ TANSTACK_WEB_PORT: 'nope' }), '7824');
  assert.equal(getBackendPort({}), '7820');
  assert.equal(getBackendPort({ BACKEND_PORT: '17820' }), '17820');
});

test('resolveBaseUrl prefers the flag, then env, then the published port', () => {
  assert.equal(
    resolveBaseUrl({ baseUrl: 'http://override.localhost' }, {}),
    'http://override.localhost'
  );
  assert.equal(
    resolveBaseUrl(
      { baseUrl: null },
      { TANSTACK_WEB_E2E_BASE_URL: 'http://from-env.localhost' }
    ),
    'http://from-env.localhost'
  );
  assert.equal(resolveBaseUrl({ baseUrl: null }, {}), 'http://127.0.0.1:7824');
  assert.equal(
    resolveBaseUrl({ baseUrl: null }, { TANSTACK_WEB_PORT: '17824' }),
    'http://127.0.0.1:17824'
  );
});

test('getComposeUpArgs includes --build by default and omits it for --no-build', () => {
  assert.deepEqual(
    getComposeUpArgs({ build: true, composeFile: DEFAULT_COMPOSE_FILE }),
    ['compose', '-f', DEFAULT_COMPOSE_FILE, 'up', '-d', '--build']
  );
  assert.deepEqual(
    getComposeUpArgs({ build: false, composeFile: 'custom.yml' }),
    ['compose', '-f', 'custom.yml', 'up', '-d']
  );
});

test('getComposeDownArgs tears down the same compose file', () => {
  assert.deepEqual(getComposeDownArgs({ composeFile: DEFAULT_COMPOSE_FILE }), [
    'compose',
    '-f',
    DEFAULT_COMPOSE_FILE,
    'down',
  ]);
});

test('getComposePsArgs and getComposeLogsArgs scope diagnostics to the dual stack', () => {
  assert.deepEqual(getComposePsArgs({ composeFile: DEFAULT_COMPOSE_FILE }), [
    'compose',
    '-f',
    DEFAULT_COMPOSE_FILE,
    'ps',
    '-a',
  ]);
  assert.deepEqual(getComposeLogsArgs({ composeFile: DEFAULT_COMPOSE_FILE }), [
    'compose',
    '-f',
    DEFAULT_COMPOSE_FILE,
    'logs',
    '--tail=300',
    'backend',
    'tanstack-web',
  ]);
});

test('getHealthInspectArgs polls Docker health status for a container', () => {
  assert.deepEqual(HEALTH_CONTAINERS, [
    BACKEND_CONTAINER,
    TANSTACK_WEB_CONTAINER,
  ]);
  assert.deepEqual(getHealthInspectArgs('backend-dual'), [
    'inspect',
    '--format',
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
    'backend-dual',
  ]);
});

test('getHealthInspectDetailArgs captures only Docker healthcheck state', () => {
  assert.deepEqual(getHealthInspectDetailArgs('tanstack-web-dual'), [
    'inspect',
    '--format',
    '{{json .State.Health}}',
    'tanstack-web-dual',
  ]);
});

test('getPlaywrightArgs builds the playwright test invocation', () => {
  assert.deepEqual(getPlaywrightArgs({ playwrightArgs: [] }), [
    'x',
    'playwright',
    'test',
  ]);
  assert.deepEqual(
    getPlaywrightArgs({ playwrightArgs: ['--project', 'chromium'] }),
    ['x', 'playwright', 'test', '--project', 'chromium']
  );
});

test('isHealthyStatus only accepts a healthy Docker status', () => {
  assert.equal(isHealthyStatus('healthy'), true);
  assert.equal(isHealthyStatus(' Healthy \n'), true);
  assert.equal(isHealthyStatus('starting'), false);
  assert.equal(isHealthyStatus('unhealthy'), false);
  assert.equal(isHealthyStatus('running'), false);
  assert.equal(isHealthyStatus(''), false);
});

test('buildCommandPlan plans up/build, health, playwright, and teardown', () => {
  const plan = buildCommandPlan(parseArgs([]), {});

  assert.deepEqual(plan.up, {
    args: ['compose', '-f', DEFAULT_COMPOSE_FILE, 'up', '-d', '--build'],
    command: 'docker',
  });
  assert.equal(plan.baseUrl, 'http://127.0.0.1:7824');
  assert.deepEqual(
    plan.healthChecks.map((check) => check.container),
    [BACKEND_CONTAINER, TANSTACK_WEB_CONTAINER]
  );
  assert.deepEqual(
    plan.diagnostics.map((diagnostic) => diagnostic.fileName),
    [
      'docker-compose-ps.txt',
      'docker-compose-services.log',
      'backend-dual-health.json',
      'tanstack-web-dual-health.json',
    ]
  );
  assert.ok(
    plan.healthChecks.every(
      (check) => check.command === 'docker' && check.args[0] === 'inspect'
    )
  );
  assert.deepEqual(plan.playwright, {
    args: ['x', 'playwright', 'test'],
    command: 'bun',
    cwd: TANSTACK_WEB_DIR,
    env: {
      BASE_URL: 'http://127.0.0.1:7824',
      TANSTACK_WEB_E2E_BASE_URL: 'http://127.0.0.1:7824',
    },
  });
  assert.deepEqual(plan.teardown, {
    args: ['compose', '-f', DEFAULT_COMPOSE_FILE, 'down'],
    command: 'docker',
  });
});

test('buildCommandPlan omits --build for --no-build and omits teardown for --keep-up', () => {
  const noBuild = buildCommandPlan(parseArgs(['--no-build']), {});
  assert.deepEqual(noBuild.up.args, [
    'compose',
    '-f',
    DEFAULT_COMPOSE_FILE,
    'up',
    '-d',
  ]);

  const keepUp = buildCommandPlan(parseArgs(['--keep-up']), {});
  assert.equal(keepUp.teardown, null);
});

test('buildCommandPlan resolves base-url overrides and the compose file', () => {
  const plan = buildCommandPlan(
    parseArgs([
      '--base-url',
      'http://custom.localhost:8080',
      '--compose-file',
      'custom.yml',
      '--',
      '--project',
      'chromium',
    ]),
    {}
  );

  assert.equal(plan.baseUrl, 'http://custom.localhost:8080');
  assert.deepEqual(plan.playwright.args, [
    'x',
    'playwright',
    'test',
    '--project',
    'chromium',
  ]);
  assert.deepEqual(plan.playwright.env, {
    BASE_URL: 'http://custom.localhost:8080',
    TANSTACK_WEB_E2E_BASE_URL: 'http://custom.localhost:8080',
  });
  assert.deepEqual(plan.up.args, [
    'compose',
    '-f',
    'custom.yml',
    'up',
    '-d',
    '--build',
  ]);
  assert.deepEqual(plan.teardown.args, ['compose', '-f', 'custom.yml', 'down']);
});

test('waitForContainersHealthy resolves once both containers are healthy', async () => {
  const plan = buildCommandPlan(parseArgs([]), {});
  const calls = [];
  const statuses = {
    'backend-dual': ['starting', 'healthy'],
    'tanstack-web-dual': ['starting', 'starting', 'healthy'],
  };

  await waitForContainersHealthy(plan, {
    env: { PATH: 'test-path' },
    execFile: (command, args, _options, callback) => {
      const container = args.at(-1);
      calls.push([command, container]);
      const queue = statuses[container];
      const status = queue.length > 1 ? queue.shift() : queue[0];
      callback(null, `${status}\n`, '');
    },
    intervalMs: 0,
    output: { write() {} },
    sleep: async () => {},
    timeoutMs: 5_000,
  });

  assert.ok(calls.every(([command]) => command === 'docker'));
  assert.ok(calls.some(([, container]) => container === 'backend-dual'));
  assert.ok(calls.some(([, container]) => container === 'tanstack-web-dual'));
});

test('waitForContainersHealthy times out and surfaces the last status', async () => {
  const plan = buildCommandPlan(parseArgs([]), {});

  await assert.rejects(
    () =>
      waitForContainersHealthy(plan, {
        env: {},
        execFile: (_command, _args, _options, callback) => {
          callback(null, 'starting\n', '');
        },
        intervalMs: 0,
        output: { write() {} },
        sleep: async () => {},
        timeoutMs: 10,
      }),
    /Timed out waiting for backend-dual, tanstack-web-dual to become healthy/u
  );
});

test('runTanStackE2EDocker prints help and runs nothing', async () => {
  const chunks = [];

  await runTanStackE2EDocker(['--help'], {
    env: {},
    output: {
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
    run: async () => {
      throw new Error('should not run any command for --help');
    },
  });

  assert.equal(chunks.join(''), HELP_TEXT);
  assert.match(
    chunks.join(''),
    /Usage: node scripts\/run-tanstack-e2e-docker/u
  );
});

test('runTanStackE2EDocker brings up, runs Playwright, then tears down', async () => {
  const calls = [];

  await runTanStackE2EDocker([], {
    env: { PATH: 'test-path' },
    execFile: (_command, _args, _options, callback) => {
      callback(null, 'healthy\n', '');
    },
    output: { write() {} },
    run: async (command, args, options = {}) => {
      calls.push({ args, command, cwd: options.cwd, env: options.env });
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => [command, args.join(' ')]),
    [
      ['docker', `compose -f ${DEFAULT_COMPOSE_FILE} up -d --build`],
      ['bun', 'x playwright test'],
      ['docker', `compose -f ${DEFAULT_COMPOSE_FILE} down`],
    ]
  );
  assert.equal(calls[1].cwd, TANSTACK_WEB_DIR);
  assert.equal(calls[1].env.BASE_URL, 'http://127.0.0.1:7824');
  assert.equal(calls[1].env.TANSTACK_WEB_E2E_BASE_URL, 'http://127.0.0.1:7824');
});

test('runTanStackE2EDocker skips teardown when --keep-up is passed', async () => {
  const calls = [];

  await runTanStackE2EDocker(['--keep-up', '--no-build'], {
    env: {},
    execFile: (_command, _args, _options, callback) => {
      callback(null, 'healthy\n', '');
    },
    output: { write() {} },
    run: async (command, args) => {
      calls.push([command, args.join(' ')]);
    },
  });

  assert.deepEqual(calls, [
    ['docker', `compose -f ${DEFAULT_COMPOSE_FILE} up -d`],
    ['bun', 'x playwright test'],
  ]);
  assert.ok(!calls.some(([, args]) => args.includes('down')));
});

test('runTanStackE2EDocker always tears down even when Playwright fails', async () => {
  const calls = [];

  await assert.rejects(
    () =>
      runTanStackE2EDocker([], {
        env: {},
        execFile: (_command, _args, _options, callback) => {
          callback(null, 'healthy\n', '');
        },
        output: { write() {} },
        run: async (command, args) => {
          calls.push([command, args.join(' ')]);

          if (command === 'bun') {
            throw new Error('playwright failed');
          }
        },
      }),
    /playwright failed/u
  );

  assert.deepEqual(calls, [
    ['docker', `compose -f ${DEFAULT_COMPOSE_FILE} up -d --build`],
    ['bun', 'x playwright test'],
    ['docker', `compose -f ${DEFAULT_COMPOSE_FILE} down`],
  ]);
});

test('runTanStackE2EDocker collects diagnostics before teardown when health fails', async () => {
  const diagnosticsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'tanstack-e2e-diagnostics-')
  );
  const events = [];

  await assert.rejects(
    () =>
      runTanStackE2EDocker([], {
        diagnosticsDir,
        env: {},
        execFile: (_command, args, _options, callback) => {
          const joinedArgs = args.join(' ');
          events.push(`exec:${joinedArgs}`);

          if (joinedArgs.includes('{{if .State.Health}}')) {
            callback(null, 'unhealthy\n', '');
            return;
          }

          if (joinedArgs.includes('ps -a')) {
            callback(null, 'compose ps output\n', '');
            return;
          }

          if (joinedArgs.includes('logs --tail=300')) {
            callback(null, 'compose logs output\n', '');
            return;
          }

          if (joinedArgs.includes('{{json .State.Health}}')) {
            callback(null, '{"Status":"unhealthy"}\n', '');
            return;
          }

          callback(null, '', '');
        },
        healthIntervalMs: 0,
        healthTimeoutMs: 1,
        output: { write() {} },
        run: async (command, args) => {
          events.push(`run:${command} ${args.join(' ')}`);
        },
        sleep: async () => {},
      }),
    /Timed out waiting for backend-dual, tanstack-web-dual to become healthy/u
  );

  const diagnosticIndex = events.findIndex((event) =>
    event.includes('logs --tail=300 backend tanstack-web')
  );
  const teardownIndex = events.findIndex((event) =>
    event.includes(`compose -f ${DEFAULT_COMPOSE_FILE} down`)
  );

  assert.ok(diagnosticIndex > -1);
  assert.ok(teardownIndex > diagnosticIndex);
  assert.equal(
    fs.readFileSync(path.join(diagnosticsDir, 'docker-compose-ps.txt'), 'utf8'),
    'compose ps output\n'
  );
  assert.equal(
    fs.readFileSync(
      path.join(diagnosticsDir, 'docker-compose-services.log'),
      'utf8'
    ),
    'compose logs output\n'
  );
  assert.equal(
    fs.readFileSync(
      path.join(diagnosticsDir, 'tanstack-web-dual-health.json'),
      'utf8'
    ),
    '{"Status":"unhealthy"}\n'
  );
});
