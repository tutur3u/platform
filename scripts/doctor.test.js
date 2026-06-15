const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzePortlessRoutes,
  checkDockerStatus,
  checkNodeVersion,
  checkPortlessCa,
  checkPortlessProxy,
  checkPortlessRoutes,
  checkRedisStatus,
  checkSupabaseStatus,
  collectDoctorChecks,
  formatDoctorReport,
  getPortlessAliasName,
  getPortlessAliasRemoveCommand,
  getFixActions,
  getFixSteps,
  parsePortlessRoutes,
  runDoctor,
  shouldUseColor,
  summarizeChecks,
} = require('./doctor');

const READY_STATUS = 'Proxy on 443: responding';
const NOT_READY_STATUS = 'Proxy on 443: not responding';

test('parsePortlessRoutes parses valid entries and tolerates garbage', () => {
  assert.deepEqual(
    parsePortlessRoutes(
      JSON.stringify([
        { hostname: 'inventory.tuturuuu.localhost', port: 4881, pid: 100 },
        { hostname: 'tuturuuu.localhost', port: '4294', pid: 0 },
        { nope: true },
      ])
    ),
    [
      { hostname: 'inventory.tuturuuu.localhost', port: 4881, pid: 100 },
      { hostname: 'tuturuuu.localhost', port: 4294, pid: 0 },
    ]
  );
  assert.deepEqual(parsePortlessRoutes('not json'), []);
  assert.deepEqual(parsePortlessRoutes('{"a":1}'), []);
});

test('checkNodeVersion flags versions below the minimum', () => {
  assert.equal(checkNodeVersion('v22.1.0', { minMajor: 22 }).status, 'ok');
  assert.equal(checkNodeVersion('v26.3.0', { minMajor: 22 }).status, 'ok');
  assert.equal(checkNodeVersion('v18.0.0', { minMajor: 22 }).status, 'fail');
});

test('checkPortlessProxy maps proxy readiness to a fixable check', () => {
  assert.equal(checkPortlessProxy(READY_STATUS).status, 'ok');

  const down = checkPortlessProxy(NOT_READY_STATUS);
  assert.equal(down.status, 'fail');
  assert.equal(down.fix, 'start-proxy');
});

test('analyzePortlessRoutes separates dead dynamic routes from dead aliases', () => {
  const routes = [
    { hostname: 'a.localhost', port: 4881, pid: 1 },
    { hostname: 'b.localhost', port: 7815, pid: 99 },
    { hostname: 'c.localhost', port: 7821, pid: 0 },
  ];
  const reachability = new Map([
    [4881, true],
    [7815, false],
    [7821, false],
  ]);

  const { annotated, staleAlias, staleDynamic } = analyzePortlessRoutes(
    routes,
    reachability
  );
  assert.equal(annotated[0].reachable, true);
  assert.equal(annotated[2].isAlias, true);
  assert.deepEqual(
    staleDynamic.map((route) => route.port),
    [7815]
  );
  assert.deepEqual(
    staleAlias.map((route) => route.port),
    [7821]
  );
});

test('checkPortlessRoutes fails (and offers a reset) when a live route is dead', () => {
  const { annotated, staleAlias, staleDynamic } = analyzePortlessRoutes(
    [
      { hostname: 'inventory.tuturuuu.localhost', port: 4881, pid: 1 },
      { hostname: 'inventory.tuturuuu.localhost', port: 7815, pid: 88 },
    ],
    new Map([
      [4881, true],
      [7815, false],
    ])
  );

  const check = checkPortlessRoutes({
    annotated,
    routesExist: true,
    staleAlias,
    staleDynamic,
  });
  assert.equal(check.status, 'fail');
  assert.equal(check.fix, 'reset-proxy');
  assert.ok(check.routes.some((line) => line.includes('DEAD')));
});

