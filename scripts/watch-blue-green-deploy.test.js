const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BLUE_GREEN_PROXY_SERVICE,
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_INTERVAL_MS,
  MAX_DEPLOYMENTS,
  SELF_WATCHED_FILES,
  WATCH_PENDING_DEPLOY_ENV,
  acquireWatchLock,
  appendDeploymentHistory,
  buildDashboardView,
  collectDeploymentTraffic,
  createQuietRunCommand,
  createWatchUi,
  formatCountdown,
  formatRelativeTime,
  formatRequestsPerMinute,
  getWatchPaths,
  isProcessAlive,
  parseArgs,
  parseProxyLogEntries,
  parseUpstreamRef,
  readDeploymentHistory,
  readWatchLock,
  releaseWatchLock,
  resolveCurrentBlueGreenStatus,
  runPendingDeployAfterRestart,
  runDeployWatchIteration,
  runDeployWatchLoop,
  main,
  spawnReplacementWatcher,
  stripAnsi,
  summarizeRequestRate,
  getLatestDeploymentSummary,
  writeDeploymentHistory,
} = require('./watch-blue-green-deploy.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROD_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.prod.yml');

function createResult(stdout = '', { code = 0, stderr = '' } = {}) {
  return {
    code,
    signal: null,
    stderr,
    stdout,
  };
}

function createRunCommandMock(responses) {
  return async (command, args) => {
    const key = `${command} ${args.join(' ')}`;

    if (!responses.has(key)) {
      throw new Error(`Unexpected command: ${key}`);
    }

    const response = responses.get(key);
    return typeof response === 'function' ? response() : response;
  };
}

function prodComposePsKey(serviceName) {
  return `docker compose -f ${PROD_COMPOSE_FILE} ps -q ${serviceName}`;
}

test('parseArgs uses a 1s interval by default and accepts --once', () => {
  assert.deepEqual(parseArgs([]), {
    intervalMs: DEFAULT_INTERVAL_MS,
    once: false,
  });
  assert.deepEqual(parseArgs(['--interval-ms', '2500', '--once']), {
    intervalMs: 2500,
    once: true,
  });
});

test('parseUpstreamRef keeps remote and branch components intact', () => {
  assert.deepEqual(parseUpstreamRef('origin/main'), {
    branch: 'main',
    remote: 'origin',
    upstreamRef: 'origin/main',
  });
  assert.deepEqual(parseUpstreamRef('origin/feat/docker-watch'), {
    branch: 'feat/docker-watch',
    remote: 'origin',
    upstreamRef: 'origin/feat/docker-watch',
  });
});

test('formatRelativeTime clamps tiny future drift so the dashboard does not flicker', () => {
  const now = Date.parse('2026-04-18T11:00:00.000Z');

  assert.equal(
    formatRelativeTime(Date.parse('2026-04-18T10:58:00.000Z'), { now }),
    '2m ago'
  );
  assert.equal(
    formatRelativeTime(Date.parse('2026-04-18T11:00:00.900Z'), { now }),
    'just now'
  );
  assert.equal(
    formatRelativeTime(Date.parse('2026-04-18T11:00:10.000Z'), { now }),
    'in 10s'
  );
  assert.equal(
    formatCountdown(Date.parse('2026-04-18T11:00:05.000Z'), { now }),
    '5.0s'
  );
  assert.equal(formatRequestsPerMinute(2.5), '2.5 rpm');
});

