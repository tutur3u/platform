const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_WATCHER_SERVICE,
  CONTAINER_SELF_RESTART_EXIT_CODE,
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_GIT_FAILURE_BACKOFF_MS,
  DEFAULT_INTERVAL_MS,
  DISPLAY_DEPLOYMENTS,
  MAX_GIT_FAILURE_BACKOFF_MS,
  MAX_DEPLOYMENTS,
  SELF_WATCHED_FILES,
  WATCH_ARGS_FILE,
  WATCH_PENDING_DEPLOY_ENV,
  WATCHER_CONTAINER_ENV,
  acquireWatchLock,
  appendDeploymentHistory,
  buildDashboardView,
  collectDeploymentTraffic,
  createQuietRunCommand,
  createWatchUi,
  formatCountdown,
  formatRelativeTime,
  formatRequestsPerMinute,
  getGitFailureBackoffMs,
  getWatchPaths,
  isRecoverableGitCommandError,
  isProcessAlive,
  listDirtyWorktreePaths,
  parseArgs,
  parseProxyLogEntries,
  parseUpstreamRef,
  readDeploymentHistory,
  readWatchArgsFile,
  readWatchLock,
  releaseWatchLock,
  resolveCurrentBlueGreenStatus,
  runBunUpgradeAndInstall,
  runPendingDeployAfterRestart,
  runDeployWatchIteration,
  runDeployWatchLoop,
  runWatcherCommand,
  startBlueGreenWatcherContainer,
  streamBlueGreenWatcherLogs,
  main,
  spawnReplacementWatcher,
  stripAnsi,
  summarizeRequestRate,
  getLatestDeploymentSummary,
  writeDeploymentHistory,
  writeWatchArgsFile,
  loadRuntimeSnapshot,
  mirrorExistingWatchSession,
  readWatchStatus,
  terminateExistingWatcher,
  writeWatchStatus,
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

function prodComposeWatcherUpKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --build --detach --force-recreate --remove-orphans ${BLUE_GREEN_WATCHER_SERVICE}`;
}

function prodComposeWatcherLogsKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis logs --follow --tail 100 ${BLUE_GREEN_WATCHER_SERVICE}`;
}

