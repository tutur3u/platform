const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { renderBlueGreenProxyConfig } = require('./docker-web/blue-green.js');
const {
  DEFAULT_DEPLOYMENT_BUILD_TIMEOUT_MS,
  DEPLOYMENT_BUILD_LOCK_TOKEN_ENV,
  DeploymentBuildLockConflictError,
  acquireDeploymentBuildLock,
  readDeploymentBuildLock,
  writeDeploymentBuildLock,
} = require('./watch-blue-green/build-lock.js');
const { readWatcherLogEntries } = require('./watch-blue-green/logs.js');

const {
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_WATCHER_SERVICE,
  CONTAINER_REFRESH_WATCHED_FILES,
  CONTAINER_REFRESH_EXIT_CODE,
  CONTAINER_SELF_RESTART_EXIT_CODE,
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_DOCKER_DAEMON_RESTART_AFTER_MS,
  DEFAULT_DOCKER_DAEMON_RESTART_COOLDOWN_MS,
  DEFAULT_DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS,
  DEFAULT_GIT_FAILURE_BACKOFF_MS,
  DEFAULT_STALE_GIT_INDEX_LOCK_MS,
  DEFAULT_INTERVAL_MS,
  DISPLAY_DEPLOYMENTS,
  DOCKER_DAEMON_RESTART_COMMAND_ENV,
  DOCKER_DAEMON_RESTART_DISABLED_ENV,
  DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV,
  DOCKER_DAEMON_RECOVERY_SETTINGS_FILE,
  HOST_WORKSPACE_DIR_ENV,
  MIGRATION_PROXY_HANDOFF_TIMEOUT_MS,
  MIGRATION_STAGING_PORT_ENV,
  MAX_GIT_FAILURE_BACKOFF_MS,
  MAX_FAILED_DEPLOYMENTS_PER_COMMIT,
  SELF_WATCHED_FILES,
  WATCH_ARGS_FILE,
  WATCH_PENDING_DEPLOY_ENV,
  WATCHER_CONTAINER_ENV,
  acquireWatchLock,
  appendDeploymentHistory,
  buildDashboardView,
  clearContainerManagedWatcherState,
  collectDeploymentTraffic,
  createQuietRunCommand,
  createWatchUi,
  fetchTrackedBranch,
  finalizeComposeProjectMigrationIfRequested,
  formatCountdown,
  formatRelativeTime,
  formatRequestsPerMinute,
  getGitFailureBackoffMs,
  getFailedDeploymentCountForCommit,
  getDockerDaemonRestartAfterMs,
  getDockerDaemonRestartCommand,
  getDockerDaemonRestartCooldownMs,
  getDockerDaemonPostRestartCommands,
  getDockerDaemonPostRestartCommandTimeoutMs,
  getDockerDaemonRecoverySettingsEnv,
  getWatcherComposeEnv,
  getWatchPaths,
  isGitIndexLockError,
  isGitLockError,
  isRecoverableGitCommandError,
  isProcessAlive,
  listDirtyWorktreePaths,
  parseArgs,
  parseContainerConsoleLogEntries,
  parseProxyLogEntries,
  parseUpstreamRef,
  pullTrackedBranch,
  readDeploymentHistory,
  readWatchArgsFile,
  readWatchLock,
  readPendingDeployRequest,
  releaseWatchLock,
  restoreTargetBranchIfDetached,
  resolveCurrentBlueGreenStatus,
  runBunFrozenInstall,
  runBlueGreenDeploy,
  runPendingDeployAfterRestart,
  runDeployWatchIteration,
  runDeployWatchLoop,
  runWatcherCommand,
  removeStaleGitLock,
  removeStaleGitIndexLock,
  startBlueGreenWatcherContainer,
  streamBlueGreenWatcherLogs,
  waitForDockerDaemonRecovery,
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
  clearPendingDeployRequest,
  getWatcherContainerState,
  getLatestSuccessfulDeploymentCommitHash,
  getMigrationTargetWatcherEnv,
  getWatcherStartupComposeEnv,
  hasPersistedPendingDeployRequest,
  handoffLegacyWatcherToTargetProject,
  writePendingDeployRequest,
  writeWatchStatus,
} = require('./watch-blue-green-deploy.js');
const {
  DEPLOYMENT_KIND_ENV,
  DEPLOYMENT_STAGES_FILE_ENV,
  readDeploymentStagesHandoff,
  writeDeploymentStagesHandoff,
} = require('./watch-blue-green/history.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROD_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.prod.yml');

test('watcher restart globs include blue-green service wiring files', () => {
  assert.ok(SELF_WATCHED_FILES.includes('scripts/docker-web/blue-green.js'));
  assert.ok(SELF_WATCHED_FILES.includes('scripts/docker-web/env.js'));
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes('docker-compose.web.prod.yml')
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes(
      'apps/discord/Dockerfile.markitdown'
    )
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes('apps/discord/local_server.py')
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes(
      'apps/discord/markitdown_service.py'
    )
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes(
      'apps/storage-unzip-proxy/Dockerfile'
    )
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes(
      'apps/storage-unzip-proxy/package.json'
    )
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes(
      'apps/storage-unzip-proxy/src/server.js'
    )
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes('apps/meet-realtime/Dockerfile')
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes('apps/meet-realtime/src/server.ts')
  );
  assert.ok(
    CONTAINER_REFRESH_WATCHED_FILES.includes(
      'packages/realtime/src/meet/index.ts'
    )
  );
});

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

    if (command === 'git' && args[0] === 'diff' && args[1] === '--name-only') {
      return createResult('apps/web/src/app/page.tsx\n');
    }

    if (!responses.has(key)) {
      throw new Error(`Unexpected command: ${key}`);
    }

    const response = responses.get(key);
    return typeof response === 'function' ? response() : response;
  };
}