test('buildDashboardView shows blue/green runtime and the last 3 deployments', () => {
  const now = Date.parse('2026-04-18T11:30:00.000Z');
  const output = buildDashboardView(
    {
      currentBlueGreen: {
        activeColor: 'green',
        activatedAt: Date.parse('2026-04-18T11:10:00.000Z'),
        averageRequestsPerMinute: 6.4,
        dailyAverageRequests: 88.4,
        dailyPeakRequests: 120,
        dailyRequestCount: 54,
        lifetimeMs: 20 * 60 * 1_000,
        peakRequestsPerMinute: 12,
        requestCount: 128,
        state: 'serving',
      },
      deployments: [
        {
          activatedAt: Date.parse('2026-04-18T11:10:00.000Z'),
          activeColor: 'green',
          averageRequestsPerMinute: 6.4,
          buildDurationMs: 42_000,
          commitShortHash: 'bbb222',
          commitSubject: 'Refresh watcher UX and restart logic',
          dailyAverageRequests: 88.4,
          dailyPeakRequests: 120,
          dailyRequestCount: 54,
          finishedAt: Date.parse('2026-04-18T11:10:00.000Z'),
          lifetimeMs: 20 * 60 * 1_000,
          peakRequestsPerMinute: 12,
          requestCount: 128,
          startedAt: Date.parse('2026-04-18T11:09:18.000Z'),
          status: 'successful',
        },
        {
          activeColor: 'blue',
          averageRequestsPerMinute: 17.1,
          buildDurationMs: 35_000,
          commitShortHash: 'aaa111',
          commitSubject: 'Previous rollout',
          dailyAverageRequests: 240,
          dailyPeakRequests: 320,
          dailyRequestCount: 180,
          endedAt: Date.parse('2026-04-18T11:10:00.000Z'),
          finishedAt: Date.parse('2026-04-18T10:40:00.000Z'),
          lifetimeMs: 30 * 60 * 1_000,
          peakRequestsPerMinute: 40,
          requestCount: 512,
          startedAt: Date.parse('2026-04-18T10:39:25.000Z'),
          status: 'successful',
        },
      ],
      events: [
        {
          level: 'info',
          message: 'Pulled main from aaa111 to bbb222.',
          time: Date.parse('2026-04-18T11:29:58.000Z'),
        },
      ],
      intervalMs: 5_000,
      lastCheckAt: Date.parse('2026-04-18T11:29:59.000Z'),
      lastDeployAt: Date.parse('2026-04-18T11:10:00.000Z'),
      lastDeployStatus: 'successful',
      lastResult: { status: 'deployed' },
      latestCommit: {
        committedAt: Date.parse('2026-04-18T11:08:00.000Z'),
        hash: 'bbbb2222',
        shortHash: 'bbb222',
        subject: 'Refresh watcher UX and restart logic',
      },
      lockFile: '/tmp/watch.lock',
      nextCheckAt: Date.parse('2026-04-18T11:30:05.000Z'),
      startedAt: Date.parse('2026-04-18T11:00:00.000Z'),
      target: {
        branch: 'main',
        upstreamRef: 'origin/main',
      },
    },
    {
      now,
      width: 100,
    }
  );

  const plainOutput = stripAnsi(output);

  assert.match(plainOutput, /Blue\/green/);
  assert.match(plainOutput, /serving green/);
  assert.match(plainOutput, /req 128 req/);
  assert.match(plainOutput, /avg 6\.4 rpm/);
  assert.match(plainOutput, /peak 12 rpm/);
  assert.match(plainOutput, /day 54 req/);
  assert.match(plainOutput, /davg 88\.4\/day/);
  assert.match(plainOutput, /dpeak 120\/day/);
  assert.match(plainOutput, /Last 3 Deployments/);
  assert.match(plainOutput, /┌/);
  assert.match(plainOutput, /\[18:10:00\]/);
  assert.match(plainOutput, /ACTIVE/);
  assert.match(plainOutput, /green/);
  assert.match(plainOutput, /42s/);
  assert.match(plainOutput, /20m/);
  assert.match(plainOutput, /Refresh watcher UX and restart logic/);

  const lines = plainOutput.split('\n');
  const firstCardTop = lines.find((line) => line.startsWith('┌'));
  const firstCardHeading = lines.find((line) =>
    line.startsWith('│ [18:10:00]')
  );

  assert.ok(firstCardTop);
  assert.ok(firstCardHeading);
  assert.equal(firstCardTop.length, firstCardHeading.length);
});