test('checkPortlessRoutes only warns for a dead static alias', () => {
  const { annotated, staleAlias, staleDynamic } = analyzePortlessRoutes(
    [
      {
        hostname: 'zalo-qr-chat-setup.chat.tuturuuu.localhost',
        port: 7821,
        pid: 0,
      },
    ],
    new Map([[7821, false]])
  );

  const check = checkPortlessRoutes({
    annotated,
    routesExist: true,
    staleAlias,
    staleDynamic,
  });
  assert.equal(check.status, 'warn');
  assert.equal(check.fix, undefined);
  assert.match(check.detail, /inactive static alias/u);
  assert.match(
    check.routes.join('\n'),
    /inactive alias \(remove: bunx portless alias --remove zalo-qr-chat-setup\.chat\.tuturuuu\)/u
  );
  assert.match(check.hint, /does not delete static aliases/u);
});

test('checkPortlessRoutes warns when no routes are registered', () => {
  assert.equal(
    checkPortlessRoutes({
      annotated: [],
      routesExist: false,
      staleAlias: [],
      staleDynamic: [],
    }).status,
    'warn'
  );
  assert.equal(
    checkPortlessRoutes({
      annotated: [],
      routesExist: true,
      staleAlias: [],
      staleDynamic: [],
    }).status,
    'warn'
  );
});

test('checkPortlessCa warns only when the CA is missing', () => {
  assert.equal(checkPortlessCa(true).status, 'ok');
  assert.equal(checkPortlessCa(false).status, 'warn');
});

test('checkDockerStatus reports daemon reachability', () => {
  assert.equal(
    checkDockerStatus({ status: 0, stdout: 'Server Version: 27', stderr: '' })
      .status,
    'ok'
  );

  const down = checkDockerStatus({
    status: 1,
    stdout: '',
    stderr: 'Cannot connect to the Docker daemon',
  });
  assert.equal(down.status, 'fail');
  assert.match(down.detail, /Cannot connect/u);
  assert.match(down.hint, /Docker/u);
});

test('checkSupabaseStatus reports local API and DB ports as the required stack', async () => {
  const checks = [];
  const check = await checkSupabaseStatus({
    dockerOk: true,
    probePort: (port) => {
      checks.push(port);
      return Promise.resolve(port === 8001 || port === 8002);
    },
  });

  assert.equal(check.status, 'ok');
  assert.deepEqual(checks.sort(), [8001, 8002, 8003]);
  assert.match(check.detail, /API :8001 ok/u);
  assert.match(check.detail, /Studio :8003 down/u);
});

test('checkSupabaseStatus warns without probing when Docker is unavailable', async () => {
  const check = await checkSupabaseStatus({
    dockerOk: false,
    probePort: () => {
      throw new Error('should not probe without Docker');
    },
  });

  assert.equal(check.status, 'warn');
  assert.match(check.detail, /Docker/u);
});

test('checkRedisStatus requires Redis and the HTTP bridge', async () => {
  const ok = await checkRedisStatus({
    dockerOk: true,
    probePort: (port) => Promise.resolve(port === 6379 || port === 8079),
  });
  assert.equal(ok.status, 'ok');
  assert.match(ok.detail, /Redis :6379 ok/u);
  assert.match(ok.detail, /HTTP bridge :8079 ok/u);

  const partial = await checkRedisStatus({
    dockerOk: true,
    probePort: (port) => Promise.resolve(port === 6379),
  });
  assert.equal(partial.status, 'warn');
  assert.match(partial.detail, /HTTP bridge :8079 down/u);
});

test('getFixActions collapses to the strongest recovery', () => {
  assert.deepEqual(
    getFixActions([
      { status: 'fail', fix: 'start-proxy' },
      { status: 'fail', fix: 'reset-proxy' },
    ]),
    ['reset-proxy']
  );
  assert.deepEqual(getFixActions([{ status: 'fail', fix: 'start-proxy' }]), [
    'start-proxy',
  ]);
  assert.deepEqual(getFixActions([{ status: 'ok' }]), []);
});

test('getFixSteps maps actions to portless command sequences', () => {
  assert.deepEqual(getFixSteps('start-proxy'), [['proxy', 'start']]);
  assert.deepEqual(getFixSteps('reset-proxy'), [
    ['proxy', 'stop'],
    ['prune'],
    ['proxy', 'start'],
  ]);
  assert.deepEqual(getFixSteps('unknown'), []);
});