test('runBlueGreenDeploy gives child deploys a stage handoff file', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-run-stages-'));
  const paths = getWatchPaths(tempDir);
  let childEnv = null;

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(paths.deploymentStagesFile, 'stale', 'utf8');

    await runBlueGreenDeploy({
      deploymentKind: 'promotion',
      deployCommand: ['bun', 'serve:web:docker:bg'],
      env: {},
      latestCommit: {
        hash: 'abc123',
        shortHash: 'abc123',
        subject: 'Stage handoff',
      },
      paths,
      runCommand: async (_command, _args, options = {}) => {
        childEnv = options.env;
        assert.equal(fs.existsSync(paths.deploymentStagesFile), false);
        return createResult('');
      },
    });

    assert.equal(childEnv?.[DEPLOYMENT_KIND_ENV], 'promotion');
    assert.equal(
      childEnv?.[DEPLOYMENT_STAGES_FILE_ENV],
      paths.deploymentStagesFile
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('docker daemon restart configuration defaults to host service commands', () => {
  assert.equal(
    getDockerDaemonRestartAfterMs({}),
    DEFAULT_DOCKER_DAEMON_RESTART_AFTER_MS
  );
  assert.equal(
    getDockerDaemonRestartCooldownMs({}),
    DEFAULT_DOCKER_DAEMON_RESTART_COOLDOWN_MS
  );
  assert.equal(
    getDockerDaemonPostRestartCommandTimeoutMs({}),
    DEFAULT_DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS
  );
  assert.deepEqual(
    getDockerDaemonRestartCommand({ env: {}, platform: 'linux' }),
    ['systemctl', 'restart', 'docker']
  );
  assert.deepEqual(
    getDockerDaemonRestartCommand({ env: {}, platform: 'darwin' }),
    ['open', '-ga', 'Docker']
  );
  assert.deepEqual(
    getDockerDaemonRestartCommand({
      env: {
        [DOCKER_DAEMON_RESTART_COMMAND_ENV]:
          '["sudo","systemctl","restart","docker"]',
      },
      platform: 'linux',
    }),
    ['sudo', 'systemctl', 'restart', 'docker']
  );
  assert.equal(
    getDockerDaemonRestartAfterMs({
      [DOCKER_DAEMON_RESTART_DISABLED_ENV]: '1',
    }),
    null
  );
  assert.deepEqual(
    getDockerDaemonPostRestartCommands({
      [DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV]:
        '[{"command":"docker","args":["compose","up","-d"],"cwd":"/srv/zeus"}]',
    }),
    [
      {
        args: ['compose', 'up', '-d'],
        command: 'docker',
        cwd: '/srv/zeus',
      },
    ]
  );
});

test('dashboard Docker recovery settings preserve host-configured command env', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-command-docker-recovery-settings-')
  );
  const paths = getWatchPaths(tempDir);

  try {
    fs.mkdirSync(paths.controlDir, { recursive: true });
    fs.writeFileSync(
      path.join(paths.controlDir, DOCKER_DAEMON_RECOVERY_SETTINGS_FILE),
      JSON.stringify({
        dockerRestartCommand: ['dashboard', 'docker', 'restart'],
        postRestartCommands: [
          {
            args: ['compose', 'up', '-d'],
            command: 'dashboard',
            cwd: '/tmp',
          },
        ],
      }),
      'utf8'
    );

    const effectiveEnv = getDockerDaemonRecoverySettingsEnv({
      env: {
        [DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV]:
          '[["docker","compose","up","-d"]]',
        [DOCKER_DAEMON_RESTART_COMMAND_ENV]: '["custom","docker","restart"]',
      },
      fsImpl: fs,
      paths,
    });

    assert.equal(
      effectiveEnv[DOCKER_DAEMON_RESTART_COMMAND_ENV],
      '["custom","docker","restart"]'
    );
    assert.equal(
      effectiveEnv[DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV],
      '[["docker","compose","up","-d"]]'
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('waitForDockerDaemonRecovery ignores dashboard command fields and runs host-configured hooks', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-command-docker-recovery-settings-')
  );
  const paths = getWatchPaths(tempDir);
  const calls = [];
  let now = 0;
  let restarted = false;

  try {
    fs.mkdirSync(paths.controlDir, { recursive: true });
    fs.writeFileSync(
      path.join(paths.controlDir, DOCKER_DAEMON_RECOVERY_SETTINGS_FILE),
      JSON.stringify({
        dockerRecoveryPollMs: 10,
        dockerRecoveryTimeoutMs: null,
        dockerRestartAfterMs: 1,
        dockerRestartCommand: ['malicious', 'docker', 'restart'],
        dockerRestartCooldownMs: 1,
        dockerRestartDisabled: false,
        kind: 'docker-recovery-settings',
        postRestartCommandTimeoutMs: 1234,
        postRestartCommands: [
          {
            args: ['after-restart'],
            command: 'malicious',
            cwd: '/tmp',
          },
        ],
      }),
      'utf8'
    );

    const recovered = await waitForDockerDaemonRecovery({
      env: {
        PATH: process.env.PATH,
        [DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV]:
          '[{"command":"docker","args":["compose","up","-d"],"cwd":"/srv/zeus"}]',
        [DOCKER_DAEMON_RESTART_COMMAND_ENV]: '["service","docker","restart"]',
      },
      fsImpl: fs,
      log: { warn() {} },
      now: () => now,
      paths,
      runCommand: async (command, args, options = {}) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(options.cwd ? `${key} cwd=${options.cwd}` : `${key}`);

        if (key === 'docker info') {
          return restarted
            ? createResult('')
            : createResult('', {
                code: 1,
                stderr: 'Cannot connect to the Docker daemon',
              });
        }

        if (key === 'service docker restart') {
          restarted = true;
          return createResult('');
        }

        if (key === 'docker compose up -d') {
          assert.equal(options.cwd, '/srv/zeus');
          assert.equal(options.timeoutMs, 1234);
          return createResult('');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
      sleepImpl: async (ms) => {
        now += ms;
      },
    });

    assert.equal(recovered, true);
    assert.deepEqual(calls, [
      'docker info',
      'docker info',
      'service docker restart',
      'docker info',
      'docker compose up -d cwd=/srv/zeus',
    ]);
    const recoveryLogs = readWatcherLogEntries(paths, fs).filter((entry) =>
      String(entry.eventType ?? '').startsWith('docker-')
    );
    assert.deepEqual(
      recoveryLogs.map((entry) => entry.eventType),
      [
        'docker-post-restart-commands-completed',
        'docker-daemon-recovered',
        'docker-daemon-restart-result',
        'docker-daemon-restart-attempt',
        'docker-daemon-unavailable',
      ]
    );
    assert.equal(
      new Set(recoveryLogs.map((entry) => entry.incidentId)).size,
      1
    );
    assert.equal(recoveryLogs[0].metadata.ran, 1);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

function prodComposePsKey(serviceName) {
  return `docker compose -f ${PROD_COMPOSE_FILE} ps -q ${serviceName}`;
}

function prodComposePsAllKey(serviceName) {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -a -q ${serviceName}`;
}

function prodComposeWatcherUpKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --build --detach --force-recreate --remove-orphans ${BLUE_GREEN_WATCHER_SERVICE}`;
}

function prodComposeWatcherLogsKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis logs --follow --tail 100 ${BLUE_GREEN_WATCHER_SERVICE}`;
}

function prodComposeHiveDbMigrateKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis run --rm hive-db-migrate`;
}

function prodComposeProxyHealthKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/__platform/drain-status`;
}

function prodComposeProxyStopKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop --timeout 1 ${BLUE_GREEN_PROXY_SERVICE}`;
}

function prodComposeProxyUpKey(extraArgs = []) {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build ${extraArgs.join(' ')}${extraArgs.length > 0 ? ' ' : ''}${BLUE_GREEN_PROXY_SERVICE}`;
}

function prodComposeProjectDownKey() {
  return `docker compose -f ${PROD_COMPOSE_FILE} --profile redis --profile cloudflared down --remove-orphans`;
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

test('runBunFrozenInstall installs dependencies with a frozen lockfile', async () => {
  const calls = [];

  await runBunFrozenInstall({
    runCommand: async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      return createResult('');
    },
  });

  assert.deepEqual(calls, ['bun install --frozen-lockfile']);
});

test('runBunFrozenInstall fails when the frozen install fails', async () => {
  const calls = [];

  await assert.rejects(() =>
    runBunFrozenInstall({
      runCommand: async (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        return createResult('', {
          code: 1,
          stderr: 'install failed',
        });
      },
    })
  );

  assert.deepEqual(calls, ['bun install --frozen-lockfile']);
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

test('isGitIndexLockError detects git index.lock failures', () => {
  assert.equal(
    isGitIndexLockError(
      new Error(
        "Command failed (1): git pull --ff-only origin main\nerror: Unable to create '/workspace/.git/index.lock': File exists.\nAnother git process seems to be running in this repository."
      )
    ),
    true
  );
  assert.equal(
    isGitIndexLockError(new Error('Command failed (1): git fetch origin main')),
    false
  );
});

test('isGitLockError detects git ref lock failures', () => {
  assert.equal(
    isGitLockError(
      new Error(
        "Command failed (1): git pull\nerror: cannot lock ref 'refs/remotes/origin/staging': Unable to create '/workspace/.git/refs/remotes/origin/staging.lock': File exists."
      )
    ),
    true
  );
  assert.equal(
    isGitLockError(new Error('Command failed (1): git fetch origin main')),
    false
  );
});

test('removeStaleGitIndexLock removes only stale lock files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-index-lock-'));
  const gitDir = path.join(tempDir, '.git');
  const lockPath = path.join(gitDir, 'index.lock');
  const logs = [];

  try {
    fs.mkdirSync(gitDir, { recursive: true });

    const lockError = new Error(
      `Command failed (1): git pull --ff-only origin main\nerror: Unable to create '${lockPath}': File exists.\nAnother git process seems to be running in this repository.`
    );

    fs.writeFileSync(lockPath, '', 'utf8');
    const staleNow = Date.now();
    const staleMtime = new Date(
      staleNow - DEFAULT_STALE_GIT_INDEX_LOCK_MS - 1_000
    );
    fs.utimesSync(lockPath, staleMtime, staleMtime);

    assert.equal(
      removeStaleGitIndexLock({
        error: lockError,
        fsImpl: fs,
        log: {
          warn(message) {
            logs.push(message);
          },
        },
        now: () => staleNow,
        rootDir: tempDir,
      }),
      true
    );
    assert.equal(fs.existsSync(lockPath), false);
    assert.match(logs.at(-1), /Removed stale git index lock/);

    fs.writeFileSync(lockPath, '', 'utf8');
    const freshNow = Date.now();
    const freshMtime = new Date(freshNow - 15_000);
    fs.utimesSync(lockPath, freshMtime, freshMtime);

    assert.equal(
      removeStaleGitIndexLock({
        error: lockError,
        fsImpl: fs,
        log: {
          warn(message) {
            logs.push(message);
          },
        },
        now: () => freshNow,
        rootDir: tempDir,
      }),
      false
    );
    assert.equal(fs.existsSync(lockPath), true);
    assert.match(logs.at(-1), /Leaving it in place/);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('removeStaleGitLock removes only stale remote ref lock files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-ref-lock-'));
  const refDir = path.join(tempDir, '.git', 'refs', 'remotes', 'origin');
  const lockPath = path.join(refDir, 'staging.lock');
  const logs = [];

  try {
    fs.mkdirSync(refDir, { recursive: true });
    const lockError = new Error(
      `Command failed (1): git pull\nerror: cannot lock ref 'refs/remotes/origin/staging': Unable to create '${lockPath}': File exists.`
    );
    const staleNow = Date.now();
    const staleMtime = new Date(
      staleNow - DEFAULT_STALE_GIT_INDEX_LOCK_MS - 1_000
    );

    fs.writeFileSync(lockPath, '', 'utf8');
    fs.utimesSync(lockPath, staleMtime, staleMtime);

    assert.equal(
      removeStaleGitLock({
        error: lockError,
        fsImpl: fs,
        log: {
          warn(message) {
            logs.push(message);
          },
        },
        now: () => staleNow,
        rootDir: tempDir,
      }),
      true
    );
    assert.equal(fs.existsSync(lockPath), false);
    assert.match(logs.at(-1), /Removed stale git ref lock/);

    fs.writeFileSync(lockPath, '', 'utf8');
    const freshNow = Date.now();
    const freshMtime = new Date(freshNow - 15_000);
    fs.utimesSync(lockPath, freshMtime, freshMtime);

    assert.equal(
      removeStaleGitLock({
        error: lockError,
        fsImpl: fs,
        log: {
          warn(message) {
            logs.push(message);
          },
        },
        now: () => freshNow,
        rootDir: tempDir,
      }),
      false
    );
    assert.equal(fs.existsSync(lockPath), true);
    assert.match(logs.at(-1), /Leaving it in place/);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('fetchTrackedBranch retries once after removing a stale remote ref lock', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-fetch-lock-'));
  const refDir = path.join(tempDir, '.git', 'refs', 'remotes', 'origin');
  const lockPath = path.join(refDir, 'staging.lock');
  const calls = [];
  const logs = [];
  const staleNow = Date.now();

  try {
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(lockPath, '', 'utf8');
    const staleMtime = new Date(
      staleNow - DEFAULT_STALE_GIT_INDEX_LOCK_MS - 1_000
    );
    fs.utimesSync(lockPath, staleMtime, staleMtime);

    await fetchTrackedBranch(
      {
        branch: 'production',
        remote: 'origin',
        upstreamBranch: 'production',
        upstreamRef: 'origin/production',
      },
      {
        cwd: tempDir,
        fsImpl: fs,
        log: {
          warn(message) {
            logs.push(message);
          },
        },
        now: () => staleNow,
        runCommand: async (command, args) => {
          calls.push(`${command} ${args.join(' ')}`);

          if (calls.length === 1) {
            return createResult('', {
              code: 1,
              stderr: `error: cannot lock ref 'refs/remotes/origin/staging': Unable to create '${lockPath}': File exists.`,
            });
          }

          return createResult('');
        },
      }
    );

    assert.deepEqual(calls, [
      'git fetch origin production',
      'git fetch origin production',
    ]);
    assert.equal(fs.existsSync(lockPath), false);
    assert.match(logs.at(-1), /Removed stale git ref lock/);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
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
            'Command failed (1): docker compose -f docker-compose.web.prod.yml --profile redis up --detach --no-build --remove-orphans web-green\nservice "web-green" is unhealthy'
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

test('releaseWatchLock can preserve target metadata without a stale PID', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-lock-preserve-target-')
  );
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
        branch: 'production',
        remote: 'origin',
        upstreamBranch: 'production',
        upstreamRef: 'origin/production',
      },
      {
        fsImpl: fs,
        paths,
        processImpl,
      }
    );

    releaseWatchLock({
      fsImpl: fs,
      now: () => 1234,
      paths,
      preserveTarget: true,
      processImpl,
    });

    assert.deepEqual(readWatchLock(paths), {
      branch: 'production',
      createdAt: readWatchLock(paths).createdAt,
      releasedAt: 1234,
      remote: 'origin',
      upstreamBranch: 'production',
      upstreamRef: 'origin/production',
    });
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

test('deployment build lock supports token re-entry and guarded release', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-build-lock-'));
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
    const heldLock = acquireDeploymentBuildLock({
      command: ['bun', 'serve:web:docker:bg'],
      deploymentKind: 'manual',
      fsImpl: fs,
      latestCommit: {
        hash: 'abc123',
        shortHash: 'abc123',
        subject: 'Deploy lock test',
      },
      now: () => 1000,
      paths,
      processImpl,
    });

    assert.equal(readDeploymentBuildLock(paths, fs).ownerPid, 4321);
    const frozenNow = () => 1000;
    assert.throws(
      () =>
        acquireDeploymentBuildLock({
          command: 'another deploy',
          fsImpl: fs,
          now: frozenNow,
          paths,
          processImpl,
        }),
      DeploymentBuildLockConflictError
    );

    const reentrant = acquireDeploymentBuildLock({
      command: 'nested watcher deploy',
      env: {
        [DEPLOYMENT_BUILD_LOCK_TOKEN_ENV]: heldLock.token,
      },
      fsImpl: fs,
      now: frozenNow,
      paths,
      processImpl,
    });

    assert.equal(reentrant.reentrant, true);
    assert.equal(reentrant.release(), false);
    assert.notEqual(readDeploymentBuildLock(paths, fs), null);
    assert.equal(heldLock.release(), true);
    assert.equal(readDeploymentBuildLock(paths, fs), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('deployment build lock replaces stale owners', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-build-stale-'));
  const paths = getWatchPaths(tempDir);
  const processImpl = {
    kill() {
      const error = new Error('missing');
      error.code = 'ESRCH';
      throw error;
    },
    pid: 9999,
  };

  try {
    writeDeploymentBuildLock(
      {
        command: 'old deploy',
        lockToken: 'stale-token',
        ownerPid: 1234,
        startedAt: 100,
      },
      {
        fsImpl: fs,
        paths,
      }
    );

    const heldLock = acquireDeploymentBuildLock({
      command: 'fresh deploy',
      fsImpl: fs,
      now: () => 200,
      paths,
      processImpl,
    });

    assert.equal(heldLock.lock.ownerPid, 9999);
    assert.equal(heldLock.lock.command, 'fresh deploy');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('deployment build lock clears Linux PID reuse when cmdline does not match deploy', () => {
  if (os.platform() !== 'linux') {
    return;
  }

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'deploy-build-pidreuse-')
  );
  const paths = getWatchPaths(tempDir);
  const ownerPid = process.pid;
  const fsImpl = {
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (...args) => fs.mkdirSync(...args),
    readFileSync: (p, enc) => {
      if (String(p) === `/proc/${ownerPid}/cmdline`) {
        return Buffer.from('node\u0000/usr/bin/node\u0000', 'utf8');
      }

      return fs.readFileSync(p, enc);
    },
    rmSync: (...args) => fs.rmSync(...args),
    writeFileSync: (...args) => fs.writeFileSync(...args),
  };

  try {
    writeDeploymentBuildLock(
      {
        command: 'bun serve:web:docker:bg',
        deploymentKind: 'manual',
        lockToken: 'stale-token',
        ownerPid,
        startedAt: 100,
      },
      { fsImpl: fs, paths }
    );

    const heldLock = acquireDeploymentBuildLock({
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'manual',
      fsImpl,
      now: () => 200,
      paths,
      processImpl: process,
    });

    assert.equal(heldLock.reentrant, false);
    assert.equal(heldLock.lock.ownerPid, process.pid);
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
          activeDeployment: {
            lockToken: 'nested-secret',
            ownerPid: 9876,
          },
          error: new Error('deploy failed'),
          lockToken: 'result-secret',
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
        activeDeployment: {
          ownerPid: 9876,
        },
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

test('appendDeploymentHistory closes the prior active deployment and preserves retained history ordering', () => {
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

    assert.equal(history.length, 6);
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

test('appendDeploymentHistory consumes deployment stage handoff for watcher-managed rows', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-history-stages-')
  );
  const paths = getWatchPaths(tempDir);
  const stages = [
    {
      finishedAt: 2000,
      id: 'web-build',
      startedAt: 1000,
      status: 'succeeded',
      target: 'web',
    },
    {
      finishedAt: 3000,
      id: 'hive-migrate',
      startedAt: 2000,
      status: 'succeeded',
      target: 'hive',
    },
  ];

  try {
    assert.equal(
      writeDeploymentStagesHandoff(
        {
          commitHash: 'abc123',
          deploymentKind: 'promotion',
          stages,
          status: 'successful',
        },
        paths.deploymentStagesFile,
        fs
      ),
      true
    );
    assert.deepEqual(
      readDeploymentStagesHandoff(paths.deploymentStagesFile, fs),
      {
        commitHash: 'abc123',
        deploymentKind: 'promotion',
        stages,
        status: 'successful',
      }
    );

    const history = appendDeploymentHistory(
      {
        activeColor: 'green',
        commitHash: 'abc123',
        commitShortHash: 'abc123',
        deploymentKind: 'promotion',
        finishedAt: 3000,
        startedAt: 1000,
        status: 'successful',
      },
      { fsImpl: fs, paths }
    );

    assert.deepEqual(history[0].stages, stages);
    assert.equal(fs.existsSync(paths.deploymentStagesFile), false);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('parseProxyLogEntries keeps only access lines and collectDeploymentTraffic counts non-health requests', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-traffic-'));
  const paths = getWatchPaths(tempDir);

  try {
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
      fsImpl: fs,
      now: Date.parse('2026-04-18T11:30:00.000Z'),
      paths,
      rootDir: tempDir,
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
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('parseProxyLogEntries understands structured nginx JSON access logs', () => {
  const parsed = parseProxyLogEntries(
    '2026-04-18T11:05:00.000000000Z {"time":"2026-04-18T11:05:00+00:00","host":"platform.test","method":"GET","path":"/ops?tab=traffic","status":200,"requestTime":0.245,"upstreamAddr":"172.18.0.4:7803","deploymentStamp":"deploy-2026-04-18T11-00-00Z","deploymentColor":"green"}'
  );

  assert.deepEqual(parsed, [
    {
      deploymentColor: 'green',
      deploymentStamp: 'deploy-2026-04-18T11-00-00Z',
      host: 'platform.test',
      isInternal: false,
      method: 'GET',
      path: '/ops?tab=traffic',
      rawLine:
        '2026-04-18T11:05:00.000000000Z {"time":"2026-04-18T11:05:00+00:00","host":"platform.test","method":"GET","path":"/ops?tab=traffic","status":200,"requestTime":0.245,"upstreamAddr":"172.18.0.4:7803","deploymentStamp":"deploy-2026-04-18T11-00-00Z","deploymentColor":"green"}',
      requestTimeMs: 245,
      sourceFormat: 'json',
      status: 200,
      time: Date.parse('2026-04-18T11:05:00.000000000Z'),
      upstreamAddress: '172.18.0.4:7803',
    },
  ]);
});

test('collectDeploymentTraffic stores request-scoped route console logs', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-traffic-logs-'));
  const paths = getWatchPaths(tempDir);
  const deployments = [
    {
      activatedAt: Date.parse('2026-04-18T10:30:00.000Z'),
      activeColor: 'green',
      commitShortHash: 'bbb222',
      deploymentStamp: 'deploy-2026-04-18T10-30-00Z',
      finishedAt: Date.parse('2026-04-18T10:30:00.000Z'),
      startedAt: Date.parse('2026-04-18T10:29:30.000Z'),
      status: 'successful',
    },
  ];

  try {
    await collectDeploymentTraffic(deployments, {
      now: Date.parse('2026-04-18T11:30:00.000Z'),
      paths,
      runCommand: createRunCommandMock(
        new Map([
          [
            prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
            createResult('proxy-123\n'),
          ],
          [prodComposePsKey('web-green'), createResult('green-123\n')],
          [prodComposePsKey('web-blue'), createResult('')],
          [
            'docker logs --timestamps --since 2026-04-18T10:30:00.000Z proxy-123',
            createResult(
              '2026-04-18T11:05:00.500000000Z {"host":"platform.test","method":"GET","path":"/api/v1/finance/export","status":500,"requestTime":0.5,"deploymentStamp":"deploy-2026-04-18T10-30-00Z","deploymentColor":"green"}'
            ),
          ],
          [
            'docker logs --timestamps --since 2026-04-18T10:28:00.000Z green-123',
            createResult(
              [
                '2026-04-18T11:05:00.200000000Z Error fetching transaction export tags token=secret-token user=admin@example.com Authorization: Bearer abc.def.ghi',
                '2026-04-18T11:06:00.000000000Z unrelated later log',
              ].join('\n')
            ),
          ],
        ])
      ),
    });

    const state = JSON.parse(fs.readFileSync(paths.requestStateFile, 'utf8'));
    const chunkPath = path.join(paths.requestLogDir, state.currentChunkFile);
    const [entry] = fs
      .readFileSync(chunkPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    assert.equal(entry.path, '/api/v1/finance/export');
    assert.deepEqual(entry.consoleLogs, [
      {
        containerId: 'green-123',
        deploymentColor: 'green',
        level: 'error',
        message:
          'Error fetching transaction export tags token: [REDACTED] user=[REDACTED_EMAIL] Authorization: [REDACTED]',
        source: 'route',
        time: Date.parse('2026-04-18T11:05:00.200000000Z'),
      },
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('parseContainerConsoleLogEntries normalizes JSON and plain route logs', () => {
  assert.deepEqual(
    parseContainerConsoleLogEntries(
      [
        '2026-04-18T11:05:00.200000000Z {"level":"warn","message":"Slow route"}',
        '2026-04-18T11:05:00.250000000Z Error loading route',
      ].join('\n'),
      {
        containerId: 'green-123',
        deploymentColor: 'green',
      }
    ),
    [
      {
        containerId: 'green-123',
        deploymentColor: 'green',
        level: 'warn',
        message: 'Slow route',
        rawLine:
          '2026-04-18T11:05:00.200000000Z {"level":"warn","message":"Slow route"}',
        source: 'route',
        time: Date.parse('2026-04-18T11:05:00.200000000Z'),
      },
      {
        containerId: 'green-123',
        deploymentColor: 'green',
        level: 'error',
        message: 'Error loading route',
        rawLine: '2026-04-18T11:05:00.250000000Z Error loading route',
        source: 'route',
        time: Date.parse('2026-04-18T11:05:00.250000000Z'),
      },
    ]
  );
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
    errorCount: 0,
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

test('resolveCurrentBlueGreenStatus recovers active color from proxy config when state file is missing', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-blue-green-proxy-active-')
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
    fs.writeFileSync(
      paths.blueGreen.proxyConfigFile,
      renderBlueGreenProxyConfig('green', { standbyColor: 'blue' }),
      'utf8'
    );

    const status = await resolveCurrentBlueGreenStatus({
      envFilePath,
      fsImpl: fs,
      paths,
      rootDir: tempDir,
      runCommand: async (command, args) => {
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
            'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123' ||
          key ===
            'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} blue-123' ||
          key ===
            'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} proxy-123'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.equal(status.activeColor, 'green');
    assert.equal(status.activeServiceRunning, true);
    assert.equal(status.state, 'serving');
    assert.equal(status.standbyColor, 'blue');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('resolveCurrentBlueGreenStatus marks an unhealthy active lane as degraded', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-blue-green-unhealthy-')
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
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123'
        ) {
          return createResult('unhealthy\n');
        }

        if (
          key ===
            'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} blue-123' ||
          key ===
            'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} proxy-123'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.equal(status.activeColor, 'green');
    assert.equal(status.activeServiceRunning, false);
    assert.equal(status.proxyRunning, true);
    assert.equal(status.standbyColor, 'blue');
    assert.equal(status.state, 'degraded');
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
            'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}',
            createResult(
              [
                `proxy-123\tplatform-web-proxy-1\tnginx:1.31.0-alpine\tUp 4 minutes (healthy)\t4 minutes\t0.0.0.0:7803->7803/tcp\tweb-proxy\t${path.basename(tempDir)}`,
                `blue-123\tplatform-web-blue-1\tplatform-web\tUp 3 minutes\t3 minutes\t\tweb-blue\t${path.basename(tempDir)}`,
                `green-123\tplatform-web-green-1\tplatform-web\tUp 6 minutes (healthy)\t6 minutes\t\tweb-green\t${path.basename(tempDir)}`,
                `markitdown-123\tplatform-markitdown-1\tplatform-markitdown\tUp 2 minutes (healthy)\t2 minutes\t\tmarkitdown\t${path.basename(tempDir)}`,
                'buildkit-123\tbuildx_buildkit_platform0\tmoby/buildkit:buildx-stable-1\tUp 2 minutes\t2 minutes\t\t\t',
              ].join('\n')
            ),
          ],
          [
            'docker stats --no-stream --format {{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.Name}} proxy-123 blue-123 green-123 markitdown-123 buildkit-123',
            createResult(
              [
                'proxy-123\t0.10%\t24.0MiB / 31.1GiB\t2.00MB / 3.00MB\tplatform-web-proxy-1',
                'blue-123\t1.20%\t150MiB / 31.1GiB\t6.00MB / 4.00MB\tplatform-web-blue-1',
                'green-123\t3.40%\t420MiB / 31.1GiB\t10.0MB / 8.00MB\tplatform-web-green-1',
                'markitdown-123\t0.30%\t96MiB / 31.1GiB\t1.00MB / 1.00MB\tplatform-markitdown-1',
                'buildkit-123\t0.20%\t29MiB / 31.1GiB\t1.00KB / 0B\tbuildx_buildkit_platform0',
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
    assert.equal(snapshot.dockerResources.allContainers.length, 5);
    assert.equal(snapshot.dockerResources.serviceHealth.length, 4);
    assert.equal(
      snapshot.dockerResources.allContainers.find(
        (container) => container.name === 'buildx_buildkit_platform0'
      )?.health,
      'healthy'
    );
    assert.equal(
      snapshot.dockerResources.serviceHealth.find(
        (service) => service.serviceName === 'markitdown'
      )?.health,
      'healthy'
    );
    assert.equal(
      snapshot.dockerResources.serviceHealth.find(
        (service) => service.serviceName === 'web-blue'
      )?.health,
      'healthy'
    );
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
    const expectedRuntimeSnapshotCalls = [
      'git rev-parse --abbrev-ref HEAD',
      'git status --porcelain',
      prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
      `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`,
      'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}',
    ];
    const optionalProxyStatusCalls = [
      prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
      `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`,
    ];

    assert.deepEqual(
      calls.slice(0, expectedRuntimeSnapshotCalls.length),
      expectedRuntimeSnapshotCalls
    );
    assert.ok(
      calls.length === expectedRuntimeSnapshotCalls.length ||
        (calls.length ===
          expectedRuntimeSnapshotCalls.length +
            optionalProxyStatusCalls.length &&
          JSON.stringify(calls.slice(expectedRuntimeSnapshotCalls.length)) ===
            JSON.stringify(optionalProxyStatusCalls))
    );
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

test('runDeployWatchIteration deploys a pinned rollback without fetching upstream', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-pin-deploy-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];
  const pendingStates = [];
  const nowValues = [1000, 2000, 5000, 6000];
  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (key === 'git status --porcelain') {
      return createResult('');
    }

    if (key === 'git rev-parse HEAD') {
      return createResult('bad123456789\n');
    }

    if (key === 'git checkout --detach old123456789') {
      return createResult('');
    }

    if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
      return createResult(
        'old123456789\nold1234\nKnown good deployment\n2026-04-18T10:58:00.000Z\n'
      );
    }

    if (
      key ===
      `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
    ) {
      fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
      fs.writeFileSync(paths.blueGreen.stateFile, 'green\n', 'utf8');
      fs.writeFileSync(
        paths.blueGreen.deploymentStampFile,
        'deploy-rollback\n',
        'utf8'
      );
      return createResult('');
    }

    if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
      return createResult('');
    }

    throw new Error(`Unexpected command: ${key}`);
  };

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.controlDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.writeFileSync(
      paths.deploymentPinFile,
      JSON.stringify(
        {
          commitHash: 'old123456789',
          commitShortHash: 'old1234',
          commitSubject: 'Known good deployment',
          kind: 'deployment-pin',
          requestedAt: '2026-04-23T10:00:00.000Z',
          requestedBy: 'user-1',
          requestedByEmail: 'ops@platform.test',
        },
        null,
        2
      ),
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
        now: () => nowValues.shift() ?? 6000,
        onDeploymentStart: (state) => pendingStates.push(state),
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(result.status, 'pinned-deployed');
    assert.equal(result.deploymentPin.commitHash, 'old123456789');
    assert.equal(result.deployments[0].deploymentKind, 'rollback-pin');
    assert.equal(result.deployments[0].commitHash, 'old123456789');
    assert.equal(
      pendingStates[0].pendingDeployment.deploymentKind,
      'rollback-pin'
    );
    assert.ok(!calls.includes('git fetch origin main'));
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration returns from detached HEAD when the deployment pin is cleared', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-pin-clear-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];
  let checkedOutBranch = false;
  const runCommand = async (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);

    if (key === 'git rev-parse --abbrev-ref HEAD') {
      return createResult(checkedOutBranch ? 'main\n' : 'HEAD\n');
    }

    if (key === 'git status --porcelain') {
      return createResult('');
    }

    if (key === 'git checkout main') {
      checkedOutBranch = true;
      return createResult('');
    }

    if (key === 'git fetch origin main') {
      return createResult('');
    }

    if (key === 'git rev-parse HEAD') {
      return createResult('main123456789\n');
    }

    if (key === 'git rev-parse origin/main') {
      return createResult('main123456789\n');
    }

    if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
      return createResult(
        'main123456789\nmain123\nResume main\n2026-04-18T10:58:00.000Z\n'
      );
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
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(result.status, 'up-to-date');
    assert.ok(calls.includes('git checkout main'));
    assert.ok(calls.includes('git fetch origin main'));
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

    if (key === 'bun install --frozen-lockfile') {
      return createResult('');
    }

    if (
      key ===
      `git diff --name-only aaa111 bbb222 -- ${CONTAINER_REFRESH_WATCHED_FILES.join(' ')}`
    ) {
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-pending-ui-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const pendingStates = [];
  const projectStatusUpdates = [];
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

    if (key === 'bun install --frozen-lockfile') {
      return createResult('');
    }

    if (
      key ===
      `git diff --name-only aaa111 bbb222 -- ${CONTAINER_REFRESH_WATCHED_FILES.join(' ')}`
    ) {
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
        now: (() => {
          const values = [1000, 2000, 3000, 4000];
          return () => values.shift() ?? 4000;
        })(),
        onDeploymentStart: (state) => {
          pendingStates.push(state);
        },
        paths,
        platformProjectDeploymentStatusUpdater: async (update) => {
          projectStatusUpdates.push(update);
        },
        platformProjectReader: async () => ({
          deploymentStatus: 'queued',
          selectedBranch: 'main',
          source: 'database',
        }),
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(pendingStates.length, 1);
    assert.equal(pendingStates[0].pendingDeployment.status, 'deploying');
    assert.equal(pendingStates[0].pendingDeployment.commitShortHash, 'bbb222');
    assert.deepEqual(
      projectStatusUpdates.map((update) => update.status),
      ['building', 'deploying', 'ready']
    );
    assert.equal(projectStatusUpdates.at(-1).latestCommit.shortHash, 'bbb222');
    assert.equal(
      projectStatusUpdates.at(-1).metadata.deployedCommitHash,
      'bbb222222222222222222'
    );
    assert.equal(result.status, 'deployed');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration waits instead of retrying while a deployment build is active', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-active-deploy-lock-')
  );
  const paths = getWatchPaths(tempDir);
  const calls = [];

  try {
    writeDeploymentHistory(
      [
        {
          activatedAt: 500,
          activeColor: 'blue',
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'Previous successful deployment',
          finishedAt: 500,
          startedAt: 100,
          status: 'successful',
        },
      ],
      paths,
      fs
    );
    writeDeploymentBuildLock(
      {
        command: 'bun serve:web:docker:bg',
        commitHash: 'bbb222222222222222222',
        commitShortHash: 'bbb222',
        commitSubject: 'Current deployment',
        deploymentKind: 'promotion',
        lockToken: 'active-token',
        ownerPid: 9876,
        startedAt: 1000,
      },
      { fsImpl: fs, paths }
    );

    const result = await runDeployWatchIteration(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        env: { PATH: process.env.PATH },
        fsImpl: fs,
        log: {
          info() {},
          warn() {},
        },
        now: () => 2000,
        paths,
        processImpl: {
          kill(pid) {
            if (pid !== 9876) {
              const error = new Error('missing');
              error.code = 'ESRCH';
              throw error;
            }
          },
          pid: 4321,
        },
        rootDir: tempDir,
        runCommand: async (command, args) => {
          const key = `${command} ${args.join(' ')}`;
          calls.push(key);

          if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
            return createResult('');
          }

          if (
            key ===
            `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`
          ) {
            return createResult('');
          }

          if (
            key ===
            'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}'
          ) {
            return createResult('');
          }

          throw new Error(`Unexpected command: ${key}`);
        },
      }
    );

    assert.equal(result.status, 'deployment-active');
    assert.equal(result.activeDeployment?.ownerPid, 9876);
    assert.equal(result.activeDeployment?.lockToken, undefined);
    assert.equal(result.deployments.length, 1);
    assert.equal(readDeploymentHistory(paths, fs).length, 1);
    assert.ok(
      calls.every(
        (call) =>
          call !==
          `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration terminates a timed-out deployment build lock', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-timeout-deploy-lock-')
  );
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const signals = [];
  const startedAt = 1000;

  try {
    writeDeploymentHistory(
      [
        {
          activatedAt: 500,
          activeColor: 'blue',
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'Previous successful deployment',
          finishedAt: 500,
          startedAt: 100,
          status: 'successful',
        },
      ],
      paths,
      fs
    );
    writeDeploymentBuildLock(
      {
        command: 'bun serve:web:docker:bg',
        commitHash: 'bbb222222222222222222',
        commitShortHash: 'bbb222',
        commitSubject: 'Current deployment',
        deploymentKind: 'promotion',
        lockToken: 'timeout-token',
        ownerPid: 9876,
        startedAt,
      },
      { fsImpl: fs, paths }
    );

    const result = await runDeployWatchIteration(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        env: { PATH: process.env.PATH },
        fsImpl: fs,
        log: {
          info() {},
          warn() {},
        },
        now: () => startedAt + DEFAULT_DEPLOYMENT_BUILD_TIMEOUT_MS + 1,
        paths,
        processImpl: {
          kill(pid, signal) {
            if (pid !== 9876) {
              const error = new Error('missing');
              error.code = 'ESRCH';
              throw error;
            }

            signals.push(signal ?? 0);
          },
          pid: 4321,
        },
        rootDir: tempDir,
        runCommand: async (command, args) => {
          const key = `${command} ${args.join(' ')}`;
          calls.push(key);

          if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
            return createResult('');
          }

          if (
            key ===
            `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`
          ) {
            return createResult('');
          }

          if (
            key ===
            'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}'
          ) {
            return createResult('');
          }

          throw new Error(`Unexpected command: ${key}`);
        },
      }
    );

    const history = readDeploymentHistory(paths, fs);
    assert.equal(result.status, 'deploy-failed');
    assert.deepEqual(signals, [0, 'SIGTERM']);
    assert.equal(readDeploymentBuildLock(paths, fs), null);
    assert.equal(history[0].status, 'failed');
    assert.equal(history[0].commitShortHash, 'bbb222');
    assert.match(history[0].failureReason, /exceeded 30m/iu);
    assert.ok(
      calls.every(
        (call) =>
          call !==
          `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration clears a timed-out self-owned deployment build lock', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-timeout-self-lock-')
  );
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const signals = [];
  const startedAt = 1000;

  try {
    writeDeploymentBuildLock(
      {
        command: 'cached-recovery',
        commitHash: 'bbb222222222222222222',
        commitShortHash: 'bbb222',
        commitSubject: 'Current cached recovery',
        deploymentKind: 'cached-recovery',
        lockToken: 'self-timeout-token',
        ownerPid: 4321,
        startedAt,
      },
      { fsImpl: fs, paths }
    );

    const result = await runDeployWatchIteration(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        env: { PATH: process.env.PATH },
        fsImpl: fs,
        log: {
          info() {},
          warn() {},
        },
        now: () => startedAt + DEFAULT_DEPLOYMENT_BUILD_TIMEOUT_MS + 1,
        paths,
        processImpl: {
          kill(pid, signal) {
            signals.push({ pid, signal });
          },
          pid: 4321,
        },
        rootDir: tempDir,
        runCommand: async (command, args) => {
          const key = `${command} ${args.join(' ')}`;
          calls.push(key);

          if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
            return createResult('');
          }

          if (
            key ===
            `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`
          ) {
            return createResult('');
          }

          if (
            key ===
            'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}'
          ) {
            return createResult('');
          }

          throw new Error(`Unexpected command: ${key}`);
        },
      }
    );

    const history = readDeploymentHistory(paths, fs);
    assert.equal(result.status, 'deploy-failed');
    assert.deepEqual(signals, []);
    assert.equal(readDeploymentBuildLock(paths, fs), null);
    assert.equal(history[0].status, 'failed');
    assert.equal(history[0].deploymentKind, 'cached-recovery');
    assert.match(history[0].failureReason, /cleared self-owned lock/iu);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration blocks when bun.lock is the only dirty file', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-bun-lock-'));
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(tempDir);
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
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(result.status, 'dirty');
    assert.ok(!calls.includes('git fetch origin main'));
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('pullTrackedBranch restores bun.lock and retries when it blocks fast-forward', async () => {
  const calls = [];
  const warnings = [];
  let pullAttempts = 0;

  await pullTrackedBranch(
    {
      remote: 'origin',
      upstreamBranch: 'production',
    },
    {
      log: {
        warn(message) {
          warnings.push(message);
        },
      },
      rootDir: '/tmp/platform',
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'git pull --ff-only origin production') {
          pullAttempts += 1;

          return pullAttempts === 1
            ? createResult('', {
                code: 1,
                stderr:
                  'error: Your local changes to the following files would be overwritten by merge:\n\tbun.lock\nPlease commit your changes or stash them before you merge.\nAborting',
              })
            : createResult('Updating aaa111..bbb222\n');
        }

        if (key === 'git status --porcelain') {
          return createResult(' M bun.lock\n');
        }

        if (key === 'git checkout HEAD -- bun.lock') {
          return createResult('');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    }
  );

  assert.equal(pullAttempts, 2);
  assert.deepEqual(calls, [
    'git pull --ff-only origin production',
    'git status --porcelain',
    'git checkout HEAD -- bun.lock',
    'git pull --ff-only origin production',
  ]);
  assert.match(warnings.join('\n'), /Discarding generated bun\.lock changes/);
});