test('buildDashboardView shows pending deployments in recent deployment cards', () => {
  const output = stripAnsi(
    buildDashboardView(
      {
        currentBlueGreen: {
          state: 'idle',
        },
        deployments: [
          {
            commitShortHash: 'ccc333',
            commitSubject: 'Ship hotfix through blue green',
            startedAt: Date.parse('2026-04-18T11:29:40.000Z'),
            status: 'deploying',
          },
        ],
        events: [],
        intervalMs: DEFAULT_INTERVAL_MS,
        lastDeployAt: Date.parse('2026-04-18T11:29:40.000Z'),
        lastDeployStatus: 'deploying',
        lastResult: { status: 'up-to-date' },
        latestCommit: {
          committedAt: Date.parse('2026-04-18T11:29:00.000Z'),
          hash: 'ccc333333333333',
          shortHash: 'ccc333',
          subject: 'Ship hotfix through blue green',
        },
        lockFile: '/tmp/watch.lock',
        startedAt: Date.parse('2026-04-18T11:00:00.000Z'),
        target: {
          branch: 'main',
          upstreamRef: 'origin/main',
        },
      },
      {
        now: Date.parse('2026-04-18T11:30:00.000Z'),
        width: 100,
      }
    )
  );

  assert.match(output, /DEPLOYING/);
  assert.match(output, /Ship hotfix through blue green/);
  assert.match(output, /Last deploy:\s+deploying/);
});

test('createWatchUi records events and renders cleanly in non-TTY mode', () => {
  const writes = [];
  const ui = createWatchUi(
    {
      intervalMs: 5_000,
    },
    {
      isTTY: false,
      stderr: {
        write(value) {
          writes.push(['stderr', value]);
        },
      },
      stdout: {
        write(value) {
          writes.push(['stdout', value]);
        },
      },
    }
  );

  ui.info('Watcher online.');
  ui.warn('Dirty worktree.');
  ui.error('Deploy failed.');

  assert.equal(ui.state.events.length, 3);
  assert.deepEqual(
    writes.map((entry) => entry[0]),
    ['stdout', 'stdout', 'stderr']
  );
});

test('createQuietRunCommand pipes subprocess output unless a caller overrides stdio', async () => {
  const calls = [];
  const quietRun = createQuietRunCommand(async (command, args, options) => {
    calls.push({ args, command, options });
    return createResult('');
  });

  await quietRun('git', ['fetch', 'origin', 'main']);
  await quietRun('git', ['status'], { stdio: 'inherit' });

  assert.deepEqual(calls, [
    {
      args: ['fetch', 'origin', 'main'],
      command: 'git',
      options: {
        stdio: 'pipe',
      },
    },
    {
      args: ['status'],
      command: 'git',
      options: {
        stdio: 'inherit',
      },
    },
  ]);
});

