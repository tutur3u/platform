const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_INTERVAL_MS,
  acquireWatchLock,
  getWatchPaths,
  isProcessAlive,
  parseArgs,
  parseUpstreamRef,
  readWatchLock,
  releaseWatchLock,
  runDeployWatchIteration,
  runDeployWatchLoop,
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
      runCommand,
    }
  );

  assert.equal(result.status, 'dirty');
  assert.deepEqual(calls, ['branch', 'status']);
});

test('runDeployWatchIteration pulls and triggers blue/green deployment when upstream advances', async () => {
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
      runCommand,
    }
  );

  assert.deepEqual(result, {
    newHead: 'bbb222',
    oldHead: 'aaa111',
    status: 'deployed',
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

  const result = await runDeployWatchLoop(
    {
      branch: 'main',
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    },
    {
      log: { error() {}, info() {}, warn() {} },
      once: true,
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
        ])
      ),
      sleepImpl: async () => {
        slept = true;
      },
    }
  );

  assert.deepEqual(result, { status: 'up-to-date' });
  assert.equal(slept, false);
});