test('pullTrackedBranch keeps non-lockfile dirty paths protected', async () => {
  const calls = [];

  await assert.rejects(
    () =>
      pullTrackedBranch(
        {
          remote: 'origin',
          upstreamBranch: 'production',
        },
        {
          log: { warn() {} },
          rootDir: '/tmp/platform',
          runCommand: async (command, args) => {
            const key = `${command} ${args.join(' ')}`;
            calls.push(key);

            if (key === 'git pull --ff-only origin production') {
              return createResult('', {
                code: 1,
                stderr:
                  'error: Your local changes to the following files would be overwritten by merge:\n\tbun.lock\nPlease commit your changes or stash them before you merge.\nAborting',
              });
            }

            if (key === 'git status --porcelain') {
              return createResult(' M bun.lock\n M apps/web/page.tsx\n');
            }

            throw new Error(`Unexpected command: ${key}`);
          },
        }
      ),
    /git pull --ff-only origin production/
  );

  assert.deepEqual(calls, [
    'git pull --ff-only origin production',
    'git status --porcelain',
  ]);
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
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q hive-blue`,
        createResult('hive-blue-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q hive-realtime`,
        createResult('hive-realtime-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q meet-realtime`,
        createResult('meet-realtime-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -a -q hive-blue`,
        createResult('hive-blue-123\n'),
      ],
      [prodComposePsAllKey('hive-db-migrate'), createResult('')],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop web-blue`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop hive-blue`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f web-blue`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f hive-blue`,
        createResult(''),
      ],
      [
        'docker logs --timestamps --since 2026-04-18T10:30:00.000Z proxy-123',
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis build web-blue`,
        createResult(''),
      ],
      [prodComposeHiveDbMigrateKey(), createResult('')],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans web-blue backend markitdown storage-unzip-proxy supermemory web-cron-runner redis serverless-redis-http`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans hive-blue hive-realtime meet-realtime`,
        createResult(''),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q markitdown`,
        createResult('markitdown-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q backend`,
        createResult('backend-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q storage-unzip-proxy`,
        createResult('storage-unzip-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q supermemory`,
        createResult('supermemory-123\n'),
      ],
      [
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q web-cron-runner`,
        createResult('cron-runner-123\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} blue-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} hive-blue-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} hive-realtime-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} meet-realtime-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} backend-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} markitdown-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} pronunciation-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} storage-unzip-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} supermemory-123`,
        createResult('healthy\n'),
      ],
      [
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} cron-runner-123`,
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
      [
        `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7814/login`,
        createResult(''),
      ],
    ]);
    const runCommand = async (command, args) => {
      const key = `${command} ${args.join(' ')}`;
      calls.push(key);

      if (
        command === 'git' &&
        args[0] === 'diff' &&
        args[1] === '--name-only'
      ) {
        return createResult('apps/web/src/app/page.tsx\n');
      }

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
    assert.equal(
      result.status,
      'standby-refreshed',
      result.error instanceof Error ? result.error.message : undefined
    );
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
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans web-blue backend markitdown storage-unzip-proxy supermemory web-cron-runner redis serverless-redis-http`
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

test('runDeployWatchIteration bootstraps active and standby deployments when no active runtime exists', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-missing-active-recovery-')
  );
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const composeProjectName = path.basename(tempDir);
  const activeServiceImageName = `${composeProjectName}-web-blue`;
  const cachedImageTag = `${composeProjectName}-web-cache:bbb222`;
  const standbyServiceImageName = `${composeProjectName}-web-green`;
  const calls = [];
  const pendingStates = [];
  const latestCommitHash = 'bbb222222222222222222';
  let activeBootstrapped = false;
  let standbyBootstrapped = false;

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    writeDeploymentHistory(
      [
        {
          activatedAt: Date.parse('2026-04-18T10:00:00.000Z'),
          activeColor: 'green',
          buildDurationMs: 20_000,
          commitHash: 'bbb222222222222222222',
          commitShortHash: 'bbb222',
          commitSubject: 'Previous recovery point',
          endedAt: Date.parse('2026-04-18T10:30:00.000Z'),
          finishedAt: Date.parse('2026-04-18T10:00:00.000Z'),
          imageTag: cachedImageTag,
          startedAt: Date.parse('2026-04-18T09:59:40.000Z'),
          status: 'successful',
        },
      ],
      paths,
      fs
    );

    const runCommand = async (command, args) => {
      const key = `${command} ${args.join(' ')}`;
      calls.push(key);

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
        return createResult(`${latestCommitHash}\n`);
      }

      if (key === 'git rev-parse origin/main') {
        return createResult(`${latestCommitHash}\n`);
      }

      if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
        return createResult(
          `${latestCommitHash}\nbbb222\nRecover missing runtime\n2026-04-18T10:58:00.000Z\n`
        );
      }

      if (key === `docker image inspect ${cachedImageTag}`) {
        return createResult('');
      }

      if (
        key ===
        `docker ps -aq --filter name=^/${composeProjectName}-hive-1$ --format {{.ID}}`
      ) {
        return createResult('');
      }

      if (key === `docker tag ${cachedImageTag} ${activeServiceImageName}`) {
        activeBootstrapped = true;
        fs.writeFileSync(paths.blueGreen.stateFile, 'blue\n', 'utf8');
        fs.writeFileSync(
          paths.blueGreen.deploymentStampFile,
          'deploy-recovery\n',
          'utf8'
        );
        return createResult('');
      }

      if (key === `docker tag ${cachedImageTag} ${standbyServiceImageName}`) {
        standbyBootstrapped = true;
        fs.writeFileSync(
          paths.blueGreen.deploymentStampFile,
          'deploy-recovery\n',
          'utf8'
        );
        return createResult('');
      }

      if (
        key ===
        'docker logs --timestamps --since 2026-04-18T10:00:00.000Z proxy-123'
      ) {
        return createResult('');
      }

      if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
        return createResult('proxy-123\n');
      }

      if (key === prodComposePsKey('web-blue')) {
        return createResult(activeBootstrapped ? 'blue-123\n' : '');
      }

      if (key === prodComposePsKey('web-green')) {
        return createResult(standbyBootstrapped ? 'green-123\n' : '');
      }

      if (key === prodComposeHiveDbMigrateKey()) {
        return createResult('');
      }

      if (key === prodComposePsAllKey('hive-db-migrate')) {
        return createResult('');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans ${BLUE_GREEN_PROXY_SERVICE} web-blue hive-blue hive-realtime meet-realtime`
      ) {
        return createResult('');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans web-green hive-green`
      ) {
        return createResult('');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q ${BLUE_GREEN_PROXY_SERVICE}`
      ) {
        return createResult('proxy-123\n');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q web-blue`
      ) {
        return createResult(activeBootstrapped ? 'blue-123\n' : '');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q hive-blue`
      ) {
        return createResult(activeBootstrapped ? 'hive-blue-123\n' : '');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q hive-realtime`
      ) {
        return createResult(activeBootstrapped ? 'hive-realtime-123\n' : '');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q meet-realtime`
      ) {
        return createResult(activeBootstrapped ? 'meet-realtime-123\n' : '');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q web-green`
      ) {
        return createResult(standbyBootstrapped ? 'green-123\n' : '');
      }

      if (
        key ===
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q hive-green`
      ) {
        return createResult(standbyBootstrapped ? 'hive-green-123\n' : '');
      }

      if (
        key ===
        `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} proxy-123`
      ) {
        return createResult('healthy\n');
      }

      if (
        key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} blue-123' ||
        key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123' ||
        key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} hive-blue-123' ||
        key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} hive-green-123' ||
        key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} hive-realtime-123' ||
        key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} meet-realtime-123'
      ) {
        return createResult('healthy\n');
      }

      if (
        key ===
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -t` ||
        key ===
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -s reload` ||
        key ===
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/__platform/drain-status` ||
        key ===
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7814/login`
      ) {
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
        envFilePath,
        fsImpl: fs,
        log: { error() {}, info() {}, warn() {} },
        now: () => Date.parse('2026-04-18T11:16:00.000Z'),
        onDeploymentStart: (state) => {
          pendingStates.push(state);
        },
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(result.status, 'recovered');
    assert.equal(result.currentBlueGreen.activeColor, 'blue');
    assert.equal(result.currentBlueGreen.standbyColor, 'green');
    assert.equal(result.deployments[0].runtimeState, 'standby');
    assert.equal(result.deployments[1].runtimeState, 'active');
    assert.deepEqual(
      pendingStates.map((state) => state.pendingDeployment.deploymentKind),
      ['recovery-cache', 'standby-refresh']
    );
    assert.ok(
      calls.includes(
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans ${BLUE_GREEN_PROXY_SERVICE} web-blue hive-blue hive-realtime meet-realtime`
      )
    );
    assert.ok(
      calls.includes(
        `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans web-green hive-green`
      )
    );
    assert.equal(
      calls.some((call) => call.startsWith('bun ')),
      false
    );
    assert.equal(
      calls.some((call) => call.includes('--build')),
      false
    );
    assert.ok(
      result.deployments.filter((entry) => entry.status === 'successful')
        .length >= 2
    );
    assert.deepEqual(
      readDeploymentHistory(paths, fs)
        .filter((entry) => entry.status === 'successful')
        .slice(0, 3)
        .map((entry) => entry.commitShortHash),
      ['bbb222', 'bbb222', 'bbb222']
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration honors an instant standby sync request before the stale window', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-instant-standby-refresh-')
  );
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const pendingStates = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.mkdirSync(paths.blueGreen.runtimeDir, { recursive: true });
    fs.mkdirSync(paths.controlDir, { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.writeFileSync(paths.blueGreen.stateFile, 'green\n', 'utf8');
    fs.writeFileSync(
      paths.instantRolloutRequestFile,
      JSON.stringify(
        {
          kind: 'sync-standby',
          requestedAt: '2026-04-23T10:00:00.000Z',
          requestedBy: 'user-1',
          requestedByEmail: 'ops@platform.test',
        },
        null,
        2
      ),
      'utf8'
    );
    writeDeploymentHistory(
      [
        {
          activatedAt: Date.parse('2026-04-18T11:14:00.000Z'),
          activeColor: 'green',
          buildDurationMs: 30_000,
          commitHash: 'bbb222222222222222222',
          commitShortHash: 'bbb222',
          commitSubject: 'current',
          finishedAt: Date.parse('2026-04-18T11:14:00.000Z'),
          startedAt: Date.parse('2026-04-18T11:13:30.000Z'),
          status: 'successful',
        },
        {
          activatedAt: Date.parse('2026-04-18T10:30:00.000Z'),
          activeColor: 'blue',
          buildDurationMs: 25_000,
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'previous',
          endedAt: Date.parse('2026-04-18T11:14:00.000Z'),
          finishedAt: Date.parse('2026-04-18T10:30:00.000Z'),
          startedAt: Date.parse('2026-04-18T10:29:35.000Z'),
          status: 'successful',
        },
      ],
      paths,
      fs
    );

    const runCommand = createRunCommandMock(
      new Map([
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
        [
          prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
          createResult('proxy-123\n'),
        ],
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
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q hive-blue`,
          createResult('hive-blue-123\n'),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q hive-realtime`,
          createResult('hive-realtime-123\n'),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q meet-realtime`,
          createResult('meet-realtime-123\n'),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -a -q hive-blue`,
          createResult('hive-blue-123\n'),
        ],
        [prodComposePsAllKey('hive-db-migrate'), createResult('')],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop web-blue`,
          createResult(''),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop hive-blue`,
          createResult(''),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f web-blue`,
          createResult(''),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis rm -f hive-blue`,
          createResult(''),
        ],
        [
          'docker logs --timestamps --since 2026-04-18T10:30:00.000Z proxy-123',
          createResult(''),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis build web-blue`,
          createResult(''),
        ],
        [prodComposeHiveDbMigrateKey(), createResult('')],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans web-blue backend markitdown storage-unzip-proxy supermemory web-cron-runner redis serverless-redis-http`,
          createResult(''),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis up --detach --no-build --remove-orphans hive-blue hive-realtime meet-realtime`,
          createResult(''),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q markitdown`,
          createResult('markitdown-123\n'),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q backend`,
          createResult('backend-123\n'),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q storage-unzip-proxy`,
          createResult('storage-unzip-123\n'),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q supermemory`,
          createResult('supermemory-123\n'),
        ],
        [
          `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q web-cron-runner`,
          createResult('cron-runner-123\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} blue-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} hive-blue-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} hive-realtime-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} meet-realtime-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} backend-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} markitdown-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} pronunciation-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} storage-unzip-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} supermemory-123`,
          createResult('healthy\n'),
        ],
        [
          `docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} cron-runner-123`,
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
        [
          `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7814/login`,
          createResult(''),
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
        envFilePath,
        fsImpl: fs,
        log: { error() {}, info() {}, warn() {} },
        now: () => Date.parse('2026-04-18T11:16:00.000Z'),
        onDeploymentStart: (state) => {
          pendingStates.push(state);
        },
        paths,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(
      result.status,
      'standby-refreshed',
      result.error instanceof Error ? result.error.message : undefined
    );
    assert.equal(pendingStates.length, 1);
    assert.equal(
      pendingStates[0].pendingDeployment.deploymentKind,
      'standby-refresh'
    );
    assert.equal(fs.existsSync(paths.instantRolloutRequestFile), false);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchLoop backs off for git failures instead of exiting immediately', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-git-backoff-'));
  const paths = getWatchPaths(tempDir);
  const sleepCalls = [];
  const iterationResults = [];
  const sentinel = new Error('stop-after-first-retry');

  try {
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
            paths,
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
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }

  assert.deepEqual(sleepCalls, [DEFAULT_GIT_FAILURE_BACKOFF_MS]);
  assert.equal(iterationResults.length, 1);
  assert.equal(iterationResults[0].status, 'git-failed');
  assert.equal(iterationResults[0].gitFailureCount, 1);
  assert.equal(iterationResults[0].sleepMs, DEFAULT_GIT_FAILURE_BACKOFF_MS);
});

test('runDeployWatchLoop restarts when the project-selected platform branch changes', async () => {
  const logs = [];
  const result = await runDeployWatchLoop(
    {
      branch: 'main',
      remote: 'origin',
      upstreamBranch: 'main',
      upstreamRef: 'origin/main',
    },
    {
      log: {
        error() {},
        info(message) {
          logs.push(message);
        },
        warn() {},
      },
      now: () => 1000,
      platformProjectReader: async () => ({
        autoDeployEnabled: true,
        deploymentStatus: 'queued',
        id: 'platform',
        metadata: {},
        selectedBranch: 'production',
        source: 'database',
      }),
      runCommand: createRunCommandMock(
        new Map([
          [
            'git log -1 --format=%H%n%h%n%s%n%cI HEAD',
            createResult(
              'aaa111111111111111111\naaa111\nKeep branch current\n2026-04-18T10:58:00.000Z\n'
            ),
          ],
        ])
      ),
      sleepImpl: async () => {
        throw new Error('unexpected sleep');
      },
    }
  );

  assert.equal(result.status, 'project-target-changed');
  assert.equal(result.restartRequired, true);
  assert.equal(result.target.branch, 'production');
  assert.equal(result.target.upstreamRef, 'origin/production');
  assert.match(logs.join('\n'), /target changed from main to production/);
});

test('runPendingDeployAfterRestart refreshes the live proxy before running blue/green deploy', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-pending-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const composeProjectName = path.basename(tempDir);
  const activeServiceImageName = `${composeProjectName}-web-green`;
  const cachedImageTag = `${composeProjectName}-web-cache:bbb222`;
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

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123'
        ) {
          return createResult('healthy\n');
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

        if (key === `docker image inspect ${activeServiceImageName}`) {
          return createResult('');
        }

        if (key === `docker tag ${activeServiceImageName} ${cachedImageTag}`) {
          return createResult('');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(calls, [
      prodComposePsKey('web-green'),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} green-123',
      prodComposePsKey(BLUE_GREEN_PROXY_SERVICE),
      prodComposePsKey('web-blue'),
      `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -t`,
      `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} nginx -s reload`,
      `docker compose -f ${PROD_COMPOSE_FILE} exec -T ${BLUE_GREEN_PROXY_SERVICE} wget -q -O /dev/null http://127.0.0.1:7803/__platform/drain-status`,
      `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`,
      `docker image inspect ${activeServiceImageName}`,
      `docker tag ${activeServiceImageName} ${cachedImageTag}`,
    ]);
    assert.equal(result.refreshedProxy, true);
    assert.equal(result.activeColor, 'green');
    assert.equal(result.buildDurationMs, 3000);
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].status, 'successful');
    assert.equal(result.history[0].imageTag, cachedImageTag);
    assert.match(
      logs[0],
      /Refreshed live blue\/green proxy config before deployment/
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDeployWatchIteration stops when the locked branch changes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-branch-lock-'));
  const paths = getWatchPaths(tempDir);

  try {
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
            paths,
            runCommand: createRunCommandMock(
              new Map([
                ['git rev-parse --abbrev-ref HEAD', createResult('release\n')],
              ])
            ),
          }
        ),
      /Current branch changed from main to release/
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
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