test('getPortlessAliasRemoveCommand removes only the .localhost suffix', () => {
  assert.equal(
    getPortlessAliasName('zalo-qr-chat-setup.chat.tuturuuu.localhost'),
    'zalo-qr-chat-setup.chat.tuturuuu'
  );
  assert.equal(
    getPortlessAliasRemoveCommand('zalo-qr-chat-setup.chat.tuturuuu.localhost'),
    'bunx portless alias --remove zalo-qr-chat-setup.chat.tuturuuu'
  );
  assert.equal(
    getPortlessAliasRemoveCommand('custom.internal.test'),
    'bunx portless alias --remove custom.internal.test'
  );
});

test('summarizeChecks computes a non-zero exit code on failure', () => {
  assert.deepEqual(summarizeChecks([{ status: 'ok' }, { status: 'warn' }]), {
    exitCode: 0,
    fail: 0,
    ok: true,
    warn: 1,
  });
  assert.equal(summarizeChecks([{ status: 'fail' }]).exitCode, 1);
});

test('collectDoctorChecks probes each registered route port once', async () => {
  const probedPorts = [];
  const checks = await collectDoctorChecks({
    nodeVersion: 'v22.0.0',
    portlessBin: 'portless',
    runner: () => ({ status: 0, stdout: '', stderr: '' }),
    readProxyStatus: () => READY_STATUS,
    readRoutesFile: () =>
      JSON.stringify([
        { hostname: 'inventory.tuturuuu.localhost', port: 4881, pid: 1 },
        // A live registration (pid set) whose port is dead -> stale state.
        { hostname: 'web.tuturuuu.localhost', port: 4294, pid: 7 },
      ]),
    caExists: () => true,
    includeLocalServiceChecks: false,
    probePort: (port) => {
      probedPorts.push(port);
      return Promise.resolve(port === 4881);
    },
  });

  assert.deepEqual(probedPorts.sort(), [4294, 4881]);
  const routeCheck = checks.find((check) => check.id === 'portless-routes');
  assert.equal(routeCheck.status, 'fail');
  assert.equal(summarizeChecks(checks).exitCode, 1);
});

test('collectDoctorChecks includes Docker, Supabase, and Redis statuses', async () => {
  const checks = await collectDoctorChecks({
    nodeVersion: 'v22.0.0',
    portlessBin: 'portless',
    runner: (command) =>
      command === 'docker'
        ? { status: 0, stdout: 'Docker is running', stderr: '' }
        : { status: 0, stdout: '', stderr: '' },
    readProxyStatus: () => READY_STATUS,
    readRoutesFile: () => null,
    caExists: () => true,
    probePort: (port) =>
      Promise.resolve([8001, 8002, 6379, 8079].includes(port)),
  });

  assert.equal(checks.find((check) => check.id === 'docker').status, 'ok');
  assert.equal(checks.find((check) => check.id === 'supabase').status, 'ok');
  assert.equal(checks.find((check) => check.id === 'redis').status, 'ok');
});

test('collectDoctorChecks makes Docker a failure and dependent services warnings', async () => {
  const checks = await collectDoctorChecks({
    nodeVersion: 'v22.0.0',
    portlessBin: 'portless',
    runner: (command) =>
      command === 'docker'
        ? { status: 1, stdout: '', stderr: 'daemon unavailable' }
        : { status: 0, stdout: '', stderr: '' },
    readProxyStatus: () => READY_STATUS,
    readRoutesFile: () => null,
    caExists: () => true,
    probePort: (port) => {
      throw new Error(`unexpected probe for ${port}`);
    },
  });

  assert.equal(checks.find((check) => check.id === 'docker').status, 'fail');
  assert.equal(checks.find((check) => check.id === 'supabase').status, 'warn');
  assert.equal(checks.find((check) => check.id === 'redis').status, 'warn');
  assert.equal(summarizeChecks(checks).exitCode, 1);
});

test('formatDoctorReport renders a status tag per check', () => {
  const report = formatDoctorReport([
    { id: 'node', title: 'Node.js runtime', status: 'ok', detail: 'v22' },
    {
      id: 'portless-routes',
      title: 'Portless route health',
      status: 'fail',
      detail: '1 dead route',
      routes: ['x.localhost -> :7815 DEAD'],
      hint: 'reset it',
    },
  ]);

  assert.match(report, /\[OK\] Node\.js runtime/u);
  assert.match(report, /\[FAIL\] Portless route health/u);
  assert.match(report, /-> reset it/u);
  assert.match(report, /Run `bun doctor --fix`/u);
});

