const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_INTERVAL_MS,
  SELF_WATCHED_FILES,
  acquireWatchLock,
  buildDashboardView,
  createWatchUi,
  formatCountdown,
  formatRelativeTime,
  getWatchPaths,
  isProcessAlive,
  parseArgs,
  parseUpstreamRef,
  readWatchLock,
  releaseWatchLock,
  runDeployWatchIteration,
  runDeployWatchLoop,
  spawnReplacementWatcher,
} = require('./watch-blue-green-deploy.js');

function createRunCommandMock(responses) {
  return async (command, args) => {
    const key = `${command} ${args.join(' ')}`;

    if (!responses.has(key)) {
      throw new Error(`Unexpected command: ${key}`);
    }

    const response = responses.get(key);

    if (typeof response === 'function') {
      return response();
    }

    return response;
  };
}

test('parseArgs uses a 5s interval by default and accepts --once', () => {
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

test('formatRelativeTime and formatCountdown render friendly terminal strings', () => {
  const now = Date.parse('2026-04-18T11:00:00.000Z');

  assert.equal(
    formatRelativeTime(Date.parse('2026-04-18T10:58:00.000Z'), { now }),
    '2m ago'
  );
  assert.equal(
    formatRelativeTime(Date.parse('2026-04-18T11:00:10.000Z'), { now }),
    'in 10s'
  );
  assert.equal(
    formatCountdown(Date.parse('2026-04-18T11:00:05.000Z'), { now }),
    '5.0s'
  );
});

test('buildDashboardView shows commit subject, relative time, and recent events', () => {
  const now = Date.parse('2026-04-18T11:00:00.000Z');
  const output = buildDashboardView(
    {
      events: [
        {
          level: 'info',
          message: 'Pulled main from aaa111 to bbb222.',
          time: Date.parse('2026-04-18T10:59:58.000Z'),
        },
      ],
      intervalMs: 5_000,
      lastCheckAt: Date.parse('2026-04-18T10:59:59.000Z'),
      lastDeployAt: Date.parse('2026-04-18T10:59:58.000Z'),
      lastDeployStatus: 'successful',
      lastResult: { status: 'deployed' },
      latestCommit: {
        committedAt: Date.parse('2026-04-18T10:57:00.000Z'),
        hash: 'bbbb2222',
        shortHash: 'bbb222',
        subject: 'Refresh watcher UX and restart logic',
      },
      lockFile: '/tmp/watch.lock',
      nextCheckAt: Date.parse('2026-04-18T11:00:05.000Z'),
      startedAt: Date.parse('2026-04-18T10:55:00.000Z'),
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

  assert.match(output, /Tuturuuu Auto Deploy Watcher/);
  assert.match(output, /Refresh watcher UX and restart logic/);
  assert.match(output, /3m ago/);
  assert.match(output, /Pulled main from aaa111 to bbb222/);
  assert.match(output, /5\.0s/);
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

test('runDeployWatchIteration skips dirty worktrees before fetch', async () => {
  const calls = [];
  const runCommand = createRunCommandMock(
    new Map([
      [
        'git rev-parse --abbrev-ref HEAD',
        () => {
          calls.push('branch');
          return { code: 0, signal: null, stderr: '', stdout: 'main\n' };
        },
      ],
      [
        'git status --porcelain',
        () => {
          calls.push('status');
          return {
            code: 0,
            signal: null,
            stderr: '',
            stdout: ' M package.json\n',
          };
        },
      ],
    ])
  );

  const result = await runDeployWatchIteration(
    {
      branch: 'main',
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    },
    {
      log: { error() {}, info() {}, warn() {} },
      now: () => 1234,
      runCommand,
    }
  );

  assert.deepEqual(result, {
    checkedAt: 1234,
    status: 'dirty',
  });
  assert.deepEqual(calls, ['branch', 'status']);
});

test('runDeployWatchIteration pulls, deploys, and flags watcher self-restart when the script changed', async () => {
  const deployCommands = [];
  const commandCounts = new Map();
  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    const count = (commandCounts.get(key) ?? 0) + 1;
    commandCounts.set(key, count);

    if (key === 'git rev-parse --abbrev-ref HEAD') {
      return { code: 0, signal: null, stderr: '', stdout: 'main\n' };
    }

    if (key === 'git status --porcelain') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (key === 'git fetch origin main') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (key === 'git rev-parse HEAD') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: count === 1 ? 'aaa111\n' : 'bbb222\n',
      };
    }

    if (key === 'git rev-parse origin/main') {
      return { code: 0, signal: null, stderr: '', stdout: 'bbb222\n' };
    }

    if (key === 'git merge-base --is-ancestor aaa111 bbb222') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (key === 'git pull --ff-only origin main') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: 'Updating aaa111..bbb222\n',
      };
    }

    if (
      key ===
      `git diff --name-only aaa111 bbb222 -- ${SELF_WATCHED_FILES.join(' ')}`
    ) {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `${SELF_WATCHED_FILES[0]}\n`,
      };
    }

    if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout:
          'bbb222222222222222222\nbbb222\nRefresh watcher UX and restart logic\n2026-04-18T10:58:00.000Z\n',
      };
    }

    if (
      key ===
      `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
    ) {
      deployCommands.push(key);
      return { code: 0, signal: null, stderr: '', stdout: '' };
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
      now: () => 9999,
      runCommand,
    }
  );

  assert.deepEqual(result, {
    checkedAt: 9999,
    latestCommit: {
      committedAt: Date.parse('2026-04-18T10:58:00.000Z'),
      hash: 'bbb222222222222222222',
      shortHash: 'bbb222',
      subject: 'Refresh watcher UX and restart logic',
    },
    newHead: 'bbb222',
    oldHead: 'aaa111',
    restartRequired: true,
    status: 'restarting',
  });
  assert.equal(deployCommands.length, 1);
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
              [
                'git rev-parse --abbrev-ref HEAD',
                { code: 0, signal: null, stderr: '', stdout: 'release\n' },
              ],
            ])
          ),
        }
      ),
    /Current branch changed from main to release/
  );
});

test('runDeployWatchLoop honors once mode without sleeping', async () => {
  let slept = false;
  const iterationStarts = [];
  const iterationResults = [];

  const result = await runDeployWatchLoop(
    {
      branch: 'main',
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    },
    {
      log: { error() {}, info() {}, warn() {} },
      now: () => 1000,
      once: true,
      onIterationResult: (value) => {
        iterationResults.push(value);
      },
      onIterationStart: (value) => {
        iterationStarts.push(value);
      },
      runCommand: createRunCommandMock(
        new Map([
          [
            'git rev-parse --abbrev-ref HEAD',
            { code: 0, signal: null, stderr: '', stdout: 'main\n' },
          ],
          [
            'git status --porcelain',
            { code: 0, signal: null, stderr: '', stdout: '' },
          ],
          [
            'git fetch origin main',
            { code: 0, signal: null, stderr: '', stdout: '' },
          ],
          [
            'git rev-parse HEAD',
            { code: 0, signal: null, stderr: '', stdout: 'aaa111\n' },
          ],
          [
            'git rev-parse origin/main',
            { code: 0, signal: null, stderr: '', stdout: 'aaa111\n' },
          ],
          [
            'git log -1 --format=%H%n%h%n%s%n%cI HEAD',
            {
              code: 0,
              signal: null,
              stderr: '',
              stdout:
                'aaa111111111111111111\naaa111\nKeep branch current\n2026-04-18T10:58:00.000Z\n',
            },
          ],
        ])
      ),
      sleepImpl: async () => {
        slept = true;
      },
    }
  );

  assert.deepEqual(result, {
    checkedAt: 1000,
    latestCommit: {
      committedAt: Date.parse('2026-04-18T10:58:00.000Z'),
      hash: 'aaa111111111111111111',
      shortHash: 'aaa111',
      subject: 'Keep branch current',
    },
    status: 'up-to-date',
  });
  assert.deepEqual(iterationStarts, [1000]);
  assert.deepEqual(iterationResults, [result]);
  assert.equal(slept, false);
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