test('runDeployWatchLoop caps long git intervals to the project queue poll interval', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-queue-sleep-'));
  const paths = getWatchPaths(tempDir);
  const sleepCalls = [];
  const iterationResults = [];
  const sentinel = new Error('stop-after-first-sleep');

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.historyFile,
      JSON.stringify([
        {
          commitHash: 'aaa111111111111111111',
          finishedAt: 1000,
          status: 'successful',
        },
      ]),
      'utf8'
    );

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
            intervalMs: 1_000_000,
            log: { error() {}, info() {}, warn() {} },
            onIterationResult: (value) => {
              iterationResults.push(value);
            },
            paths,
            projectPollIntervalMs: 60_000,
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
            sleepImpl: async (ms) => {
              sleepCalls.push(ms);
              throw sentinel;
            },
          }
        ),
      sentinel
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }

  assert.deepEqual(sleepCalls, [60_000]);
  assert.equal(iterationResults.length, 1);
  assert.equal(iterationResults[0].status, 'up-to-date');
  assert.equal(iterationResults[0].sleepMs, 60_000);
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

test('getWatchPaths honors container watcher path overrides', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-path-env-'));
  const runtimeDir = path.join(tempDir, 'runtime');
  const argsFile = path.join(tempDir, 'control', 'args.json');
  const statusFile = path.join(tempDir, 'control', 'status.json');

  try {
    const paths = getWatchPaths(tempDir, {
      PLATFORM_BLUE_GREEN_WATCH_ARGS_FILE: argsFile,
      PLATFORM_BLUE_GREEN_WATCH_RUNTIME_DIR: runtimeDir,
      PLATFORM_BLUE_GREEN_WATCH_STATUS_FILE: statusFile,
    });

    assert.equal(paths.argsFile, argsFile);
    assert.equal(paths.runtimeDir, runtimeDir);
    assert.equal(paths.statusFile, statusFile);
    assert.equal(
      paths.logFile,
      path.join(runtimeDir, 'blue-green-auto-deploy.logs.json')
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('startBlueGreenWatcherContainer writes watcher args and recreates the compose service', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-container-'));
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];
  const envs = [];
  const paths = getWatchPaths(tempDir);

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.lockFile,
      JSON.stringify({ branch: 'main', pid: 18 }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      paths.statusFile,
      JSON.stringify({ ownerPid: 18, status: 'healthy' }, null, 2),
      'utf8'
    );

    await startBlueGreenWatcherContainer(['--interval-ms', '5000'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      rootDir: tempDir,
      runCommand: async (command, args, options = {}) => {
        calls.push(`${command} ${args.join(' ')}`);
        envs.push(options.env ?? null);
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
    assert.equal(fs.existsSync(paths.lockFile), false);
    assert.equal(fs.existsSync(paths.statusFile), false);
    assert.equal(envs[1][HOST_WORKSPACE_DIR_ENV], tempDir);
    assert.equal(envs[1].COMPOSE_PROJECT_NAME, path.basename(tempDir));
    assert.equal(envs[1].SUPERMEMORY_BASE_URL, 'http://supermemory:8787');
    assert.equal(envs[1].SUPERMEMORY_ENABLED, 'true');
    assert.match(envs[1].SUPERMEMORY_API_KEY, /^[a-f0-9]{64}$/u);
    assert.match(envs[1].SUPERMEMORY_POSTGRES_PASSWORD, /^[a-f0-9]{64}$/u);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getWatcherComposeEnv injects the mirrored host workspace path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-compose-env-'));

  try {
    const composeEnv = getWatcherComposeEnv({
      baseEnv: { PATH: 'test-path' },
      rootDir: tempDir,
    });

    assert.equal(composeEnv[HOST_WORKSPACE_DIR_ENV], tempDir);
    assert.equal(composeEnv.COMPOSE_PROJECT_NAME, path.basename(tempDir));
    assert.equal(composeEnv.SUPERMEMORY_BASE_URL, 'http://supermemory:8787');
    assert.match(composeEnv.SUPERMEMORY_API_KEY, /^[a-f0-9]{64}$/u);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getWatcherComposeEnv preserves the existing host workspace path when running in a container', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-host-path-'));
  const hostWorkspaceDir = path.join(tempDir, 'home', 'sokora', 'platform');

  try {
    fs.mkdirSync(hostWorkspaceDir, { recursive: true });

    const composeEnv = getWatcherComposeEnv({
      baseEnv: {
        PATH: 'test-path',
        COMPOSE_PROJECT_NAME: 'platform',
        [HOST_WORKSPACE_DIR_ENV]: hostWorkspaceDir,
      },
      rootDir: '/workspace',
    });

    assert.equal(composeEnv[HOST_WORKSPACE_DIR_ENV], hostWorkspaceDir);
    assert.equal(composeEnv.COMPOSE_PROJECT_NAME, 'platform');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getMigrationTargetWatcherEnv stages the tuturuuu stack on non-conflicting ports', () => {
  const env = getMigrationTargetWatcherEnv({
    env: {
      COMPOSE_PROJECT_NAME: 'platform',
      PATH: 'test-path',
      [HOST_WORKSPACE_DIR_ENV]: '/workspace/platform',
    },
    rootDir: '/workspace',
  });

  assert.equal(env.DOCKER_WEB_COMPOSE_PROJECT_NAME, 'tuturuuu');
  assert.equal(env.DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT, 'platform');
  for (const [key, value] of Object.entries(MIGRATION_STAGING_PORT_ENV)) {
    assert.equal(env[key], value);
  }
});

test('getWatcherStartupComposeEnv stages host watcher startup when the legacy project still exists', async () => {
  const calls = [];
  const env = await getWatcherStartupComposeEnv({
    composeEnv: {
      COMPOSE_PROJECT_NAME: 'tuturuuu',
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
      PATH: process.env.PATH,
      [HOST_WORKSPACE_DIR_ENV]: '/workspace/platform',
    },
    runCommand: async (command, args, options = {}) => {
      calls.push({
        command: `${command} ${args.join(' ')}`,
        env: options.env ?? {},
      });
      return createResult('legacy-web-proxy\n');
    },
  });

  assert.deepEqual(calls, [
    {
      command: `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`,
      env: {
        COMPOSE_PROJECT_NAME: 'platform',
        DOCKER_WEB_COMPOSE_PROJECT_NAME: 'platform',
        PATH: process.env.PATH,
        [HOST_WORKSPACE_DIR_ENV]: '/workspace/platform',
      },
    },
  ]);
  assert.equal(env.COMPOSE_PROJECT_NAME, 'tuturuuu');
  assert.equal(env.DOCKER_WEB_COMPOSE_PROJECT_NAME, 'tuturuuu');
  assert.equal(env.DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT, 'platform');
  assert.equal(env.DOCKER_WEB_BUILDKIT_PORT, '17914');
  assert.equal(env.DOCKER_WEB_PROXY_HOST_PORT, '17803');
});

test('getWatcherStartupComposeEnv keeps canonical ports when no legacy project exists', async () => {
  const env = await getWatcherStartupComposeEnv({
    composeEnv: {
      COMPOSE_PROJECT_NAME: 'tuturuuu',
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
      PATH: process.env.PATH,
      [HOST_WORKSPACE_DIR_ENV]: '/workspace/platform',
    },
    runCommand: async () => createResult(''),
  });

  assert.equal(env.DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT, undefined);
  assert.equal(env.DOCKER_WEB_BUILDKIT_PORT, undefined);
});

test('handoffLegacyWatcherToTargetProject starts a staged target watcher and stops the legacy watcher', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-migration-'));
  const hostWorkspaceDir = path.join(tempDir, 'platform');
  const envFilePath = path.join(hostWorkspaceDir, 'apps', 'web', '.env.local');
  const calls = [];
  const envs = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    const started = await handoffLegacyWatcherToTargetProject({
      argv: ['--interval-ms', '5000'],
      env: {
        COMPOSE_PROJECT_NAME: 'platform',
        PATH: process.env.PATH,
        PLATFORM_BLUE_GREEN_WATCHER_CONTAINER: '1',
        [HOST_WORKSPACE_DIR_ENV]: hostWorkspaceDir,
      },
      envFilePath,
      fsImpl: fs,
      rootDir: '/workspace',
      runCommand: async (command, args, options = {}) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);
        envs.push(options.env ?? null);
        if (
          key === `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`
        ) {
          return createResult('legacy-web-proxy\n');
        }
        return createResult('');
      },
    });

    assert.equal(started, true);
    assert.deepEqual(calls, [
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`,
      'docker compose version',
      prodComposeWatcherUpKey(),
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop --timeout 1 ${BLUE_GREEN_WATCHER_SERVICE}`,
    ]);
    assert.equal(envs[0].COMPOSE_PROJECT_NAME, 'platform');
    assert.equal(envs[0].DOCKER_WEB_COMPOSE_PROJECT_NAME, 'platform');
    assert.equal(envs[2].COMPOSE_PROJECT_NAME, 'tuturuuu');
    assert.equal(envs[2].DOCKER_WEB_COMPOSE_PROJECT_NAME, 'tuturuuu');
    assert.equal(envs[2].DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT, 'platform');
    assert.equal(envs[2].DOCKER_WEB_PROXY_HOST_PORT, '17803');
    assert.equal(envs[3].COMPOSE_PROJECT_NAME, 'platform');
    assert.equal(envs[3].DOCKER_WEB_COMPOSE_PROJECT_NAME, 'platform');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('handoffLegacyWatcherToTargetProject detects legacy watcher containers without compose env passthrough', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-migration-'));
  const hostWorkspaceDir = path.join(tempDir, 'platform');
  const envFilePath = path.join(hostWorkspaceDir, 'apps', 'web', '.env.local');
  const calls = [];

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    const started = await handoffLegacyWatcherToTargetProject({
      argv: [],
      env: {
        PATH: process.env.PATH,
        PLATFORM_BLUE_GREEN_WATCHER_CONTAINER: '1',
        [HOST_WORKSPACE_DIR_ENV]: hostWorkspaceDir,
      },
      envFilePath,
      fsImpl: fs,
      rootDir: '/workspace',
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);
        if (
          key === `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`
        ) {
          return createResult('legacy-web-proxy\n');
        }
        return createResult('');
      },
    });

    assert.equal(started, true);
    assert.deepEqual(calls, [
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`,
      'docker compose version',
      prodComposeWatcherUpKey(),
      `docker compose -f ${PROD_COMPOSE_FILE} --profile redis stop --timeout 1 ${BLUE_GREEN_WATCHER_SERVICE}`,
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('handoffLegacyWatcherToTargetProject keeps a fully migrated unmarked target watcher running when the legacy source is absent', async () => {
  const calls = [];
  const started = await handoffLegacyWatcherToTargetProject({
    env: {
      PATH: process.env.PATH,
      PLATFORM_BLUE_GREEN_WATCHER_CONTAINER: '1',
      [HOST_WORKSPACE_DIR_ENV]: '/workspace/platform',
    },
    rootDir: '/workspace',
    runCommand: async (command, args) => {
      const key = `${command} ${args.join(' ')}`;
      calls.push(key);
      return createResult('');
    },
  });

  assert.equal(started, false);
  assert.deepEqual(calls, [
    `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`,
  ]);
});

test('handoffLegacyWatcherToTargetProject does not re-handoff a staged target watcher', async () => {
  const started = await handoffLegacyWatcherToTargetProject({
    env: {
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
      DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT: 'platform',
      PATH: process.env.PATH,
      PLATFORM_BLUE_GREEN_WATCHER_CONTAINER: '1',
      [HOST_WORKSPACE_DIR_ENV]: '/workspace/platform',
    },
    rootDir: '/workspace',
    runCommand: async () => {
      throw new Error('target watcher should not start another watcher');
    },
  });

  assert.equal(started, false);
});

test('finalizeComposeProjectMigrationIfRequested switches proxy under the deadline and removes the legacy project', async () => {
  const calls = [];
  const envs = [];
  const timestamps = [0, 1200, 1200];
  const result = await finalizeComposeProjectMigrationIfRequested({
    env: {
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
      DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT: 'platform',
      DOCKER_WEB_PROXY_HOST_PORT: '17803',
      PATH: process.env.PATH,
    },
    log: { error() {}, info() {}, warn() {} },
    now: () => timestamps.shift() ?? 1200,
    runCommand: async (command, args, options = {}) => {
      const key = `${command} ${args.join(' ')}`;
      calls.push(key);
      envs.push(options.env ?? {});

      if (
        key === `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`
      ) {
        return createResult('legacy-web-proxy\n');
      }

      if (
        [
          prodComposeProxyHealthKey(),
          prodComposeProxyStopKey(),
          prodComposeProxyUpKey(['--force-recreate']),
          prodComposeProjectDownKey(),
        ].includes(key)
      ) {
        return createResult('');
      }

      throw new Error(`Unexpected command: ${key}`);
    },
  });

  assert.deepEqual(result, {
    handoffDurationMs: 1200,
    sourceProjectName: 'platform',
    status: 'completed',
    targetProjectName: 'tuturuuu',
  });
  assert.deepEqual(calls, [
    `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`,
    prodComposeProxyHealthKey(),
    prodComposeProxyStopKey(),
    prodComposeProxyUpKey(['--force-recreate']),
    prodComposeProxyHealthKey(),
    prodComposeProjectDownKey(),
  ]);
  assert.equal(envs[1].COMPOSE_PROJECT_NAME, 'tuturuuu');
  assert.equal(envs[1].DOCKER_WEB_PROXY_HOST_PORT, '17803');
  assert.equal(envs[2].COMPOSE_PROJECT_NAME, 'platform');
  assert.equal(envs[4].COMPOSE_PROJECT_NAME, 'tuturuuu');
  assert.equal(envs[4].DOCKER_WEB_PROXY_HOST_PORT, '7803');
});

test('finalizeComposeProjectMigrationIfRequested rolls back when target proxy verification fails', async () => {
  const calls = [];
  const envs = [];
  const timestamps = [0, 10, 20];
  const result = await finalizeComposeProjectMigrationIfRequested({
    env: {
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
      DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT: 'platform',
      DOCKER_WEB_PROXY_HOST_PORT: '17803',
      PATH: process.env.PATH,
    },
    log: { error() {}, info() {}, warn() {} },
    now: () => timestamps.shift() ?? 20,
    runCommand: async (command, args, options = {}) => {
      const key = `${command} ${args.join(' ')}`;
      const env = options.env ?? {};
      calls.push(key);
      envs.push(env);

      if (
        key === `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`
      ) {
        return createResult('legacy-web-proxy\n');
      }

      if (
        key === prodComposeProxyHealthKey() &&
        env.COMPOSE_PROJECT_NAME === 'tuturuuu' &&
        env.DOCKER_WEB_PROXY_HOST_PORT === '7803'
      ) {
        return createResult('', { code: 1, stderr: 'target unhealthy' });
      }

      if (
        [
          prodComposeProxyHealthKey(),
          prodComposeProxyStopKey(),
          prodComposeProxyUpKey(['--force-recreate']),
          prodComposeProxyUpKey(),
        ].includes(key)
      ) {
        return createResult('');
      }

      throw new Error(`Unexpected command: ${key}`);
    },
  });

  assert.equal(result.status, 'rolled-back');
  assert.match(result.error, /target unhealthy/);
  assert.deepEqual(calls, [
    `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`,
    prodComposeProxyHealthKey(),
    prodComposeProxyStopKey(),
    prodComposeProxyUpKey(['--force-recreate']),
    prodComposeProxyHealthKey(),
    prodComposeProxyStopKey(),
    prodComposeProxyUpKey(),
    prodComposeProxyHealthKey(),
  ]);
  assert.equal(envs[5].COMPOSE_PROJECT_NAME, 'tuturuuu');
  assert.equal(envs[6].COMPOSE_PROJECT_NAME, 'platform');
  assert.equal(envs[7].COMPOSE_PROJECT_NAME, 'platform');
});

test('finalizeComposeProjectMigrationIfRequested rolls back when proxy handoff exceeds three seconds', async () => {
  const timestamps = [0, MIGRATION_PROXY_HANDOFF_TIMEOUT_MS + 1, 3010, 3020];
  const result = await finalizeComposeProjectMigrationIfRequested({
    env: {
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
      DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT: 'platform',
      DOCKER_WEB_PROXY_HOST_PORT: '17803',
      PATH: process.env.PATH,
    },
    log: { error() {}, info() {}, warn() {} },
    now: () => timestamps.shift() ?? 3020,
    runCommand: async (command, args) => {
      const key = `${command} ${args.join(' ')}`;

      if (
        key === `docker compose -f ${PROD_COMPOSE_FILE} --profile redis ps -q`
      ) {
        return createResult('legacy-web-proxy\n');
      }

      if (
        [
          prodComposeProxyHealthKey(),
          prodComposeProxyStopKey(),
          prodComposeProxyUpKey(['--force-recreate']),
          prodComposeProxyUpKey(),
        ].includes(key)
      ) {
        return createResult('');
      }

      throw new Error(`Unexpected command: ${key}`);
    },
  });

  assert.equal(result.status, 'rolled-back');
  assert.match(result.error, /Proxy handoff exceeded 3000ms/);
});

test('clearContainerManagedWatcherState removes persisted lock and status files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-state-clear-'));
  const paths = getWatchPaths(tempDir);

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(paths.lockFile, '{}', 'utf8');
    fs.writeFileSync(paths.statusFile, '{}', 'utf8');

    clearContainerManagedWatcherState({ fsImpl: fs, paths });

    assert.equal(fs.existsSync(paths.lockFile), false);
    assert.equal(fs.existsSync(paths.statusFile), false);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('clearContainerManagedWatcherState preserves branch target metadata', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-state-target-'));
  const paths = getWatchPaths(tempDir);

  try {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.lockFile,
      JSON.stringify(
        {
          branch: 'production',
          createdAt: 1000,
          pid: 123,
          remote: 'origin',
          upstreamBranch: 'production',
          upstreamRef: 'origin/production',
        },
        null,
        2
      ),
      'utf8'
    );
    fs.writeFileSync(paths.statusFile, '{}', 'utf8');

    clearContainerManagedWatcherState({
      fsImpl: fs,
      now: () => 2000,
      paths,
    });

    assert.deepEqual(readWatchLock(paths, fs), {
      branch: 'production',
      createdAt: 1000,
      releasedAt: 2000,
      remote: 'origin',
      upstreamBranch: 'production',
      upstreamRef: 'origin/production',
    });
    assert.equal(fs.existsSync(paths.statusFile), false);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('restoreTargetBranchIfDetached checks out the locked branch on a clean detached worktree', async () => {
  const calls = [];
  let checkedOutBranch = false;

  const restored = await restoreTargetBranchIfDetached(
    {
      branch: 'production',
      remote: 'origin',
      upstreamBranch: 'production',
      upstreamRef: 'origin/production',
    },
    {
      log: { info() {}, warn() {} },
      rootDir: '/workspace/platform',
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'git rev-parse --abbrev-ref HEAD') {
          return createResult(checkedOutBranch ? 'production\n' : 'HEAD\n');
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git checkout production') {
          checkedOutBranch = true;
          return createResult('');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    }
  );

  assert.equal(restored, true);
  assert.deepEqual(calls, [
    'git rev-parse --abbrev-ref HEAD',
    'git status --porcelain',
    'git checkout production',
  ]);
});

test('restoreTargetBranchIfDetached leaves bun.lock-dirty detached worktrees untouched', async () => {
  const calls = [];

  const restored = await restoreTargetBranchIfDetached(
    {
      branch: 'production',
      remote: 'origin',
      upstreamBranch: 'production',
      upstreamRef: 'origin/production',
    },
    {
      log: { info() {}, warn() {} },
      rootDir: '/workspace/platform',
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'git rev-parse --abbrev-ref HEAD') {
          return createResult('HEAD\n');
        }

        if (key === 'git status --porcelain') {
          return createResult(' M bun.lock\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    }
  );

  assert.equal(restored, false);
  assert.deepEqual(calls, [
    'git rev-parse --abbrev-ref HEAD',
    'git status --porcelain',
  ]);
});

test('pending deploy requests persist across restarts and can be cleared explicitly', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-pending-file-'));
  const paths = getWatchPaths(tempDir);

  try {
    writePendingDeployRequest(
      {
        commitHash: 'bbb222222222222222222',
        commitShortHash: 'bbb222',
        reason: 'process-restart',
      },
      { fsImpl: fs, paths }
    );

    assert.equal(
      hasPersistedPendingDeployRequest(
        {},
        {
          fsImpl: fs,
          paths,
        }
      ),
      true
    );
    assert.deepEqual(readPendingDeployRequest(paths, fs), {
      commitHash: 'bbb222222222222222222',
      commitShortHash: 'bbb222',
      reason: 'process-restart',
    });

    clearPendingDeployRequest({ fsImpl: fs, paths });

    assert.equal(readPendingDeployRequest(paths, fs), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('streamBlueGreenWatcherLogs follows the watcher service output', async () => {
  const calls = [];

  const result = await streamBlueGreenWatcherLogs({
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
      mkdirSync() {},
      readFileSync() {
        return '';
      },
      writeFileSync() {},
    },
    runCommand: async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      return createResult('');
    },
  });

  assert.deepEqual(result, { status: 'completed' });
  assert.deepEqual(calls, [prodComposeWatcherLogsKey()]);
});

test('streamBlueGreenWatcherLogs treats watcher self-recreate exits as reconnectable', async () => {
  const result = await streamBlueGreenWatcherLogs({
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
      mkdirSync() {},
      readFileSync() {
        return '';
      },
      writeFileSync() {},
    },
    runCommand: async () => createResult('', { code: 143 }),
  });

  assert.deepEqual(result, { status: 'recreated' });
});

test('streamBlueGreenWatcherLogs treats non-zero docker exits as reconnectable stream errors', async () => {
  const result = await streamBlueGreenWatcherLogs({
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
      mkdirSync() {},
      readFileSync() {
        return '';
      },
      writeFileSync() {},
    },
    runCommand: async () =>
      createResult('', { code: 1, stderr: 'Error: daemon overloaded' }),
  });

  assert.deepEqual(result, {
    status: 'stream-error',
    code: 1,
    detail: 'Error: daemon overloaded',
  });
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
      reconnectDelayMs: 0,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'docker compose version') {
          return createResult('');
        }

        if (key === prodComposeWatcherUpKey()) {
          return createResult('');
        }

        if (key === prodComposeWatcherLogsKey()) {
          return createResult('');
        }

        if (key === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)) {
          return createResult('watcher-123\n');
        }

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runWatcherCommand reconnects log tail after a transient docker logs failure', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-command-log-retry-')
  );
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
      reconnectDelayMs: 0,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'docker compose version') {
          return createResult('');
        }

        if (key === prodComposeWatcherUpKey()) {
          return createResult('');
        }

        if (key === prodComposeWatcherLogsKey()) {
          const logCalls = calls.filter(
            (call) => call === prodComposeWatcherLogsKey()
          ).length;
          return logCalls === 1
            ? createResult('', { code: 1, stderr: 'daemon busy' })
            : createResult('');
        }

        if (key === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)) {
          return createResult('watcher-123\n');
        }

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runWatcherCommand waits for Docker daemon recovery before recreating watcher', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-command-docker-recovery-')
  );
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
      reconnectDelayMs: 0,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'docker compose version') {
          const versionCalls = calls.filter(
            (call) => call === 'docker compose version'
          ).length;
          return versionCalls === 2
            ? createResult('', {
                code: 1,
                stderr: 'Cannot connect to the Docker daemon',
              })
            : createResult('');
        }

        if (key === 'docker info') {
          const infoCalls = calls.filter(
            (call) => call === 'docker info'
          ).length;
          return infoCalls === 1
            ? createResult('', {
                code: 1,
                stderr: 'Cannot connect to the Docker daemon',
              })
            : createResult('');
        }

        if (key === prodComposeWatcherUpKey()) {
          return createResult('');
        }

        if (key === prodComposeWatcherLogsKey()) {
          const logCalls = calls.filter(
            (call) => call === prodComposeWatcherLogsKey()
          ).length;
          return logCalls === 1
            ? createResult('', {
                code: 1,
                stderr: 'Cannot connect to the Docker daemon',
              })
            : createResult('');
        }

        if (key === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)) {
          const psCalls = calls.filter(
            (call) => call === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)
          ).length;
          return psCalls === 1
            ? createResult('', {
                code: 1,
                stderr: 'Cannot connect to the Docker daemon',
              })
            : createResult('watcher-123\n');
        }

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
      sleepImpl: async () => {},
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker compose version',
      'docker info',
      'docker info',
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getWatcherContainerState reads stopped watcher containers by compose service', async () => {
  const calls = [];
  const state = await getWatcherContainerState({
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
      mkdirSync() {},
      readFileSync() {
        return '';
      },
      writeFileSync() {},
    },
    runCommand: async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);

      if (calls.at(-1) === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)) {
        return createResult('watcher-123\n');
      }

      if (
        calls.at(-1) ===
        'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123'
      ) {
        return createResult('exited\n');
      }

      throw new Error(`Unexpected command: ${calls.at(-1)}`);
    },
  });

  assert.equal(state, 'exited');
  assert.deepEqual(calls, [
    prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
    'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
  ]);
});

test('runWatcherCommand reconnects after watcher service recreation', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-command-loop-'));
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
      reconnectDelayMs: 0,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'docker compose version') {
          return createResult('');
        }

        if (key === prodComposeWatcherUpKey()) {
          return createResult('');
        }

        if (key === prodComposeWatcherLogsKey()) {
          const logCallCount = calls.filter(
            (call) => call === prodComposeWatcherLogsKey()
          ).length;
          return logCallCount === 1
            ? createResult('', { code: 143 })
            : createResult('');
        }

        if (key === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)) {
          return createResult('watcher-123\n');
        }

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runWatcherCommand recreates the watcher when the log stream completes after container exit', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-command-exit-refresh-')
  );
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
      reconnectDelayMs: 0,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'docker compose version') {
          return createResult('');
        }

        if (key === prodComposeWatcherUpKey()) {
          return createResult('');
        }

        if (key === prodComposeWatcherLogsKey()) {
          return createResult('');
        }

        if (key === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)) {
          const stateChecks = calls.filter(
            (call) => call === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)
          ).length;
          return createResult(
            stateChecks === 1 ? 'watcher-123\n' : 'watcher-456\n'
          );
        }

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123'
        ) {
          return createResult('exited\n');
        }

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-456'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-456',
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runWatcherCommand force-recreates when watcher logs request host-supervised refresh', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-command-refresh-request-')
  );
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
      reconnectDelayMs: 0,
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === 'docker compose version') {
          return createResult('');
        }

        if (key === prodComposeWatcherUpKey()) {
          return createResult('');
        }

        if (key === prodComposeWatcherLogsKey()) {
          const logCallCount = calls.filter(
            (call) => call === prodComposeWatcherLogsKey()
          ).length;
          return logCallCount === 1
            ? createResult(
                'Critical watcher container files changed. Requesting host-supervised watcher service recreation.\nWatcher requested a host-supervised container refresh. Stopping wrapper.\n'
              )
            : createResult('');
        }

        if (key === prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE)) {
          return createResult('watcher-123\n');
        }

        if (
          key ===
          'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123'
        ) {
          return createResult('healthy\n');
        }

        throw new Error(`Unexpected command: ${key}`);
      },
    });

    assert.deepEqual(calls, [
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      'docker compose version',
      prodComposeWatcherUpKey(),
      prodComposeWatcherLogsKey(),
      prodComposePsAllKey(BLUE_GREEN_WATCHER_SERVICE),
      'docker inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} watcher-123',
    ]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getLatestSuccessfulDeploymentCommitHash returns the newest successful commit', () => {
  assert.equal(
    getLatestSuccessfulDeploymentCommitHash([
      {
        commitHash: null,
        status: 'deploying',
      },
      {
        commitHash: 'bbb222222222222222222',
        status: 'successful',
      },
      {
        commitHash: 'aaa111111111111111111',
        status: 'successful',
      },
    ]),
    'bbb222222222222222222'
  );
});

test('getFailedDeploymentCountForCommit counts failed attempts per commit', () => {
  assert.equal(
    getFailedDeploymentCountForCommit(
      [
        { commitHash: 'bbb222', status: 'failed' },
        { commitHash: 'bbb222', status: 'failed' },
        { commitHash: 'bbb222', status: 'successful' },
        { commitHash: 'aaa111', status: 'failed' },
      ],
      'bbb222'
    ),
    2
  );
});

test('runDeployWatchIteration stops retrying a commit after three failed deployments', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-retry-cap-'));
  const paths = getWatchPaths(tempDir);
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];
  const warnings = [];
  const latestCommitHash = 'bbb222222222222222222';

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    writeDeploymentHistory(
      [
        {
          commitHash: latestCommitHash,
          commitShortHash: 'bbb222',
          commitSubject: 'Broken deployment',
          finishedAt: 300,
          startedAt: 200,
          status: 'failed',
        },
        {
          commitHash: latestCommitHash,
          commitShortHash: 'bbb222',
          commitSubject: 'Broken deployment',
          finishedAt: 200,
          startedAt: 100,
          status: 'failed',
        },
        {
          commitHash: latestCommitHash,
          commitShortHash: 'bbb222',
          commitSubject: 'Broken deployment',
          finishedAt: 100,
          startedAt: 0,
          status: 'failed',
        },
        {
          activatedAt: 50,
          activeColor: 'green',
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'Previous successful deployment',
          finishedAt: 50,
          startedAt: 0,
          status: 'successful',
        },
      ],
      paths,
      fs
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
        log: {
          error() {},
          info() {},
          warn(message) {
            warnings.push(message);
          },
        },
        paths,
        rootDir: tempDir,
        runCommand: async (command, args) => {
          const key = `${command} ${args.join(' ')}`;
          calls.push(key);

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
            return createResult(`${latestCommitHash}\n`);
          }

          if (key === 'git rev-parse origin/main') {
            return createResult(`${latestCommitHash}\n`);
          }

          if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
            return createResult(
              `${latestCommitHash}\nbbb222\nBroken deployment\n2026-04-18T10:59:00.000Z\n`
            );
          }

          if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
            return createResult('');
          }

          if (
            key ===
            `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`
          ) {
            return createResult('');
          }

          if (
            key ===
            'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}'
          ) {
            return createResult('');
          }

          throw new Error(`Unexpected command: ${key}`);
        },
      }
    );

    assert.equal(result.status, 'retry-limited');
    assert.equal(
      result.failedDeploymentCount,
      MAX_FAILED_DEPLOYMENTS_PER_COMMIT
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /already failed 3 deployment attempts/);
    assert.ok(!calls.includes('bun install --frozen-lockfile'));
    assert.ok(
      !calls.includes(
        `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
      )
    );

    writeWatchStatus(
      {
        lastResult: result,
      },
      {
        fsImpl: fs,
        paths,
        processImpl: { pid: 4321 },
      }
    );

    const secondResult = await runDeployWatchIteration(
      {
        branch: 'main',
        remote: 'origin',
        upstreamBranch: 'main',
        upstreamRef: 'origin/main',
      },
      {
        envFilePath,
        fsImpl: fs,
        log: {
          error() {},
          info() {},
          warn(message) {
            warnings.push(message);
          },
        },
        paths,
        rootDir: tempDir,
        runCommand: async (command, args) => {
          const key = `${command} ${args.join(' ')}`;
          calls.push(key);

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
            return createResult(`${latestCommitHash}\n`);
          }

          if (key === 'git rev-parse origin/main') {
            return createResult(`${latestCommitHash}\n`);
          }

          if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
            return createResult(
              `${latestCommitHash}\nbbb222\nBroken deployment\n2026-04-18T10:59:00.000Z\n`
            );
          }

          if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
            return createResult('');
          }

          if (
            key ===
            `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`
          ) {
            return createResult('');
          }

          if (
            key ===
            'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}'
          ) {
            return createResult('');
          }

          throw new Error(`Unexpected command: ${key}`);
        },
      }
    );

    assert.equal(secondResult.status, 'retry-limited');
    assert.equal(warnings.length, 1);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('main keeps watching after recovered pending deployment failure and caps retries', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-pending-failure-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const uiState = {};
  const latestCommitHash = 'bbb222222222222222222';
  const deployKey = `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`;

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    writeDeploymentHistory(
      [
        {
          commitHash: latestCommitHash,
          commitShortHash: 'bbb222',
          commitSubject: 'Broken deployment',
          finishedAt: 300,
          startedAt: 200,
          status: 'failed',
        },
        {
          commitHash: latestCommitHash,
          commitShortHash: 'bbb222',
          commitSubject: 'Broken deployment',
          finishedAt: 200,
          startedAt: 100,
          status: 'failed',
        },
        {
          activatedAt: 50,
          activeColor: 'green',
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'Previous successful deployment',
          finishedAt: 50,
          startedAt: 0,
          status: 'successful',
        },
      ],
      paths,
      fs
    );
    writePendingDeployRequest(
      {
        commitHash: latestCommitHash,
        commitShortHash: 'bbb222',
        reason: 'process-restart',
      },
      { fsImpl: fs, paths }
    );

    await main(['--once'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      now: (() => {
        const values = [1000, 2000, 3000, 4000, 5000, 6000];
        return () => values.shift() ?? 6000;
      })(),
      processImpl: {
        argv: ['node', 'scripts/watch-blue-green-deploy.js'],
        exit() {
          throw new Error('main should not exit after deploy failure');
        },
        on() {},
        pid: 4321,
      },
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
          return createResult('');
        }

        if (
          key ===
          `docker ps --filter label=com.docker.compose.project=${path.basename(tempDir)} --filter label=com.docker.compose.service=${BLUE_GREEN_PROXY_SERVICE} --format {{.ID}}`
        ) {
          return createResult('');
        }

        if (
          key ===
          'docker ps --format {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}'
        ) {
          return createResult('');
        }

        if (key === 'git rev-parse --abbrev-ref HEAD') {
          return createResult('main\n');
        }

        if (key === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') {
          return createResult('origin/main\n');
        }

        if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
          return createResult(
            `${latestCommitHash}\nbbb222\nBroken deployment\n2026-04-18T10:59:00.000Z\n`
          );
        }

        if (key === deployKey) {
          return createResult('', { code: 1, stderr: 'build failed' });
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git fetch origin main') {
          return createResult('');
        }

        if (key === 'git rev-parse HEAD') {
          return createResult(`${latestCommitHash}\n`);
        }

        if (key === 'git rev-parse origin/main') {
          return createResult(`${latestCommitHash}\n`);
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

    const history = readDeploymentHistory(paths, fs);

    assert.equal(readPendingDeployRequest(paths, fs), null);
    assert.equal(uiState.lastResult.status, 'retry-limited');
    assert.equal(
      getFailedDeploymentCountForCommit(history, latestCommitHash),
      MAX_FAILED_DEPLOYMENTS_PER_COMMIT
    );
    assert.equal(calls.filter((key) => key === deployKey).length, 1);
    assert.ok(!calls.includes('bun install --frozen-lockfile'));
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('main deploys the latest fetched revision after recovery when the last successful build is stale', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-pending-deploy-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const uiState = {};

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
          activatedAt: 500,
          activeColor: 'green',
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'Old deployed revision',
          finishedAt: 500,
          startedAt: 100,
          status: 'successful',
        },
      ],
      paths,
      fs
    );
    writePendingDeployRequest(
      {
        commitHash: 'bbb222222222222222222',
        commitShortHash: 'bbb222',
        reason: 'process-restart',
      },
      { fsImpl: fs, paths }
    );

    await main(['--once'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      now: (() => {
        const values = [1000, 2000, 5000, 6000];
        return () => values.shift() ?? 6000;
      })(),
      processImpl: {
        argv: ['node', 'scripts/watch-blue-green-deploy.js'],
        exit() {},
        on() {},
        pid: 4321,
      },
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
          return createResult('proxy-123\n');
        }

        if (key === prodComposePsKey('web-green')) {
          return createResult('green-123\n');
        }

        if (key === prodComposePsKey('web-blue')) {
          return createResult('');
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

        if (key === 'git rev-parse --abbrev-ref HEAD') {
          return createResult('main\n');
        }

        if (key === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') {
          return createResult('origin/main\n');
        }

        if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
          return createResult(
            'bbb222222222222222222\nbbb222\nRefresh watcher UX and restart logic\n2026-04-18T10:59:00.000Z\n'
          );
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git fetch origin main') {
          return createResult('');
        }

        if (key === 'git rev-parse HEAD') {
          return createResult('bbb222\n');
        }

        if (key === 'git rev-parse origin/main') {
          return createResult('bbb222\n');
        }

        if (
          key ===
          `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
        ) {
          return createResult('');
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

    assert.ok(
      calls.includes(
        `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
      )
    );
    assert.equal(readPendingDeployRequest(paths, fs), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('main skips recovery deploys when the latest successful build already matches HEAD', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-pending-skip-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const uiState = {};

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    writeDeploymentHistory(
      [
        {
          activatedAt: 500,
          activeColor: 'green',
          commitHash: 'bbb222222222222222222',
          commitShortHash: 'bbb222',
          commitSubject: 'Latest deployed revision',
          finishedAt: 500,
          startedAt: 100,
          status: 'successful',
        },
      ],
      paths,
      fs
    );
    writePendingDeployRequest(
      {
        commitHash: 'bbb222222222222222222',
        commitShortHash: 'bbb222',
        reason: 'process-restart',
      },
      { fsImpl: fs, paths }
    );
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    await main(['--once'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      processImpl: {
        argv: ['node', 'scripts/watch-blue-green-deploy.js'],
        exit() {},
        on() {},
        pid: 4321,
      },
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

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
          return createResult(
            'bbb222222222222222222\nbbb222\nRefresh watcher UX and restart logic\n2026-04-18T10:59:00.000Z\n'
          );
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git fetch origin main') {
          return createResult('');
        }

        if (key === 'git rev-parse HEAD') {
          return createResult('bbb222\n');
        }

        if (key === 'git rev-parse origin/main') {
          return createResult('bbb222\n');
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

    assert.equal(
      calls.includes(
        `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
      ),
      false
    );
    assert.equal(readPendingDeployRequest(paths, fs), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('main checks out production when startup is detached and no target lock remains', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-detached-no-lock-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const uiState = {};
  let checkedOutBranch = false;

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    await main(['--once'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      processImpl: {
        argv: ['node', 'scripts/watch-blue-green-deploy.js'],
        exit() {},
        on() {},
        pid: 4321,
      },
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
          return createResult('');
        }

        if (key === 'git rev-parse --abbrev-ref HEAD') {
          return createResult(checkedOutBranch ? 'production\n' : 'HEAD\n');
        }

        if (key === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') {
          return createResult('', {
            code: 1,
            stderr: 'fatal: HEAD has no upstream configured\n',
          });
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git checkout production') {
          checkedOutBranch = true;
          return createResult('');
        }

        if (key === 'git fetch origin production') {
          return createResult('');
        }

        if (key === 'git rev-parse HEAD') {
          return createResult('bbb222222222222222222\n');
        }

        if (key === 'git rev-parse origin/production') {
          return createResult('bbb222222222222222222\n');
        }

        if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
          return createResult(
            'bbb222222222222222222\nbbb222\nRecover production\n2026-05-12T15:23:00.000Z\n'
          );
        }

        throw new Error(`Unexpected command: ${key}`);
      },
      ui: {
        close() {},
        error(message) {
          throw new Error(message);
        },
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

    assert.ok(calls.includes('git checkout production'));
    assert.ok(calls.includes('git fetch origin production'));
    assert.equal(readWatchLock(paths), null);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('main recovers the locked branch from target metadata when the checkout is detached', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-detached-lock-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const uiState = {};
  let checkedOutBranch = false;

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(
      paths.lockFile,
      JSON.stringify(
        {
          branch: 'production',
          releasedAt: 1000,
          remote: 'origin',
          upstreamBranch: 'production',
          upstreamRef: 'origin/production',
        },
        null,
        2
      ),
      'utf8'
    );

    await main(['--once'], {
      env: {
        PATH: process.env.PATH,
        [WATCHER_CONTAINER_ENV]: '1',
      },
      envFilePath,
      fsImpl: fs,
      now: () => 2000,
      processImpl: {
        argv: ['node', 'scripts/watch-blue-green-deploy.js'],
        exit() {},
        on() {},
        pid: 4321,
      },
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

        if (key === prodComposePsKey(BLUE_GREEN_PROXY_SERVICE)) {
          return createResult('');
        }

        if (key === 'git rev-parse --abbrev-ref HEAD') {
          return createResult(checkedOutBranch ? 'production\n' : 'HEAD\n');
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git checkout production') {
          checkedOutBranch = true;
          return createResult('');
        }

        if (key === 'git fetch origin production') {
          return createResult('');
        }

        if (key === 'git rev-parse HEAD') {
          return createResult('bbb222222222222222222\n');
        }

        if (key === 'git rev-parse origin/production') {
          return createResult('bbb222222222222222222\n');
        }

        if (key === 'git log -1 --format=%H%n%h%n%s%n%cI HEAD') {
          return createResult(
            'bbb222222222222222222\nbbb222\nStay on production\n2026-05-12T15:22:00.000Z\n'
          );
        }

        throw new Error(`Unexpected command: ${key}`);
      },
      ui: {
        close() {},
        error(message) {
          throw new Error(message);
        },
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

    assert.ok(calls.includes('git checkout production'));
    assert.ok(calls.includes('git fetch origin production'));
    assert.equal(
      calls.includes('git rev-parse --abbrev-ref --symbolic-full-name @{u}'),
      false
    );
    assert.deepEqual(readWatchLock(paths), {
      branch: 'production',
      createdAt: readWatchLock(paths).createdAt,
      releasedAt: 2000,
      remote: 'origin',
      upstreamBranch: 'production',
      upstreamRef: 'origin/production',
    });
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('main reconciles HEAD when git is current but the latest successful deployment is stale', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-reconcile-head-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(tempDir);
  const calls = [];
  const uiState = {};

  try {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    writeDeploymentHistory(
      [
        {
          activatedAt: 500,
          activeColor: 'blue',
          commitHash: 'aaa111111111111111111',
          commitShortHash: 'aaa111',
          commitSubject: 'Older deployed revision',
          finishedAt: 500,
          startedAt: 100,
          status: 'successful',
        },
      ],
      paths,
      fs
    );
    fs.writeFileSync(
      envFilePath,
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n',
      'utf8'
    );

    await main(['--once'], {
      env: { PATH: process.env.PATH },
      envFilePath,
      fsImpl: fs,
      processImpl: {
        argv: ['node', 'scripts/watch-blue-green-deploy.js'],
        exit() {},
        on() {},
        pid: 4321,
      },
      rootDir: tempDir,
      runCommand: async (command, args) => {
        const key = `${command} ${args.join(' ')}`;
        calls.push(key);

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
          return createResult(
            'bbb222222222222222222\nbbb222\nReconcile runtime with latest head\n2026-04-18T10:59:00.000Z\n'
          );
        }

        if (key === 'git status --porcelain') {
          return createResult('');
        }

        if (key === 'git fetch origin main') {
          return createResult('');
        }

        if (key === 'git rev-parse HEAD') {
          return createResult('bbb222\n');
        }

        if (key === 'git rev-parse origin/main') {
          return createResult('bbb222\n');
        }

        if (key === 'bun install --frozen-lockfile') {
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

    assert.ok(
      calls.includes(
        `${DEFAULT_DEPLOY_COMMAND[0]} ${DEFAULT_DEPLOY_COMMAND.slice(1).join(' ')}`
      )
    );
    assert.ok(calls.includes('bun install --frozen-lockfile'));
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

        if (key === 'bun install --frozen-lockfile') {
          return createResult('');
        }

        if (
          key ===
          `git diff --name-only aaa111 bbb222 -- ${CONTAINER_REFRESH_WATCHED_FILES.join(' ')}`
        ) {
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

        if (key === 'bun install --frozen-lockfile') {
          return createResult('');
        }

        if (
          key ===
          `git diff --name-only aaa111 bbb222 -- ${CONTAINER_REFRESH_WATCHED_FILES.join(' ')}`
        ) {
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

test('main exits with the container refresh code when critical watcher runtime files change inside the watcher container', async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'watch-main-container-refresh-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const calls = [];
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
        calls.push(key);

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
                'bbb222222222222222222\nbbb222\nRefresh watcher image runtime\n2026-04-18T10:59:00.000Z\n'
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

        if (key === 'bun install --frozen-lockfile') {
          return createResult('');
        }

        if (
          key ===
          `git diff --name-only aaa111 bbb222 -- ${CONTAINER_REFRESH_WATCHED_FILES.join(' ')}`
        ) {
          return createResult(`${CONTAINER_REFRESH_WATCHED_FILES[0]}\n`);
        }

        if (
          key ===
          `git diff --name-only aaa111 bbb222 -- ${SELF_WATCHED_FILES.join(' ')}`
        ) {
          return createResult('');
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

    assert.deepEqual(exits, [CONTAINER_REFRESH_EXIT_CODE]);
    assert.equal(calls.includes('docker compose version'), false);
    assert.equal(calls.includes(prodComposeWatcherUpKey()), false);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
