const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CommitWindowConflictError,
  LOCK_FILE_RELATIVE_PATH,
  UsageError,
  checkCommitWindow,
  claimCommitWindow,
  getCommitWindowPaths,
  getCommitWindowStatus,
  parseArgs,
  parseTtlMinutes,
  parseWaitPollMs,
  parseWaitTimeoutMinutes,
  releaseCommitWindow,
  runCli,
  waitForCommitWindow,
} = require('./git-commit-window.js');

const FIXED_NOW = new Date('2026-06-12T04:20:00.000Z');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'git-commit-window-'));
}

function cleanupTempRoot(rootDir) {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function createExecFile(stagedFiles = '') {
  return (command, args, options) => {
    assert.equal(command, 'git');
    assert.deepEqual(args, [
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=ACMRD',
    ]);
    assert.equal(options.encoding, 'utf8');
    return stagedFiles;
  };
}

function claimOptions(rootDir, overrides = {}) {
  return {
    cwd: rootDir,
    execFile: createExecFile(overrides.stagedFiles),
    now: () => overrides.now ?? FIXED_NOW,
    pid: 1234,
    rootDir,
    tokenFactory: () => overrides.token ?? 'token-1',
  };
}

function claimInput(overrides = {}) {
  return {
    allowStaged: false,
    owner: 'Codex',
    paths: ['scripts/git-commit-window.js'],
    scope: 'docs(codex): add commit coordination',
    ttlMinutes: 10,
    ...overrides,
  };
}

function writeLock(rootDir, lock) {
  const paths = getCommitWindowPaths(rootDir);
  fs.mkdirSync(paths.coordinationDir, { recursive: true });
  fs.writeFileSync(paths.lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  return paths;
}

test('parseArgs parses claim options', () => {
  assert.deepEqual(
    parseArgs([
      'claim',
      '--owner',
      'Codex',
      '--scope=docs(codex): add commit coordination',
      '--path',
      'AGENTS.md',
      '--path=scripts/git-commit-window.js',
      '--ttl-minutes',
      '7',
      '--allow-staged',
    ]),
    {
      allowStaged: true,
      command: 'claim',
      owner: 'Codex',
      paths: ['AGENTS.md', 'scripts/git-commit-window.js'],
      scope: 'docs(codex): add commit coordination',
      ttlMinutes: 7,
    }
  );
});

test('parseArgs parses wait options', () => {
  assert.deepEqual(
    parseArgs([
      'wait',
      '--owner=Codex',
      '--scope',
      'docs(codex): add commit coordination',
      '--path=AGENTS.md',
      '--poll-ms',
      '250',
      '--timeout-minutes=5',
    ]),
    {
      allowStaged: false,
      command: 'wait',
      owner: 'Codex',
      paths: ['AGENTS.md'],
      pollMs: 250,
      scope: 'docs(codex): add commit coordination',
      timeoutMinutes: 5,
      ttlMinutes: 10,
    }
  );
});

test('parseTtlMinutes validates range and integer values', () => {
  assert.equal(parseTtlMinutes('5'), 5);
  assert.equal(parseTtlMinutes('10'), 10);
  assert.throws(() => parseTtlMinutes('4'), /between 5 and 10/);
  assert.throws(() => parseTtlMinutes('11'), /between 5 and 10/);
  assert.throws(() => parseTtlMinutes('1.5'), /integer/);
});

test('wait option parsers validate range and integer values', () => {
  assert.equal(parseWaitPollMs('100'), 100);
  assert.equal(parseWaitPollMs('60000'), 60_000);
  assert.throws(() => parseWaitPollMs('99'), /between 100 and 60000/);
  assert.throws(() => parseWaitPollMs('100.5'), /integer/);
  assert.equal(parseWaitTimeoutMinutes('1'), 1);
  assert.equal(parseWaitTimeoutMinutes('1440'), 1440);
  assert.throws(() => parseWaitTimeoutMinutes('1441'), /between 1 and 1440/);
});

test('claimCommitWindow writes a new atomic lock', () => {
  const rootDir = makeTempRoot();

  try {
    const result = claimCommitWindow(claimInput(), claimOptions(rootDir));
    const paths = getCommitWindowPaths(rootDir);
    const lockText = fs.readFileSync(paths.lockFile, 'utf8');
    const lock = JSON.parse(lockText);

    assert.equal(paths.lockFile.endsWith(LOCK_FILE_RELATIVE_PATH), true);
    assert.equal(result.lock.token, 'token-1');
    assert.equal(lock.owner, 'Codex');
    assert.equal(lock.scope, 'docs(codex): add commit coordination');
    assert.deepEqual(lock.paths, ['scripts/git-commit-window.js']);
    assert.equal(lock.pid, 1234);
    assert.equal(lock.createdAt, '2026-06-12T04:20:00.000Z');
    assert.equal(lock.expiresAt, '2026-06-12T04:30:00.000Z');
    assert.deepEqual(lock.stagedFilesAtClaim, []);
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('claimCommitWindow rejects staged files unless explicitly allowed', () => {
  const rootDir = makeTempRoot();

  try {
    assert.throws(
      () =>
        claimCommitWindow(
          claimInput(),
          claimOptions(rootDir, { stagedFiles: 'apps/web/page.tsx\n' })
        ),
      UsageError
    );

    const result = claimCommitWindow(
      claimInput({ allowStaged: true }),
      claimOptions(rootDir, {
        stagedFiles: 'apps/web/page.tsx\n',
        token: 'allowed-token',
      })
    );

    assert.deepEqual(result.lock.stagedFilesAtClaim, ['apps/web/page.tsx']);
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('claimCommitWindow rejects an active lock', () => {
  const rootDir = makeTempRoot();

  try {
    writeLock(rootDir, {
      owner: 'Other agent',
      scope: 'fix(web): commit something',
      expiresAt: '2026-06-12T05:00:00.000Z',
      token: 'other-token',
    });

    assert.throws(
      () => claimCommitWindow(claimInput(), claimOptions(rootDir)),
      CommitWindowConflictError
    );
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('claimCommitWindow clears expired locks before writing', () => {
  const rootDir = makeTempRoot();

  try {
    writeLock(rootDir, {
      owner: 'Expired agent',
      scope: 'old scope',
      expiresAt: '2026-06-12T04:00:00.000Z',
      token: 'expired-token',
    });

    const result = claimCommitWindow(
      claimInput(),
      claimOptions(rootDir, { token: 'fresh-token' })
    );

    assert.equal(result.lock.token, 'fresh-token');
    assert.equal(
      getCommitWindowStatus({ now: () => FIXED_NOW, rootDir }).expired,
      false
    );
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('checkCommitWindow validates the active token', () => {
  const rootDir = makeTempRoot();

  try {
    claimCommitWindow(
      claimInput(),
      claimOptions(rootDir, { token: 'check-token' })
    );

    const status = checkCommitWindow('check-token', {
      now: () => FIXED_NOW,
      rootDir,
    });

    assert.equal(status.lock.owner, 'Codex');
    assert.throws(
      () => checkCommitWindow('wrong-token', { now: () => FIXED_NOW, rootDir }),
      CommitWindowConflictError
    );
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('releaseCommitWindow removes matching token locks', () => {
  const rootDir = makeTempRoot();

  try {
    claimCommitWindow(
      claimInput(),
      claimOptions(rootDir, { token: 'release-token' })
    );

    const released = releaseCommitWindow(
      { token: 'release-token' },
      { now: () => FIXED_NOW, rootDir }
    );

    assert.equal(released.released, true);
    assert.equal(fs.existsSync(getCommitWindowPaths(rootDir).lockFile), false);
    assert.deepEqual(
      releaseCommitWindow({ token: 'release-token' }, { rootDir }),
      {
        released: false,
        reason: 'none',
        status: {
          expired: false,
          lock: null,
          paths: getCommitWindowPaths(rootDir),
        },
      }
    );
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('releaseCommitWindow force-releases only expired locks', () => {
  const rootDir = makeTempRoot();

  try {
    writeLock(rootDir, {
      owner: 'Other agent',
      scope: 'active scope',
      expiresAt: '2026-06-12T05:00:00.000Z',
      token: 'active-token',
    });

    assert.throws(
      () =>
        releaseCommitWindow(
          { forceStale: true },
          { now: () => FIXED_NOW, rootDir }
        ),
      CommitWindowConflictError
    );

    writeLock(rootDir, {
      owner: 'Other agent',
      scope: 'expired scope',
      expiresAt: '2026-06-12T04:00:00.000Z',
      token: 'expired-token',
    });

    const released = releaseCommitWindow(
      { forceStale: true },
      { now: () => FIXED_NOW, rootDir }
    );

    assert.equal(released.reason, 'stale');
    assert.equal(fs.existsSync(getCommitWindowPaths(rootDir).lockFile), false);
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('waitForCommitWindow sleeps until release and claims the lock', () => {
  const rootDir = makeTempRoot();
  const sleepDurations = [];
  let now = FIXED_NOW;

  try {
    const paths = writeLock(rootDir, {
      owner: 'Other agent',
      scope: 'active scope',
      expiresAt: '2026-06-12T05:00:00.000Z',
      token: 'active-token',
    });

    const result = waitForCommitWindow(
      claimInput({
        pollMs: 250,
        timeoutMinutes: 5,
      }),
      {
        ...claimOptions(rootDir, { token: 'wait-token' }),
        now: () => now,
        sleep: (ms) => {
          sleepDurations.push(ms);
          fs.rmSync(paths.lockFile, { force: true });
          now = new Date(now.getTime() + ms);
        },
      }
    );

    assert.equal(result.waited, true);
    assert.equal(result.attempts, 1);
    assert.deepEqual(sleepDurations, [250]);
    assert.equal(result.lock.token, 'wait-token');
    assert.equal(
      JSON.parse(fs.readFileSync(paths.lockFile, 'utf8')).token,
      'wait-token'
    );
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('waitForCommitWindow times out with conflict exit semantics', () => {
  const rootDir = makeTempRoot();
  let now = FIXED_NOW;

  try {
    writeLock(rootDir, {
      owner: 'Other agent',
      scope: 'active scope',
      expiresAt: '2026-06-12T05:00:00.000Z',
      token: 'active-token',
    });

    assert.throws(
      () =>
        waitForCommitWindow(
          claimInput({
            pollMs: 30_000,
            timeoutMinutes: 1,
          }),
          {
            ...claimOptions(rootDir),
            now: () => now,
            sleep: (ms) => {
              now = new Date(now.getTime() + ms);
            },
          }
        ),
      CommitWindowConflictError
    );
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('runCli returns exit code 2 for active-lock conflicts', () => {
  const rootDir = makeTempRoot();
  const stdout = { write() {} };
  const stderrMessages = [];
  const stderr = { write: (message) => stderrMessages.push(message) };

  try {
    writeLock(rootDir, {
      owner: 'Other agent',
      scope: 'active scope',
      expiresAt: '2026-06-12T05:00:00.000Z',
      token: 'active-token',
    });

    const exitCode = runCli(
      [
        'claim',
        '--owner',
        'Codex',
        '--scope',
        'docs(codex): add commit coordination',
      ],
      {
        ...claimOptions(rootDir),
        stderr,
        stdout,
      }
    );

    assert.equal(exitCode, 2);
    assert.match(stderrMessages.join(''), /already claimed/);
  } finally {
    cleanupTempRoot(rootDir);
  }
});

test('runCli wait notifies then claims after release', () => {
  const rootDir = makeTempRoot();
  const stdoutMessages = [];
  const stderr = { write() {} };
  const stdout = { write: (message) => stdoutMessages.push(message) };
  let now = FIXED_NOW;

  try {
    const paths = writeLock(rootDir, {
      owner: 'Other agent',
      scope: 'active scope',
      expiresAt: '2026-06-12T05:00:00.000Z',
      token: 'active-token',
    });

    const exitCode = runCli(
      [
        'wait',
        '--owner',
        'Codex',
        '--scope',
        'docs(codex): add commit coordination',
        '--poll-ms',
        '500',
        '--timeout-minutes',
        '1',
      ],
      {
        ...claimOptions(rootDir, { token: 'wait-cli-token' }),
        now: () => now,
        sleep: (ms) => {
          fs.rmSync(paths.lockFile, { force: true });
          now = new Date(now.getTime() + ms);
        },
        stderr,
        stdout,
      }
    );

    assert.equal(exitCode, 0);
    assert.match(stdoutMessages.join(''), /Waiting for git commit window/);
    assert.match(stdoutMessages.join(''), /released and claimed/);
    assert.match(stdoutMessages.join(''), /wait-cli-token/);
  } finally {
    cleanupTempRoot(rootDir);
  }
});