test('parseArgs uses a 1s interval by default and accepts --once', () => {
  assert.deepEqual(parseArgs([]), {
    intervalMs: DEFAULT_INTERVAL_MS,
    lockConflictAction: 'fail',
    once: false,
  });
  assert.deepEqual(parseArgs(['--interval-ms', '2500', '--once']), {
    intervalMs: 2500,
    lockConflictAction: 'fail',
    once: true,
  });
  assert.deepEqual(parseArgs(['--resume-if-running']), {
    intervalMs: DEFAULT_INTERVAL_MS,
    lockConflictAction: 'resume',
    once: false,
  });
  assert.deepEqual(parseArgs(['--replace-existing']), {
    intervalMs: DEFAULT_INTERVAL_MS,
    lockConflictAction: 'replace',
    once: false,
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

test('listDirtyWorktreePaths expands rename records and keeps bun.lock visible', async () => {
  assert.deepEqual(
    await listDirtyWorktreePaths({
      runCommand: createRunCommandMock(
        new Map([
          [
            'git status --porcelain',
            createResult(
              ' M bun.lock\nR  old-name.js -> new-name.js\n?? apps/web/tmp.txt\n'
            ),
          ],
        ])
      ),
    }),
    ['bun.lock', 'old-name.js', 'new-name.js', 'apps/web/tmp.txt']
  );
});

test('runBunUpgradeAndInstall runs bun upgrade before bun i', async () => {
  const calls = [];

  await runBunUpgradeAndInstall({
    runCommand: async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      return createResult('');
    },
  });

  assert.deepEqual(calls, ['bun upgrade', 'bun i']);
});

test('getGitFailureBackoffMs starts at one minute and caps exponential retries', () => {
  assert.equal(getGitFailureBackoffMs(1), DEFAULT_GIT_FAILURE_BACKOFF_MS);
  assert.equal(getGitFailureBackoffMs(2), DEFAULT_GIT_FAILURE_BACKOFF_MS * 2);
  assert.equal(getGitFailureBackoffMs(99), MAX_GIT_FAILURE_BACKOFF_MS);
});

test('isRecoverableGitCommandError only retries wrapped git command failures', () => {
  assert.equal(
    isRecoverableGitCommandError(
      new Error('Command failed (1): git fetch origin main\nnetwork timeout')
    ),
    true
  );
  assert.equal(
    isRecoverableGitCommandError(
      new Error('Current branch changed from main to release.')
    ),
    false
  );
});

test('buildDashboardView shows blue/green runtime and the top 3 prioritized deployments', () => {
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
      dockerResources: {
        containers: [
          {
            color: 'green',
            cpuPercent: 3.2,
            label: 'green',
            memoryBytes: 450 * 1024 * 1024,
            rxBytes: 12 * 1024 * 1024,
            txBytes: 8 * 1024 * 1024,
          },
          {
            color: 'cyan',
            cpuPercent: 0.1,
            label: 'proxy',
            memoryBytes: 24 * 1024 * 1024,
            rxBytes: 2 * 1024 * 1024,
            txBytes: 3 * 1024 * 1024,
          },
        ],
        state: 'live',
        totalCpuPercent: 3.3,
        totalMemoryBytes: 474 * 1024 * 1024,
        totalRxBytes: 14 * 1024 * 1024,
        totalTxBytes: 11 * 1024 * 1024,
      },
      deployments: [
        {
          activeColor: 'green',
          commitShortHash: 'ddd444',
          commitSubject: 'Current promotion in flight',
          startedAt: Date.parse('2026-04-18T11:29:40.000Z'),
          status: 'deploying',
        },
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
        {
          activeColor: 'green',
          commitShortHash: 'zzz999',
          commitSubject: 'Older retired deployment',
          endedAt: Date.parse('2026-04-18T09:20:00.000Z'),
          finishedAt: Date.parse('2026-04-18T09:00:00.000Z'),
          startedAt: Date.parse('2026-04-18T08:59:30.000Z'),
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
  assert.match(plainOutput, /Docker:\s+live/);
  assert.match(plainOutput, /cpu 3\.3%/);
  assert.match(plainOutput, /Containers:\s+\[GREEN\]/);
  assert.match(plainOutput, /\[PROXY\]/);
  assert.doesNotMatch(plainOutput, /Next poll:/);
  assert.match(plainOutput, /req 128 req/);
  assert.match(plainOutput, /avg 6\.4 rpm/);
  assert.match(plainOutput, /peak 12 rpm/);
  assert.match(plainOutput, /day 54 req/);
  assert.match(plainOutput, /davg 88\.4\/day/);
  assert.match(plainOutput, /dpeak 120\/day/);
  assert.match(plainOutput, /Top 3 Deployments/);
  assert.match(
    plainOutput,
    /Showing the most relevant cards first: in-progress rollout, live traffic, then warm standby\./
  );
  assert.match(plainOutput, /╭/);
  assert.match(plainOutput, /Current promotion in flight/);
  assert.match(plainOutput, /\[18:10:00\]/);
  assert.match(plainOutput, /ACTIVE/);
  assert.match(plainOutput, /green/);
  assert.match(plainOutput, /DEPLOYED/);
  assert.match(plainOutput, /RETIRED/);
  assert.match(plainOutput, /42s/);
  assert.match(plainOutput, /20m/);
  assert.match(plainOutput, /Refresh watcher UX and restart logic/);
  assert.doesNotMatch(plainOutput, /Older retired deployment/);

  const lines = plainOutput.split('\n');
  const firstCardTop = lines.find((line) => line.startsWith('╭'));
  const firstCardHeading = lines.find((line) =>
    line.includes('Current promotion in flight')
  );
  const deploymentsSection = plainOutput.split('Top 3 Deployments')[1] ?? '';
  const promotionIndex = deploymentsSection.indexOf(
    'Current promotion in flight'
  );
  const activeIndex = deploymentsSection.indexOf(
    'Refresh watcher UX and restart logic'
  );
  const standbyIndex = deploymentsSection.indexOf('Previous rollout');

  assert.ok(firstCardTop);
  assert.ok(firstCardHeading);
  assert.ok(promotionIndex >= 0);
  assert.ok(activeIndex > promotionIndex);
  assert.ok(standbyIndex > activeIndex);
  assert.equal((plainOutput.match(/╭/g) ?? []).length, DISPLAY_DEPLOYMENTS);
  assert.equal(firstCardTop.length, firstCardHeading.length);
});

test('buildDashboardView surfaces the latest deploy failure details', () => {
  const now = Date.parse('2026-04-18T11:30:00.000Z');
  const plainOutput = stripAnsi(
    buildDashboardView(
      {
        currentBlueGreen: {
          activeColor: 'green',
          state: 'degraded',
        },
        deployments: [],
        events: [],
        intervalMs: DEFAULT_INTERVAL_MS,
        lastResult: {
          error: new Error(
            'Command failed (1): docker compose -f docker-compose.web.prod.yml --profile redis up --build --detach --remove-orphans web-green\nservice "web-green" is unhealthy'
          ),
          status: 'deploy-failed',
        },
        latestCommit: {
          committedAt: now,
          shortHash: 'bbb222',
          subject: 'current',
        },
        startedAt: now - 30_000,
        target: {
          branch: 'main',
          upstreamRef: 'origin/main',
        },
      },
      { now, width: 100 }
    )
  );

  assert.match(plainOutput, /Failure:\s+Command failed \(1\): docker compose/);
  assert.match(plainOutput, /Detail:\s+service "web-green" is unhealthy/);
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
  assert.match(output, /PROMOTING/);
  assert.match(output, /Ship hotfix through blue green/);
  assert.match(output, /Last deploy:\s+deploying/);
  assert.match(output, /elapsed 20s/);
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

test('createWatchUi refreshes TTY dashboards every second so elapsed metrics keep ticking', () => {
  const writes = [];
  const intervals = [];
  const cleared = [];
  const stdout = {
    columns: 100,
    isTTY: true,
    write(value) {
      writes.push(value);
    },
  };

  const ui = createWatchUi(
    {
      deployments: [
        {
          activeColor: 'green',
          commitShortHash: 'bbb222',
          commitSubject: 'Deploy in progress',
          startedAt: Date.parse('2026-04-19T10:00:00.000Z'),
          status: 'building',
        },
      ],
      intervalMs: 1000,
      lastDeployAt: Date.parse('2026-04-19T10:00:00.000Z'),
      lastDeployStatus: 'building',
    },
    {
      clearIntervalImpl(id) {
        cleared.push(id);
      },
      isTTY: true,
      now: () => Date.parse('2026-04-19T10:00:05.000Z'),
      refreshIntervalMs: 1000,
      setIntervalImpl(callback, delay) {
        intervals.push({ callback, delay });
        return 'timer-1';
      },
      stdout,
    }
  );

  ui.start();
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 1000);

  const writesBeforeTick = writes.length;
  intervals[0].callback();
  assert.ok(writes.length > writesBeforeTick);

  ui.close();
  assert.deepEqual(cleared, ['timer-1']);
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

test('writeWatchStatus persists a serializable watcher snapshot', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-status-'));
  const paths = getWatchPaths(tempDir);

  try {
    writeWatchStatus(
      {
        deployments: [],
        lastResult: {
          error: new Error('deploy failed'),
          status: 'deploy-failed',
        },
        latestCommit: {
          shortHash: 'abc123',
          subject: 'Test commit',
        },
      },
      {
        fsImpl: fs,
        now: 1234,
        paths,
        processImpl: { pid: 4321 },
      }
    );

    assert.deepEqual(readWatchStatus(paths, fs), {
      deployments: [],
      lastResult: {
        error: 'deploy failed',
        status: 'deploy-failed',
      },
      latestCommit: {
        shortHash: 'abc123',
        subject: 'Test commit',
      },
      ownerPid: 4321,
      updatedAt: 1234,
    });
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('terminateExistingWatcher gracefully stops a running watcher pid', async () => {
  const signals = [];
  const processImpl = {
    kill(_pid, signal) {
      if (signal === 0 || signal == null) {
        if (signals.includes('SIGTERM')) {
          const error = new Error('missing');
          error.code = 'ESRCH';
          throw error;
        }

        return;
      }

      signals.push(signal);
    },
  };

  const terminated = await terminateExistingWatcher(
    { pid: 4321 },
    {
      processImpl,
      sleepImpl: async () => {},
      timeoutMs: 100,
    }
  );

  assert.equal(terminated, true);
  assert.deepEqual(signals, ['SIGTERM']);
});

test('mirrorExistingWatchSession loads the persisted watcher state when resuming', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-resume-'));
  const paths = getWatchPaths(tempDir);
  const updates = [];
  const infos = [];

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.lockFile,
      JSON.stringify({
        branch: 'main',
        pid: 4321,
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      }),
      'utf8'
    );
    writeWatchStatus(
      {
        currentBlueGreen: {
          activeColor: 'green',
          state: 'serving',
        },
        deployments: [],
        intervalMs: 1000,
        lastDeployStatus: 'successful',
        target: {
          branch: 'main',
          upstreamRef: 'origin/main',
        },
      },
      {
        fsImpl: fs,
        now: 1234,
        paths,
        processImpl: { pid: 4321 },
      }
    );

    const result = await mirrorExistingWatchSession(
      {
        branch: 'main',
        pid: 4321,
        upstreamRef: 'origin/main',
      },
      {
        fsImpl: fs,
        log: {
          close() {},
          error() {},
          info(message) {
            infos.push(message);
          },
          start() {},
          update(patch) {
            updates.push(patch);
          },
          warn() {},
        },
        once: true,
        paths,
        processImpl: {
          kill() {},
        },
      }
    );

    assert.equal(result.resumedPid, 4321);
    assert.equal(updates[0].currentBlueGreen.activeColor, 'green');
    assert.match(infos[0], /Resuming watcher view for PID 4321/);
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

test('appendDeploymentHistory closes the prior active deployment and keeps only the last 5 entries', () => {
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
    appendDeploymentHistory(
      {
        buildDurationMs: 8_000,
        commitShortHash: 'e5',
        commitSubject: 'five',
        finishedAt: 5000,
        startedAt: 4500,
        status: 'failed',
      },
      {
        fsImpl: fs,
        paths,
      }
    );
    appendDeploymentHistory(
      {
        activatedAt: 6000,
        activeColor: 'green',
        buildDurationMs: 20_000,
        commitShortHash: 'f6',
        commitSubject: 'six',
        finishedAt: 6000,
        startedAt: 5500,
        status: 'successful',
      },
      {
        fsImpl: fs,
        paths,
      }
    );

    const history = readDeploymentHistory(paths, fs);

    assert.equal(history.length, MAX_DEPLOYMENTS);
    assert.equal(history[0].commitShortHash, 'f6');
    assert.equal(history[1].commitShortHash, 'e5');
    assert.equal(history[2].commitShortHash, 'd4');
    assert.equal(history[3].commitShortHash, 'c3');
    assert.equal(history[4].commitShortHash, 'b2');
    assert.equal(history[4].endedAt, 4000);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('appendDeploymentHistory keeps the active deployment open during standby refreshes', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-history-standby-refresh-')
  );
  const paths = getWatchPaths(tempDir);

  try {
    writeDeploymentHistory(
      [
        {
          activatedAt: 1000,
          activeColor: 'green',
          buildDurationMs: 30_000,
          commitHash: 'green-current',
          commitShortHash: 'g1',
          commitSubject: 'green current',
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
        activeColor: 'blue',
        buildDurationMs: 28_000,
        commitHash: 'green-current',
        commitShortHash: 'b2',
        commitSubject: 'blue catch-up',
        deploymentKind: 'standby-refresh',
        finishedAt: 2000,
        startedAt: 1500,
        status: 'successful',
      },
      {
        fsImpl: fs,
        paths,
      }
    );

    const history = readDeploymentHistory(paths, fs);

    assert.equal(history.length, 2);
    assert.equal(history[0].deploymentKind, 'standby-refresh');
    assert.equal(history[0].activeColor, 'blue');
    assert.equal(history[1].activeColor, 'green');
    assert.equal(history[1].endedAt, undefined);
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
      {
        path: '/__platform/drain-status',
        time: Date.parse('2026-04-19T11:02:20.000Z'),
      },
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

        if (key === prodComposePsKey('web-blue')) {
          return createResult('blue-123\n');
        }

        if (
          key ===
          'docker stats --no-stream --format {{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.Name}} proxy-123 blue-123 green-123'
        ) {
          return createResult(
            [
              'proxy-123\t0.10%\t24.0MiB / 31.1GiB\t2.00MB / 3.00MB\tplatform-web-proxy-1',
              'blue-123\t1.20%\t150MiB / 31.1GiB\t6.00MB / 4.00MB\tplatform-web-blue-1',
              'green-123\t3.40%\t420MiB / 31.1GiB\t10.0MB / 8.00MB\tplatform-web-green-1',
            ].join('\n')
          );
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(status, {
      activeColor: 'green',
      activeServiceRunning: true,
      liveColors: ['blue', 'green'],
      proxyRunning: true,
      serviceContainers: {
        proxy: 'proxy-123',
        'web-blue': 'blue-123',
        'web-green': 'green-123',
      },
      state: 'serving',
      standbyColor: 'blue',
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

test('resolveCurrentBlueGreenStatus falls back to docker ps when compose inspection fails', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-runtime-compose-fallback-')
  );
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

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
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;

        if (
          key ===
          `docker compose -f ${PROD_COMPOSE_FILE} ps -q ${BLUE_GREEN_PROXY_SERVICE}`
        ) {
          return createResult('', {
            code: 1,
            stderr: 'missing UPSTASH_REDIS_REST_TOKEN',
          });
        }

        if (key === `docker compose -f ${PROD_COMPOSE_FILE} ps -q web-green`) {
          return createResult('', {
            code: 1,
            stderr: 'missing UPSTASH_REDIS_REST_TOKEN',
          });
        }

        if (key === `docker compose -f ${PROD_COMPOSE_FILE} ps -q web-blue`) {
          return createResult('', {
            code: 1,
            stderr: 'missing UPSTASH_REDIS_REST_TOKEN',
          });
        }

        if (
          key ===
          `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=web-proxy --format {{.ID}}`
        ) {
          return createResult('proxy-fallback\n');
        }

        if (
          key ===
          `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=web-green --format {{.ID}}`
        ) {
          return createResult('green-fallback\n');
        }

        if (
          key ===
          `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=web-blue --format {{.ID}}`
        ) {
          return createResult('blue-fallback\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(status, {
      activeColor: 'green',
      activeServiceRunning: true,
      liveColors: ['blue', 'green'],
      proxyRunning: true,
      serviceContainers: {
        proxy: 'proxy-fallback',
        'web-blue': 'blue-fallback',
        'web-green': 'green-fallback',
      },
      state: 'serving',
      standbyColor: 'blue',
    });
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('loadRuntimeSnapshot keeps both live colors marked active in deployment cards', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-runtime-live-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.writeFileSync(paths.blueGreen.stateFile, 'green\n', 'utf8');

    const now = Date.parse('2026-04-18T11:30:00.000Z');
    const snapshot = await loadRuntimeSnapshot({
      envFilePath,
      fsImpl: fs,
      history: [
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
        {
          activatedAt: Date.parse('2026-04-18T10:00:00.000Z'),
          activeColor: 'green',
          buildDurationMs: 22_000,
          commitHash: 'old-green-commit',
          commitShortHash: 'ggg000',
          commitSubject: 'older green',
          endedAt: Date.parse('2026-04-18T10:59:00.000Z'),
          finishedAt: Date.parse('2026-04-18T10:00:00.000Z'),
          startedAt: Date.parse('2026-04-18T09:59:38.000Z'),
          status: 'successful',
        },
      ],
      now,
      paths,
      rootDir: tempDir,
      runCommand: createRunCommandMock(
        new Map([
          [
            prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
            createResult('proxy-123\n'),
          ],
          [prodComposePsKey('web-green'), createResult('green-123\n')],
          [prodComposePsKey('web-blue'), createResult('blue-123\n')],
          [
            'docker stats --no-stream --format {{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.Name}} proxy-123 blue-123 green-123',
            createResult(
              [
                'proxy-123\t0.10%\t24.0MiB / 31.1GiB\t2.00MB / 3.00MB\tplatform-web-proxy-1',
                'blue-123\t1.20%\t150MiB / 31.1GiB\t6.00MB / 4.00MB\tplatform-web-blue-1',
                'green-123\t3.40%\t420MiB / 31.1GiB\t10.0MB / 8.00MB\tplatform-web-green-1',
              ].join('\n')
            ),
          ],
          [
            'docker logs --timestamps --since 2026-04-18T10:30:00.000Z proxy-123',
            createResult(''),
          ],
        ])
      ),
    });

    assert.equal(snapshot.deployments[0].runtimeState, 'active');
    assert.equal(snapshot.deployments[1].runtimeState, 'standby');
    assert.equal(snapshot.deployments[2].runtimeState, null);
    assert.equal(snapshot.dockerResources.state, 'live');
    assert.equal(snapshot.dockerResources.containers.length, 3);
    assert.equal(snapshot.dockerResources.totalCpuPercent, 4.7);
    assert.match(
      stripAnsi(
        buildDashboardView(
          {
            currentBlueGreen: snapshot.currentBlueGreen,
            dockerResources: snapshot.dockerResources,
            deployments: snapshot.deployments,
            events: [],
            intervalMs: DEFAULT_INTERVAL_MS,
            lastDeployAt: now,
            lastDeployStatus: 'successful',
            lastResult: { status: 'up-to-date' },
            latestCommit: {
              committedAt: now,
              hash: 'bbb222222',
              shortHash: 'bbb222',
              subject: 'current',
            },
            lockFile: '/tmp/watch.lock',
            startedAt: now - 30_000,
            target: {
              branch: 'main',
              upstreamRef: 'origin/main',
            },
          },
          { now, width: 100 }
        )
      ),
      /\[ACTIVE\] \[green\][\s\S]*\[STANDBY\] \[blue\]/
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('loadRuntimeSnapshot parses docker stats that use comma decimals', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-runtime-locale-')
  );
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.writeFileSync(paths.blueGreen.stateFile, 'green\n', 'utf8');

    const now = Date.parse('2026-04-18T11:30:00.000Z');
    const snapshot = await loadRuntimeSnapshot({
      envFilePath,
      fsImpl: fs,
      history: [],
      now,
      paths,
      rootDir: tempDir,
      runCommand: createRunCommandMock(
        new Map([
          [
            prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
            createResult('proxy-123\n'),
          ],
          [prodComposePsKey('web-green'), createResult('green-123\n')],
          [prodComposePsKey('web-blue'), createResult('blue-123\n')],
          [
            'docker stats --no-stream --format {{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.Name}} proxy-123 blue-123 green-123',
            createResult(
              [
                'proxy-123\t0,10%\t24,0MiB / 31,1GiB\t2,00MB / 3,00MB\tplatform-web-proxy-1',
                'blue-123\t1,20%\t150,5MiB / 31,1GiB\t6,00MB / 4,00MB\tplatform-web-blue-1',
                'green-123\t3,40%\t420,25MiB / 31,1GiB\t10,0MB / 8,00MB\tplatform-web-green-1',
              ].join('\n')
            ),
          ],
        ])
      ),
    });

    assert.equal(snapshot.dockerResources.state, 'live');
    assert.equal(snapshot.dockerResources.containers.length, 3);
    assert.equal(snapshot.dockerResources.totalCpuPercent, 4.7);
    assert.ok(snapshot.dockerResources.totalMemoryBytes > 0);
    assert.ok(snapshot.dockerResources.totalRxBytes > 0);
    assert.ok(snapshot.dockerResources.totalTxBytes > 0);
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
      `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`,
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration reports git fetch failures without killing the watcher state', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-git-fail-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

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
        runCommand: createRunCommandMock(
          new Map([
            ['git rev-parse --abbrev-ref HEAD', createResult('main\n')],
            ['git status --porcelain', createResult('')],
            [
              'git fetch origin main',
              createResult('', {
                code: 1,
                stderr: 'fatal: unable to access origin/main',
              }),
            ],
            [
              'git log -1 --format=%H%n%h%n%s%n%cI HEAD',
              createResult(
                'aaa111111111111111111\naaa111\nKeep branch current\n2026-04-18T10:58:00.000Z\n'
              ),
            ],
            [prodComposePsKey(BLUE_GREEN_PROXY_SERVICE), createResult('')],
          ])
        ),
      }
    );

    assert.equal(result.status, 'git-failed');
    assert.equal(result.latestCommit?.shortHash, 'aaa111');
    assert.match(result.error.message, /git fetch origin main/);
    assert.equal(result.currentBlueGreen.state, 'idle');
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

    if (key === 'bun upgrade') {
      return createResult('');
    }

    if (key === 'bun i') {
      return createResult('');
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

    if (key === 'bun upgrade') {
      return createResult('');
    }

    if (key === 'bun i') {
      return createResult('');
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

test('runDeployWatchIteration keeps polling when bun.lock is the only dirty file', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (key === 'git rev-parse --abbrev-ref HEAD') {
      return createResult('main\n');
    }

    if (key === 'git status --porcelain') {
      return createResult(' M bun.lock\n');
    }

    if (key === 'git fetch origin main') {
      return createResult('');
    }

    if (key === 'git rev-parse HEAD') {
      return createResult('aaa111\n');
    }

    if (key === 'git rev-parse origin/main') {
      return createResult('aaa111\n');
    }

    if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
      return createResult(
        'aaa111111111111111111\naaa111\nKeep branch current\n2026-04-18T10:58:00.000Z\n'
      );
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
      runCommand,
    }
  );

  assert.equal(result.status, 'up-to-date');
  assert.ok(calls.includes('git fetch origin main'));
});

test('runDeployWatchIteration refreshes a stale standby deployment after 15 minutes', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-standby-refresh-')
  );
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];
  const pendingStates = [];
  const nowValues = [
    Date.parse('2026-04-18T11:16:00.000Z'),
    Date.parse('2026-04-18T11:16:00.000Z'),
    Date.parse('2026-04-18T11:16:01.000Z'),
    Date.parse('2026-04-18T11:16:05.000Z'),
    Date.parse('2026-04-18T11:16:05.000Z'),
  ];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.writeFileSync(paths.blueGreen.stateFile, 'green\n', 'utf8');
    writeDeploymentHistory(
      [
        {
          activatedAt: Date.parse('2026-04-18T11:00:00.000Z'),
          activeColor: 'green',
          buildDurationMs: 30_000,
          commitHash: 'bbb222222222222222222',
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
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'previous',
          endedAt: Date.parse('2026-04-18T11:00:00.000Z'),
          finishedAt: Date.parse('2026-04-18T10:30:00.000Z'),
          startedAt: Date.parse('2026-04-18T10:29:35.000Z'),
          status: 'successful',
        },
      ],
      paths,
      fs
    );

    const responses = new Map([
      ['git rev-parse --abbrev-ref HEAD', createResult('main\n')],
      ['git status --porcelain', createResult('')],
      ['git fetch origin main', createResult('')],
      ['git rev-parse HEAD', createResult('bbb222\n')],
      ['git rev-parse origin/main', createResult('bbb222\n')],
      [
        'git log -1 --format=%H%n%h%n%s%n%cI HEAD',
        createResult(
          'bbb222222222222222222\nbbb222\nRefresh watcher UX and restart logic\n2026-04-18T10:58:00.000Z\n'
        ),
      ],
      [prodComposePsKey(BLUE_GREEN_PROXY_SERVICE), createResult('proxy-123\n')],
      [prodComposePsKey('web-green'), createResult('green-123\n')],
      [prodComposePsKey('web-blue'), createResult('blue-123\n')],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q web-green`,
        createResult('green-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q web-blue`,
        createResult('blue-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -a -q web-blue`,
        createResult('blue-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop web-blue`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f web-blue`,
        createResult(''),
      ],
      [
        'docker logs --timestamps --since 2026-04-18T10:30:00.000Z proxy-123',
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --build --detach --remove-orphans web-blue redis serverless-redis-http`,
        createResult(''),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} blue-123`,
        createResult('healthy\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -t`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -s reload`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/__platform/drain-status`,
        createResult(''),
      ],
    ]);
    const runCommand = async (command, args) => {
      const key = `${command} ${args.join(' ')}`;
      calls.push(key);

      if (!responses.has(key)) {
        throw new Error(`Unexpected command: ${key}`);
      }

      return responses.get(key);
    };

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
        now: () => nowValues.shift() ?? Date.parse('2026-04-18T11:16:05.000Z'),
        onDeploymentStart: (state) => {
          pendingStates.push(state);
        },
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(pendingStates.length, 1);
    assert.equal(pendingStates[0].pendingDeployment.status, 'building');
    assert.equal(
      pendingStates[0].pendingDeployment.deploymentKind,
      'standby-refresh'
    );
    assert.equal(pendingStates[0].pendingDeployment.activeColor, 'blue');
    assert.equal(result.status, 'standby-refreshed');
    assert.equal(result.currentBlueGreen.activeColor, 'green');
    assert.equal(result.currentBlueGreen.standbyColor, 'blue');
    assert.equal(result.deployments[0].runtimeState, 'standby');
    assert.equal(result.deployments[0].commitHash, 'bbb222222222222222222');
    assert.equal(result.deployments[1].runtimeState, 'active');
    assert.equal(result.deployments[1].endedAt, undefined);
    assert.ok(
      calls.includes(
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop web-blue`
      )
    );
    assert.ok(
      calls.includes(
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f web-blue`
      )
    );
    assert.ok(
      calls.indexOf(
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f web-blue`
      ) <
        calls.indexOf(
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --build --detach --remove-orphans web-blue redis serverless-redis-http`
        )
    );
    assert.ok(
      result.deployments.length >= 2,
      'expected refreshed standby and active primary deployments'
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchLoop backs off for git failures instead of exiting immediately', async () => {
  const sleepCalls = [];
  const iterationResults = [];
  const sentinel = new Error('stop-after-first-retry');

  await assert.rejects(
    () =>
      runDeployWatchLoop(
        {
          branch: 'main',
          remote: 'origin',
          upstreamBranch: 'main',
          upstreamRef: 'origin/main',
        },
        {
          log: { error() {}, info() {}, warn() {} },
          onIterationResult: (value) => {
            iterationResults.push(value);
          },
          onIterationStart() {},
          runCommand: createRunCommandMock(
            new Map([
              ['git rev-parse --abbrev-ref HEAD', createResult('main\n')],
              ['git status --porcelain', createResult('')],
              [
                'git fetch origin main',
                createResult('', {
                  code: 1,
                  stderr: 'fatal: unable to access origin/main',
                }),
              ],
              [
                'git log -1 --format=%H%n%h%n%s%n%cI HEAD',
                createResult(
                  'aaa111111111111111111\naaa111\nKeep branch current\n2026-04-18T10:58:00.000Z\n'
                ),
              ],
              [prodComposePsKey(BLUE_GREEN_PROXY_SERVICE), createResult('')],
            ])
          ),
          sleepImpl: async (ms) => {
            sleepCalls.push(ms);
            throw sentinel;
          },
        }
      ),
    sentinel
  );

  assert.deepEqual(sleepCalls, [DEFAULT_GIT_FAILURE_BACKOFF_MS]);
  assert.equal(iterationResults.length, 1);
  assert.equal(iterationResults[0].status, 'git-failed');
  assert.equal(iterationResults[0].gitFailureCount, 1);
  assert.equal(iterationResults[0].sleepMs, DEFAULT_GIT_FAILURE_BACKOFF_MS);
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
          `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/__platform/drain-status`
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
      `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/__platform/drain-status`,
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

test('writeWatchArgsFile persists argv for the watcher container entrypoint', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-args-'));

  try {
    const paths = getWatchPaths(tempDir);
    writeWatchArgsFile(['--interval-ms', '5000'], {
      fsImpl: fs,
      paths,
    });

    assert.equal(
      paths.argsFile,
      path.join(
        tempDir,
        'tmp',
        'docker-web',
        'watch',
        'blue-green-auto-deploy.args.json'
      )
    );
    assert.equal(paths.argsFile.endsWith(path.basename(WATCH_ARGS_FILE)), true);
    assert.deepEqual(readWatchArgsFile({ fsImpl: fs, paths }), [
      '--interval-ms',
      '5000',
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('startBlueGreenWatcherContainer writes watcher args and recreates the compose service', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-container-'));
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    await startBlueGreenWatcherContainer(['--interval-ms', '5000'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        return createResult('');
      },
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
    ]);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(
          path.join(
            tempDir,
            'tmp',
            'docker-web',
            'watch',
            'blue-green-auto-deploy.args.json'
          ),
          'utf8'
        )
      ),
      ['--interval-ms', '5000']
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('streamBlueGreenWatcherLogs follows the watcher service output', async () => {
  const calls = [];

  await streamBlueGreenWatcherLogs({
    env: {
      PATH: process.env.PATH,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:8001',
      SUPABASE_SERVER_URL: 'http://localhost:8001',
      UPSTASH_REDIS_REST_TOKEN: 'token',
      UPSTASH_REDIS_REST_URL: 'http://serverless-redis-http:80',
    },
    fsImpl: {
      existsSync() {
        return true;
      },
      readFileSync() {
        return '';
      },
    },
    runCommand: async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      return createResult('');
    },
  });

  assert.deepEqual(calls, [prodComposeWatcherLogsKey()]);
});

test('runWatcherCommand boots the watcher container before tailing logs', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-command-'));
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    await runWatcherCommand(['--once'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        return createResult('');
      },
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
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

        if (key === 'bun upgrade') {
          return createResult('');
        }

        if (key === 'bun i') {
          return createResult('');
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

test('main exits with the container restart code when the watcher script changes inside the watcher container', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-container-restart-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const exits = [];
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
      env: {
        PATH: process.env.PATH,
        [WATCHER_CONTAINER_ENV]: '1',
      },
      envFilePath,
      fsImpl: fs,
      processImpl: {
        argv: ['bun', 'scripts/watch-blue-green-deploy.js'],
        exit(code) {
          exits.push(code);
        },
        on() {},
        pid: 4321,
      },
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

        if (key === 'bun upgrade') {
          return createResult('');
        }

        if (key === 'bun i') {
          return createResult('');
        }

        if (
          key ===
          `git diff --name-only aaa111 bbb222 -- ${SELF_WATCHED_FILES.join(' ')}`
        ) {
          return createResult(`${SELF_WATCHED_FILES[0]}\n`);
        }

        throw new Error(`Unexpected command: ${key}`);
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

    assert.deepEqual(exits, [CONTAINER_SELF_RESTART_EXIT_CODE]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