test('acquireWatchLock writes a PID-backed lock and releaseWatchLock removes it', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-lock-'));
  const paths = getWatchPaths(tempDir);
  const processImpl = {
    kill(pid) {
      if (pid !== 4321) {
        const error = new Error('missing');
        error.code = 'ESRCH';
        throw error;
      }
    },
    pid: 4321,
  };

  try {
    acquireWatchLock(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        fsImpl: fs,
        paths,
        processImpl,
      }
    );

    assert.deepEqual(readWatchLock(paths), {
      branch: 'main',
      createdAt: readWatchLock(paths).createdAt,
      pid: 4321,
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    });

    releaseWatchLock({
      fsImpl: fs,
      paths,
      processImpl,
    });

    assert.equal(readWatchLock(paths), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('acquireWatchLock rejects a live existing watcher', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-lock-live-'));
  const paths = getWatchPaths(tempDir);
  const processImpl = {
    kill() {},
    pid: 9999,
  };

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.lockFile,
      JSON.stringify({
        branch: 'main',
        pid: 1234,
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      }),
      'utf8'
    );

    assert.throws(
      () =>
        acquireWatchLock(
          {
            branch: 'main',
            remote: 'origin',
            upstreamBranch: 'main',
            upstreamRef: 'origin/main',
          },
          {
            fsImpl: fs,
            paths,
            processImpl,
          }
        ),
      /already locked by PID 1234/
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('isProcessAlive handles missing and inaccessible processes safely', () => {
  assert.equal(
    isProcessAlive(1234, {
      kill() {},
    }),
    true
  );
  assert.equal(
    isProcessAlive(1234, {
      kill() {
        const error = new Error('forbidden');
        error.code = 'EPERM';
        throw error;
      },
    }),
    true
  );
  assert.equal(
    isProcessAlive(1234, {
      kill() {
        const error = new Error('missing');
        error.code = 'ESRCH';
        throw error;
      },
    }),
    false
  );
});

test('appendDeploymentHistory closes the prior active deployment and keeps only the last 3 entries', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-history-'));
  const paths = getWatchPaths(tempDir);

  try {
    writeDeploymentHistory(
      [
        {
          activatedAt: 1000,
          activeColor: 'blue',
          buildDurationMs: 30_000,
          commitShortHash: 'a1',
          commitSubject: 'one',
          finishedAt: 1000,
          startedAt: 0,
          status: 'successful',
        },
      ],
      paths,
      fs
    );

    appendDeploymentHistory(
      {
        activatedAt: 2000,
        activeColor: 'green',
        buildDurationMs: 35_000,
        commitShortHash: 'b2',
        commitSubject: 'two',
        finishedAt: 2000,
        startedAt: 1500,
        status: 'successful',
      },
      {
        fsImpl: fs,
        paths,
      }
    );
    appendDeploymentHistory(
      {
        buildDurationMs: 10_000,
        commitShortHash: 'c3',
        commitSubject: 'three',
        finishedAt: 3000,
        startedAt: 2500,
        status: 'failed',
      },
      {
        fsImpl: fs,
        paths,
      }
    );
    appendDeploymentHistory(
      {
        activatedAt: 4000,
        activeColor: 'blue',
        buildDurationMs: 25_000,
        commitShortHash: 'd4',
        commitSubject: 'four',
        finishedAt: 4000,
        startedAt: 3500,
        status: 'successful',
      },
      {
        fsImpl: fs,
        paths,
      }
    );

    const history = readDeploymentHistory(paths, fs);

    assert.equal(history.length, MAX_DEPLOYMENTS);
    assert.equal(history[0].commitShortHash, 'd4');
    assert.equal(history[1].commitShortHash, 'c3');
    assert.equal(history[2].commitShortHash, 'b2');
    assert.equal(history[2].endedAt, 4000);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('parseProxyLogEntries keeps only access lines and collectDeploymentTraffic counts non-health requests', async () => {
  const deployments = [
    {
      activatedAt: Date.parse('2026-04-18T11:00:00.000Z'),
      activeColor: 'green',
      buildDurationMs: 30_000,
      commitShortHash: 'bbb222',
      commitSubject: 'current',
      finishedAt: Date.parse('2026-04-18T11:00:00.000Z'),
      startedAt: Date.parse('2026-04-18T10:59:30.000Z'),
      status: 'successful',
    },
    {
      activatedAt: Date.parse('2026-04-18T10:30:00.000Z'),
      activeColor: 'blue',
      buildDurationMs: 25_000,
      commitShortHash: 'aaa111',
      commitSubject: 'previous',
      endedAt: Date.parse('2026-04-18T11:00:00.000Z'),
      finishedAt: Date.parse('2026-04-18T10:30:00.000Z'),
      startedAt: Date.parse('2026-04-18T10:29:35.000Z'),
      status: 'successful',
    },
  ];
  const parsed = parseProxyLogEntries(
    [
      '2026-04-18T10:35:00.000000000Z 10.0.0.1 - - [18/Apr/2026:10:35:00 +0000] "GET /docs HTTP/1.1" 200 120 "-" "Mozilla/5.0" "-"',
      '2026-04-18T11:05:00.000000000Z 10.0.0.1 - - [18/Apr/2026:11:05:00 +0000] "GET / HTTP/1.1" 200 120 "-" "Mozilla/5.0" "-"',
      '2026-04-18T11:06:00.000000000Z 127.0.0.1 - - [18/Apr/2026:11:06:00 +0000] "GET /api/health HTTP/1.1" 200 2 "-" "Wget/1.21" "-"',
      '2026-04-18T11:07:00.000000000Z nginx: configuration file /etc/nginx/nginx.conf test is successful',
    ].join('\n')
  );

  assert.equal(parsed.length, 3);

  const enriched = await collectDeploymentTraffic(deployments, {
    now: Date.parse('2026-04-18T11:30:00.000Z'),
    runCommand: createRunCommandMock(
      new Map([
        [
          prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
          createResult('proxy-123\n'),
        ],
        [
          'docker logs --timestamps --since 2026-04-18T10:30:00.000Z proxy-123',
          createResult(
            [
              '2026-04-18T10:35:00.000000000Z 10.0.0.1 - - [18/Apr/2026:10:35:00 +0000] "GET /docs HTTP/1.1" 200 120 "-" "Mozilla/5.0" "-"',
              '2026-04-18T11:05:00.000000000Z 10.0.0.1 - - [18/Apr/2026:11:05:00 +0000] "GET / HTTP/1.1" 200 120 "-" "Mozilla/5.0" "-"',
              '2026-04-18T11:06:00.000000000Z 127.0.0.1 - - [18/Apr/2026:11:06:00 +0000] "GET /api/health HTTP/1.1" 200 2 "-" "Wget/1.21" "-"',
            ].join('\n')
          ),
        ],
      ])
    ),
  });

  assert.equal(enriched[0].requestCount, 1);
  assert.equal(enriched[1].requestCount, 1);
  assert.equal(enriched[0].averageRequestsPerMinute, 1 / 30);
  assert.equal(enriched[0].dailyAverageRequests, 48);
  assert.equal(enriched[0].dailyPeakRequests, 1);
  assert.equal(enriched[0].dailyRequestCount, 1);
  assert.equal(enriched[0].peakRequestsPerMinute, 1);
  assert.equal(enriched[0].lifetimeMs, 30 * 60 * 1_000);
});

test('summarizeRequestRate computes total, per-minute, and per-day traffic stats', () => {
  const startTime = Date.parse('2026-04-18T00:00:00.000Z');
  const endTime = Date.parse('2026-04-20T00:00:00.000Z');
  const summary = summarizeRequestRate(
    [
      { path: '/', time: Date.parse('2026-04-18T11:00:10.000Z') },
      { path: '/docs', time: Date.parse('2026-04-18T11:00:20.000Z') },
      { path: '/', time: Date.parse('2026-04-19T11:01:10.000Z') },
      { path: '/about', time: Date.parse('2026-04-19T11:01:20.000Z') },
      { path: '/about', time: Date.parse('2026-04-19T11:02:10.000Z') },
      { path: '/api/health', time: Date.parse('2026-04-19T11:02:20.000Z') },
    ],
    startTime,
    endTime
  );

  assert.deepEqual(summary, {
    averageRequestsPerMinute: 5 / (48 * 60),
    dailyAverageRequests: 2.5,
    dailyPeakRequests: 3,
    dailyRequestCount: 3,
    peakRequestsPerMinute: 2,
    requestCount: 5,
  });
});

test('getLatestDeploymentSummary derives the last deploy timestamp and status from history', () => {
  assert.deepEqual(getLatestDeploymentSummary([]), {
    lastDeployAt: null,
    lastDeployStatus: null,
  });

  assert.deepEqual(
    getLatestDeploymentSummary([
      {
        finishedAt: 5000,
        status: 'successful',
      },
      {
        finishedAt: 1000,
        status: 'failed',
      },
    ]),
    {
      lastDeployAt: 5000,
      lastDeployStatus: 'successful',
    }
  );

  assert.deepEqual(
    getLatestDeploymentSummary([
      {
        activatedAt: 2000,
        startedAt: 1000,
        status: 'failed',
      },
    ]),
    {
      lastDeployAt: 2000,
      lastDeployStatus: 'failed',
    }
  );
});

test('resolveCurrentBlueGreenStatus reflects the active color and running services', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-blue-green-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const receivedEnvs = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.writeFileSync(paths.blueGreen.stateFile, 'green\n', 'utf8');

    const status = await resolveCurrentBlueGreenStatus({
      envFilePath,
      fsImpl: fs,
      paths,
      rootDir: tempDir,
      runCommand: async (command, args, options) => {
        receivedEnvs.push(options.env);
        const key = `${command} ${args.join(' ')}`;

        if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
          return createResult('proxy-123\n');
        }

        if (key === prodComposePsKey('web-green')) {
          return createResult('green-123\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(status, {
      activeColor: 'green',
      activeServiceRunning: true,
      proxyRunning: true,
      state: 'serving',
    });
    assert.equal(receivedEnvs[0].UPSTASH_REDIS_REST_TOKEN.length, 64);
    assert.equal(
      receivedEnvs[0].SUPABASE_SERVER_URL,
      'http://host.docker.internal:8001/'
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration skips dirty worktrees before fetch and still reports runtime state', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-dirty-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];
  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (key === 'git rev-parse --abbrev-ref HEAD') {
      return createResult('main\n');
    }

    if (key === 'git status --porcelain') {
      return createResult(' M package.json\n');
    }

    if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
      return createResult('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    const result = await runDeployWatchIteration(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        envFilePath,
        fsImpl: fs,
        log: { error() {}, info() {}, warn() {} },
        now: () => 1234,
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(result.status, 'dirty');
    assert.equal(result.currentBlueGreen.state, 'idle');
    assert.deepEqual(result.deployments, []);
    assert.deepEqual(calls, [
      'git rev-parse --abbrev-ref HEAD',
      'git status --porcelain',
      prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration restarts before deployment when the watcher script changed', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-deploy-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const deployCommands = [];
  let pullCompleted = false;
  const nowValues = [1000, 2000, 4000];
  const now = () => nowValues.shift() ?? 4000;
  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;

    if (key === 'git rev-parse --abbrev-ref HEAD') {
      return createResult('main\n');
    }

    if (key === 'git status --porcelain') {
      return createResult('');
    }

    if (key === 'git fetch origin main') {
      return createResult('');
    }

    if (key === 'git rev-parse HEAD') {
      return createResult(pullCompleted ? 'bbb222\n' : 'aaa111\n');
    }

    if (key === 'git rev-parse origin/main') {
      return createResult('bbb222\n');
    }

    if (key === 'git merge-base --is-ancestor aaa111 bbb222') {
      return createResult('');
    }

    if (key === 'git pull --ff-only origin main') {
      pullCompleted = true;
      return createResult('Updating aaa111..bbb222\n');
    }

    if (
      key ===
      `git diff --name-only aaa111 bbb222 -- ${SELF_WATCHED_FILES.join(' ')}`
    ) {
      return createResult(`${SELF_WATCHED_FILES[0]}\n`);
    }

    if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
      return createResult(
        'bbb222222222222222222\nbbb222\nRefresh watcher UX and restart logic\n2026-04-18T10:58:00.000Z\n'
      );
    }

    if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
      return createResult('');
    }

    if (key === prodComposePsKey('web-green')) {
      return createResult('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    const result = await runDeployWatchIteration(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        envFilePath,
        fsImpl: fs,
        log: { error() {}, info() {}, warn() {} },
        now,
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(result.status, 'restarting');
    assert.equal(result.restartRequired, true);
    assert.equal(result.currentBlueGreen.state, 'idle');
    assert.deepEqual(result.deployments, []);
    assert.equal(deployCommands.length, 0);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration emits a pending deployment before deploy completion', async () => {
  const pendingStates = [];
  let pullCompleted = false;
  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;

    if (key === 'git rev-parse --abbrev-ref HEAD') {
      return createResult('main\n');
    }

    if (key === 'git status --porcelain') {
      return createResult('');
    }

    if (key === 'git fetch origin main') {
      return createResult('');
    }

    if (key === 'git rev-parse HEAD') {
      return createResult(pullCompleted ? 'bbb222\n' : 'aaa111\n');
    }

    if (key === 'git rev-parse origin/main') {
      return createResult('bbb222\n');
    }

    if (key === 'git merge-base --is-ancestor aaa111 bbb222') {
      return createResult('');
    }

    if (key === 'git pull --ff-only origin main') {
      pullCompleted = true;
      return createResult('Updating aaa111..bbb222\n');
    }

    if (
      key ===
      `git diff --name-only aaa111 bbb222 -- ${SELF_WATCHED_FILES.join(' ')}`
    ) {
      return createResult('');
    }

    if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
      return createResult(
        'bbb222222222222222222\nbbb222\nRefresh watcher UX and restart logic\n2026-04-18T10:58:00.000Z\n'
      );
    }

    if (
      key ===
      `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
    ) {
      return createResult('');
    }

    if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
      return createResult('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  const result = await runDeployWatchIteration(
    {
      branch: 'main',
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    },
    {
      log: { error() {}, info() {}, warn() {} },
      now: (() => {
        const values = [1000, 2000, 3000, 4000];
        return () => values.shift() ?? 4000;
      })(),
      onDeploymentStart: (state) => {
        pendingStates.push(state);
      },
      runCommand,
    }
  );

  assert.equal(pendingStates.length, 1);
  assert.equal(pendingStates[0].pendingDeployment.status, 'deploying');
  assert.equal(pendingStates[0].pendingDeployment.commitShortHash, 'bbb222');
  assert.equal(result.status, 'deployed');
});

test('runPendingDeployAfterRestart refreshes the live proxy before running blue/green deploy', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-pending-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const logs = [];
  const calls = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.writeFileSync(paths.blueGreen.stateFile, 'green\n', 'utf8');

    const result = await runPendingDeployAfterRestart({
      envFilePath,
      fsImpl: fs,
      latestCommit: {
        hash: 'bbb222222222222222222',
        shortHash: 'bbb222',
        subject: 'Refresh watcher UX and restart logic',
      },
      log: {
        info(message) {
          logs.push(message);
        },
      },
      now: (() => {
        const values = [2000, 5000];
        return () => values.shift() ?? 5000;
      })(),
      paths,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === prodComposePsKey('web-green')) {
          return createResult('green-123\n');
        }

        if (key === prodComposePsKey('web-blue')) {
          return createResult('');
        }

        if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
          return createResult('proxy-123\n');
        }

        if (
          key ===
          `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -t`
        ) {
          return createResult('');
        }

        if (
          key ===
          `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -s reload`
        ) {
          return createResult('');
        }

        if (
          key ===
          `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/api/health`
        ) {
          return createResult('');
        }

        if (
          key ===
          `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
        ) {
          return createResult('');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(calls, [
      prodComposePsKey('web-green'),
      prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
      prodComposePsKey('web-blue'),
      `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -t`,
      `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -s reload`,
      `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/api/health`,
      `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`,
    ]);
    assert.equal(result.refreshedProxy, true);
    assert.equal(result.activeColor, 'green');
    assert.equal(result.buildDurationMs, 3000);
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].status, 'successful');
    assert.match(
      logs[0],
      /Refreshed live blue\/green proxy config before deployment/
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration stops when the locked branch changes', async () => {
  await assert.rejects(
    () =>
      runDeployWatchIteration(
        {
          branch: 'main',
          remote: 'origin',
          upstreamBranch: 'main',
          upstreamRef: 'origin/main',
        },
        {
          log: { error() {}, info() {}, warn() {} },
          runCommand: createRunCommandMock(
            new Map([
              ['git rev-parse --abbrev-ref HEAD', createResult('release\n')],
            ])
          ),
        }
      ),
    /Current branch changed from main to release/
  );
});

test('runDeployWatchLoop honors once mode without sleeping', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-once-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  let slept = false;
  const iterationStarts = [];
  const iterationResults = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    const result = await runDeployWatchLoop(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        envFilePath,
        fsImpl: fs,
        log: { error() {}, info() {}, warn() {} },
        now: () => 1000,
        once: true,
        onIterationResult: (value) => {
          iterationResults.push(value);
        },
        onIterationStart: (value) => {
          iterationStarts.push(value);
        },
        paths,
        rootDir: tempDir,
        runCommand: createRunCommandMock(
          new Map([
            ['git rev-parse --abbrev-ref HEAD', createResult('main\n')],
            ['git status --porcelain', createResult('')],
            ['git fetch origin main', createResult('')],
            ['git rev-parse HEAD', createResult('aaa111\n')],
            ['git rev-parse origin/main', createResult('aaa111\n')],
            [
              'git log -1 --format=%H%n%h%n%s%n%cI HEAD',
              createResult(
                'aaa111111111111111111\naaa111\nKeep branch current\n2026-04-18T10:58:00.000Z\n'
              ),
            ],
            [prodComposePsKey(BLUE_GREEN_PROXY_SERVICE), createResult('')],
          ])
        ),
        sleepImpl: async () => {
          slept = true;
        },
      }
    );

    assert.equal(result.status, 'up-to-date');
    assert.equal(result.currentBlueGreen.state, 'idle');
    assert.deepEqual(iterationStarts, [1000]);
    assert.deepEqual(iterationResults, [result]);
    assert.equal(slept, false);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('spawnReplacementWatcher relaunches the watcher with inherited args', async () => {
  const calls = [];

  await spawnReplacementWatcher({
    argv: ['scripts/watch-blue-green-deploy.js', '--interval-ms', '5000'],
    cwd: '/tmp/platform',
    env: { PATH: 'test-path' },
    execPath: '/usr/local/bin/node',
    spawnImpl(command, args, options) {
      calls.push({ args, command, options });

      return {
        once(event, handler) {
          if (event === 'spawn') {
            handler();
          }
          return this;
        },
        unref() {},
      };
    },
  });

  assert.deepEqual(calls, [
    {
      args: ['scripts/watch-blue-green-deploy.js', '--interval-ms', '5000'],
      command: '/usr/local/bin/node',
      options: {
        cwd: '/tmp/platform',
        detached: true,
        env: { PATH: 'test-path' },
        stdio: 'inherit',
      },
    },
  ]);
});

test('main restarts the watcher with a pending deploy handoff env when the watcher script changed', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-main-restart-'));
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const spawnCalls = [];
  const uiState = {};
  let pullCompleted = false;

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    await main([], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      processImpl: {
        argv: ['node', 'scripts/watch-blue-green-deploy.js'],
        exit() {},
        on() {},
        pid: 4321,
      },
      restartArgv: ['scripts/watch-blue-green-deploy.js'],
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;

        if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
          return createResult('');
        }

        if (key === 'git rev-parse --abbrev-ref HEAD') {
          return createResult('main\n');
        }

        if (key === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') {
          return createResult('origin/main\n');
        }

        if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
          return pullCompleted
            ? createResult(
                'bbb222222222222222222\nbbb222\nRefresh watcher UX and restart logic\n2026-04-18T10:59:00.000Z\n'
              )
            : createResult(
                'aaa111111111111111111\naaa111\nKeep branch current\n2026-04-18T10:58:00.000Z\n'
              );
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git fetch origin main') {
          return createResult('');
        }

        if (key === 'git rev-parse HEAD') {
          return createResult(pullCompleted ? 'bbb222\n' : 'aaa111\n');
        }

        if (key === 'git rev-parse origin/main') {
          return createResult('bbb222\n');
        }

        if (key === 'git merge-base --is-ancestor aaa111 bbb222') {
          return createResult('');
        }

        if (key === 'git pull --ff-only origin main') {
          pullCompleted = true;
          return createResult('Updating aaa111..bbb222\n');
        }

        if (
          key ===
          `git diff --name-only aaa111 bbb222 -- ${SELF_WATCHED_FILES.join(' ')}`
        ) {
          return createResult(`${SELF_WATCHED_FILES[0]}\n`);
        }

        throw new Error(`Unexpected command: ${key}`);
      },
      spawnImpl(command, args, options) {
        spawnCalls.push({ args, command, options });
        return {
          once(event, handler) {
            if (event === 'spawn') {
              handler();
            }
            return this;
          },
          unref() {},
        };
      },
      ui: {
        close() {},
        error() {},
        info() {},
        render() {},
        start() {},
        state: uiState,
        update(patch) {
          Object.assign(uiState, patch);
        },
        warn() {},
      },
    });

    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].options.env[WATCH_PENDING_DEPLOY_ENV], '1');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