test('formatDoctorReport frames warning-only reports as optional cleanup', () => {
  const report = formatDoctorReport([
    {
      id: 'portless-routes',
      title: 'Portless route health',
      status: 'warn',
      detail: '1 inactive static alias',
      routes: [
        'x.localhost -> :7815 inactive alias (remove: bunx portless alias --remove x)',
      ],
      hint: 'remove it',
    },
  ]);

  assert.match(report, /No blocking issues/u);
  assert.match(report, /optional cleanup/u);
  assert.match(report, /bunx portless alias --remove x/u);
});

test('formatDoctorReport can color status tags and route health', () => {
  const report = formatDoctorReport(
    [
      { id: 'node', title: 'Node.js runtime', status: 'ok', detail: 'v22' },
      {
        id: 'portless-routes',
        title: 'Portless route health',
        status: 'fail',
        detail: '1 dead route',
        routes: ['x.localhost -> :7815 DEAD'],
        hint: 'reset it',
      },
    ],
    { colorsEnabled: true }
  );

  const esc = String.fromCharCode(27);
  assert.ok(report.includes(`${esc}[32m[OK]${esc}[0m`));
  assert.ok(report.includes(`${esc}[31m[FAIL]${esc}[0m`));
  assert.ok(report.includes(`${esc}[31m${esc}[1mDEAD${esc}[0m`));
});

test('shouldUseColor respects NO_COLOR, FORCE_COLOR, and TTY output', () => {
  assert.equal(
    shouldUseColor({
      env: { FORCE_COLOR: '1', NO_COLOR: '' },
      stdout: { isTTY: true },
    }),
    false
  );
  assert.equal(
    shouldUseColor({ env: { FORCE_COLOR: '1' }, stdout: { isTTY: false } }),
    true
  );
  assert.equal(shouldUseColor({ env: {}, stdout: { isTTY: true } }), true);
  assert.equal(shouldUseColor({ env: {}, stdout: { isTTY: false } }), false);
  assert.equal(
    shouldUseColor({
      colorsEnabled: true,
      env: { NO_COLOR: '' },
      stdout: { isTTY: false },
    }),
    true
  );
});

test('runDoctor --fix runs the reset sequence and re-checks', async () => {
  const ranSteps = [];
  let proxyReady = false;
  const probeReady = { 4881: false };

  const deps = {
    nodeVersion: 'v22.0.0',
    portlessBin: 'portless',
    runner: (_bin, stepArgs) => {
      ranSteps.push(stepArgs.join(' '));
      // Simulate the reset bringing the proxy back and the route recovering.
      if (stepArgs.join(' ') === 'proxy start') {
        proxyReady = true;
        probeReady[4881] = true;
      }
      return { status: 0, stdout: '', stderr: '' };
    },
    readProxyStatus: () => (proxyReady ? READY_STATUS : NOT_READY_STATUS),
    readRoutesFile: () =>
      JSON.stringify([
        { hostname: 'inventory.tuturuuu.localhost', port: 4881, pid: 1 },
      ]),
    caExists: () => true,
    includeLocalServiceChecks: false,
    probePort: (port) => Promise.resolve(Boolean(probeReady[port])),
  };

  const logs = [];
  const code = await runDoctor({
    argv: ['--fix'],
    log: (message) => logs.push(message),
    deps,
  });

  // The stale-route failure must drive a full reset sequence...
  assert.deepEqual(ranSteps, ['proxy stop', 'prune', 'proxy start']);
  // ...and the post-fix re-check should pass.
  assert.equal(code, 0);
  assert.ok(logs.some((line) => line.includes('Re-running checks')));
});

test('runDoctor --help short-circuits without running checks', async () => {
  let called = false;
  const code = await runDoctor({
    argv: ['--help'],
    log: () => {},
    deps: {
      readProxyStatus: () => {
        called = true;
        return READY_STATUS;
      },
      readRoutesFile: () => null,
      caExists: () => true,
      probePort: () => Promise.resolve(true),
    },
  });

  assert.equal(code, 0);
  assert.equal(called, false);
});
