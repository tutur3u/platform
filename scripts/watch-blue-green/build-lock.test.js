const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const {
  DEFAULT_DEPLOYMENT_BUILD_TIMEOUT_MS,
  deploymentLockMatchesProcessCmdline,
  isDeploymentBuildLockBlocking,
  readDeploymentBuildLock,
  tryInvalidateStaleDeploymentBuildLock,
  tryTerminateTimedOutDeploymentBuildLock,
} = require('./build-lock.js');

describe('deploymentLockMatchesProcessCmdline', () => {
  const lock = {
    command: 'bun serve:web:docker:bg',
    deploymentKind: 'manual',
  };

  it('matches bun argv that includes the package script name', () => {
    assert.equal(
      deploymentLockMatchesProcessCmdline(
        lock,
        '/usr/bin/bun run serve:web:docker:bg'.toLowerCase()
      ),
      true
    );
  });

  it('matches node scripts/docker-web.js (package.json invokes node, not bun argv)', () => {
    assert.equal(
      deploymentLockMatchesProcessCmdline(
        lock,
        'node /repo/scripts/docker-web.js up --mode prod --strategy blue-green'.toLowerCase()
      ),
      true
    );
  });

  it('does not match unrelated long tokens in cmdline', () => {
    assert.equal(
      deploymentLockMatchesProcessCmdline(
        lock,
        'node /repo/scripts/some-other-deploy.js --mode prod'.toLowerCase()
      ),
      false
    );
  });
});

const EIGHT_H_MS = 8 * 60 * 60 * 1000;

describe('tryInvalidateStaleDeploymentBuildLock (non-Linux age)', () => {
  it('removes the lock file when the lock age exceeds the stale window', () => {
    const runtimeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'build-lock-stale-')
    );
    const deploymentBuildLockFile = path.join(
      runtimeDir,
      'blue-green-deployment-build.lock'
    );
    const paths = { deploymentBuildLockFile, runtimeDir };

    const startedAt = 1_700_000_000_000;
    const lock = {
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'manual',
      lockToken: 'test-token',
      ownerPid: process.pid,
      startedAt,
    };
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      deploymentBuildLockFile,
      JSON.stringify(lock, null, 2),
      'utf8'
    );

    try {
      const cleared = tryInvalidateStaleDeploymentBuildLock(lock, {
        env: {},
        fsImpl: fs,
        now: () => startedAt + EIGHT_H_MS + 60_000,
        paths,
        processImpl: process,
        platform: 'darwin',
      });
      assert.equal(cleared, true);
      assert.equal(fs.existsSync(deploymentBuildLockFile), false);
    } finally {
      fs.rmSync(runtimeDir, { force: true, recursive: true });
    }
  });

  it('does not remove a young lock on non-Linux when the owner PID is alive', () => {
    const runtimeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'build-lock-young-')
    );
    const deploymentBuildLockFile = path.join(
      runtimeDir,
      'blue-green-deployment-build.lock'
    );
    const paths = { deploymentBuildLockFile, runtimeDir };

    const startedAt = Date.now() - 60_000;
    const lock = {
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'manual',
      lockToken: 'young-token',
      ownerPid: process.pid,
      startedAt,
    };
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      deploymentBuildLockFile,
      JSON.stringify(lock, null, 2),
      'utf8'
    );

    try {
      const cleared = tryInvalidateStaleDeploymentBuildLock(lock, {
        fsImpl: fs,
        now: () => Date.now(),
        paths,
        processImpl: process,
        platform: 'win32',
      });
      assert.equal(cleared, false);
      assert.notEqual(readDeploymentBuildLock(paths, fs), null);
    } finally {
      fs.rmSync(runtimeDir, { force: true, recursive: true });
    }
  });
});

describe('isDeploymentBuildLockBlocking (non-Linux age)', () => {
  it('returns false for an aged lock even when the PID is still alive', () => {
    const startedAt = 1_700_000_000_000;
    const lock = {
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'manual',
      ownerPid: process.pid,
      startedAt,
    };

    assert.equal(
      isDeploymentBuildLockBlocking(lock, {
        now: () => startedAt + EIGHT_H_MS + 1,
        platform: 'darwin',
      }),
      false
    );
  });

  it('returns true for a young lock when the PID is alive', () => {
    const startedAt = Date.now() - 30_000;
    const lock = {
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'manual',
      ownerPid: process.pid,
      startedAt,
    };

    assert.equal(
      isDeploymentBuildLockBlocking(lock, {
        now: () => Date.now(),
        platform: 'darwin',
      }),
      true
    );
  });
});

describe('tryTerminateTimedOutDeploymentBuildLock', () => {
  it('sends SIGTERM and clears the lock after the watcher build timeout', () => {
    const runtimeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'build-lock-timeout-')
    );
    const deploymentBuildLockFile = path.join(
      runtimeDir,
      'blue-green-deployment-build.lock'
    );
    const paths = { deploymentBuildLockFile, runtimeDir };
    const startedAt = 1_700_000_000_000;
    const signals = [];
    const processImpl = {
      kill(pid, signal) {
        if (pid !== 9876) {
          const error = new Error('missing');
          error.code = 'ESRCH';
          throw error;
        }

        signals.push(signal ?? 0);
      },
      pid: 4321,
    };
    const lock = {
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'promotion',
      lockToken: 'timeout-token',
      ownerPid: 9876,
      startedAt,
    };

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      deploymentBuildLockFile,
      JSON.stringify(lock, null, 2),
      'utf8'
    );

    try {
      const result = tryTerminateTimedOutDeploymentBuildLock(lock, {
        fsImpl: fs,
        now: () => startedAt + DEFAULT_DEPLOYMENT_BUILD_TIMEOUT_MS + 1,
        paths,
        processImpl,
      });

      assert.equal(result.action, 'terminated');
      assert.deepEqual(signals, [0, 'SIGTERM']);
      assert.equal(fs.existsSync(deploymentBuildLockFile), false);
    } finally {
      fs.rmSync(runtimeDir, { force: true, recursive: true });
    }
  });

  it('leaves a young live lock untouched', () => {
    const runtimeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'build-lock-timeout-young-')
    );
    const deploymentBuildLockFile = path.join(
      runtimeDir,
      'blue-green-deployment-build.lock'
    );
    const paths = { deploymentBuildLockFile, runtimeDir };
    const startedAt = 1_700_000_000_000;
    const signals = [];
    const processImpl = {
      kill(pid, signal) {
        if (pid !== 9876) {
          const error = new Error('missing');
          error.code = 'ESRCH';
          throw error;
        }

        signals.push(signal ?? 0);
      },
      pid: 4321,
    };
    const lock = {
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'promotion',
      lockToken: 'young-timeout-token',
      ownerPid: 9876,
      startedAt,
    };

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      deploymentBuildLockFile,
      JSON.stringify(lock, null, 2),
      'utf8'
    );

    try {
      const result = tryTerminateTimedOutDeploymentBuildLock(lock, {
        fsImpl: fs,
        now: () => startedAt + 60_000,
        paths,
        processImpl,
      });

      assert.equal(result.action, 'none');
      assert.deepEqual(signals, []);
      assert.notEqual(readDeploymentBuildLock(paths, fs), null);
    } finally {
      fs.rmSync(runtimeDir, { force: true, recursive: true });
    }
  });
});
