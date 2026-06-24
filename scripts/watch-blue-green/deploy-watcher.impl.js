#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  assertBlueGreenCachedImageExists,
  getBlueGreenCacheImageTag,
  getBlueGreenServiceName,
  readBlueGreenActiveColor,
  readBlueGreenDeploymentStamp,
  refreshBlueGreenProxyIfRunning,
  runBlueGreenCachedRecoveryWorkflow,
  runBlueGreenStandbyRefreshWorkflow,
  tagBlueGreenServiceImageForCache,
} = require('../docker-web/blue-green.js');
const {
  DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME,
  DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV,
  ensureProductionRedisToken,
  ensureProductionSupabaseOrigin,
  ensureWebEnvFile,
  getComposeEnvironment,
  getDockerWebComposeProjectName,
  LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
  WEB_ENV_FILE,
} = require('../docker-web/env.js');
const {
  getComposeServiceContainerId,
  getComposeCommandArgs,
  getComposeFile,
  getContainerHealthStatus,
  runChecked,
  runCommand,
} = require('../docker-web/compose.js');
const deployWatcherRuntime = require('./deploy-watcher-runtime.js');
const {
  BLUE_GREEN_PROXY_SERVICE,
  PROD_COMPOSE_FILE,
  getWatcherComposeEnv,
  loadRuntimeSnapshot,
} = deployWatcherRuntime;
const {
  ROOT_DIR,
  WATCH_ARGS_FILE,
  WATCH_HISTORY_FILE,
  WATCH_LOCK_FILE,
  WATCH_LOG_FILE,
  WATCH_PENDING_DEPLOY_FILE,
  WATCH_RUNTIME_DIR,
  WATCH_STATUS_FILE,
  getWatchPaths,
} = require('./paths.js');
const {
  DEPLOYMENT_KIND_ENV,
  DEPLOYMENT_STAGES_FILE_ENV,
  MAX_DEPLOYMENTS,
  SKIP_WATCH_HISTORY_ENV,
  appendDeploymentHistory,
  clearDeploymentStagesHandoff,
  createPendingDeploymentEntry,
  getLatestDeploymentSummary,
  prependPendingDeployment,
  readDeploymentHistory,
  writeDeploymentHistory,
} = require('./history.js');
const {
  parseContainerConsoleLogEntries,
  parseProxyLogEntries,
  summarizeRequestRate,
} = require('./telemetry.js');
const {
  appendWatcherLogEntry,
  createWatcherLogEntry,
  readWatcherLogEntries,
} = require('./logs.js');
const { createGitHubChecksPublisher } = require('./github-checks.js');
const { sendBuildFailureIncidentEmail } = require('./incident-email.js');
const {
  DEFAULT_PROJECT_POLL_INTERVAL_MS,
  normalizeProjectBranch,
  processManagedInfrastructureProjects,
  readPlatformProject,
  resolvePlatformProjectTarget,
  updatePlatformProjectDeploymentStatus,
} = require('./projects.js');
const {
  clearDeploymentRevertRequest,
  clearInstantRolloutRequest,
  readDeploymentRevertRequest,
  readDeploymentPin,
  readInstantRolloutRequest,
  writeDeploymentPin,
} = require('./control.js');
const { cancelActiveBlueGreenBuild } = require('./active-build-cancel.js');
const {
  DEFAULT_DEPLOYMENT_BUILD_TIMEOUT_MS,
  DEPLOYMENT_BUILD_LOCK_TOKEN_ENV,
  DeploymentBuildLockConflictError,
  acquireDeploymentBuildLock,
  describeActiveDeploymentConflict,
  getActiveDeploymentConflict,
  getDeploymentBuildTimeoutMs,
  readDeploymentBuildLock,
  tryTerminateTimedOutDeploymentBuildLock,
} = require('./build-lock.js');
const {
  DEFAULT_GIT_FAILURE_BACKOFF_MS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_STALE_GIT_INDEX_LOCK_MS,
  DISPLAY_DEPLOYMENTS,
  MAX_EVENTS,
  MAX_GIT_FAILURE_BACKOFF_MS,
} = require('./watcher-constants.js');
const {
  buildDashboardView,
  createWatchUi,
  formatClockTime,
  formatCountdown,
  formatDuration,
  formatRelativeTime,
  formatRequestsPerMinute,
  stripAnsi,
  summarizeBlueGreenRuntime,
  summarizeResult,
} = require('./dashboard.js');
const {
  checkoutBranch,
  checkoutRevision,
  fetchTrackedBranch,
  forceSyncWatcherWorktree,
  getCommitMetadata,
  getCurrentBranch,
  getCurrentBranchName,
  getGitFailureBackoffMs,
  getRevision,
  getTrackedUpstream,
  gitStdout,
  hasDirtyWorktree,
  hasWatchedScriptChanges,
  isAncestor,
  isGitIndexLockError,
  isGitLockError,
  isRecoverableGitCommandError,
  isWatcherWorktreeResetDisabled,
  listChangedFilesBetweenRevisions,
  listDirtyWorktreePaths,
  parseUpstreamRef,
  pullTrackedBranch,
  removeUntrackedWorktreeFiles,
  removeStaleGitLock,
  removeStaleGitIndexLock,
  resetTrackedWorktreeChanges,
  resolveLockedBranchTarget,
} = require('./deploy-watcher-git.js');
const {
  acquireWatchLock,
  clearWatchStatus,
  isProcessAlive,
  readWatchLock,
  readWatchStatus,
  releaseWatchLock,
  writeWatchStatus,
} = require('./deploy-watcher-lock-status.js');
const {
  CONTAINER_REFRESH_WATCHED_FILES,
  SELF_WATCHED_FILES,
} = require('./deploy-watcher-watched-paths.js');
const DEFAULT_DEPLOY_COMMAND = ['bun', 'serve:web:docker:bg'];
const DEFAULT_STANDBY_REFRESH_AFTER_MS = 15 * 60_000;
const DEFAULT_LOCK_CONFLICT_ACTION = 'fail';
const DEFAULT_REPLACE_WATCHER_TIMEOUT_MS = 5_000;
const CONTAINER_SELF_RESTART_EXIT_CODE = 75;
const CONTAINER_REFRESH_EXIT_CODE = 76;
const MAX_FAILED_DEPLOYMENTS_PER_COMMIT = 3;
const MAX_RECOVERY_CACHE_IMAGES = 5;

function normalizeGitHubChecksPublisher(publisher) {
  if (!publisher) {
    return null;
  }

  if (typeof publisher === 'function') {
    return {
      publish: publisher,
    };
  }

  return typeof publisher.publish === 'function' ? publisher : null;
}

function publishGitHubChecksFromWatcherState(publisher, state, log = console) {
  if (!publisher) {
    return;
  }

  try {
    const result = publisher.publish(state);

    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        log.warn?.(
          `Unable to publish Tuturuuu CI GitHub Check Run: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
  } catch (error) {
    log.warn?.(
      `Unable to publish Tuturuuu CI GitHub Check Run: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function wrapWatchUiStateChange(ui, onStateChange) {
  if (!ui || typeof onStateChange !== 'function') {
    return ui;
  }

  const originalClose =
    typeof ui.close === 'function' ? ui.close.bind(ui) : null;
  const originalStart =
    typeof ui.start === 'function' ? ui.start.bind(ui) : null;
  const originalUpdate =
    typeof ui.update === 'function' ? ui.update.bind(ui) : null;

  return {
    ...ui,
    close() {
      originalClose?.();
      onStateChange(ui.state);
    },
    start() {
      originalStart?.();
      onStateChange(ui.state);
    },
    update(patch) {
      if (originalUpdate) {
        originalUpdate(patch);
      } else if (ui.state && patch && typeof patch === 'object') {
        Object.assign(ui.state, patch);
      }

      onStateChange(ui.state);
    },
  };
}

const DOCKER_DAEMON_RECOVERY_POLL_MS_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_RECOVERY_POLL_MS';
const DOCKER_DAEMON_RECOVERY_TIMEOUT_MS_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_RECOVERY_TIMEOUT_MS';
const DOCKER_DAEMON_RESTART_AFTER_MS_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_RESTART_AFTER_MS';
const DOCKER_DAEMON_RESTART_COMMAND_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_RESTART_COMMAND';
const DOCKER_DAEMON_RESTART_COOLDOWN_MS_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_RESTART_COOLDOWN_MS';
const DOCKER_DAEMON_RESTART_DISABLED_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_RESTART_DISABLED';
const DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_POST_RESTART_COMMANDS';
const DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS_ENV =
  'DOCKER_WEB_WATCHER_DOCKER_POST_RESTART_COMMAND_TIMEOUT_MS';
const DOCKER_DAEMON_RECOVERY_SETTINGS_FILE =
  'blue-green-docker-recovery-settings.json';
const DEFAULT_DOCKER_DAEMON_RECOVERY_POLL_MS = 5_000;
const DEFAULT_DOCKER_DAEMON_RECOVERY_TIMEOUT_MS = 0;
const DEFAULT_DOCKER_DAEMON_RESTART_AFTER_MS = 30_000;
const DEFAULT_DOCKER_DAEMON_RESTART_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS = 10 * 60_000;
const BLUE_GREEN_WATCHER_SERVICE = 'web-blue-green-watcher';
const HOST_WORKSPACE_DIR_ENV = 'PLATFORM_HOST_WORKSPACE_DIR';
const WATCH_PENDING_DEPLOY_ENV = 'WATCHER_PENDING_BLUE_GREEN_DEPLOY';
const WATCHER_CONTAINER_ENV = 'PLATFORM_BLUE_GREEN_WATCHER_CONTAINER';
const WATCHER_CONTAINER_REFRESH_MESSAGE =
  'host-supervised watcher service recreation';
const MIGRATION_PROXY_HANDOFF_TIMEOUT_MS = 3_000;
const MIGRATION_STAGING_PORT_ENV = {
  DOCKER_WEB_BUILDKIT_PORT: '17914',
  DOCKER_WEB_DIRECT_HOST_PORT: '17804',
  DOCKER_WEB_PROXY_HOST_PORT: '17803',
  DOCKER_WEB_REDIS_HOST_PORT: '16379',
  DOCKER_WEB_SERVERLESS_REDIS_HTTP_HOST_PORT: '18079',
};
const MIGRATION_CANONICAL_PORT_ENV = {
  DOCKER_WEB_BUILDKIT_PORT: '7914',
  DOCKER_WEB_DIRECT_HOST_PORT: '7803',
  DOCKER_WEB_PROXY_HOST_PORT: '7803',
  DOCKER_WEB_REDIS_HOST_PORT: '6379',
  DOCKER_WEB_SERVERLESS_REDIS_HTTP_HOST_PORT: '8079',
};

function parseArgs(argv) {
  const args = [...argv];
  let intervalMs = DEFAULT_INTERVAL_MS;
  let lockConflictAction = DEFAULT_LOCK_CONFLICT_ACTION;
  let once = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--interval-ms') {
      const value = Number(args[index + 1]);

      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Expected --interval-ms to be a positive number.');
      }

      intervalMs = value;
      index += 1;
      continue;
    }

    if (arg === '--once') {
      once = true;
      continue;
    }

    if (arg === '--resume-if-running') {
      lockConflictAction = 'resume';
      continue;
    }

    if (arg === '--replace-existing') {
      lockConflictAction = 'replace';
      continue;
    }

    if (arg === '--if-locked') {
      const value = args[index + 1];

      if (!['fail', 'resume', 'replace'].includes(value)) {
        throw new Error(
          'Expected --if-locked to be one of: fail, resume, replace.'
        );
      }

      lockConflictAction = value;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument "${arg}".`);
  }

  return {
    intervalMs,
    lockConflictAction,
    once,
  };
}

function getProjectNameFromEnv(env, key) {
  return typeof env?.[key] === 'string' ? env[key].trim() : '';
}

function isLegacyComposeProjectWatcher({
  env = process.env,
  rootDir = ROOT_DIR,
} = {}) {
  const inheritedProjectName = getProjectNameFromEnv(
    env,
    'COMPOSE_PROJECT_NAME'
  );
  const explicitProjectName = getProjectNameFromEnv(
    env,
    'DOCKER_WEB_COMPOSE_PROJECT_NAME'
  );
  const migrationSourceProjectName = getProjectNameFromEnv(
    env,
    DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV
  );
  const hostWorkspaceDir =
    getProjectNameFromEnv(env, HOST_WORKSPACE_DIR_ENV) || rootDir;

  const hasLegacyProjectName =
    inheritedProjectName === LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME ||
    explicitProjectName === LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME;
  const isUnmarkedLegacyWatcher =
    !inheritedProjectName &&
    !explicitProjectName &&
    !migrationSourceProjectName;

  return (
    env[WATCHER_CONTAINER_ENV] === '1' &&
    path.basename(hostWorkspaceDir) ===
      LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME &&
    (hasLegacyProjectName || isUnmarkedLegacyWatcher)
  );
}

function getMigrationTargetWatcherEnv({
  env = process.env,
  rootDir = ROOT_DIR,
} = {}) {
  const targetProjectName = getDockerWebComposeProjectName({
    baseEnv: {
      ...env,
      COMPOSE_PROJECT_NAME: undefined,
      DOCKER_WEB_COMPOSE_PROJECT_NAME:
        env.DOCKER_WEB_COMPOSE_PROJECT_NAME ??
        DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME,
    },
    rootDir,
  });

  return {
    ...env,
    ...Object.fromEntries(
      Object.entries(MIGRATION_STAGING_PORT_ENV).map(([key, value]) => [
        key,
        env[key] ?? value,
      ])
    ),
    [DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV]:
      LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: targetProjectName,
  };
}

async function handoffLegacyWatcherToTargetProject({
  argv,
  env = process.env,
  envFilePath,
  fsImpl = fs,
  log = console,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  if (!isLegacyComposeProjectWatcher({ env, rootDir })) {
    return false;
  }

  const sourceEnv = {
    ...env,
    COMPOSE_PROJECT_NAME: LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
  };
  const sourceHasContainers = await composeProjectHasContainers({
    env: sourceEnv,
    runCommand: run,
  });

  if (!sourceHasContainers) {
    return false;
  }

  const targetEnv = getMigrationTargetWatcherEnv({ env, rootDir });

  log.warn?.(
    `Starting ${targetEnv.DOCKER_WEB_COMPOSE_PROJECT_NAME} watcher to migrate the legacy ${LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME} Compose project.`
  );

  await startBlueGreenWatcherContainer(argv, {
    env: targetEnv,
    envFilePath,
    fsImpl,
    rootDir:
      getProjectNameFromEnv(env, HOST_WORKSPACE_DIR_ENV) ||
      getProjectNameFromEnv(targetEnv, HOST_WORKSPACE_DIR_ENV) ||
      rootDir,
    runCommand: run,
  });

  await runChecked(
    'docker',
    getComposeCommandArgs(
      PROD_COMPOSE_FILE,
      ['--profile', 'redis'],
      'stop',
      '--timeout',
      '1',
      BLUE_GREEN_WATCHER_SERVICE
    ),
    {
      env: sourceEnv,
      runCommand: run,
    }
  );

  return true;
}

async function getWatcherStartupComposeEnv({
  composeEnv,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const hostWorkspaceDir =
    getProjectNameFromEnv(composeEnv, HOST_WORKSPACE_DIR_ENV) || rootDir;
  const projectName = getProjectNameFromEnv(composeEnv, 'COMPOSE_PROJECT_NAME');
  const migrationSourceProjectName = getProjectNameFromEnv(
    composeEnv,
    DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV
  );

  if (
    composeEnv?.[WATCHER_CONTAINER_ENV] === '1' ||
    migrationSourceProjectName ||
    projectName !== DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME ||
    path.basename(hostWorkspaceDir) !== LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME
  ) {
    return composeEnv;
  }

  const sourceEnv = {
    ...composeEnv,
    COMPOSE_PROJECT_NAME: LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
  };
  const sourceHasContainers = await composeProjectHasContainers({
    env: sourceEnv,
    runCommand: run,
  });

  if (!sourceHasContainers) {
    return composeEnv;
  }

  console.warn(
    `Detected legacy ${LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME} Compose project while starting ${DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME} watcher; staging target watcher on migration ports.`
  );

  return getMigrationTargetWatcherEnv({
    env: composeEnv,
    rootDir: hostWorkspaceDir,
  });
}

function writeWatchArgsFile(
  argv,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(paths.argsFile, JSON.stringify(argv, null, 2), 'utf8');
}

function readWatchArgsFile({ fsImpl = fs, paths = getWatchPaths() } = {}) {
  if (!fsImpl.existsSync(paths.argsFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(paths.argsFile, 'utf8'));
    return Array.isArray(parsed) &&
      parsed.every((value) => typeof value === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function getTargetOnlyWatchLockPayload(lock, now = Date.now) {
  if (
    !lock ||
    typeof lock.branch !== 'string' ||
    typeof lock.remote !== 'string' ||
    typeof lock.upstreamBranch !== 'string' ||
    typeof lock.upstreamRef !== 'string'
  ) {
    return null;
  }

  const { pid: _pid, ...targetLock } = lock;

  return {
    ...targetLock,
    releasedAt: typeof now === 'function' ? now() : now,
  };
}

function clearContainerManagedWatcherState({
  fsImpl = fs,
  now = Date.now,
  paths = getWatchPaths(),
} = {}) {
  const targetLock = getTargetOnlyWatchLockPayload(
    readWatchLock(paths, fsImpl),
    now
  );

  if (targetLock) {
    fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
    fsImpl.writeFileSync(
      paths.lockFile,
      JSON.stringify(targetLock, null, 2),
      'utf8'
    );
  } else {
    fsImpl.rmSync(paths.lockFile, { force: true });
  }

  fsImpl.rmSync(paths.statusFile, { force: true });
}

async function startBlueGreenWatcherContainer(
  argv,
  {
    env = process.env,
    envFilePath,
    fsImpl = fs,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  parseArgs(argv);

  await runChecked('docker', ['compose', 'version'], {
    env,
    fsImpl,
    runCommand: run,
    stdio: 'ignore',
  });

  const resolvedEnvFilePath = envFilePath ?? path.join(rootDir, '.env.local');
  ensureWebEnvFile(fsImpl, resolvedEnvFilePath, rootDir);
  ensureProductionRedisToken(
    {
      composeGlobalArgs: ['--profile', 'redis'],
      mode: 'prod',
    },
    env,
    (composeGlobalArgs, profileName) => composeGlobalArgs.includes(profileName),
    {
      fsImpl,
      rootDir,
    }
  );

  const composeEnv = getWatcherComposeEnv({
    baseEnv: env,
    envFilePath: resolvedEnvFilePath,
    fsImpl,
    rootDir,
  });
  ensureProductionSupabaseOrigin({
    baseEnv: env,
    composeEnv,
    envFilePath: resolvedEnvFilePath,
    fsImpl,
    rootDir:
      getProjectNameFromEnv(composeEnv, HOST_WORKSPACE_DIR_ENV) || rootDir,
  });
  const startupComposeEnv = await getWatcherStartupComposeEnv({
    composeEnv,
    rootDir,
    runCommand: run,
  });

  clearContainerManagedWatcherState({
    fsImpl,
    paths: getWatchPaths(rootDir),
  });
  writeWatchArgsFile(argv, {
    fsImpl,
    paths: getWatchPaths(rootDir),
  });

  await runChecked(
    'docker',
    getComposeCommandArgs(
      PROD_COMPOSE_FILE,
      ['--profile', 'redis'],
      'up',
      '--build',
      '--detach',
      '--force-recreate',
      '--remove-orphans',
      BLUE_GREEN_WATCHER_SERVICE
    ),
    {
      env: startupComposeEnv,
      fsImpl,
      runCommand: run,
    }
  );
}

async function startBlueGreenWatcherContainerWithRecovery(argv, options = {}) {
  const log = options.log ?? console;
  const sleepImpl = options.sleepImpl ?? sleep;

  while (true) {
    try {
      await startBlueGreenWatcherContainer(argv, options);
      return;
    } catch (error) {
      if (!isDockerDaemonUnavailableError(error)) {
        throw error;
      }

      const recovered = await waitForDockerDaemonRecovery({
        env: options.env ?? process.env,
        fsImpl: options.fsImpl ?? fs,
        log,
        paths: getWatchPaths(options.rootDir ?? ROOT_DIR, options.env),
        runCommand: options.runCommand ?? runCommand,
        sleepImpl,
      });

      if (!recovered) {
        throw error;
      }
    }
  }
}

async function getWatcherContainerState({
  env = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const composeEnv = getWatcherComposeEnv({
    baseEnv: env,
    envFilePath,
    fsImpl,
    rootDir,
  });

  let containerId = '';
  try {
    containerId = await getComposeServiceContainerId(
      BLUE_GREEN_WATCHER_SERVICE,
      {
        composeFile: PROD_COMPOSE_FILE,
        composeGlobalArgs: ['--profile', 'redis'],
        env: composeEnv,
        includeStopped: true,
        runCommand: run,
      }
    );
  } catch {
    return 'missing';
  }

  if (!containerId) {
    return 'missing';
  }

  try {
    return await getContainerHealthStatus(containerId, {
      env: composeEnv,
      runCommand: run,
    });
  } catch {
    return 'unknown';
  }
}

async function streamBlueGreenWatcherLogs({
  env = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const composeEnv = getWatcherComposeEnv({
    baseEnv: env,
    envFilePath,
    fsImpl,
    rootDir,
  });
  const result = await run(
    'docker',
    getComposeCommandArgs(
      PROD_COMPOSE_FILE,
      ['--profile', 'redis'],
      'logs',
      '--follow',
      '--tail',
      '100',
      BLUE_GREEN_WATCHER_SERVICE
    ),
    {
      env: composeEnv,
      fsImpl,
    }
  );

  if (
    result.signal &&
    (result.signal === 'SIGINT' || result.signal === 'SIGTERM')
  ) {
    return { status: 'interrupted' };
  }

  if (result.code === 143) {
    return { status: 'recreated' };
  }

  if (
    result.stdout?.includes(WATCHER_CONTAINER_REFRESH_MESSAGE) ||
    result.stderr?.includes(WATCHER_CONTAINER_REFRESH_MESSAGE)
  ) {
    return { status: 'container-refresh-requested' };
  }

  if (result.code !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    return {
      status: 'stream-error',
      code: result.code,
      detail: detail || null,
    };
  }

  return { status: 'completed' };
}

async function runWatcherCommand(argv = process.argv.slice(2), options = {}) {
  await startBlueGreenWatcherContainerWithRecovery(argv, options);

  while (true) {
    const result = await streamBlueGreenWatcherLogs(options);

    if (result?.status === 'interrupted') {
      return;
    }

    await sleep(options.reconnectDelayMs ?? 2_000);

    if (result?.status === 'container-refresh-requested') {
      await startBlueGreenWatcherContainerWithRecovery(argv, options);
      continue;
    }

    const state = await getWatcherContainerState(options);
    if (state === 'missing' || state === 'dead' || state === 'exited') {
      await startBlueGreenWatcherContainerWithRecovery(argv, options);
      continue;
    }

    if (result?.status === 'recreated') {
      continue;
    }

    if (result?.status === 'stream-error') {
      console.warn(
        `[watch-blue-green-deploy] Watcher log stream exited with code ${result.code}; reconnecting after backoff.${
          result.detail ? `\n${result.detail}` : ''
        }`
      );
      continue;
    }

    return;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasPendingDeployRequest(env = process.env) {
  return env[WATCH_PENDING_DEPLOY_ENV] === '1';
}

function readPendingDeployRequest(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.pendingDeployFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.pendingDeployFile, 'utf8')
    );
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writePendingDeployRequest(
  request,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.pendingDeployFile,
    JSON.stringify(request, null, 2),
    'utf8'
  );
}

function clearPendingDeployRequest({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  fsImpl.rmSync(paths.pendingDeployFile, { force: true });
}

function hasPersistedPendingDeployRequest(
  env = process.env,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  return (
    hasPendingDeployRequest(env) ||
    readPendingDeployRequest(paths, fsImpl) != null
  );
}

function getLatestSuccessfulDeploymentCommitHash(deployments = []) {
  const latestSuccessfulDeployment = deployments.find(
    (entry) =>
      entry?.status === 'successful' &&
      typeof entry.commitHash === 'string' &&
      entry.commitHash.length > 0
  );

  return latestSuccessfulDeployment?.commitHash ?? null;
}

async function getChangedFilesForBuildScope({
  env,
  fromCommitHash,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  toCommitHash,
} = {}) {
  if (!fromCommitHash || !toCommitHash) {
    return null;
  }

  if (fromCommitHash === toCommitHash) {
    return [];
  }

  try {
    return await listChangedFilesBetweenRevisions(
      fromCommitHash,
      toCommitHash,
      {
        cwd: rootDir,
        env,
        runCommand: run,
      }
    );
  } catch {
    return null;
  }
}

function getLatestCachedSuccessfulDeployment(deployments = [], commitHash) {
  return deployments.find(
    (entry) =>
      entry?.status === 'successful' &&
      typeof entry.imageTag === 'string' &&
      entry.imageTag.length > 0 &&
      (!commitHash || entry.commitHash === commitHash)
  );
}

function getRecoveryCacheImageTagsToKeep(
  deployments = [],
  { extraImageTag = null, max = MAX_RECOVERY_CACHE_IMAGES } = {}
) {
  const imageTags = [];

  if (typeof extraImageTag === 'string' && extraImageTag.length > 0) {
    imageTags.push(extraImageTag);
  }

  for (const entry of deployments) {
    if (
      entry?.status !== 'successful' ||
      typeof entry.imageTag !== 'string' ||
      entry.imageTag.length === 0 ||
      imageTags.includes(entry.imageTag)
    ) {
      continue;
    }

    imageTags.push(entry.imageTag);
  }

  return imageTags.slice(0, max);
}

function getPrunableRecoveryCacheImageTags(
  deployments = [],
  keptImageTags = []
) {
  const kept = new Set(keptImageTags);
  const prunable = [];

  for (const entry of deployments) {
    if (
      entry?.status !== 'successful' ||
      typeof entry.imageTag !== 'string' ||
      entry.imageTag.length === 0 ||
      kept.has(entry.imageTag) ||
      prunable.includes(entry.imageTag)
    ) {
      continue;
    }

    prunable.push(entry.imageTag);
  }

  return prunable;
}

function isMissingDockerImageError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /No such image:/iu.test(message);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createDockerRecoveryIncidentId(startedAt) {
  return `docker-daemon-${new Date(startedAt).toISOString()}`;
}

function appendDockerRecoveryLogEntry({
  eventType,
  fsImpl = fs,
  incidentId,
  level = 'warn',
  message,
  metadata = {},
  now = Date.now,
  paths = getWatchPaths(),
} = {}) {
  const time = now();

  try {
    return appendWatcherLogEntry(
      {
        activeColor: null,
        commitHash: null,
        commitShortHash: null,
        deploymentKey: null,
        deploymentKind: 'docker-daemon-recovery',
        deploymentStamp: null,
        deploymentStatus: null,
        eventId: `${incidentId}:${eventType}:${time}`,
        eventType,
        incidentId,
        level,
        message,
        metadata,
        time,
      },
      { fsImpl, paths }
    );
  } catch {
    return [];
  }
}

function getPositiveIntegerEnv(env, name, fallback) {
  const raw = env?.[name];

  if (raw == null || String(raw).trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(raw).trim(), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isTruthyEnv(value) {
  return /^(1|true|yes)$/iu.test(String(value ?? '').trim());
}

function getDockerDaemonRecoveryPollMs(env = process.env) {
  return (
    getPositiveIntegerEnv(
      env,
      DOCKER_DAEMON_RECOVERY_POLL_MS_ENV,
      DEFAULT_DOCKER_DAEMON_RECOVERY_POLL_MS
    ) ?? DEFAULT_DOCKER_DAEMON_RECOVERY_POLL_MS
  );
}

function getDockerDaemonRecoveryTimeoutMs(env = process.env) {
  const timeoutMs = getPositiveIntegerEnv(
    env,
    DOCKER_DAEMON_RECOVERY_TIMEOUT_MS_ENV,
    DEFAULT_DOCKER_DAEMON_RECOVERY_TIMEOUT_MS
  );

  return timeoutMs && timeoutMs > 0 ? timeoutMs : null;
}

function getDockerDaemonRestartAfterMs(env = process.env) {
  if (isTruthyEnv(env?.[DOCKER_DAEMON_RESTART_DISABLED_ENV])) {
    return null;
  }

  const restartAfterMs = getPositiveIntegerEnv(
    env,
    DOCKER_DAEMON_RESTART_AFTER_MS_ENV,
    DEFAULT_DOCKER_DAEMON_RESTART_AFTER_MS
  );

  return restartAfterMs && restartAfterMs > 0 ? restartAfterMs : null;
}

function getDockerDaemonRestartCooldownMs(env = process.env) {
  return (
    getPositiveIntegerEnv(
      env,
      DOCKER_DAEMON_RESTART_COOLDOWN_MS_ENV,
      DEFAULT_DOCKER_DAEMON_RESTART_COOLDOWN_MS
    ) ?? DEFAULT_DOCKER_DAEMON_RESTART_COOLDOWN_MS
  );
}

function getDockerDaemonPostRestartCommandTimeoutMs(env = process.env) {
  return (
    getPositiveIntegerEnv(
      env,
      DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS_ENV,
      DEFAULT_DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS
    ) ?? DEFAULT_DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS
  );
}

function splitDockerDaemonRestartCommand(rawCommand) {
  const trimmed = String(rawCommand ?? '').trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      return Array.isArray(parsed) &&
        parsed.every(
          (value) => typeof value === 'string' && value.trim().length > 0
        )
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  return trimmed.split(/\s+/u).filter(Boolean);
}

function getDefaultDockerDaemonRestartCommand(platform = process.platform) {
  if (platform === 'linux') {
    return ['systemctl', 'restart', 'docker'];
  }

  if (platform === 'darwin') {
    return ['open', '-ga', 'Docker'];
  }

  if (platform === 'win32') {
    return [
      'powershell.exe',
      '-NoProfile',
      '-Command',
      'Start-Process',
      'Docker Desktop',
    ];
  }

  return null;
}

function getDockerDaemonRestartCommand({
  env = process.env,
  platform = process.platform,
} = {}) {
  const rawCommand = env?.[DOCKER_DAEMON_RESTART_COMMAND_ENV];

  if (rawCommand != null && String(rawCommand).trim().length > 0) {
    return splitDockerDaemonRestartCommand(rawCommand);
  }

  return getDefaultDockerDaemonRestartCommand(platform);
}

function describeDockerDaemonRestartCommand(command) {
  return command ? command.join(' ') : 'none configured';
}

function normalizeDockerDaemonPostRestartCommandSpec(spec, index) {
  if (Array.isArray(spec)) {
    if (
      spec.length === 0 ||
      !spec.every(
        (value) => typeof value === 'string' && value.trim().length > 0
      )
    ) {
      throw new Error(
        `Docker post-restart command ${index + 1} must be a non-empty argv array of strings.`
      );
    }

    return {
      args: spec.slice(1),
      command: spec[0],
      cwd: null,
    };
  }

  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const command = spec.command;
    const args = spec.args ?? [];
    const cwd = spec.cwd ?? null;

    if (typeof command !== 'string' || command.trim().length === 0) {
      throw new Error(
        `Docker post-restart command ${index + 1} must include a command string.`
      );
    }

    if (
      !Array.isArray(args) ||
      !args.every(
        (value) => typeof value === 'string' && value.trim().length > 0
      )
    ) {
      throw new Error(
        `Docker post-restart command ${index + 1} args must be an array of strings.`
      );
    }

    if (cwd != null && (typeof cwd !== 'string' || cwd.trim().length === 0)) {
      throw new Error(
        `Docker post-restart command ${index + 1} cwd must be a non-empty string when provided.`
      );
    }

    return {
      args,
      command: command.trim(),
      cwd: cwd?.trim() ?? null,
    };
  }

  throw new Error(
    `Docker post-restart command ${index + 1} must be an argv array or object.`
  );
}

function getDockerDaemonPostRestartCommands(env = process.env) {
  const raw = env?.[DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV];

  if (raw == null || String(raw).trim().length === 0) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (error) {
    throw new Error(
      `${DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV} must be valid JSON: ${getErrorMessage(error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `${DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV} must be a JSON array.`
    );
  }

  return parsed.map(normalizeDockerDaemonPostRestartCommandSpec);
}

function readDockerDaemonRecoverySettings({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  const filePath = path.join(
    paths.controlDir,
    DOCKER_DAEMON_RECOVERY_SETTINGS_FILE
  );

  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeSettingEnvValue(env, key, value) {
  if (value === undefined) {
    return;
  }

  if (value == null) {
    env[key] = '0';
    return;
  }

  env[key] = String(value);
}

function getDockerDaemonRecoverySettingsEnv({
  env = process.env,
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  const settings = readDockerDaemonRecoverySettings({ fsImpl, paths });

  if (!settings) {
    return env;
  }

  const nextEnv = { ...env };
  writeSettingEnvValue(
    nextEnv,
    DOCKER_DAEMON_RECOVERY_POLL_MS_ENV,
    settings.dockerRecoveryPollMs
  );
  writeSettingEnvValue(
    nextEnv,
    DOCKER_DAEMON_RECOVERY_TIMEOUT_MS_ENV,
    settings.dockerRecoveryTimeoutMs
  );
  writeSettingEnvValue(
    nextEnv,
    DOCKER_DAEMON_RESTART_AFTER_MS_ENV,
    settings.dockerRestartAfterMs
  );
  writeSettingEnvValue(
    nextEnv,
    DOCKER_DAEMON_RESTART_COOLDOWN_MS_ENV,
    settings.dockerRestartCooldownMs
  );
  writeSettingEnvValue(
    nextEnv,
    DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS_ENV,
    settings.postRestartCommandTimeoutMs
  );

  if (settings.dockerRestartDisabled === true) {
    nextEnv[DOCKER_DAEMON_RESTART_DISABLED_ENV] = '1';
  } else {
    delete nextEnv[DOCKER_DAEMON_RESTART_DISABLED_ENV];
  }

  return nextEnv;
}

function describeDockerDaemonPostRestartCommand(commandSpec) {
  const label = [commandSpec.command, ...commandSpec.args].join(' ');

  return commandSpec.cwd ? `${label} (cwd: ${commandSpec.cwd})` : label;
}

function isDockerDaemonUnavailableError(error) {
  const message = stripAnsi(getErrorMessage(error)).toLowerCase();

  return /cannot connect to the docker daemon|connection refused|context canceled|context cancelled|docker daemon is not running|error during connect|is the docker daemon running|request returned (?:internal server error|bad gateway)|server misbehaving|use of closed network connection/u.test(
    message
  );
}

async function restartDockerDaemon({
  env = process.env,
  log = console,
  platform = process.platform,
  runCommand: run = runCommand,
} = {}) {
  const command = getDockerDaemonRestartCommand({ env, platform });

  if (!command || command.length === 0) {
    log.warn?.(
      `Docker daemon restart skipped because no restart command is configured for ${platform}.`
    );
    return false;
  }

  const [executable, ...args] = command;
  log.warn?.(
    `Docker daemon is still unavailable; attempting restart with: ${describeDockerDaemonRestartCommand(command)}`
  );

  try {
    const result = await run(executable, args, {
      env,
      stdio: 'pipe',
    });

    if (result.code === 0) {
      log.warn?.('Docker daemon restart command completed.');
      return true;
    }

    const detail = result.stderr?.trim() || result.stdout?.trim();
    log.warn?.(
      `Docker daemon restart command exited with code ${result.code}${
        detail ? `: ${detail}` : ''
      }`
    );
  } catch (error) {
    log.warn?.(
      `Docker daemon restart command failed: ${getErrorMessage(error)}`
    );
  }

  return false;
}

async function runDockerDaemonPostRestartCommands({
  env = process.env,
  log = console,
  runCommand: run = runCommand,
} = {}) {
  let commands;
  try {
    commands = getDockerDaemonPostRestartCommands(env);
  } catch (error) {
    log.warn?.(
      `Docker post-restart commands are misconfigured: ${getErrorMessage(error)}`
    );
    return {
      failed: 0,
      ran: 0,
      status: 'misconfigured',
    };
  }

  if (commands.length === 0) {
    return {
      failed: 0,
      ran: 0,
      status: 'skipped',
    };
  }

  const timeoutMs = getDockerDaemonPostRestartCommandTimeoutMs(env);
  let failed = 0;

  for (const commandSpec of commands) {
    log.warn?.(
      `Running Docker post-restart recovery command: ${describeDockerDaemonPostRestartCommand(commandSpec)}`
    );

    try {
      const result = await run(commandSpec.command, commandSpec.args, {
        cwd: commandSpec.cwd ?? undefined,
        env,
        stdio: 'pipe',
        timeoutMs,
      });

      if (result.code === 0) {
        continue;
      }

      failed += 1;
      const detail = result.stderr?.trim() || result.stdout?.trim();
      log.warn?.(
        `Docker post-restart recovery command exited with code ${result.code}: ${describeDockerDaemonPostRestartCommand(commandSpec)}${
          detail ? `\n${detail}` : ''
        }`
      );
    } catch (error) {
      failed += 1;
      log.warn?.(
        `Docker post-restart recovery command failed: ${describeDockerDaemonPostRestartCommand(commandSpec)}\n${getErrorMessage(error)}`
      );
    }
  }

  return {
    failed,
    ran: commands.length,
    status: failed > 0 ? 'completed-with-failures' : 'completed',
  };
}

async function waitForDockerDaemonRecovery({
  env = process.env,
  fsImpl = fs,
  log = console,
  now = () => Date.now(),
  paths = getWatchPaths(),
  platform = process.platform,
  runCommand: run = runCommand,
  sleepImpl = sleep,
} = {}) {
  let effectiveEnv = getDockerDaemonRecoverySettingsEnv({
    env,
    fsImpl,
    paths,
  });
  const timeoutMs = getDockerDaemonRecoveryTimeoutMs(effectiveEnv);
  const startedAt = now();
  const incidentId = createDockerRecoveryIncidentId(startedAt);
  const deadline = timeoutMs == null ? null : startedAt + timeoutMs;
  let attempts = 0;
  let lastError = null;
  let lastRestartAttemptAt = null;
  let daemonRestarted = false;
  let unavailableLogged = false;
  let postRestartCommandsRan = false;

  while (deadline == null || now() <= deadline) {
    effectiveEnv = getDockerDaemonRecoverySettingsEnv({
      env,
      fsImpl,
      paths,
    });

    try {
      await runChecked('docker', ['info'], {
        env: effectiveEnv,
        runCommand: run,
        stdio: 'ignore',
      });
      if (unavailableLogged) {
        appendDockerRecoveryLogEntry({
          eventType: 'docker-daemon-recovered',
          fsImpl,
          incidentId,
          level: 'info',
          message: `Docker daemon recovered after ${formatDuration(now() - startedAt)}.`,
          metadata: {
            attempts,
            daemonRestarted,
            durationMs: now() - startedAt,
          },
          now,
          paths,
        });
      }
      if (daemonRestarted && !postRestartCommandsRan) {
        postRestartCommandsRan = true;
        const postRestartResult = await runDockerDaemonPostRestartCommands({
          env: effectiveEnv,
          log,
          runCommand: run,
        });
        appendDockerRecoveryLogEntry({
          eventType: 'docker-post-restart-commands-completed',
          fsImpl,
          incidentId,
          level:
            postRestartResult.status === 'completed-with-failures'
              ? 'warn'
              : 'info',
          message: `Docker post-restart recovery commands ${postRestartResult.status}. Ran ${postRestartResult.ran}, failed ${postRestartResult.failed}.`,
          metadata: postRestartResult,
          now,
          paths,
        });
      }
      return true;
    } catch (error) {
      lastError = error;
      attempts += 1;
      if (!unavailableLogged) {
        unavailableLogged = true;
        appendDockerRecoveryLogEntry({
          eventType: 'docker-daemon-unavailable',
          fsImpl,
          incidentId,
          level: 'error',
          message: `Docker daemon became unavailable: ${getErrorMessage(error)}`,
          metadata: {
            attempt: attempts,
            timeoutMs,
          },
          now,
          paths,
        });
      }

      if (attempts === 1 || attempts % 12 === 0) {
        const windowLabel =
          timeoutMs == null
            ? 'without a timeout'
            : `for ${formatDuration(timeoutMs)}`;
        log.warn?.(
          `Docker daemon is unavailable; waiting ${windowLabel} before restarting the watcher stack: ${getErrorMessage(error)}`
        );
      }

      const currentTime = now();
      const restartAfterMs = getDockerDaemonRestartAfterMs(effectiveEnv);
      const restartCooldownMs = getDockerDaemonRestartCooldownMs(effectiveEnv);
      const shouldRestartDaemon =
        restartAfterMs != null &&
        currentTime - startedAt >= restartAfterMs &&
        (lastRestartAttemptAt == null ||
          currentTime - lastRestartAttemptAt >= restartCooldownMs);

      if (shouldRestartDaemon) {
        lastRestartAttemptAt = currentTime;
        appendDockerRecoveryLogEntry({
          eventType: 'docker-daemon-restart-attempt',
          fsImpl,
          incidentId,
          level: 'warn',
          message: `Attempting Docker daemon restart with: ${describeDockerDaemonRestartCommand(
            getDockerDaemonRestartCommand({ env: effectiveEnv, platform })
          )}`,
          metadata: {
            attempt: attempts,
            restartAfterMs,
          },
          now,
          paths,
        });
        const restartSucceeded = await restartDockerDaemon({
          env: effectiveEnv,
          log,
          platform,
          runCommand: run,
        });
        daemonRestarted = restartSucceeded || daemonRestarted;
        appendDockerRecoveryLogEntry({
          eventType: 'docker-daemon-restart-result',
          fsImpl,
          incidentId,
          level: restartSucceeded ? 'info' : 'warn',
          message: restartSucceeded
            ? 'Docker daemon restart command completed.'
            : 'Docker daemon restart command did not complete successfully.',
          metadata: {
            restartSucceeded,
          },
          now,
          paths,
        });
      }

      const pollMs = getDockerDaemonRecoveryPollMs(effectiveEnv);
      const remainingMs = deadline == null ? pollMs : deadline - now();

      if (remainingMs <= 0) {
        break;
      }

      await sleepImpl(Math.min(pollMs, remainingMs));
    }
  }

  log.warn?.(
    `Docker daemon did not recover: ${lastError ? getErrorMessage(lastError) : 'unknown error'}`
  );
  appendDockerRecoveryLogEntry({
    eventType: 'docker-daemon-recovery-timeout',
    fsImpl,
    incidentId,
    level: 'error',
    message: `Docker daemon did not recover: ${lastError ? getErrorMessage(lastError) : 'unknown error'}`,
    metadata: {
      attempts,
      daemonRestarted,
      timeoutMs,
    },
    now,
    paths,
  });

  return false;
}

function summarizeDeploymentFailure(error) {
  const rawMessage = stripAnsi(getErrorMessage(error));
  const lines = rawMessage
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const relevantLines = lines.filter((line) =>
    /bun has crashed|cannot allocate memory|command failed|context deadline exceeded|crashed while loading native module|error:|exit code|exited \([0-9]+\)|failed to compile|failed to solve|illegal instruction|javascript heap out of memory|no space left|panic|resourceexhausted|segmentation fault|sig(?:ill|kill|term)|terminated by signal|timed out|waiting for connection/iu.test(
      line
    )
  );
  const selected = relevantLines.length > 0 ? relevantLines : lines.slice(-4);
  const summary = selected.slice(-6).join('\n');

  return summary.length > 1800 ? `${summary.slice(0, 1800)}...` : summary;
}

function withDeploymentFailureDetails(entry, error) {
  const failureReason = summarizeDeploymentFailure(error);
  const exitCode =
    error && typeof error === 'object' && Number.isFinite(error.exitCode)
      ? error.exitCode
      : null;
  const signal =
    error && typeof error === 'object' && typeof error.signal === 'string'
      ? error.signal
      : null;

  return {
    ...entry,
    ...(exitCode != null ? { exitCode } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(signal ? { signal } : {}),
  };
}

function describeTimedOutDeploymentBuild(result) {
  const lock = result?.lock ?? {};
  const timeoutMs = result?.timeoutMs ?? DEFAULT_DEPLOYMENT_BUILD_TIMEOUT_MS;
  const elapsedMs = result?.elapsedMs ?? 0;
  if (result?.action === 'self-cleared') {
    return `Deployment build exceeded ${formatDuration(timeoutMs)} while still building; cleared self-owned lock for PID ${lock.ownerPid ?? lock.pid ?? 'unknown'} after ${formatDuration(elapsedMs)} because the watcher had returned to the poll loop.`;
  }

  const signal = result?.signal ?? 'SIGTERM';
  return `Deployment build exceeded ${formatDuration(timeoutMs)} while still building; sent ${signal} to PID ${lock.ownerPid ?? lock.pid ?? 'unknown'} after ${formatDuration(elapsedMs)}.`;
}

async function stopTimedOutDeploymentBuildIfNeeded({
  env,
  fsImpl,
  log = console,
  now = () => Date.now(),
  paths,
  processImpl,
  target = null,
} = {}) {
  const lock = readDeploymentBuildLock(paths, fsImpl);
  const result = tryTerminateTimedOutDeploymentBuildLock(lock, {
    env,
    fsImpl,
    now,
    paths,
    processImpl,
  });

  if (result.action === 'failed') {
    log.warn?.(
      `Deployment build exceeded ${formatDuration(result.timeoutMs)} but could not be stopped: ${getErrorMessage(result.error)}`
    );
    return result;
  }

  if (result.action !== 'terminated' && result.action !== 'self-cleared') {
    return result;
  }

  const finishedAt = now();
  const reason = describeTimedOutDeploymentBuild(result);
  const timedOutError = new Error(reason);

  await appendFailedDeploymentHistoryAndNotify(
    {
      buildDurationMs: result.elapsedMs,
      commitHash: result.lock?.commitHash ?? null,
      commitShortHash: result.lock?.commitShortHash ?? null,
      commitSubject: result.lock?.commitSubject ?? null,
      deploymentKind: result.lock?.deploymentKind ?? 'watcher-timeout',
      finishedAt,
      startedAt: result.lock?.startedAt ?? finishedAt,
      status: 'failed',
    },
    timedOutError,
    {
      env,
      fsImpl,
      log,
      paths,
      target,
    }
  );
  log.warn?.(reason);

  return { ...result, reason };
}

function getFailedDeploymentCountForCommit(deployments = [], commitHash) {
  if (!commitHash) {
    return 0;
  }

  return deployments.filter(
    (entry) => entry?.status === 'failed' && entry.commitHash === commitHash
  ).length;
}

async function appendFailedDeploymentHistoryAndNotify(
  entry,
  error,
  {
    env,
    fsImpl = fs,
    incidentEmailSender = sendBuildFailureIncidentEmail,
    log = console,
    paths = getWatchPaths(),
    target = null,
  } = {}
) {
  const failedEntry = withDeploymentFailureDetails(entry, error);
  const priorHistory = readDeploymentHistory(paths, fsImpl);
  const shouldNotify =
    failedEntry.commitHash &&
    getFailedDeploymentCountForCommit(priorHistory, failedEntry.commitHash) ===
      0;
  const history = appendDeploymentHistory(failedEntry, {
    fsImpl,
    paths,
  });

  if (!shouldNotify) {
    return history;
  }

  try {
    const result = await incidentEmailSender({
      entry: failedEntry,
      env,
      fsImpl,
      paths,
      target,
    });

    if (result?.sent) {
      log.warn?.(
        `Sent blue/green build failure incident email for ${failedEntry.commitShortHash ?? failedEntry.commitHash.slice(0, 12)} to ${result.recipients?.length ?? 0} recipient(s).`
      );
    } else if (result?.skipped === 'send-failed') {
      log.error?.(
        `Failed to send blue/green build failure incident email for ${failedEntry.commitShortHash ?? failedEntry.commitHash.slice(0, 12)}: ${result.error ?? 'unknown error'}`
      );
    }
  } catch (notificationError) {
    log.error?.(
      `Failed to send blue/green build failure incident email for ${failedEntry.commitShortHash ?? failedEntry.commitHash.slice(0, 12)}: ${getErrorMessage(notificationError)}`
    );
  }

  return history;
}

function hasReachedDeploymentFailureLimit(deployments = [], commitHash) {
  return (
    getFailedDeploymentCountForCommit(deployments, commitHash) >=
    MAX_FAILED_DEPLOYMENTS_PER_COMMIT
  );
}

function hasReportedRetryLimitForCommit(commitHash, { fsImpl, paths }) {
  if (!commitHash) {
    return false;
  }

  const lastResult = readWatchStatus(paths, fsImpl)?.lastResult;

  return (
    lastResult?.status === 'retry-limited' &&
    lastResult?.latestCommit?.hash === commitHash
  );
}

function logRetryLimitOnce(message, commitHash, { fsImpl, log, paths }) {
  if (hasReportedRetryLimitForCommit(commitHash, { fsImpl, paths })) {
    return;
  }

  log.warn?.(message);
}

function getActiveDeploymentConflictKey(conflict) {
  const lock = conflict?.lock ?? {};

  return [
    conflict?.source ?? 'unknown',
    conflict?.status ?? 'unknown',
    lock.ownerPid ?? 'unknown',
    lock.command ?? 'unknown',
    lock.deploymentKind ?? 'unknown',
    lock.commitHash ?? lock.commitShortHash ?? 'unknown',
    lock.startedAt ?? 'unknown',
  ].join('|');
}

function getConflictFromDeploymentBuildLockError(
  error,
  now = () => Date.now()
) {
  return {
    elapsedMs: Math.max(0, now() - (error?.lock?.startedAt ?? now())),
    lock: error?.lock ?? null,
    source: 'lock',
    status: 'building',
  };
}

function sanitizeActiveDeploymentLock(lock) {
  if (!lock || typeof lock !== 'object') {
    return null;
  }

  const { lockToken: _lockToken, ...safeLock } = lock;
  return safeLock;
}

function createDeploymentActiveResult(conflict, result = {}) {
  return {
    ...result,
    activeDeployment: sanitizeActiveDeploymentLock(conflict?.lock),
    activeDeploymentKey: getActiveDeploymentConflictKey(conflict),
    activeDeploymentSource: conflict?.source ?? null,
    activeDeploymentStatus: conflict?.status ?? null,
    status: 'deployment-active',
  };
}

async function cancelActiveDeploymentForWatcherRequest({
  cancellationSource,
  conflict,
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl,
  latestCommit,
  now,
  paths,
  processImpl,
  rootDir,
  runCommand: run,
}) {
  if (!conflict) {
    return null;
  }

  return cancelActiveBlueGreenBuild({
    cancellationSource,
    composeEnv: getWatcherComposeEnv({
      baseEnv: env,
      envFilePath,
      fsImpl,
      rootDir,
    }),
    conflict,
    fsImpl,
    latestCommit,
    now,
    paths,
    processImpl,
    rootDir,
    runCommand: run,
    stopWatcherService: false,
  });
}

async function hasCachedRecoveryImage({
  cachedImageTag,
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl,
  log,
  rootDir,
  runCommand: run,
}) {
  try {
    await assertBlueGreenCachedImageExists(cachedImageTag, {
      env: getWatcherComposeEnv({
        baseEnv: env,
        envFilePath,
        fsImpl,
        rootDir,
      }),
      runCommand: run,
    });
    return true;
  } catch (error) {
    log.warn?.(
      `Cached recovery image ${cachedImageTag} is unavailable; falling back to rollback pin: ${getErrorMessage(error)}`
    );
    return false;
  }
}

function hasReportedActiveDeploymentConflict(conflict, { fsImpl, paths }) {
  const lastResult = readWatchStatus(paths, fsImpl)?.lastResult;

  return (
    lastResult?.status === 'deployment-active' &&
    lastResult?.activeDeploymentKey === getActiveDeploymentConflictKey(conflict)
  );
}

function logActiveDeploymentDeferralOnce(
  message,
  conflict,
  { fsImpl, log, paths }
) {
  if (hasReportedActiveDeploymentConflict(conflict, { fsImpl, paths })) {
    return;
  }

  log.info?.(`${message} (${describeActiveDeploymentConflict(conflict)}).`);
}

function hasSuccessfulDeploymentForCommit(deployments = [], commitHash) {
  if (!commitHash) {
    return false;
  }

  return deployments.some(
    (entry) => entry?.status === 'successful' && entry.commitHash === commitHash
  );
}

async function getGitFirstParentRevision(
  childHash,
  { env, runCommand: run = runCommand } = {}
) {
  if (!childHash) {
    return null;
  }

  try {
    const rev = await gitStdout(['rev-parse', `${childHash}^`], {
      env,
      runCommand: run,
    });
    const trimmed = rev.trim();

    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function resolveParentFallbackCommitForRetryLimitedHead(
  headCommit,
  deploymentHistory,
  { env, runCommand: run = runCommand } = {}
) {
  if (!headCommit?.hash) {
    return null;
  }

  if (!hasReachedDeploymentFailureLimit(deploymentHistory, headCommit.hash)) {
    return null;
  }

  const parentRev = await getGitFirstParentRevision(headCommit.hash, {
    env,
    runCommand: run,
  });

  if (!parentRev) {
    return null;
  }

  if (hasSuccessfulDeploymentForCommit(deploymentHistory, parentRev)) {
    return null;
  }

  return getCommitMetadata(parentRev, { env, runCommand: run });
}

async function runDetachedCommitFullBlueGreenDeploy({
  afterBunBeforeDeploy = null,
  checkedAt,
  deployCommand = DEFAULT_DEPLOY_COMMAND,
  deployCommit,
  deploymentKind,
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  log = console,
  now = () => Date.now(),
  onDeploymentStart = () => {},
  paths = getWatchPaths(),
  pendingDeploymentStatus = 'deploying',
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  targetBranch,
} = {}) {
  if (!deployCommit?.hash || !targetBranch) {
    throw new Error(
      'runDetachedCommitFullBlueGreenDeploy requires deployCommit.hash and targetBranch'
    );
  }

  await checkoutRevision(deployCommit.hash, { env, runCommand: run });

  try {
    await runBunFrozenInstall({ env, runCommand: run });

    if (typeof afterBunBeforeDeploy === 'function') {
      await afterBunBeforeDeploy();
    }

    const deployStartedAt = now();

    onDeploymentStart({
      checkedAt,
      latestCommit: deployCommit,
      pendingDeployment: createPendingDeploymentEntry({
        deploymentKind,
        latestCommit: deployCommit,
        startedAt: deployStartedAt,
        status: pendingDeploymentStatus,
      }),
    });

    try {
      await runBlueGreenDeploy({
        deploymentKind,
        deployCommand,
        env: {
          ...(env ?? process.env),
          PLATFORM_BUILD_REF_NAME: env?.PLATFORM_BUILD_REF_NAME ?? targetBranch,
        },
        fsImpl,
        latestCommit: deployCommit,
        now,
        paths,
        runCommand: run,
      });
      const deployFinishedAt = now();
      const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
      const deploymentStamp = readBlueGreenDeploymentStamp(
        paths.blueGreen,
        fsImpl
      );
      const imageTag = await cacheBlueGreenDeploymentImage({
        activeColor,
        env,
        envFilePath,
        fsImpl,
        latestCommit: deployCommit,
        log,
        rootDir,
        runCommand: run,
      });
      const history = appendDeploymentHistory(
        {
          activatedAt: deployFinishedAt,
          activeColor,
          buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
          commitHash: deployCommit.hash,
          commitShortHash: deployCommit.shortHash,
          commitSubject: deployCommit.subject,
          deploymentKind,
          deploymentStamp,
          finishedAt: deployFinishedAt,
          ...(imageTag ? { imageTag } : {}),
          startedAt: deployStartedAt,
          status: 'successful',
        },
        {
          fsImpl,
          paths,
        }
      );
      await pruneBlueGreenRecoveryCacheImages(history, {
        env,
        extraImageTag: imageTag,
        log,
        runCommand: run,
      });

      return { success: true, history };
    } catch (error) {
      const deployFinishedAt = now();

      if (error instanceof DeploymentBuildLockConflictError) {
        return { buildLockConflict: true, error, history: null };
      }

      const history = await appendFailedDeploymentHistoryAndNotify(
        {
          buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
          commitHash: deployCommit.hash,
          commitShortHash: deployCommit.shortHash,
          commitSubject: deployCommit.subject,
          deploymentKind,
          finishedAt: deployFinishedAt,
          startedAt: deployStartedAt,
          status: 'failed',
        },
        error,
        {
          env,
          fsImpl,
          log,
          paths,
          target: { branch: targetBranch },
        }
      );

      return { success: false, error, history };
    }
  } finally {
    await checkoutBranch(targetBranch, { env, runCommand: run });
  }
}

async function runDetachedParentFallbackStandbyRefresh({
  buildRootDir,
  checkedAt,
  deployCommit,
  deploymentKind = 'parent-fallback-standby-refresh',
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  log = console,
  now = () => Date.now(),
  onDeploymentStart = () => {},
  manageCheckout = true,
  paths = getWatchPaths(),
  processImpl = process,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  standbyRefreshCandidate,
  targetBranch,
} = {}) {
  if (!deployCommit?.hash || !targetBranch || !standbyRefreshCandidate) {
    throw new Error(
      'runDetachedParentFallbackStandbyRefresh requires deployCommit, targetBranch, and standbyRefreshCandidate'
    );
  }

  const effectiveBuildRootDir = buildRootDir ?? rootDir;

  if (manageCheckout) {
    await checkoutRevision(deployCommit.hash, { env, runCommand: run });
  }

  try {
    const refreshStartedAt = now();

    onDeploymentStart({
      checkedAt,
      latestCommit: deployCommit,
      pendingDeployment: createPendingDeploymentEntry({
        activeColor: standbyRefreshCandidate.standbyColor,
        deploymentKind,
        latestCommit: deployCommit,
        startedAt: refreshStartedAt,
        status: 'building',
      }),
    });

    try {
      const changedFiles = await getChangedFilesForBuildScope({
        env,
        fromCommitHash: standbyRefreshCandidate.standbyDeployment?.commitHash,
        rootDir: effectiveBuildRootDir,
        runCommand: run,
        toCommitHash: deployCommit.hash,
      });
      const standbyResult = await runBlueGreenStandbyRefresh({
        buildRootDir: effectiveBuildRootDir,
        changedFiles,
        env,
        envFilePath,
        fsImpl,
        latestCommit: deployCommit,
        now,
        paths,
        processImpl,
        rootDir,
        runCommand: run,
      });
      const refreshFinishedAt = now();
      const deploymentStamp = readBlueGreenDeploymentStamp(
        paths.blueGreen,
        fsImpl
      );
      const imageTag = await cacheBlueGreenDeploymentImage({
        activeColor:
          standbyResult.standbyColor ?? standbyRefreshCandidate.standbyColor,
        env,
        envFilePath,
        fsImpl,
        latestCommit: deployCommit,
        log,
        rootDir: effectiveBuildRootDir,
        runCommand: run,
      });
      const history = appendDeploymentHistory(
        {
          activatedAt: refreshFinishedAt,
          activeColor:
            standbyResult.standbyColor ?? standbyRefreshCandidate.standbyColor,
          buildDurationMs: Math.max(0, refreshFinishedAt - refreshStartedAt),
          commitHash: deployCommit.hash,
          commitShortHash: deployCommit.shortHash,
          commitSubject: deployCommit.subject,
          deploymentKind,
          deploymentStamp,
          finishedAt: refreshFinishedAt,
          ...(imageTag ? { imageTag } : {}),
          startedAt: refreshStartedAt,
          status: 'successful',
        },
        {
          fsImpl,
          paths,
        }
      );
      await pruneBlueGreenRecoveryCacheImages(history, {
        env,
        extraImageTag: imageTag,
        log,
        runCommand: run,
      });

      return { success: true, history };
    } catch (error) {
      const refreshFinishedAt = now();

      if (error instanceof DeploymentBuildLockConflictError) {
        return { buildLockConflict: true, error, history: null };
      }

      const history = await appendFailedDeploymentHistoryAndNotify(
        {
          activeColor: standbyRefreshCandidate.standbyColor,
          buildDurationMs: Math.max(0, refreshFinishedAt - refreshStartedAt),
          commitHash: deployCommit.hash,
          commitShortHash: deployCommit.shortHash,
          commitSubject: deployCommit.subject,
          deploymentKind,
          finishedAt: refreshFinishedAt,
          startedAt: refreshStartedAt,
          status: 'failed',
        },
        error,
        {
          env,
          fsImpl,
          log,
          paths,
          target: { branch: targetBranch },
        }
      );

      return { success: false, error, history };
    }
  } finally {
    if (manageCheckout) {
      await checkoutBranch(targetBranch, { env, runCommand: run });
    }
  }
}

function getRuntimeDeployment(deployments, runtimeState) {
  return (deployments ?? []).find(
    (entry) => entry.runtimeState === runtimeState
  );
}

function getExpectedStandbyColor(activeColor) {
  if (activeColor === 'blue') {
    return 'green';
  }

  if (activeColor === 'green') {
    return 'blue';
  }

  return null;
}

function needsActiveRuntimeRecovery(runtimeSnapshot) {
  const currentBlueGreen = runtimeSnapshot?.currentBlueGreen;

  return (
    currentBlueGreen?.state === 'degraded' &&
    (!currentBlueGreen.activeColor || !currentBlueGreen.activeServiceRunning)
  );
}

function getStandbyRefreshCandidate(
  runtimeSnapshot,
  latestCommit,
  { now = Date.now(), refreshAfterMs = DEFAULT_STANDBY_REFRESH_AFTER_MS } = {}
) {
  const activeDeployment = getRuntimeDeployment(
    runtimeSnapshot?.deployments,
    'active'
  );

  if (
    !runtimeSnapshot?.currentBlueGreen?.activeColor ||
    !latestCommit?.hash ||
    !activeDeployment?.activatedAt
  ) {
    return null;
  }

  const standbyDeployment = getRuntimeDeployment(
    runtimeSnapshot.deployments,
    'standby'
  );
  let standbyColor =
    runtimeSnapshot.currentBlueGreen.standbyColor ??
    runtimeSnapshot.currentBlueGreen.liveColors?.find(
      (color) => color !== runtimeSnapshot.currentBlueGreen.activeColor
    ) ??
    null;

  if (!standbyColor) {
    standbyColor =
      runtimeSnapshot.currentBlueGreen.activeColor === 'blue'
        ? 'green'
        : 'blue';
  }

  if (!standbyColor) {
    return null;
  }

  if (now - activeDeployment.activatedAt < refreshAfterMs) {
    return null;
  }

  if (standbyDeployment?.commitHash === latestCommit.hash) {
    return null;
  }

  return {
    activeDeployment,
    standbyColor,
    standbyDeployment,
  };
}

function formatInstantRolloutRequester(request) {
  if (!request) {
    return 'an operator request';
  }

  return (
    request.requestedByEmail || request.requestedBy || 'an operator request'
  );
}

async function runBlueGreenDeploy({
  deploymentKind,
  deployCommand = DEFAULT_DEPLOY_COMMAND,
  env,
  fsImpl = fs,
  latestCommit,
  now = () => Date.now(),
  paths = getWatchPaths(),
  processImpl = process,
  runCommand: run = runCommand,
} = {}) {
  const [command, ...args] = deployCommand;
  const heldLock = acquireDeploymentBuildLock({
    command: deployCommand,
    deploymentKind,
    env: env ?? process.env,
    fsImpl,
    latestCommit,
    now,
    paths,
    processImpl,
  });
  clearDeploymentStagesHandoff(paths.deploymentStagesFile, fsImpl);

  try {
    const baseEnv = env ?? process.env;
    const timeoutMs = getDeploymentBuildTimeoutMs(baseEnv);
    const deploymentEnv = {
      ...baseEnv,
      ...(deploymentKind ? { [DEPLOYMENT_KIND_ENV]: deploymentKind } : {}),
      ...(latestCommit?.hash && !baseEnv.PLATFORM_BUILD_COMMIT_HASH
        ? { PLATFORM_BUILD_COMMIT_HASH: latestCommit.hash }
        : {}),
      ...(latestCommit?.shortHash && !baseEnv.PLATFORM_BUILD_COMMIT_SHORT_HASH
        ? { PLATFORM_BUILD_COMMIT_SHORT_HASH: latestCommit.shortHash }
        : {}),
      ...(latestCommit?.subject && !baseEnv.PLATFORM_BUILD_COMMIT_MESSAGE
        ? { PLATFORM_BUILD_COMMIT_MESSAGE: latestCommit.subject }
        : {}),
      [DEPLOYMENT_BUILD_LOCK_TOKEN_ENV]: heldLock.token,
      [DEPLOYMENT_STAGES_FILE_ENV]: paths.deploymentStagesFile,
      [SKIP_WATCH_HISTORY_ENV]: '1',
    };

    await runChecked(command, args, {
      env: deploymentEnv,
      runCommand: run,
      stdio: 'pipe',
      teeOutput: true,
      timeoutMs,
    });
  } finally {
    heldLock.release();
  }
}

async function testComposeProxyRouting({
  composeFile = PROD_COMPOSE_FILE,
  composeGlobalArgs = ['--profile', 'redis'],
  env,
  runCommand: run = runCommand,
} = {}) {
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'exec',
      '-T',
      BLUE_GREEN_PROXY_SERVICE,
      'wget',
      '-q',
      '-O',
      '/dev/null',
      'http://127.0.0.1:7803/__platform/drain-status'
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function testComposeProxyRoutingWithin({
  deadlineMs = MIGRATION_PROXY_HANDOFF_TIMEOUT_MS,
  now = () => Date.now(),
  ...options
} = {}) {
  const startedAt = now();

  await testComposeProxyRouting(options);

  const elapsedMs = now() - startedAt;
  if (elapsedMs > deadlineMs) {
    throw new Error(
      `Proxy handoff verification exceeded ${deadlineMs}ms (${elapsedMs}ms).`
    );
  }
}

function getMigrationRequest({ env = process.env, rootDir = ROOT_DIR } = {}) {
  const sourceProjectName = getProjectNameFromEnv(
    env,
    DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV
  );
  const targetProjectName = getDockerWebComposeProjectName({
    baseEnv: env,
    rootDir,
  });

  if (!sourceProjectName || !targetProjectName) {
    return null;
  }

  if (sourceProjectName === targetProjectName) {
    return null;
  }

  return {
    sourceProjectName,
    targetProjectName,
  };
}

function markComposeProjectMigrationComplete(env) {
  if (!env || typeof env !== 'object') {
    return;
  }

  Object.assign(env, MIGRATION_CANONICAL_PORT_ENV);
  delete env[DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV];
}

async function composeProjectHasContainers({
  composeFile = PROD_COMPOSE_FILE,
  composeGlobalArgs = ['--profile', 'redis'],
  env,
  runCommand: run = runCommand,
} = {}) {
  const result = await runChecked(
    'docker',
    getComposeCommandArgs(composeFile, composeGlobalArgs, 'ps', '-q'),
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return result.stdout.trim().length > 0;
}

async function removeLegacyComposeProject({
  composeFile = PROD_COMPOSE_FILE,
  composeGlobalArgs = ['--profile', 'redis', '--profile', 'cloudflared'],
  env,
  runCommand: run = runCommand,
} = {}) {
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'down',
      '--remove-orphans'
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function recoverLegacyProxy({
  composeFile = PROD_COMPOSE_FILE,
  composeGlobalArgs = ['--profile', 'redis'],
  deadlineMs = MIGRATION_PROXY_HANDOFF_TIMEOUT_MS,
  now = () => Date.now(),
  runCommand: run = runCommand,
  sourceEnv,
  targetEnv,
} = {}) {
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'stop',
      '--timeout',
      '1',
      BLUE_GREEN_PROXY_SERVICE
    ),
    {
      env: targetEnv,
      runCommand: run,
    }
  );
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'up',
      '--detach',
      '--no-build',
      BLUE_GREEN_PROXY_SERVICE
    ),
    {
      env: sourceEnv,
      runCommand: run,
    }
  );
  await testComposeProxyRoutingWithin({
    composeFile,
    composeGlobalArgs,
    deadlineMs,
    env: sourceEnv,
    now,
    runCommand: run,
  });
}

async function finalizeComposeProjectMigrationIfRequested({
  composeFile = PROD_COMPOSE_FILE,
  composeGlobalArgs = ['--profile', 'redis'],
  deadlineMs = MIGRATION_PROXY_HANDOFF_TIMEOUT_MS,
  env = process.env,
  log = console,
  now = () => Date.now(),
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const migration = getMigrationRequest({ env, rootDir });

  if (!migration) {
    return null;
  }

  const sourceEnv = {
    ...env,
    COMPOSE_PROJECT_NAME: migration.sourceProjectName,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: migration.sourceProjectName,
    DOCKER_WEB_PROXY_HOST_PORT: '7803',
  };
  const targetStagedEnv = {
    ...env,
    COMPOSE_PROJECT_NAME: migration.targetProjectName,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: migration.targetProjectName,
  };
  const targetFinalEnv = {
    ...targetStagedEnv,
    DOCKER_WEB_PROXY_HOST_PORT: '7803',
  };

  const sourceHasContainers = await composeProjectHasContainers({
    composeFile,
    composeGlobalArgs,
    env: sourceEnv,
    runCommand: run,
  });

  if (!sourceHasContainers) {
    markComposeProjectMigrationComplete(env);

    return {
      sourceProjectName: migration.sourceProjectName,
      status: 'source-absent',
      targetProjectName: migration.targetProjectName,
    };
  }

  await testComposeProxyRouting({
    composeFile,
    composeGlobalArgs,
    env: targetStagedEnv,
    runCommand: run,
  });

  const handoffStartedAt = now();
  log.warn?.(
    `Switching Docker proxy from ${migration.sourceProjectName} to ${migration.targetProjectName}; rollback threshold is ${deadlineMs}ms.`
  );

  try {
    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'stop',
        '--timeout',
        '1',
        BLUE_GREEN_PROXY_SERVICE
      ),
      {
        env: sourceEnv,
        runCommand: run,
      }
    );
    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'up',
        '--detach',
        '--no-build',
        '--force-recreate',
        BLUE_GREEN_PROXY_SERVICE
      ),
      {
        env: targetFinalEnv,
        runCommand: run,
      }
    );
    await testComposeProxyRouting({
      composeFile,
      composeGlobalArgs,
      env: targetFinalEnv,
      runCommand: run,
    });

    const verifiedAt = now();
    const handoffDurationMs = verifiedAt - handoffStartedAt;
    if (handoffDurationMs > deadlineMs) {
      throw new Error(
        `Proxy handoff exceeded ${deadlineMs}ms (${handoffDurationMs}ms).`
      );
    }
  } catch (error) {
    const failureMessage =
      error instanceof Error ? error.message : String(error);

    try {
      await recoverLegacyProxy({
        composeFile,
        composeGlobalArgs,
        deadlineMs,
        now,
        runCommand: run,
        sourceEnv,
        targetEnv: targetFinalEnv,
      });
    } catch (rollbackError) {
      throw new Error(
        `Proxy migration from ${migration.sourceProjectName} to ${migration.targetProjectName} failed and rollback also failed: ${failureMessage}; rollback error: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      );
    }

    log.error?.(
      `Proxy migration from ${migration.sourceProjectName} to ${migration.targetProjectName} failed; legacy proxy was restored: ${failureMessage}`
    );

    return {
      error: failureMessage,
      sourceProjectName: migration.sourceProjectName,
      status: 'rolled-back',
      targetProjectName: migration.targetProjectName,
    };
  }

  const handoffDurationMs = now() - handoffStartedAt;

  await removeLegacyComposeProject({
    composeFile,
    env: sourceEnv,
    runCommand: run,
  });
  markComposeProjectMigrationComplete(env);

  log.info?.(
    `Docker proxy migration to ${migration.targetProjectName} completed in ${handoffDurationMs}ms.`
  );

  return {
    handoffDurationMs,
    sourceProjectName: migration.sourceProjectName,
    status: 'completed',
    targetProjectName: migration.targetProjectName,
  };
}

async function runBunFrozenInstall({ env, runCommand: run = runCommand } = {}) {
  await runChecked('bun', ['install', '--frozen-lockfile'], {
    env,
    runCommand: run,
  });
}

async function pruneBlueGreenRecoveryCacheImages(
  deploymentHistory,
  {
    env,
    extraImageTag = null,
    log = console,
    runCommand: run = runCommand,
  } = {}
) {
  const keptImageTags = getRecoveryCacheImageTagsToKeep(deploymentHistory, {
    extraImageTag,
  });
  const prunableImageTags = getPrunableRecoveryCacheImageTags(
    deploymentHistory,
    keptImageTags
  );

  for (const imageTag of prunableImageTags) {
    try {
      await runChecked('docker', ['image', 'rm', imageTag], {
        env,
        runCommand: run,
      });
    } catch (error) {
      if (isMissingDockerImageError(error)) {
        continue;
      }

      log.warn?.(
        `Unable to prune old blue/green recovery cache image ${imageTag}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return keptImageTags;
}

async function cacheBlueGreenDeploymentImage({
  activeColor,
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  latestCommit,
  log = console,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  if (!activeColor || !latestCommit?.shortHash) {
    return null;
  }

  const composeFile = getComposeFile('prod');
  const composeEnv = getComposeEnvironment({
    baseEnv: env ?? process.env,
    envFilePath,
    fsImpl,
    preferEnvFilePath: true,
    rootDir,
    withRedis: true,
    withSupportServices: true,
  });
  ensureProductionSupabaseOrigin({
    baseEnv: env ?? process.env,
    composeEnv,
    envFilePath,
    fsImpl,
    rootDir,
  });
  const serviceName = getBlueGreenServiceName(activeColor, composeEnv);
  const imageTag = getBlueGreenCacheImageTag(latestCommit.shortHash, {
    composeFile,
    env: composeEnv,
  });

  try {
    return await tagBlueGreenServiceImageForCache(serviceName, imageTag, {
      composeFile,
      env: composeEnv,
      runCommand: run,
    });
  } catch (error) {
    log.warn?.(
      `Unable to cache blue/green image ${imageTag} for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

async function runBlueGreenStandbyRefresh({
  buildRootDir,
  changedFiles = null,
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  latestCommit = null,
  now = () => Date.now(),
  paths = getWatchPaths(),
  processImpl = process,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const heldLock = acquireDeploymentBuildLock({
    command: 'standby-refresh',
    deploymentKind: 'standby-refresh',
    env: env ?? process.env,
    fsImpl,
    latestCommit,
    now,
    paths,
    processImpl,
  });

  try {
    return await runBlueGreenStandbyRefreshWorkflow(
      {
        action: 'up',
        composeArgs: [],
        composeGlobalArgs: ['--profile', 'redis'],
        mode: 'prod',
        strategy: 'blue-green',
      },
      {
        buildRootDir,
        changedFiles,
        deploymentKind: 'standby-refresh',
        env: {
          ...(env ?? process.env),
          [DEPLOYMENT_BUILD_LOCK_TOKEN_ENV]: heldLock.token,
        },
        envFilePath,
        fsImpl,
        latestCommit,
        rootDir,
        runCommand: run,
      }
    );
  } finally {
    heldLock.release();
  }
}

async function runBlueGreenCachedRecovery({
  cachedImageTag,
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  latestCommit = null,
  now = () => Date.now(),
  paths = getWatchPaths(),
  processImpl = process,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const heldLock = acquireDeploymentBuildLock({
    command: 'cached-recovery',
    deploymentKind: 'cached-recovery',
    env: env ?? process.env,
    fsImpl,
    latestCommit,
    now,
    paths,
    processImpl,
  });

  try {
    return await runBlueGreenCachedRecoveryWorkflow(
      {
        action: 'up',
        composeArgs: [],
        composeGlobalArgs: ['--profile', 'redis'],
        mode: 'prod',
        strategy: 'blue-green',
      },
      {
        cachedImageTag,
        env: {
          ...(env ?? process.env),
          [DEPLOYMENT_BUILD_LOCK_TOKEN_ENV]: heldLock.token,
        },
        envFilePath,
        fsImpl,
        rootDir,
        runCommand: run,
      }
    );
  } finally {
    heldLock.release();
  }
}

const { runMissingActiveDeploymentRecovery } =
  require('./deploy-watcher-active-recovery.js')({
    DEFAULT_DEPLOY_COMMAND,
    cacheBlueGreenDeploymentImage,
    finalizeComposeProjectMigrationIfRequested,
    getExpectedStandbyColor,
    getLatestCachedSuccessfulDeployment,
    pruneBlueGreenRecoveryCacheImages,
    runBlueGreenCachedRecovery,
    runBlueGreenDeploy,
    runBunFrozenInstall,
  });
async function runPendingDeployAfterRestart({
  deployCommand = DEFAULT_DEPLOY_COMMAND,
  deploymentKind = 'recovery-bootstrap',
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  latestCommit,
  log = console,
  now = () => Date.now(),
  paths = getWatchPaths(),
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const refreshedProxy = await refreshBlueGreenProxyIfRunning({
    env,
    envFilePath,
    fsImpl,
    paths: paths.blueGreen,
    rootDir,
    runCommand: run,
  });

  log.info?.(
    refreshedProxy
      ? 'Refreshed live blue/green proxy config before deployment.'
      : 'No live blue/green proxy was running; skipping proxy refresh.'
  );

  const deployStartedAt = now();
  await runBlueGreenDeploy({
    deploymentKind,
    deployCommand,
    env,
    fsImpl,
    latestCommit,
    now,
    paths,
    runCommand: run,
  });
  const deployFinishedAt = now();
  const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
  const deploymentStamp = readBlueGreenDeploymentStamp(paths.blueGreen, fsImpl);
  const imageTag = await cacheBlueGreenDeploymentImage({
    activeColor,
    env,
    envFilePath,
    fsImpl,
    latestCommit,
    log,
    rootDir,
    runCommand: run,
  });
  const history = appendDeploymentHistory(
    {
      activatedAt: deployFinishedAt,
      activeColor,
      buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
      commitHash: latestCommit.hash,
      commitShortHash: latestCommit.shortHash,
      commitSubject: latestCommit.subject,
      deploymentKind,
      deploymentStamp,
      finishedAt: deployFinishedAt,
      ...(imageTag ? { imageTag } : {}),
      startedAt: deployStartedAt,
      status: 'successful',
    },
    {
      fsImpl,
      paths,
    }
  );
  await pruneBlueGreenRecoveryCacheImages(history, {
    env,
    extraImageTag: imageTag,
    log,
    runCommand: run,
  });
  const migration = await finalizeComposeProjectMigrationIfRequested({
    env,
    log,
    now,
    rootDir,
    runCommand: run,
  });

  return {
    activeColor,
    buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
    deployFinishedAt,
    deployStartedAt,
    history,
    migration,
    refreshedProxy,
  };
}

function createQuietRunCommand(baseRun = runCommand) {
  return (command, args, options = {}) =>
    baseRun(command, args, {
      ...options,
      stdio: options.stdio ?? 'pipe',
    });
}

async function spawnReplacementWatcher({
  argv = process.argv.slice(1),
  cwd = ROOT_DIR,
  env = process.env,
  execPath = process.execPath,
  spawnImpl = spawn,
} = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawnImpl(execPath, argv, {
      cwd,
      detached: true,
      env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref?.();
      resolve(child);
    });
  });
}

async function waitForProcessExit(
  pid,
  {
    pollMs = 100,
    processImpl = process,
    sleepImpl = sleep,
    timeoutMs = DEFAULT_REPLACE_WATCHER_TIMEOUT_MS,
  } = {}
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    if (!isProcessAlive(pid, processImpl)) {
      return true;
    }

    await sleepImpl(pollMs);
  }

  return !isProcessAlive(pid, processImpl);
}

async function terminateExistingWatcher(
  existingLock,
  {
    processImpl = process,
    sleepImpl = sleep,
    timeoutMs = DEFAULT_REPLACE_WATCHER_TIMEOUT_MS,
  } = {}
) {
  if (!existingLock?.pid || !isProcessAlive(existingLock.pid, processImpl)) {
    return false;
  }

  processImpl.kill(existingLock.pid, 'SIGTERM');
  const exitedGracefully = await waitForProcessExit(existingLock.pid, {
    processImpl,
    sleepImpl,
    timeoutMs,
  });

  if (exitedGracefully) {
    return true;
  }

  processImpl.kill(existingLock.pid, 'SIGKILL');
  return waitForProcessExit(existingLock.pid, {
    processImpl,
    sleepImpl,
    timeoutMs: Math.min(timeoutMs, 1_000),
  });
}

async function mirrorExistingWatchSession(
  existingLock,
  {
    env,
    envFilePath,
    fsImpl = fs,
    log,
    now = () => Date.now(),
    once = false,
    paths = getWatchPaths(),
    processImpl = process,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
    sleepImpl = sleep,
  } = {}
) {
  const ui = log;

  ui.start();
  ui.info(
    `Resuming watcher view for PID ${existingLock.pid} on ${existingLock.branch} (${existingLock.upstreamRef}).`
  );

  while (true) {
    const status = readWatchStatus(paths, fsImpl);

    if (status) {
      ui.update({
        ...status,
        deploymentPin: readDeploymentPin(paths, fsImpl),
        lockFile: paths.lockFile,
      });
    } else {
      const runtimeSnapshot = await loadRuntimeSnapshot({
        env,
        envFilePath,
        fsImpl,
        now: now(),
        paths,
        rootDir,
        runCommand: run,
      });
      const deploymentSummary = getLatestDeploymentSummary(
        runtimeSnapshot.deployments
      );

      ui.update({
        currentBlueGreen: runtimeSnapshot.currentBlueGreen,
        deploymentPin: readDeploymentPin(paths, fsImpl),
        deployments: runtimeSnapshot.deployments,
        lastDeployAt: deploymentSummary.lastDeployAt,
        lastDeployStatus: deploymentSummary.lastDeployStatus,
        lockFile: paths.lockFile,
        target: existingLock,
      });
    }

    if (once) {
      return {
        resumedPid: existingLock.pid,
        status: readWatchStatus(paths, fsImpl),
      };
    }

    const activeLock = readWatchLock(paths, fsImpl);
    if (
      !activeLock ||
      activeLock.pid !== existingLock.pid ||
      !isProcessAlive(existingLock.pid, processImpl)
    ) {
      ui.info(`Watcher PID ${existingLock.pid} is no longer active.`);
      return {
        resumedPid: existingLock.pid,
        status: 'ended',
      };
    }

    await sleepImpl(DEFAULT_INTERVAL_MS);
  }
}

function findSuccessfulDeploymentByCommit(deployments = [], commitHash) {
  return deployments.find(
    (entry) => entry?.status === 'successful' && entry.commitHash === commitHash
  );
}

function createDeploymentPinFromRevertRequest(request, deployment) {
  return {
    activeColor: deployment.activeColor ?? null,
    commitHash: deployment.commitHash,
    commitShortHash:
      deployment.commitShortHash ?? deployment.commitHash.slice(0, 12),
    commitSubject: deployment.commitSubject ?? null,
    deploymentStamp: deployment.deploymentStamp ?? null,
    kind: 'deployment-pin',
    requestedAt: request.requestedAt,
    requestedBy: request.requestedBy,
    requestedByEmail: request.requestedByEmail ?? null,
  };
}

async function runDeploymentRevertRequestIteration(
  target,
  request,
  {
    activeDeploymentConflict = null,
    attachRuntime,
    checkedAt,
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    log = console,
    now = () => Date.now(),
    onDeploymentStart = () => {},
    paths = getWatchPaths(),
    platformProjectDeploymentStatusUpdater = updatePlatformProjectDeploymentStatus,
    platformProjectReader = readPlatformProject,
    processImpl = process,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const deploymentHistory = readDeploymentHistory(paths, fsImpl);
  const deployment = findSuccessfulDeploymentByCommit(
    deploymentHistory,
    request.commitHash
  );

  if (!deployment) {
    clearDeploymentRevertRequest({ fsImpl, paths });
    log.warn?.(
      `Ignoring deployment revert request for ${request.commitHash.slice(0, 12)} because no successful retained deployment matches it.`
    );
    return attachRuntime({
      checkedAt,
      status: 'revert-target-missing',
    });
  }

  const pin = createDeploymentPinFromRevertRequest(request, deployment);
  let cachedImageTag =
    typeof deployment.imageTag === 'string' &&
    deployment.imageTag.length > 0 &&
    (request.imageTag == null || request.imageTag === deployment.imageTag)
      ? deployment.imageTag
      : null;

  if (cachedImageTag) {
    const cacheAvailable = await hasCachedRecoveryImage({
      cachedImageTag,
      env,
      envFilePath,
      fsImpl,
      log,
      rootDir,
      runCommand: run,
    });

    if (!cacheAvailable) {
      cachedImageTag = null;
    }
  }

  if (!cachedImageTag) {
    if (activeDeploymentConflict) {
      logActiveDeploymentDeferralOnce(
        `Rollback pin for ${pin.commitShortHash} is waiting because another deployment is already active`,
        activeDeploymentConflict,
        { fsImpl, log, paths }
      );
      return attachRuntime(
        createDeploymentActiveResult(activeDeploymentConflict, {
          checkedAt,
          latestCommit: {
            hash: deployment.commitHash,
            shortHash:
              deployment.commitShortHash ?? deployment.commitHash.slice(0, 7),
            subject: deployment.commitSubject ?? 'Production rollback',
          },
        })
      );
    }

    writeDeploymentPin(pin, { fsImpl, paths });
    clearDeploymentRevertRequest({ fsImpl, paths });
    log.warn?.(
      `Reverting production to ${pin.commitShortHash} through rollback pin; no cached image is retained for an instant revert.`
    );
    return runPinnedDeploymentIteration(target, pin, {
      deployCommand,
      env,
      envFilePath,
      fsImpl,
      log,
      now,
      onDeploymentStart,
      paths,
      platformProjectDeploymentStatusUpdater,
      platformProjectReader,
      rootDir,
      runCommand: run,
    });
  }

  const latestCommit = {
    hash: deployment.commitHash,
    shortHash: deployment.commitShortHash ?? deployment.commitHash.slice(0, 7),
    subject: deployment.commitSubject ?? 'Cached production revert',
  };
  const startedAt = now();

  onDeploymentStart({
    checkedAt,
    latestCommit,
    pendingDeployment: createPendingDeploymentEntry({
      activeColor: deployment.activeColor ?? null,
      deploymentKind: 'instant-revert',
      latestCommit,
      startedAt,
      status: 'deploying',
    }),
  });

  try {
    if (activeDeploymentConflict) {
      await cancelActiveDeploymentForWatcherRequest({
        cancellationSource: 'instant cached production revert',
        conflict: activeDeploymentConflict,
        env,
        envFilePath,
        fsImpl,
        latestCommit,
        now,
        paths,
        processImpl,
        rootDir,
        runCommand: run,
      });
    }

    log.warn?.(
      `Instant reverting production to ${latestCommit.shortHash} from cached image ${cachedImageTag}.`
    );
    const recovery = await runBlueGreenCachedRecovery({
      cachedImageTag,
      env,
      envFilePath,
      fsImpl,
      latestCommit,
      now,
      paths,
      processImpl,
      rootDir,
      runCommand: run,
    });
    const finishedAt = now();
    const history = appendDeploymentHistory(
      {
        activatedAt: finishedAt,
        activeColor: recovery.activeColor,
        buildDurationMs: Math.max(0, finishedAt - startedAt),
        commitHash: latestCommit.hash,
        commitShortHash: latestCommit.shortHash,
        commitSubject: latestCommit.subject,
        deploymentKind: 'instant-revert',
        deploymentStamp: recovery.deploymentStamp,
        finishedAt,
        imageTag: recovery.cachedImageTag,
        revertedBy: request.requestedBy,
        revertedByEmail: request.requestedByEmail ?? null,
        startedAt,
        status: 'successful',
      },
      {
        fsImpl,
        paths,
      }
    );
    await pruneBlueGreenRecoveryCacheImages(history, {
      env,
      extraImageTag: recovery.cachedImageTag,
      log,
      runCommand: run,
    });
    writeDeploymentPin(
      {
        ...pin,
        activeColor: recovery.activeColor,
        deploymentStamp: recovery.deploymentStamp,
      },
      { fsImpl, paths }
    );
    clearDeploymentRevertRequest({ fsImpl, paths });

    const migration = await finalizeComposeProjectMigrationIfRequested({
      env,
      log,
      now,
      rootDir,
      runCommand: run,
    });

    return attachRuntime(
      {
        cachedImageTag,
        checkedAt,
        latestCommit,
        migration,
        status: 'instant-reverted',
      },
      history
    );
  } catch (error) {
    if (error instanceof DeploymentBuildLockConflictError) {
      const activeConflict = getConflictFromDeploymentBuildLockError(
        error,
        now
      );
      logActiveDeploymentDeferralOnce(
        `Instant revert for ${latestCommit.shortHash} is waiting because another deployment is already active`,
        activeConflict,
        { fsImpl, log, paths }
      );
      return attachRuntime(
        createDeploymentActiveResult(activeConflict, {
          checkedAt,
          error,
          latestCommit,
        })
      );
    }

    const finishedAt = now();
    const history = await appendFailedDeploymentHistoryAndNotify(
      {
        buildDurationMs: Math.max(0, finishedAt - startedAt),
        commitHash: latestCommit.hash,
        commitShortHash: latestCommit.shortHash,
        commitSubject: latestCommit.subject,
        deploymentKind: 'instant-revert',
        finishedAt,
        revertedBy: request.requestedBy,
        revertedByEmail: request.requestedByEmail ?? null,
        startedAt,
        status: 'failed',
      },
      error,
      {
        env,
        fsImpl,
        log,
        paths,
        target,
      }
    );

    clearDeploymentRevertRequest({ fsImpl, paths });
    log.error?.(
      `Instant revert for ${latestCommit.shortHash} failed: ${error instanceof Error ? error.message : String(error)}`
    );

    return attachRuntime(
      {
        checkedAt,
        error,
        latestCommit,
        status: 'instant-revert-failed',
      },
      history
    );
  }
}

async function runPinnedDeploymentIteration(
  target,
  deploymentPin,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    log = console,
    now = () => Date.now(),
    onDeploymentStart = () => {},
    paths = getWatchPaths(),
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const checkedAt = now();
  const attachRuntime = async (result, history = null) => {
    const snapshotNow = now();

    return {
      ...result,
      deploymentPin: readDeploymentPin(paths, fsImpl),
      ...(await loadRuntimeSnapshot({
        env,
        envFilePath,
        fsImpl,
        history,
        now: snapshotNow,
        paths,
        rootDir,
        runCommand: run,
      })),
    };
  };
  const hasBlockingDirtyWorktree = await hasDirtyWorktree({
    env,
    runCommand: run,
  });

  if (hasBlockingDirtyWorktree) {
    log.warn?.(
      `Skipping pinned rollback because the worktree has uncommitted changes on ${target.branch}.`
    );
    return attachRuntime({
      checkedAt,
      status: 'dirty',
    });
  }

  const currentHead = await getRevision('HEAD', { env, runCommand: run });
  if (currentHead !== deploymentPin.commitHash) {
    log.warn?.(
      `Deployment pin is active. Checking out ${deploymentPin.commitShortHash ?? deploymentPin.commitHash.slice(0, 12)} in detached mode and pausing normal upstream sync.`
    );
    await checkoutRevision(deploymentPin.commitHash, {
      env,
      runCommand: run,
    });
  }

  const latestCommit = await getCommitMetadata('HEAD', {
    env,
    runCommand: run,
  });
  const latestDeployedCommitHash = getLatestSuccessfulDeploymentCommitHash(
    readDeploymentHistory(paths, fsImpl)
  );
  const deploymentHistory = readDeploymentHistory(paths, fsImpl);
  const failedDeploymentCount = getFailedDeploymentCountForCommit(
    deploymentHistory,
    latestCommit.hash
  );

  if (latestCommit.hash && latestCommit.hash === latestDeployedCommitHash) {
    return attachRuntime({
      checkedAt,
      latestCommit,
      status: 'pinned',
    });
  }

  if (hasReachedDeploymentFailureLimit(deploymentHistory, latestCommit.hash)) {
    logRetryLimitOnce(
      `Skipping pinned rollback for ${latestCommit.shortHash} because it already failed ${failedDeploymentCount} deployment attempts.`,
      latestCommit.hash,
      { fsImpl, log, paths }
    );
    return attachRuntime({
      checkedAt,
      failedDeploymentCount,
      latestCommit,
      status: 'retry-limited',
    });
  }

  const deployStartedAt = now();
  onDeploymentStart({
    checkedAt,
    latestCommit,
    pendingDeployment: createPendingDeploymentEntry({
      deploymentKind: 'rollback-pin',
      latestCommit,
      startedAt: deployStartedAt,
      status: 'deploying',
    }),
  });

  try {
    log.warn?.(
      `Deploying pinned rollback ${latestCommit.shortHash}; upstream sync remains paused until the pin is cleared.`
    );
    await runBlueGreenDeploy({
      deploymentKind: 'rollback-pin',
      deployCommand,
      env,
      fsImpl,
      latestCommit,
      now,
      paths,
      runCommand: run,
    });

    const deployFinishedAt = now();
    const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
    const deploymentStamp = readBlueGreenDeploymentStamp(
      paths.blueGreen,
      fsImpl
    );
    const imageTag = await cacheBlueGreenDeploymentImage({
      activeColor,
      env,
      envFilePath,
      fsImpl,
      latestCommit,
      log,
      rootDir,
      runCommand: run,
    });
    const history = appendDeploymentHistory(
      {
        activatedAt: deployFinishedAt,
        activeColor,
        buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
        commitHash: latestCommit.hash,
        commitShortHash: latestCommit.shortHash,
        commitSubject: latestCommit.subject,
        deploymentKind: 'rollback-pin',
        deploymentStamp,
        finishedAt: deployFinishedAt,
        ...(imageTag ? { imageTag } : {}),
        pinnedBy: deploymentPin.requestedBy,
        pinnedByEmail: deploymentPin.requestedByEmail,
        startedAt: deployStartedAt,
        status: 'successful',
      },
      {
        fsImpl,
        paths,
      }
    );
    await pruneBlueGreenRecoveryCacheImages(history, {
      env,
      extraImageTag: imageTag,
      log,
      runCommand: run,
    });
    const migration = await finalizeComposeProjectMigrationIfRequested({
      env,
      log,
      now,
      rootDir,
      runCommand: run,
    });

    log.info?.(`Pinned rollback deployed for ${latestCommit.shortHash}.`);

    return attachRuntime(
      {
        checkedAt,
        latestCommit,
        migration,
        pinnedFromCommitHash: latestDeployedCommitHash,
        status: 'pinned-deployed',
      },
      history
    );
  } catch (error) {
    if (error instanceof DeploymentBuildLockConflictError) {
      const activeConflict = getConflictFromDeploymentBuildLockError(
        error,
        now
      );

      logActiveDeploymentDeferralOnce(
        `Pinned rollback for ${latestCommit.shortHash} is waiting because another deployment is already active`,
        activeConflict,
        { fsImpl, log, paths }
      );

      return attachRuntime(
        createDeploymentActiveResult(activeConflict, {
          checkedAt,
          error,
          latestCommit,
          pinnedFromCommitHash: latestDeployedCommitHash,
        })
      );
    }

    const deployFinishedAt = now();
    const history = await appendFailedDeploymentHistoryAndNotify(
      {
        buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
        commitHash: latestCommit.hash,
        commitShortHash: latestCommit.shortHash,
        commitSubject: latestCommit.subject,
        deploymentKind: 'rollback-pin',
        finishedAt: deployFinishedAt,
        pinnedBy: deploymentPin.requestedBy,
        pinnedByEmail: deploymentPin.requestedByEmail,
        startedAt: deployStartedAt,
        status: 'failed',
      },
      error,
      {
        env,
        fsImpl,
        log,
        paths,
        target,
      }
    );

    log.error?.(
      `Pinned rollback failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
    );

    return attachRuntime(
      {
        checkedAt,
        error,
        latestCommit,
        pinnedFromCommitHash: latestDeployedCommitHash,
        status: 'pin-deploy-failed',
      },
      history
    );
  }
}

async function runDeployWatchIteration(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    log = console,
    now = () => Date.now(),
    onDeploymentStart = () => {},
    paths = getWatchPaths(),
    processImpl = process,
    platformProjectDeploymentStatusUpdater = updatePlatformProjectDeploymentStatus,
    platformProjectReader = readPlatformProject,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const checkedAt = now();
  const updatePlatformProjectStatus = (payload) =>
    platformProjectDeploymentStatusUpdater({
      env,
      ...payload,
    });
  const attachRuntime = async (result, history = null) => {
    const snapshotNow = now();

    return {
      ...result,
      deploymentPin: readDeploymentPin(paths, fsImpl),
      ...(await loadRuntimeSnapshot({
        env,
        envFilePath,
        fsImpl,
        now: snapshotNow,
        paths,
        rootDir,
        runCommand: run,
        history,
      })),
    };
  };
  const timedOutBuild = await stopTimedOutDeploymentBuildIfNeeded({
    env,
    fsImpl,
    log,
    now,
    paths,
    processImpl,
    target,
  });

  if (
    timedOutBuild.action === 'terminated' ||
    timedOutBuild.action === 'self-cleared'
  ) {
    return attachRuntime({
      checkedAt,
      error: new Error(timedOutBuild.reason),
      status: 'deploy-failed',
    });
  }

  const deploymentPin = readDeploymentPin(paths, fsImpl);
  const deploymentRevertRequest = readDeploymentRevertRequest(paths, fsImpl);
  const activeDeploymentConflict = getActiveDeploymentConflict({
    env,
    fsImpl,
    now,
    paths,
    processImpl,
  });

  if (deploymentRevertRequest) {
    return runDeploymentRevertRequestIteration(
      target,
      deploymentRevertRequest,
      {
        activeDeploymentConflict,
        attachRuntime,
        checkedAt,
        deployCommand,
        env,
        envFilePath,
        fsImpl,
        log,
        now,
        onDeploymentStart,
        paths,
        platformProjectDeploymentStatusUpdater:
          updatePlatformProjectDeploymentStatus,
        platformProjectReader,
        processImpl,
        rootDir,
        runCommand: run,
      }
    );
  }

  if (activeDeploymentConflict) {
    logActiveDeploymentDeferralOnce(
      'Skipping watcher deployment poll because another deployment is already active',
      activeDeploymentConflict,
      { fsImpl, log, paths }
    );

    return attachRuntime(
      createDeploymentActiveResult(activeDeploymentConflict, { checkedAt })
    );
  }

  if (deploymentPin) {
    return runPinnedDeploymentIteration(target, deploymentPin, {
      deployCommand,
      env,
      envFilePath,
      fsImpl,
      log,
      now,
      onDeploymentStart,
      paths,
      platformProjectDeploymentStatusUpdater:
        updatePlatformProjectDeploymentStatus,
      platformProjectReader,
      rootDir,
      runCommand: run,
    });
  }

  const resetDisabled = isWatcherWorktreeResetDisabled(env);
  let currentBranch = await getCurrentBranchName({ env, runCommand: run });

  if (currentBranch === 'HEAD') {
    const hasBlockingDirtyWorktree = await hasDirtyWorktree({
      cwd: rootDir,
      env,
      runCommand: run,
    });

    if (hasBlockingDirtyWorktree && resetDisabled) {
      log.warn?.(
        `Skipping poll because the detached worktree has uncommitted changes before returning to ${target.branch}.`
      );
      return attachRuntime({
        checkedAt,
        status: 'dirty',
      });
    }

    if (hasBlockingDirtyWorktree) {
      log.warn?.(
        `Resetting detached watcher checkout before returning to ${target.branch}.`
      );
      await resetTrackedWorktreeChanges({
        cwd: rootDir,
        env,
        fsImpl,
        log,
        now,
        runCommand: run,
      });
      await removeUntrackedWorktreeFiles({
        cwd: rootDir,
        env,
        fsImpl,
        log,
        now,
        runCommand: run,
      });
    }

    log.info?.(
      `Deployment pin is clear. Checking out ${target.branch} and resuming normal upstream sync.`
    );
    await checkoutBranch(target.branch, {
      env,
      runCommand: run,
    });
    currentBranch = await getCurrentBranchName({ env, runCommand: run });
  }

  if (currentBranch !== target.branch) {
    throw new Error(
      `Current branch changed from ${target.branch} to ${currentBranch}. The watcher is locked to ${target.branch} and will stop.`
    );
  }

  const hasBlockingDirtyWorktree = await hasDirtyWorktree({
    cwd: rootDir,
    env,
    runCommand: run,
  });

  if (hasBlockingDirtyWorktree && resetDisabled) {
    log.warn?.(
      `Skipping poll because the worktree has uncommitted changes on ${target.branch}.`
    );
    return attachRuntime({
      checkedAt,
      status: 'dirty',
    });
  }

  try {
    const syncResult = resetDisabled
      ? null
      : await forceSyncWatcherWorktree(target, {
          env,
          fsImpl,
          log,
          now,
          rootDir,
          runCommand: run,
        });

    if (!syncResult) {
      await fetchTrackedBranch(target, {
        cwd: rootDir,
        env,
        fsImpl,
        log,
        now,
        runCommand: run,
      });
    }

    const localHead =
      syncResult?.localHead ??
      (await getRevision('HEAD', { env, runCommand: run }));
    const upstreamHead =
      syncResult?.upstreamHead ??
      (await getRevision(target.upstreamRef, {
        env,
        runCommand: run,
      }));

    if (localHead === upstreamHead) {
      const latestCommit = await getCommitMetadata('HEAD', {
        env,
        runCommand: run,
      });
      const latestDeployedCommitHash = getLatestSuccessfulDeploymentCommitHash(
        readDeploymentHistory(paths, fsImpl)
      );
      const deploymentHistory = readDeploymentHistory(paths, fsImpl);
      const failedDeploymentCount = getFailedDeploymentCountForCommit(
        deploymentHistory,
        latestCommit.hash
      );
      const platformProject = await platformProjectReader({ env });

      if (platformProject.deploymentStatus === 'queued') {
        if (
          hasReachedDeploymentFailureLimit(deploymentHistory, latestCommit.hash)
        ) {
          const parentDeploy =
            await resolveParentFallbackCommitForRetryLimitedHead(
              latestCommit,
              deploymentHistory,
              { env, runCommand: run }
            );

          if (!parentDeploy) {
            await updatePlatformProjectStatus({
              latestCommit,
              metadata: {
                failedDeploymentCount,
                retryLimitedAt: new Date(checkedAt).toISOString(),
              },
              status: 'failed',
            });
            logRetryLimitOnce(
              `Skipping queued platform deployment for ${latestCommit.shortHash} because it already failed ${failedDeploymentCount} deployment attempts.`,
              latestCommit.hash,
              { fsImpl, log, paths }
            );
            return attachRuntime({
              checkedAt,
              failedDeploymentCount,
              latestCommit,
              status: 'retry-limited',
            });
          }

          log.warn?.(
            `Queued platform deployment for ${latestCommit.shortHash} hit the deploy retry cap; deploying parent ${parentDeploy.shortHash} instead because it has no successful deployment yet.`
          );
          log.info?.(
            `Processing queued parent-fallback platform deployment for ${parentDeploy.shortHash}.`
          );
          await updatePlatformProjectStatus({
            latestCommit: parentDeploy,
            metadata: {
              buildStartedAt: new Date(checkedAt).toISOString(),
              commitHash: parentDeploy.hash,
              parentFallbackFromHead: latestCommit.hash,
              parentFallbackFromHeadShort: latestCommit.shortHash,
            },
            status: 'building',
          });

          try {
            const fb = await runDetachedCommitFullBlueGreenDeploy({
              afterBunBeforeDeploy: () =>
                updatePlatformProjectStatus({
                  latestCommit: parentDeploy,
                  metadata: {
                    commitHash: parentDeploy.hash,
                    deployStartedAt: new Date(now()).toISOString(),
                    parentFallbackFromHead: latestCommit.hash,
                  },
                  status: 'deploying',
                }),
              checkedAt,
              deployCommand,
              deployCommit: parentDeploy,
              deploymentKind: 'parent-fallback-manual',
              env,
              envFilePath,
              fsImpl,
              log,
              now,
              onDeploymentStart,
              paths,
              rootDir,
              runCommand: run,
              targetBranch: target.branch,
            });

            if (fb.buildLockConflict) {
              const activeConflict = getConflictFromDeploymentBuildLockError(
                fb.error,
                now
              );
              await updatePlatformProjectStatus({
                latestCommit: parentDeploy,
                metadata: {
                  deferredAt: new Date(now()).toISOString(),
                  deferredReason:
                    fb.error instanceof Error
                      ? fb.error.message
                      : String(fb.error),
                },
                status: 'queued',
              });
              logActiveDeploymentDeferralOnce(
                `Queued parent-fallback platform deployment for ${parentDeploy.shortHash} is waiting because another deployment is already active`,
                activeConflict,
                { fsImpl, log, paths }
              );

              return attachRuntime(
                createDeploymentActiveResult(activeConflict, {
                  branchTipCommit: latestCommit,
                  checkedAt,
                  error: fb.error,
                  latestCommit: parentDeploy,
                })
              );
            }

            if (!fb.success) {
              const fbError = fb.error;
              await updatePlatformProjectStatus({
                latestCommit: parentDeploy,
                metadata: {
                  error:
                    fbError instanceof Error
                      ? fbError.message
                      : String(fbError),
                  failedAt: new Date(now()).toISOString(),
                  parentFallbackFromHead: latestCommit.hash,
                },
                status: 'failed',
              });
              log.error?.(
                `Queued parent-fallback platform deployment failed for ${parentDeploy.shortHash}: ${fbError instanceof Error ? fbError.message : String(fbError)}`
              );

              return attachRuntime(
                {
                  branchTipCommit: latestCommit,
                  checkedAt,
                  error: fbError,
                  latestCommit: parentDeploy,
                  status: 'deploy-failed',
                },
                fb.history
              );
            }

            const migration = await finalizeComposeProjectMigrationIfRequested({
              env,
              log,
              now,
              rootDir,
              runCommand: run,
            });
            const parentDeployFinishedAt = now();
            const parentDeploymentStamp = readBlueGreenDeploymentStamp(
              paths.blueGreen,
              fsImpl
            );

            await updatePlatformProjectStatus({
              latestCommit: parentDeploy,
              metadata: {
                deployedAt: new Date(parentDeployFinishedAt).toISOString(),
                deployedCommitHash: parentDeploy.hash,
                deploymentStamp: parentDeploymentStamp,
                parentFallbackFromHead: latestCommit.hash,
              },
              status: 'ready',
            });
            log.info?.(
              `Queued parent-fallback platform deployment completed for ${parentDeploy.shortHash}.`
            );

            return attachRuntime(
              {
                branchTipCommit: latestCommit,
                checkedAt,
                latestCommit: parentDeploy,
                migration,
                status: 'deployed',
              },
              fb.history
            );
          } catch (error) {
            await updatePlatformProjectStatus({
              latestCommit: parentDeploy,
              metadata: {
                error: error instanceof Error ? error.message : String(error),
                failedAt: new Date(now()).toISOString(),
              },
              status: 'failed',
            });
            log.error?.(
              `Queued parent-fallback platform deployment failed before completion: ${error instanceof Error ? error.message : String(error)}`
            );

            return attachRuntime({
              branchTipCommit: latestCommit,
              checkedAt,
              error,
              latestCommit: parentDeploy,
              status: 'deploy-failed',
            });
          }
        }

        log.info?.(
          `Processing queued platform deployment for ${latestCommit.shortHash}.`
        );
        await updatePlatformProjectStatus({
          latestCommit,
          metadata: {
            buildStartedAt: new Date(checkedAt).toISOString(),
            commitHash: latestCommit.hash,
          },
          status: 'building',
        });
        await runBunFrozenInstall({
          env,
          runCommand: run,
        });

        const deployStartedAt = now();
        onDeploymentStart({
          checkedAt,
          latestCommit,
          pendingDeployment: createPendingDeploymentEntry({
            deploymentKind: 'manual',
            latestCommit,
            startedAt: deployStartedAt,
            status: 'deploying',
          }),
        });

        try {
          await updatePlatformProjectStatus({
            latestCommit,
            metadata: {
              deployStartedAt: new Date(deployStartedAt).toISOString(),
              commitHash: latestCommit.hash,
            },
            status: 'deploying',
          });
          await runBlueGreenDeploy({
            deploymentKind: 'queued',
            deployCommand,
            env,
            fsImpl,
            latestCommit,
            now,
            paths,
            runCommand: run,
          });

          const deployFinishedAt = now();
          const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
          const deploymentStamp = readBlueGreenDeploymentStamp(
            paths.blueGreen,
            fsImpl
          );
          const imageTag = await cacheBlueGreenDeploymentImage({
            activeColor,
            env,
            envFilePath,
            fsImpl,
            latestCommit,
            log,
            rootDir,
            runCommand: run,
          });
          const history = appendDeploymentHistory(
            {
              activatedAt: deployFinishedAt,
              activeColor,
              buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              commitSubject: latestCommit.subject,
              deploymentKind: 'manual',
              deploymentStamp,
              finishedAt: deployFinishedAt,
              ...(imageTag ? { imageTag } : {}),
              startedAt: deployStartedAt,
              status: 'successful',
            },
            {
              fsImpl,
              paths,
            }
          );
          await pruneBlueGreenRecoveryCacheImages(history, {
            env,
            extraImageTag: imageTag,
            log,
            runCommand: run,
          });
          const migration = await finalizeComposeProjectMigrationIfRequested({
            env,
            log,
            now,
            rootDir,
            runCommand: run,
          });
          await updatePlatformProjectStatus({
            latestCommit,
            metadata: {
              deployedAt: new Date(deployFinishedAt).toISOString(),
              deployedCommitHash: latestCommit.hash,
              deploymentStamp,
            },
            status: 'ready',
          });

          log.info?.(
            `Queued platform deployment completed for ${latestCommit.shortHash}.`
          );

          return attachRuntime(
            {
              checkedAt,
              latestCommit,
              migration,
              status: 'deployed',
            },
            history
          );
        } catch (error) {
          if (error instanceof DeploymentBuildLockConflictError) {
            const activeConflict = getConflictFromDeploymentBuildLockError(
              error,
              now
            );
            await updatePlatformProjectStatus({
              latestCommit,
              metadata: {
                deferredAt: new Date(now()).toISOString(),
                deferredReason:
                  error instanceof Error ? error.message : String(error),
              },
              status: 'queued',
            });
            logActiveDeploymentDeferralOnce(
              `Queued platform deployment for ${latestCommit.shortHash} is waiting because another deployment is already active`,
              activeConflict,
              { fsImpl, log, paths }
            );

            return attachRuntime(
              createDeploymentActiveResult(activeConflict, {
                checkedAt,
                error,
                latestCommit,
              })
            );
          }

          const deployFinishedAt = now();
          const history = await appendFailedDeploymentHistoryAndNotify(
            {
              buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              commitSubject: latestCommit.subject,
              deploymentKind: 'manual',
              finishedAt: deployFinishedAt,
              startedAt: deployStartedAt,
              status: 'failed',
            },
            error,
            {
              env,
              fsImpl,
              log,
              paths,
              target,
            }
          );
          await updatePlatformProjectStatus({
            latestCommit,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              failedAt: new Date(deployFinishedAt).toISOString(),
            },
            status: 'failed',
          });

          log.error?.(
            `Queued platform deployment failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
          );

          return attachRuntime(
            {
              checkedAt,
              error,
              latestCommit,
              status: 'deploy-failed',
            },
            history
          );
        }
      }

      const runtimeSnapshot = await attachRuntime({
        checkedAt,
        latestCommit,
        status: 'up-to-date',
      });

      if (needsActiveRuntimeRecovery(runtimeSnapshot)) {
        if (
          hasReachedDeploymentFailureLimit(deploymentHistory, latestCommit.hash)
        ) {
          const parentDeploy =
            await resolveParentFallbackCommitForRetryLimitedHead(
              latestCommit,
              deploymentHistory,
              { env, runCommand: run }
            );

          if (!parentDeploy) {
            logRetryLimitOnce(
              `Skipping blue/green runtime recovery for ${latestCommit.shortHash} because it already failed ${failedDeploymentCount} deployment attempts.`,
              latestCommit.hash,
              { fsImpl, log, paths }
            );
            return attachRuntime({
              checkedAt,
              failedDeploymentCount,
              latestCommit,
              status: 'retry-limited',
            });
          }

          log.warn?.(
            `Blue/green runtime recovery for ${latestCommit.shortHash} hit the deploy retry cap; recovering from parent ${parentDeploy.shortHash} instead because it has no successful deployment yet.`
          );
          await checkoutRevision(parentDeploy.hash, { env, runCommand: run });

          try {
            const recoveryResult = await runMissingActiveDeploymentRecovery(
              parentDeploy,
              {
                attachRuntime,
                checkedAt,
                deployCommand,
                env,
                envFilePath,
                fsImpl,
                log,
                now,
                onDeploymentStart,
                paths,
                rootDir,
                runCommand: run,
                runtimeSnapshot,
              }
            );

            return {
              ...recoveryResult,
              branchTipCommit: latestCommit,
            };
          } finally {
            await checkoutBranch(target.branch, { env, runCommand: run });
          }
        }

        return runMissingActiveDeploymentRecovery(latestCommit, {
          attachRuntime,
          checkedAt,
          deployCommand,
          env,
          envFilePath,
          fsImpl,
          log,
          now,
          onDeploymentStart,
          paths,
          processImpl,
          rootDir,
          runCommand: run,
          runtimeSnapshot,
        });
      }

      if (
        latestDeployedCommitHash &&
        latestCommit.hash &&
        latestCommit.hash !== latestDeployedCommitHash
      ) {
        if (
          hasReachedDeploymentFailureLimit(deploymentHistory, latestCommit.hash)
        ) {
          const parentDeploy =
            await resolveParentFallbackCommitForRetryLimitedHead(
              latestCommit,
              deploymentHistory,
              { env, runCommand: run }
            );

          if (!parentDeploy) {
            logRetryLimitOnce(
              `Skipping reconciliation deploy for ${latestCommit.shortHash} because it already failed ${failedDeploymentCount} deployment attempts.`,
              latestCommit.hash,
              { fsImpl, log, paths }
            );
            return attachRuntime({
              checkedAt,
              failedDeploymentCount,
              latestCommit,
              reconciledFromCommitHash: latestDeployedCommitHash,
              status: 'retry-limited',
            });
          }

          log.warn?.(
            `Reconciliation for ${latestCommit.shortHash} hit the deploy retry cap; reconciling from parent ${parentDeploy.shortHash} instead because it has no successful deployment yet.`
          );
          log.warn?.(
            `Latest successful deployment is ${latestDeployedCommitHash ? latestDeployedCommitHash.slice(0, 12) : 'missing'}. Rebuilding ${parentDeploy.shortHash} to reconcile runtime drift.`
          );

          const fb = await runDetachedCommitFullBlueGreenDeploy({
            checkedAt,
            deployCommand,
            deployCommit: parentDeploy,
            deploymentKind: 'parent-fallback-reconcile',
            env,
            envFilePath,
            fsImpl,
            log,
            now,
            onDeploymentStart,
            paths,
            pendingDeploymentStatus: 'building',
            rootDir,
            runCommand: run,
            targetBranch: target.branch,
          });

          if (fb.buildLockConflict) {
            const activeConflict = getConflictFromDeploymentBuildLockError(
              fb.error,
              now
            );
            logActiveDeploymentDeferralOnce(
              `Parent-fallback reconciliation for ${parentDeploy.shortHash} is waiting because another deployment is already active`,
              activeConflict,
              { fsImpl, log, paths }
            );

            return attachRuntime(
              createDeploymentActiveResult(activeConflict, {
                branchTipCommit: latestCommit,
                checkedAt,
                error: fb.error,
                latestCommit: parentDeploy,
                reconciledFromCommitHash: latestDeployedCommitHash,
              })
            );
          }

          if (!fb.success) {
            log.error?.(
              `Blue/green parent-fallback reconciliation deployment failed for ${parentDeploy.shortHash}: ${fb.error instanceof Error ? fb.error.message : String(fb.error)}`
            );

            return attachRuntime(
              {
                branchTipCommit: latestCommit,
                checkedAt,
                error: fb.error,
                latestCommit: parentDeploy,
                reconciledFromCommitHash: latestDeployedCommitHash,
                status: 'deploy-failed',
              },
              fb.history
            );
          }

          const migration = await finalizeComposeProjectMigrationIfRequested({
            env,
            log,
            now,
            rootDir,
            runCommand: run,
          });
          log.info?.(
            `Blue/green parent-fallback reconciliation deployment completed for ${parentDeploy.shortHash}.`
          );

          return attachRuntime(
            {
              branchTipCommit: latestCommit,
              checkedAt,
              latestCommit: parentDeploy,
              migration,
              reconciledFromCommitHash: latestDeployedCommitHash,
              status: 'deployed',
            },
            fb.history
          );
        }

        log.warn?.(
          `Latest successful deployment is ${latestDeployedCommitHash ? latestDeployedCommitHash.slice(0, 12) : 'missing'}. Rebuilding ${latestCommit.shortHash} to reconcile runtime drift.`
        );
        log.info?.(
          `Installing dependencies from the reviewed frozen lockfile for ${latestCommit.shortHash} before reconciliation deploy.`
        );

        await runBunFrozenInstall({
          env,
          runCommand: run,
        });

        const deployStartedAt = now();
        onDeploymentStart({
          checkedAt,
          latestCommit,
          pendingDeployment: createPendingDeploymentEntry({
            deploymentKind: 'reconcile',
            latestCommit,
            startedAt: deployStartedAt,
            status: 'building',
          }),
        });

        try {
          await runBlueGreenDeploy({
            deploymentKind: 'reconcile',
            deployCommand,
            env,
            fsImpl,
            latestCommit,
            now,
            paths,
            runCommand: run,
          });

          const deployFinishedAt = now();
          const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
          const deploymentStamp = readBlueGreenDeploymentStamp(
            paths.blueGreen,
            fsImpl
          );
          const imageTag = await cacheBlueGreenDeploymentImage({
            activeColor,
            env,
            envFilePath,
            fsImpl,
            latestCommit,
            log,
            rootDir,
            runCommand: run,
          });
          const history = appendDeploymentHistory(
            {
              activatedAt: deployFinishedAt,
              activeColor,
              buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              commitSubject: latestCommit.subject,
              deploymentKind: 'reconcile',
              deploymentStamp,
              finishedAt: deployFinishedAt,
              ...(imageTag ? { imageTag } : {}),
              startedAt: deployStartedAt,
              status: 'successful',
            },
            {
              fsImpl,
              paths,
            }
          );
          await pruneBlueGreenRecoveryCacheImages(history, {
            env,
            extraImageTag: imageTag,
            log,
            runCommand: run,
          });
          const migration = await finalizeComposeProjectMigrationIfRequested({
            env,
            log,
            now,
            rootDir,
            runCommand: run,
          });

          log.info?.(
            `Blue/green reconciliation deployment completed for ${latestCommit.shortHash}.`
          );

          return attachRuntime(
            {
              checkedAt,
              latestCommit,
              migration,
              reconciledFromCommitHash: latestDeployedCommitHash,
              status: 'deployed',
            },
            history
          );
        } catch (error) {
          if (error instanceof DeploymentBuildLockConflictError) {
            const activeConflict = getConflictFromDeploymentBuildLockError(
              error,
              now
            );
            logActiveDeploymentDeferralOnce(
              `Reconciliation for ${latestCommit.shortHash} is waiting because another deployment is already active`,
              activeConflict,
              { fsImpl, log, paths }
            );

            return attachRuntime(
              createDeploymentActiveResult(activeConflict, {
                checkedAt,
                error,
                latestCommit,
                reconciledFromCommitHash: latestDeployedCommitHash,
              })
            );
          }

          const deployFinishedAt = now();
          const history = await appendFailedDeploymentHistoryAndNotify(
            {
              buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              commitSubject: latestCommit.subject,
              deploymentKind: 'reconcile',
              finishedAt: deployFinishedAt,
              startedAt: deployStartedAt,
              status: 'failed',
            },
            error,
            {
              env,
              fsImpl,
              log,
              paths,
              target,
            }
          );

          log.error?.(
            `Blue/green reconciliation deployment failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
          );

          return attachRuntime(
            {
              checkedAt,
              error,
              latestCommit,
              reconciledFromCommitHash: latestDeployedCommitHash,
              status: 'deploy-failed',
            },
            history
          );
        }
      }

      const instantRolloutRequest = readInstantRolloutRequest(paths, fsImpl);
      const standbyRefreshCandidate = getStandbyRefreshCandidate(
        runtimeSnapshot,
        latestCommit,
        {
          now: checkedAt,
          refreshAfterMs: instantRolloutRequest ? 0 : undefined,
        }
      );

      if (!standbyRefreshCandidate) {
        if (instantRolloutRequest) {
          clearInstantRolloutRequest({
            fsImpl,
            paths,
          });

          const standbyDeployment = getRuntimeDeployment(
            runtimeSnapshot.deployments,
            'standby'
          );

          if (
            standbyDeployment?.commitHash &&
            latestCommit.hash &&
            standbyDeployment.commitHash === latestCommit.hash
          ) {
            log.info?.(
              `Ignoring instant standby sync from ${formatInstantRolloutRequester(instantRolloutRequest)} because the standby deployment already matches ${latestCommit.shortHash}.`
            );
          } else {
            log.warn?.(
              `Ignoring instant standby sync from ${formatInstantRolloutRequester(instantRolloutRequest)} because the blue/green runtime is not ready for a standby refresh.`
            );
          }
        }

        const migration = await finalizeComposeProjectMigrationIfRequested({
          env,
          log,
          now,
          rootDir,
          runCommand: run,
        });

        return {
          ...runtimeSnapshot,
          migration,
        };
      }

      if (
        hasReachedDeploymentFailureLimit(deploymentHistory, latestCommit.hash)
      ) {
        const parentDeploy =
          await resolveParentFallbackCommitForRetryLimitedHead(
            latestCommit,
            deploymentHistory,
            { env, runCommand: run }
          );

        if (!parentDeploy) {
          logRetryLimitOnce(
            `Skipping standby refresh for ${latestCommit.shortHash} because it already failed ${failedDeploymentCount} deployment attempts.`,
            latestCommit.hash,
            { fsImpl, log, paths }
          );
          return attachRuntime({
            checkedAt,
            failedDeploymentCount,
            latestCommit,
            status: 'retry-limited',
          });
        }

        log.warn?.(
          `Standby refresh for ${latestCommit.shortHash} hit the deploy retry cap; refreshing standby ${standbyRefreshCandidate.standbyColor} to parent ${parentDeploy.shortHash} instead because it has no successful deployment yet.`
        );
        log.info?.(
          instantRolloutRequest
            ? `Refreshing standby ${standbyRefreshCandidate.standbyColor} to ${parentDeploy.shortHash} immediately for ${formatInstantRolloutRequester(instantRolloutRequest)}.`
            : `Refreshing standby ${standbyRefreshCandidate.standbyColor} to ${parentDeploy.shortHash} after the 15 minute stale window.`
        );

        const sb = await runDetachedParentFallbackStandbyRefresh({
          checkedAt,
          deployCommit: parentDeploy,
          env,
          envFilePath,
          fsImpl,
          log,
          now,
          onDeploymentStart,
          paths,
          rootDir,
          runCommand: run,
          standbyRefreshCandidate,
          targetBranch: target.branch,
        });

        if (sb.buildLockConflict) {
          return attachRuntime({
            activeDeploymentConflict: describeActiveDeploymentConflict(
              sb.error?.conflict
            ),
            branchTipCommit: latestCommit,
            checkedAt,
            latestCommit: parentDeploy,
            status: 'deployment-active',
          });
        }

        if (!sb.success) {
          log.error?.(
            `Standby ${standbyRefreshCandidate.standbyColor} parent-fallback refresh failed for ${parentDeploy.shortHash}: ${sb.error instanceof Error ? sb.error.message : String(sb.error)}`
          );

          if (instantRolloutRequest) {
            clearInstantRolloutRequest({
              fsImpl,
              paths,
            });
          }

          return attachRuntime(
            {
              branchTipCommit: latestCommit,
              checkedAt,
              error: sb.error,
              latestCommit: parentDeploy,
              status: 'standby-refresh-failed',
            },
            sb.history
          );
        }

        const migration = await finalizeComposeProjectMigrationIfRequested({
          env,
          log,
          now,
          rootDir,
          runCommand: run,
        });
        log.info?.(
          `Standby ${standbyRefreshCandidate.standbyColor} now matches ${parentDeploy.shortHash}.`
        );

        if (instantRolloutRequest) {
          clearInstantRolloutRequest({
            fsImpl,
            paths,
          });
        }

        return attachRuntime(
          {
            branchTipCommit: latestCommit,
            checkedAt,
            latestCommit: parentDeploy,
            migration,
            status: 'standby-refreshed',
          },
          sb.history
        );
      }

      log.info?.(
        instantRolloutRequest
          ? `Refreshing standby ${standbyRefreshCandidate.standbyColor} to ${latestCommit.shortHash} immediately for ${formatInstantRolloutRequester(instantRolloutRequest)}.`
          : `Refreshing standby ${standbyRefreshCandidate.standbyColor} to ${latestCommit.shortHash} after the 15 minute stale window.`
      );

      const refreshStartedAt = now();
      onDeploymentStart({
        checkedAt,
        latestCommit,
        pendingDeployment: createPendingDeploymentEntry({
          activeColor: standbyRefreshCandidate.standbyColor,
          deploymentKind: 'standby-refresh',
          latestCommit,
          startedAt: refreshStartedAt,
          status: 'building',
        }),
      });

      try {
        const changedFiles = await getChangedFilesForBuildScope({
          env,
          fromCommitHash: standbyRefreshCandidate.standbyDeployment?.commitHash,
          rootDir,
          runCommand: run,
          toCommitHash: latestCommit.hash,
        });

        await runBlueGreenStandbyRefresh({
          changedFiles,
          env,
          envFilePath,
          fsImpl,
          latestCommit,
          now,
          paths,
          rootDir,
          runCommand: run,
        });

        const refreshFinishedAt = now();
        const deploymentStamp = readBlueGreenDeploymentStamp(
          paths.blueGreen,
          fsImpl
        );
        const imageTag = await cacheBlueGreenDeploymentImage({
          activeColor: standbyRefreshCandidate.standbyColor,
          env,
          envFilePath,
          fsImpl,
          latestCommit,
          log,
          rootDir,
          runCommand: run,
        });
        const history = appendDeploymentHistory(
          {
            activatedAt: refreshFinishedAt,
            activeColor: standbyRefreshCandidate.standbyColor,
            buildDurationMs: Math.max(0, refreshFinishedAt - refreshStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            deploymentKind: 'standby-refresh',
            deploymentStamp,
            finishedAt: refreshFinishedAt,
            ...(imageTag ? { imageTag } : {}),
            startedAt: refreshStartedAt,
            status: 'successful',
          },
          {
            fsImpl,
            paths,
          }
        );
        await pruneBlueGreenRecoveryCacheImages(history, {
          env,
          extraImageTag: imageTag,
          log,
          runCommand: run,
        });
        const migration = await finalizeComposeProjectMigrationIfRequested({
          env,
          log,
          now,
          rootDir,
          runCommand: run,
        });

        log.info?.(
          `Standby ${standbyRefreshCandidate.standbyColor} now matches ${latestCommit.shortHash}.`
        );

        if (instantRolloutRequest) {
          clearInstantRolloutRequest({
            fsImpl,
            paths,
          });
        }

        return attachRuntime(
          {
            checkedAt,
            latestCommit,
            migration,
            status: 'standby-refreshed',
          },
          history
        );
      } catch (error) {
        if (error instanceof DeploymentBuildLockConflictError) {
          const activeConflict = getConflictFromDeploymentBuildLockError(
            error,
            now
          );
          logActiveDeploymentDeferralOnce(
            `Standby ${standbyRefreshCandidate.standbyColor} refresh for ${latestCommit.shortHash} is waiting because another deployment is already active`,
            activeConflict,
            { fsImpl, log, paths }
          );

          return attachRuntime(
            createDeploymentActiveResult(activeConflict, {
              checkedAt,
              error,
              latestCommit,
            })
          );
        }

        const refreshFinishedAt = now();
        const history = await appendFailedDeploymentHistoryAndNotify(
          {
            activeColor: standbyRefreshCandidate.standbyColor,
            buildDurationMs: Math.max(0, refreshFinishedAt - refreshStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            deploymentKind: 'standby-refresh',
            finishedAt: refreshFinishedAt,
            startedAt: refreshStartedAt,
            status: 'failed',
          },
          error,
          {
            env,
            fsImpl,
            log,
            paths,
            target,
          }
        );

        log.error?.(
          `Standby ${standbyRefreshCandidate.standbyColor} refresh failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
        );

        if (instantRolloutRequest) {
          clearInstantRolloutRequest({
            fsImpl,
            paths,
          });
        }

        return attachRuntime(
          {
            checkedAt,
            error,
            latestCommit,
            status: 'standby-refresh-failed',
          },
          history
        );
      }
    }

    const shouldDeploySyncedHead = syncResult
      ? syncResult.updatedHead !== syncResult.localHead
      : await isAncestor(localHead, upstreamHead, { env, runCommand: run });

    if (shouldDeploySyncedHead) {
      if (!syncResult) {
        await pullTrackedBranch(target, {
          env,
          fsImpl,
          log,
          now,
          rootDir,
          runCommand: run,
        });
      }

      const updatedHead =
        syncResult?.updatedHead ??
        (await getRevision('HEAD', { env, runCommand: run }));

      if (updatedHead === localHead) {
        return attachRuntime({
          checkedAt,
          latestCommit: await getCommitMetadata('HEAD', {
            env,
            runCommand: run,
          }),
          status: 'up-to-date',
        });
      }

      const containerRefreshRequired = await hasWatchedScriptChanges(
        localHead,
        updatedHead,
        {
          env,
          relativePaths: CONTAINER_REFRESH_WATCHED_FILES,
          runCommand: run,
        }
      );
      const restartRequired = await hasWatchedScriptChanges(
        localHead,
        updatedHead,
        {
          env,
          runCommand: run,
        }
      );
      const latestCommit = await getCommitMetadata('HEAD', {
        env,
        runCommand: run,
      });
      const platformProject = await platformProjectReader({ env });
      const shouldUpdatePlatformProject =
        platformProject.source === 'database' ||
        platformProject.deploymentStatus === 'queued';
      const deploymentHistory = readDeploymentHistory(paths, fsImpl);
      const failedDeploymentCount = getFailedDeploymentCountForCommit(
        deploymentHistory,
        latestCommit.hash
      );

      log.info?.(
        `${syncResult ? 'Synced' : 'Pulled'} ${target.branch} from ${localHead.slice(
          0,
          12
        )} to ${updatedHead.slice(0, 12)}.`
      );

      log.info?.(
        `Installing dependencies from the reviewed frozen lockfile for ${updatedHead.slice(0, 12)}.`
      );

      if (
        hasReachedDeploymentFailureLimit(deploymentHistory, latestCommit.hash)
      ) {
        const parentDeploy =
          await resolveParentFallbackCommitForRetryLimitedHead(
            latestCommit,
            deploymentHistory,
            { env, runCommand: run }
          );

        if (!parentDeploy) {
          if (shouldUpdatePlatformProject) {
            await updatePlatformProjectStatus({
              latestCommit,
              metadata: {
                failedDeploymentCount,
                retryLimitedAt: new Date(checkedAt).toISOString(),
              },
              status: 'failed',
            });
          }
          logRetryLimitOnce(
            `Skipping deployment for ${latestCommit.shortHash} because it already failed ${failedDeploymentCount} deployment attempts.`,
            latestCommit.hash,
            { fsImpl, log, paths }
          );
          return attachRuntime({
            checkedAt,
            failedDeploymentCount,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            status: 'retry-limited',
          });
        }

        log.warn?.(
          `Fast-forward deployment for ${latestCommit.shortHash} hit the deploy retry cap; deploying parent ${parentDeploy.shortHash} instead because it has no successful deployment yet.`
        );

        if (shouldUpdatePlatformProject) {
          await updatePlatformProjectStatus({
            latestCommit: parentDeploy,
            metadata: {
              buildStartedAt: new Date(checkedAt).toISOString(),
              commitHash: parentDeploy.hash,
              oldHead: localHead,
              parentFallbackFromHead: latestCommit.hash,
              parentFallbackFromHeadShort: latestCommit.shortHash,
            },
            status: 'building',
          });
        }

        try {
          const fb = await runDetachedCommitFullBlueGreenDeploy({
            afterBunBeforeDeploy: shouldUpdatePlatformProject
              ? () =>
                  updatePlatformProjectStatus({
                    latestCommit: parentDeploy,
                    metadata: {
                      commitHash: parentDeploy.hash,
                      deployStartedAt: new Date(now()).toISOString(),
                      oldHead: localHead,
                      parentFallbackFromHead: latestCommit.hash,
                    },
                    status: 'deploying',
                  })
              : null,
            checkedAt,
            deployCommand,
            deployCommit: parentDeploy,
            deploymentKind: 'parent-fallback-promotion',
            env,
            envFilePath,
            fsImpl,
            log,
            now,
            onDeploymentStart,
            paths,
            rootDir,
            runCommand: run,
            targetBranch: target.branch,
          });

          if (fb.buildLockConflict) {
            const activeConflict = getConflictFromDeploymentBuildLockError(
              fb.error,
              now
            );
            if (shouldUpdatePlatformProject) {
              await updatePlatformProjectStatus({
                latestCommit: parentDeploy,
                metadata: {
                  deferredAt: new Date(now()).toISOString(),
                  deferredReason:
                    fb.error instanceof Error
                      ? fb.error.message
                      : String(fb.error),
                  parentFallbackFromHead: latestCommit.hash,
                },
                status: 'queued',
              });
            }
            logActiveDeploymentDeferralOnce(
              `Parent-fallback deployment for ${parentDeploy.shortHash} is waiting because another deployment is already active`,
              activeConflict,
              { fsImpl, log, paths }
            );

            return attachRuntime(
              createDeploymentActiveResult(activeConflict, {
                branchTipCommit: latestCommit,
                checkedAt,
                error: fb.error,
                latestCommit: parentDeploy,
                newHead: updatedHead,
                oldHead: localHead,
              })
            );
          }

          if (!fb.success) {
            if (shouldUpdatePlatformProject) {
              await updatePlatformProjectStatus({
                latestCommit: parentDeploy,
                metadata: {
                  error:
                    fb.error instanceof Error
                      ? fb.error.message
                      : String(fb.error),
                  failedAt: new Date(now()).toISOString(),
                  parentFallbackFromHead: latestCommit.hash,
                },
                status: 'failed',
              });
            }
            log.error?.(
              `Blue/green parent-fallback deployment failed for ${parentDeploy.shortHash}: ${fb.error instanceof Error ? fb.error.message : String(fb.error)}`
            );

            return attachRuntime(
              {
                branchTipCommit: latestCommit,
                checkedAt,
                error: fb.error,
                latestCommit: parentDeploy,
                newHead: updatedHead,
                oldHead: localHead,
                status: 'deploy-failed',
              },
              fb.history
            );
          }

          const migration = await finalizeComposeProjectMigrationIfRequested({
            env,
            log,
            now,
            rootDir,
            runCommand: run,
          });
          const deployFinishedAt = now();
          const parentDeploymentStamp = readBlueGreenDeploymentStamp(
            paths.blueGreen,
            fsImpl
          );

          if (shouldUpdatePlatformProject) {
            await updatePlatformProjectStatus({
              latestCommit: parentDeploy,
              metadata: {
                deployedAt: new Date(deployFinishedAt).toISOString(),
                deployedCommitHash: parentDeploy.hash,
                deploymentStamp: parentDeploymentStamp,
                oldHead: localHead,
                parentFallbackFromHead: latestCommit.hash,
              },
              status: 'ready',
            });
          }

          log.info?.(
            `Blue/green parent-fallback deployment completed for ${parentDeploy.shortHash}.`
          );

          return attachRuntime(
            {
              branchTipCommit: latestCommit,
              checkedAt,
              containerRefreshRequired: false,
              latestCommit: parentDeploy,
              migration,
              newHead: updatedHead,
              oldHead: localHead,
              restartRequired: false,
              status: 'deployed',
            },
            fb.history
          );
        } catch (error) {
          if (shouldUpdatePlatformProject) {
            await updatePlatformProjectStatus({
              latestCommit: parentDeploy,
              metadata: {
                error: error instanceof Error ? error.message : String(error),
                failedAt: new Date(now()).toISOString(),
              },
              status: 'failed',
            });
          }

          return attachRuntime({
            branchTipCommit: latestCommit,
            checkedAt,
            error,
            latestCommit: parentDeploy,
            newHead: updatedHead,
            oldHead: localHead,
            status: 'deploy-failed',
          });
        }
      }

      if (shouldUpdatePlatformProject) {
        await updatePlatformProjectStatus({
          latestCommit,
          metadata: {
            buildStartedAt: new Date(checkedAt).toISOString(),
            commitHash: latestCommit.hash,
            oldHead: localHead,
          },
          status: 'building',
        });
      }

      await runBunFrozenInstall({
        env,
        runCommand: run,
      });

      const deployStartedAt = now();
      onDeploymentStart({
        checkedAt,
        latestCommit,
        pendingDeployment: createPendingDeploymentEntry({
          latestCommit,
          startedAt: deployStartedAt,
          status: 'deploying',
        }),
      });

      try {
        if (containerRefreshRequired) {
          writePendingDeployRequest(
            {
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              reason: 'container-refresh',
              requestedAt: new Date(checkedAt).toISOString(),
            },
            {
              fsImpl,
              paths,
            }
          );
          log.warn?.(
            'Watcher container runtime changed in the pulled revision. Recreating the watcher container before deployment.'
          );
          if (shouldUpdatePlatformProject) {
            await updatePlatformProjectStatus({
              latestCommit,
              metadata: {
                pendingRestartAt: new Date(checkedAt).toISOString(),
                pendingRestartReason: 'container-refresh',
              },
              status: 'queued',
            });
          }

          return attachRuntime({
            checkedAt,
            containerRefreshRequired,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            restartRequired: false,
            status: 'restarting',
          });
        }

        if (restartRequired) {
          writePendingDeployRequest(
            {
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              reason: 'process-restart',
              requestedAt: new Date(checkedAt).toISOString(),
            },
            {
              fsImpl,
              paths,
            }
          );
          log.warn?.(
            'Watcher script changed in the pulled revision. Restarting watcher before deployment.'
          );
          if (shouldUpdatePlatformProject) {
            await updatePlatformProjectStatus({
              latestCommit,
              metadata: {
                pendingRestartAt: new Date(checkedAt).toISOString(),
                pendingRestartReason: 'process-restart',
              },
              status: 'queued',
            });
          }

          return attachRuntime({
            checkedAt,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            containerRefreshRequired: false,
            restartRequired,
            status: 'restarting',
          });
        }

        log.info?.(
          `Starting blue/green deployment for ${updatedHead.slice(0, 12)}.`
        );

        if (shouldUpdatePlatformProject) {
          await updatePlatformProjectStatus({
            latestCommit,
            metadata: {
              deployStartedAt: new Date(deployStartedAt).toISOString(),
              commitHash: latestCommit.hash,
              oldHead: localHead,
            },
            status: 'deploying',
          });
        }

        await runBlueGreenDeploy({
          deploymentKind: 'promotion',
          deployCommand,
          env,
          fsImpl,
          latestCommit,
          now,
          paths,
          runCommand: run,
        });

        const deployFinishedAt = now();
        const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
        const deploymentStamp = readBlueGreenDeploymentStamp(
          paths.blueGreen,
          fsImpl
        );
        const imageTag = await cacheBlueGreenDeploymentImage({
          activeColor,
          env,
          envFilePath,
          fsImpl,
          latestCommit,
          log,
          rootDir,
          runCommand: run,
        });
        const history = appendDeploymentHistory(
          {
            activatedAt: deployFinishedAt,
            activeColor,
            buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            deploymentStamp,
            finishedAt: deployFinishedAt,
            ...(imageTag ? { imageTag } : {}),
            startedAt: deployStartedAt,
            status: 'successful',
          },
          {
            fsImpl,
            paths,
          }
        );
        await pruneBlueGreenRecoveryCacheImages(history, {
          env,
          extraImageTag: imageTag,
          log,
          runCommand: run,
        });
        const migration = await finalizeComposeProjectMigrationIfRequested({
          env,
          log,
          now,
          rootDir,
          runCommand: run,
        });
        if (shouldUpdatePlatformProject) {
          await updatePlatformProjectStatus({
            latestCommit,
            metadata: {
              deployedAt: new Date(deployFinishedAt).toISOString(),
              deployedCommitHash: latestCommit.hash,
              deploymentStamp,
              oldHead: localHead,
            },
            status: 'ready',
          });
        }

        log.info?.(
          `Blue/green deployment completed for ${updatedHead.slice(0, 12)}.`
        );

        return attachRuntime(
          {
            checkedAt,
            containerRefreshRequired: false,
            latestCommit,
            migration,
            newHead: updatedHead,
            oldHead: localHead,
            restartRequired: false,
            status: 'deployed',
          },
          history
        );
      } catch (error) {
        if (error instanceof DeploymentBuildLockConflictError) {
          const activeConflict = getConflictFromDeploymentBuildLockError(
            error,
            now
          );
          if (shouldUpdatePlatformProject) {
            await updatePlatformProjectStatus({
              latestCommit,
              metadata: {
                deferredAt: new Date(now()).toISOString(),
                deferredReason:
                  error instanceof Error ? error.message : String(error),
                oldHead: localHead,
              },
              status: 'queued',
            });
          }
          logActiveDeploymentDeferralOnce(
            `Blue/green deployment for ${updatedHead.slice(0, 12)} is waiting because another deployment is already active`,
            activeConflict,
            { fsImpl, log, paths }
          );

          return attachRuntime(
            createDeploymentActiveResult(activeConflict, {
              checkedAt,
              containerRefreshRequired: false,
              error,
              latestCommit,
              newHead: updatedHead,
              oldHead: localHead,
              restartRequired: false,
            })
          );
        }

        const deployFinishedAt = now();
        const history = await appendFailedDeploymentHistoryAndNotify(
          {
            buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            deploymentKind: 'promotion',
            finishedAt: deployFinishedAt,
            startedAt: deployStartedAt,
            status: 'failed',
          },
          error,
          {
            env,
            fsImpl,
            log,
            paths,
            target,
          }
        );

        log.error?.(
          `Blue/green deployment failed for ${updatedHead.slice(0, 12)}: ${error instanceof Error ? error.message : String(error)}`
        );
        if (shouldUpdatePlatformProject) {
          await updatePlatformProjectStatus({
            latestCommit,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              failedAt: new Date(deployFinishedAt).toISOString(),
              oldHead: localHead,
            },
            status: 'failed',
          });
        }

        return attachRuntime(
          {
            checkedAt,
            containerRefreshRequired: false,
            error,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            restartRequired: false,
            status: 'deploy-failed',
          },
          history
        );
      }
    }

    if (
      !syncResult &&
      (await isAncestor(upstreamHead, localHead, { env, runCommand: run }))
    ) {
      log.warn?.(
        `Local branch ${target.branch} is ahead of ${target.upstreamRef}; skipping auto-pull.`
      );
      return attachRuntime({
        checkedAt,
        latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
        status: 'ahead',
      });
    }

    if (syncResult) {
      return attachRuntime({
        checkedAt,
        latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
        status: 'up-to-date',
      });
    }

    log.warn?.(
      `Local branch ${target.branch} diverged from ${target.upstreamRef}; skipping auto-pull.`
    );
    return attachRuntime({
      checkedAt,
      latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
      status: 'diverged',
    });
  } catch (error) {
    if (!isRecoverableGitCommandError(error)) {
      throw error;
    }

    log.warn?.(
      `Git polling failed on ${target.branch}: ${error instanceof Error ? error.message : String(error)}`
    );

    let latestCommit = null;
    try {
      latestCommit = await getCommitMetadata('HEAD', {
        env,
        runCommand: run,
      });
    } catch {}

    return attachRuntime({
      checkedAt,
      error,
      latestCommit,
      status: 'git-failed',
    });
  }
}

async function runDeployWatchLoop(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    intervalMs = DEFAULT_INTERVAL_MS,
    log = console,
    now = () => Date.now(),
    once = false,
    onDeploymentStart = () => {},
    onIterationResult = () => {},
    onIterationStart = () => {},
    paths = getWatchPaths(),
    platformProjectReader = readPlatformProject,
    processImpl = process,
    projectPollIntervalMs = DEFAULT_PROJECT_POLL_INTERVAL_MS,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
    sleepImpl = sleep,
  } = {}
) {
  let consecutiveGitFailures = 0;
  let lastProjectPollAt = 0;

  while (true) {
    const startedAt = now();
    onIterationStart(startedAt);

    try {
      const platformProject = await platformProjectReader({ env });
      const selectedBranch = normalizeProjectBranch(
        platformProject.selectedBranch
      );

      if (
        platformProject.source === 'database' &&
        selectedBranch !== target.branch
      ) {
        log.info?.(
          `Platform project target changed from ${target.branch} to ${selectedBranch}. Restarting watcher to re-lock the branch.`
        );
        return {
          checkedAt: startedAt,
          latestCommit: await getCommitMetadata('HEAD', {
            env,
            runCommand: run,
          }).catch(() => null),
          project: platformProject,
          restartRequired: true,
          status: 'project-target-changed',
          target: {
            ...target,
            branch: selectedBranch,
            upstreamBranch: selectedBranch,
            upstreamRef: `${target.remote}/${selectedBranch}`,
          },
        };
      }
    } catch (error) {
      log.warn?.(
        `Platform project target check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (startedAt - lastProjectPollAt >= projectPollIntervalMs) {
      lastProjectPollAt = startedAt;
      try {
        const projectResults = await processManagedInfrastructureProjects({
          env,
          fsImpl,
          log,
          now,
          paths,
          processImpl,
          rootDir,
          runCommand: run,
        });
        const deployedProjects = projectResults.filter(
          (result) => result.status === 'ready'
        );

        if (deployedProjects.length > 0) {
          log.info?.(
            `Processed ${deployedProjects.length} managed project deployment${deployedProjects.length === 1 ? '' : 's'}.`
          );
        }
      } catch (error) {
        log.warn?.(
          `Managed project polling failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const iterationResult = await runDeployWatchIteration(target, {
      deployCommand,
      env,
      envFilePath,
      fsImpl,
      log,
      now,
      onDeploymentStart,
      paths,
      processImpl,
      rootDir,
      runCommand: run,
    });
    const isGitFailure = iterationResult.status === 'git-failed';
    consecutiveGitFailures = isGitFailure ? consecutiveGitFailures + 1 : 0;
    const baseSleepMs = isGitFailure
      ? getGitFailureBackoffMs(consecutiveGitFailures)
      : intervalMs;
    const queuePollSleepMs =
      !isGitFailure &&
      Number.isFinite(projectPollIntervalMs) &&
      projectPollIntervalMs > 0
        ? projectPollIntervalMs
        : baseSleepMs;
    const sleepMs = Math.min(baseSleepMs, queuePollSleepMs);
    const result = {
      ...iterationResult,
      gitFailureCount: isGitFailure ? consecutiveGitFailures : 0,
      sleepMs,
    };

    if (isGitFailure) {
      log.warn?.(
        `Retrying Git poll in ${formatDuration(sleepMs)} after ${result.gitFailureCount} consecutive failure${result.gitFailureCount === 1 ? '' : 's'}.`
      );
    }

    onIterationResult(result);

    if (once || result.containerRefreshRequired || result.restartRequired) {
      return result;
    }

    await sleepImpl(sleepMs);
  }
}

async function resolveInitialWatcherTarget({
  env,
  fsImpl,
  log,
  paths,
  rootDir = ROOT_DIR,
  runCommand: run,
} = {}) {
  try {
    return await resolveLockedBranchTarget({
      env,
      fsImpl,
      paths,
      runCommand: run,
    });
  } catch (error) {
    const currentBranch = await getCurrentBranchName({
      env,
      runCommand: run,
    }).catch(() => null);

    if (currentBranch !== 'HEAD') {
      throw error;
    }

    const hasBlockingDirtyWorktree = await hasDirtyWorktree({
      cwd: rootDir,
      env,
      runCommand: run,
    });
    const platformProject = await readPlatformProject({ env });
    const selectedBranch = normalizeProjectBranch(
      platformProject.selectedBranch
    );

    if (hasBlockingDirtyWorktree && isWatcherWorktreeResetDisabled(env)) {
      throw new Error(
        `Watcher started from detached HEAD without a persisted target lock, but the worktree has uncommitted changes. Check out ${selectedBranch} manually after preserving those changes.`
      );
    }

    if (hasBlockingDirtyWorktree) {
      log?.warn?.(
        `Watcher started from detached HEAD with local changes. Resetting the checkout before switching to ${selectedBranch}.`
      );
      await resetTrackedWorktreeChanges({
        cwd: rootDir,
        env,
        fsImpl,
        log,
        runCommand: run,
      });
      await removeUntrackedWorktreeFiles({
        cwd: rootDir,
        env,
        fsImpl,
        log,
        runCommand: run,
      });
    }

    log?.warn?.(
      `Watcher started from detached HEAD without a persisted target lock. Checking out ${selectedBranch} before locking the branch.`
    );
    await checkoutBranch(selectedBranch, {
      cwd: rootDir,
      env,
      runCommand: run,
    });

    return {
      branch: selectedBranch,
      remote: 'origin',
      upstreamBranch: selectedBranch,
      upstreamRef: `origin/${selectedBranch}`,
    };
  }
}

async function restoreTargetBranchIfDetached(
  target,
  { env, log, rootDir = ROOT_DIR, runCommand: run = runCommand } = {}
) {
  if (!target?.branch) {
    return false;
  }

  let currentBranch;
  try {
    currentBranch = await getCurrentBranchName({
      cwd: rootDir,
      env,
      runCommand: run,
    });
  } catch (error) {
    log?.warn?.(
      `Unable to inspect watcher checkout before shutdown: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }

  if (currentBranch !== 'HEAD') {
    return false;
  }

  let hasBlockingDirtyWorktree = true;
  try {
    hasBlockingDirtyWorktree = await hasDirtyWorktree({
      cwd: rootDir,
      env,
      runCommand: run,
    });
  } catch (error) {
    log?.warn?.(
      `Unable to inspect detached watcher worktree before returning to ${target.branch}: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }

  if (hasBlockingDirtyWorktree) {
    log?.warn?.(
      `Watcher is shutting down from detached HEAD but the worktree has uncommitted changes; leaving checkout detached instead of forcing ${target.branch}.`
    );
    return false;
  }

  try {
    log?.info?.(
      `Watcher is shutting down from detached HEAD; checking out ${target.branch}.`
    );
    await checkoutBranch(target.branch, {
      cwd: rootDir,
      env,
      runCommand: run,
    });
    return true;
  } catch (error) {
    log?.warn?.(
      `Unable to check out ${target.branch} before watcher shutdown: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  const env = options.env ?? process.env;
  const fsImpl = options.fsImpl ?? fs;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const envFilePath = options.envFilePath ?? path.join(rootDir, '.env.local');
  const paths = getWatchPaths(rootDir);
  const processImpl = options.processImpl ?? process;
  const run = createQuietRunCommand(options.runCommand ?? runCommand);
  const initialRuntimeSnapshot = await loadRuntimeSnapshot({
    env,
    envFilePath,
    fsImpl,
    now: Date.now(),
    paths,
    rootDir,
    runCommand: run,
  });
  const initialDeploymentSummary = getLatestDeploymentSummary(
    initialRuntimeSnapshot.deployments
  );
  let ui = null;
  const githubChecksPublisher = normalizeGitHubChecksPublisher(
    options.githubChecksPublisher ??
      createGitHubChecksPublisher({
        env,
        fsImpl,
        log: {
          warn(message) {
            ui?.warn?.(message);
          },
        },
        paths,
        rootDir,
        runCommand: run,
      })
  );
  const handleStateChange = (state) => {
    writeWatchStatus(state, {
      fsImpl,
      now: Date.now(),
      paths,
      processImpl,
    });
    publishGitHubChecksFromWatcherState(githubChecksPublisher, state, ui);
  };
  ui = options.ui
    ? wrapWatchUiStateChange(options.ui, handleStateChange)
    : createWatchUi(
        {
          currentBlueGreen: initialRuntimeSnapshot.currentBlueGreen,
          dockerResources: initialRuntimeSnapshot.dockerResources,
          deploymentPin: readDeploymentPin(paths, fsImpl),
          deployments: initialRuntimeSnapshot.deployments,
          logs: readWatcherLogEntries(paths, fsImpl),
          intervalMs: parsed.intervalMs,
          lastDeployAt: initialDeploymentSummary.lastDeployAt,
          lastDeployStatus: initialDeploymentSummary.lastDeployStatus,
          lockFile: paths.lockFile,
          startedAt: Date.now(),
        },
        {
          onEvent: (event, state) => {
            const nextLogs = appendWatcherLogEntry(
              createWatcherLogEntry(event, state),
              {
                fsImpl,
                paths,
              }
            );
            state.logs = nextLogs;
          },
          onStateChange: handleStateChange,
        }
      );
  let released = false;
  let target = null;
  let terminating = false;

  const cleanup = () => {
    if (released) {
      return;
    }

    released = true;
    releaseWatchLock({
      fsImpl,
      now: options.now ?? Date.now(),
      preserveTarget: env[WATCHER_CONTAINER_ENV] === '1',
      paths,
      processImpl,
    });
    clearWatchStatus({
      fsImpl,
      paths,
      processImpl,
    });
  };

  const restoreDetachedCheckout = () =>
    restoreTargetBranchIfDetached(target, {
      env,
      log: ui,
      rootDir,
      runCommand: run,
    });

  const handleTermination = (signal) => {
    if (terminating) {
      return;
    }

    terminating = true;
    ui.warn(`Received ${signal}. Shutting down watcher.`);
    void restoreDetachedCheckout()
      .catch((error) => {
        ui.warn(
          `Unable to restore watcher branch during shutdown: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        cleanup();
        ui.close();
        processImpl.exit(0);
      });
  };

  try {
    const migrationHandoffStarted = await handoffLegacyWatcherToTargetProject({
      argv: options.restartArgv ?? argv,
      env,
      envFilePath,
      fsImpl,
      log: ui,
      rootDir,
      runCommand: run,
    });

    if (migrationHandoffStarted) {
      ui.info(
        `Started ${DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME} watcher for Docker project migration; legacy watcher will stop.`
      );

      return {
        sourceProjectName: LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
        status: 'migration-handoff',
        targetProjectName: DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME,
      };
    }

    const initialTarget = await resolveInitialWatcherTarget({
      env,
      fsImpl,
      log: ui,
      paths,
      rootDir,
      runCommand: run,
    });
    const existingLock = readWatchLock(paths, fsImpl);

    if (existingLock && isProcessAlive(existingLock.pid, processImpl)) {
      if (parsed.lockConflictAction === 'resume') {
        await mirrorExistingWatchSession(existingLock, {
          env,
          envFilePath,
          fsImpl,
          log: ui,
          now: options.now ?? (() => Date.now()),
          once: parsed.once,
          paths,
          processImpl,
          rootDir,
          runCommand: run,
          sleepImpl: options.sleepImpl ?? sleep,
        });
        return;
      }

      if (parsed.lockConflictAction === 'replace') {
        ui.warn(
          `Replacing existing watcher PID ${existingLock.pid} on ${existingLock.branch}.`
        );
        const terminated = await terminateExistingWatcher(existingLock, {
          processImpl,
          sleepImpl: options.sleepImpl ?? sleep,
        });

        if (!terminated) {
          throw new Error(
            `Unable to stop existing watcher PID ${existingLock.pid}.`
          );
        }
      } else {
        throw new Error(
          `Watcher already locked by PID ${existingLock.pid}. Re-run with --resume-if-running to mirror the existing session or --replace-existing to stop it and take over.`
        );
      }
    }

    const projectTarget = await resolvePlatformProjectTarget(initialTarget, {
      env,
      listDirtyWorktreePaths,
      log: ui,
      runCommand: run,
    });
    target = projectTarget.target;

    if (projectTarget.blocked) {
      ui.warn(projectTarget.message ?? 'Project deployment is blocked.');
      ui.update({
        lastResult: {
          project: projectTarget.project,
          status: 'blocked',
        },
        target,
      });
      writeWatchStatus(ui.state, {
        fsImpl,
        now: Date.now(),
        paths,
        processImpl,
      });

      return {
        project: projectTarget.project,
        status: 'blocked',
      };
    }

    try {
      acquireWatchLock(target, {
        fsImpl,
        paths,
        processImpl,
      });
    } catch (error) {
      if (parsed.lockConflictAction === 'fail' && error instanceof Error) {
        error.message = `${error.message} Re-run with --resume-if-running to mirror the existing session or --replace-existing to stop it and take over.`;
      }

      throw error;
    }

    if (!isWatcherWorktreeResetDisabled(env)) {
      await forceSyncWatcherWorktree(target, {
        env,
        fsImpl,
        log: ui,
        now: options.now ?? (() => Date.now()),
        rootDir,
        runCommand: run,
      });
    }

    const latestCommit = await getCommitMetadata('HEAD', {
      env,
      runCommand: run,
    });

    ui.update({
      latestCommit,
      target,
    });

    ui.start();
    ui.info(
      `Watching ${target.branch} (${target.upstreamRef}) every ${parsed.intervalMs}ms.`
    );
    ui.update({
      lockFile: paths.lockFile,
      nextCheckAt: Date.now(),
    });

    processImpl.on('SIGINT', () => {
      handleTermination('SIGINT');
    });
    processImpl.on('SIGTERM', () => {
      handleTermination('SIGTERM');
    });

    if (
      hasPersistedPendingDeployRequest(env, {
        fsImpl,
        paths,
      })
    ) {
      const latestDeployedCommitHash = getLatestSuccessfulDeploymentCommitHash(
        readDeploymentHistory(paths, fsImpl)
      );

      if (latestCommit.hash && latestCommit.hash === latestDeployedCommitHash) {
        clearPendingDeployRequest({
          fsImpl,
          paths,
        });
        ui.info(
          `Recovered watcher is already serving ${latestCommit.shortHash}; skipping the pending deploy handoff.`
        );
      } else {
        await stopTimedOutDeploymentBuildIfNeeded({
          env,
          fsImpl,
          log: ui,
          now: options.now ?? (() => Date.now()),
          paths,
          processImpl,
          target,
        });
        let activeDeploymentConflict = getActiveDeploymentConflict({
          env,
          fsImpl,
          now: options.now ?? (() => Date.now()),
          paths,
          processImpl,
        });

        while (activeDeploymentConflict) {
          logActiveDeploymentDeferralOnce(
            'Recovered pending deploy handoff is waiting because another deployment is already active',
            activeDeploymentConflict,
            { fsImpl, log: ui, paths }
          );
          ui.update({
            lastResult: createDeploymentActiveResult(activeDeploymentConflict, {
              checkedAt:
                typeof options.now === 'function' ? options.now() : Date.now(),
              latestCommit,
            }),
            nextCheckAt: Date.now() + parsed.intervalMs,
          });

          if (parsed.once) {
            return;
          }

          await (options.sleepImpl ?? sleep)(parsed.intervalMs);
          await stopTimedOutDeploymentBuildIfNeeded({
            env,
            fsImpl,
            log: ui,
            now: options.now ?? (() => Date.now()),
            paths,
            processImpl,
            target,
          });
          activeDeploymentConflict = getActiveDeploymentConflict({
            env,
            fsImpl,
            now: options.now ?? (() => Date.now()),
            paths,
            processImpl,
          });
        }

        const deploymentHistory = readDeploymentHistory(paths, fsImpl);
        const failedDeploymentCount = getFailedDeploymentCountForCommit(
          deploymentHistory,
          latestCommit.hash
        );

        const runRecoveredPendingDeployForCommit = async (
          deployCommit,
          {
            deploymentKind = 'recovery-bootstrap',
            pendingStartedAt,
            successMessage,
            failureMessage,
          }
        ) => {
          const buildingDeployment = createPendingDeploymentEntry({
            deploymentKind,
            latestCommit: deployCommit,
            startedAt: pendingStartedAt,
            status: 'building',
          });
          const buildingDeployments = prependPendingDeployment(
            ui.state.deployments,
            buildingDeployment
          );
          const buildingSummary =
            getLatestDeploymentSummary(buildingDeployments);

          ui.update({
            dockerResources: ui.state.dockerResources,
            deployments: buildingDeployments,
            lastDeployAt: buildingSummary.lastDeployAt,
            lastDeployStatus: buildingSummary.lastDeployStatus,
            nextCheckAt: null,
          });

          try {
            const pendingResult = await runPendingDeployAfterRestart({
              deployCommand: options.deployCommand ?? DEFAULT_DEPLOY_COMMAND,
              deploymentKind,
              env,
              envFilePath,
              fsImpl,
              latestCommit: deployCommit,
              log: ui,
              now: options.now ?? (() => Date.now()),
              paths,
              rootDir,
              runCommand: run,
            });
            const runtimeSnapshot = await loadRuntimeSnapshot({
              env,
              envFilePath,
              fsImpl,
              now:
                typeof options.now === 'function' ? options.now() : Date.now(),
              paths,
              rootDir,
              runCommand: run,
              history: pendingResult.history,
            });
            const latestDeploymentSummary = getLatestDeploymentSummary(
              runtimeSnapshot.deployments
            );

            ui.update({
              currentBlueGreen: runtimeSnapshot.currentBlueGreen,
              dockerResources: runtimeSnapshot.dockerResources,
              deployments: runtimeSnapshot.deployments,
              lastDeployAt: latestDeploymentSummary.lastDeployAt,
              lastDeployStatus: latestDeploymentSummary.lastDeployStatus,
              lastResult: { status: 'deployed' },
              nextCheckAt: Date.now() + parsed.intervalMs,
            });
            clearPendingDeployRequest({
              fsImpl,
              paths,
            });
            ui.info(successMessage);
          } catch (error) {
            const deployFinishedAt =
              typeof options.now === 'function' ? options.now() : Date.now();
            if (error instanceof DeploymentBuildLockConflictError) {
              const activeConflict = getConflictFromDeploymentBuildLockError(
                error,
                options.now ?? (() => Date.now())
              );
              const runtimeSnapshot = await loadRuntimeSnapshot({
                env,
                envFilePath,
                fsImpl,
                now: deployFinishedAt,
                paths,
                rootDir,
                runCommand: run,
              });
              const latestDeploymentSummary = getLatestDeploymentSummary(
                runtimeSnapshot.deployments
              );

              logActiveDeploymentDeferralOnce(
                'Recovered pending deploy handoff is waiting because another deployment is already active',
                activeConflict,
                { fsImpl, log: ui, paths }
              );
              ui.update({
                currentBlueGreen: runtimeSnapshot.currentBlueGreen,
                dockerResources: runtimeSnapshot.dockerResources,
                deployments: runtimeSnapshot.deployments,
                lastDeployAt: latestDeploymentSummary.lastDeployAt,
                lastDeployStatus: latestDeploymentSummary.lastDeployStatus,
                lastResult: createDeploymentActiveResult(activeConflict, {
                  checkedAt: deployFinishedAt,
                  error,
                  latestCommit: deployCommit,
                }),
                nextCheckAt: Date.now() + parsed.intervalMs,
              });
              return;
            }

            const history = await appendFailedDeploymentHistoryAndNotify(
              {
                buildDurationMs: Math.max(
                  0,
                  deployFinishedAt - pendingStartedAt
                ),
                commitHash: deployCommit.hash,
                commitShortHash: deployCommit.shortHash,
                commitSubject: deployCommit.subject,
                deploymentKind,
                finishedAt: deployFinishedAt,
                startedAt: pendingStartedAt,
                status: 'failed',
              },
              error,
              {
                env,
                fsImpl,
                log: ui,
                paths,
                target,
              }
            );
            const runtimeSnapshot = await loadRuntimeSnapshot({
              env,
              envFilePath,
              fsImpl,
              now: deployFinishedAt,
              paths,
              rootDir,
              runCommand: run,
              history,
            });
            const latestDeploymentSummary = getLatestDeploymentSummary(
              runtimeSnapshot.deployments
            );

            ui.update({
              currentBlueGreen: runtimeSnapshot.currentBlueGreen,
              dockerResources: runtimeSnapshot.dockerResources,
              deployments: runtimeSnapshot.deployments,
              lastDeployAt: latestDeploymentSummary.lastDeployAt,
              lastDeployStatus: latestDeploymentSummary.lastDeployStatus,
              lastResult: { error, status: 'deploy-failed' },
              nextCheckAt: Date.now() + parsed.intervalMs,
            });
            clearPendingDeployRequest({
              fsImpl,
              paths,
            });
            ui.error(failureMessage(error));
          }
        };

        if (
          hasReachedDeploymentFailureLimit(deploymentHistory, latestCommit.hash)
        ) {
          const parentDeploy =
            await resolveParentFallbackCommitForRetryLimitedHead(
              latestCommit,
              deploymentHistory,
              { env, runCommand: run }
            );

          if (!parentDeploy) {
            clearPendingDeployRequest({
              fsImpl,
              paths,
            });
            ui.warn(
              `Skipping recovered deploy handoff for ${latestCommit.shortHash} because it already failed ${failedDeploymentCount} deployment attempts.`
            );
          } else {
            ui.warn(
              `Recovered deploy handoff for ${latestCommit.shortHash} hit the deploy retry cap; deploying parent ${parentDeploy.shortHash} instead because it has no successful deployment yet.`
            );
            await checkoutRevision(parentDeploy.hash, { env, runCommand: run });

            try {
              const pendingStartedAt =
                typeof options.now === 'function' ? options.now() : Date.now();

              await runRecoveredPendingDeployForCommit(parentDeploy, {
                deploymentKind: 'parent-fallback-recovery-bootstrap',
                failureMessage: (error) =>
                  `Recovered parent-fallback deploy handoff failed for ${parentDeploy.shortHash}: ${error instanceof Error ? error.message : String(error)}`,
                pendingStartedAt,
                successMessage: `Blue/green parent-fallback deployment completed for ${parentDeploy.shortHash}.`,
              });
            } finally {
              await checkoutBranch(target.branch, { env, runCommand: run });
            }
          }
        } else {
          const pendingStartedAt =
            typeof options.now === 'function' ? options.now() : Date.now();

          await runRecoveredPendingDeployForCommit(latestCommit, {
            deploymentKind: 'recovery-bootstrap',
            failureMessage: (error) =>
              `Recovered deploy handoff failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`,
            pendingStartedAt,
            successMessage: `Blue/green deployment completed for ${latestCommit.shortHash}.`,
          });
        }
      }
    }

    const result = await runDeployWatchLoop(target, {
      deployCommand: options.deployCommand ?? DEFAULT_DEPLOY_COMMAND,
      env,
      envFilePath,
      fsImpl,
      intervalMs: parsed.intervalMs,
      log: ui,
      now: options.now ?? (() => Date.now()),
      once: parsed.once,
      projectPollIntervalMs: DEFAULT_PROJECT_POLL_INTERVAL_MS,
      processImpl,
      onDeploymentStart: ({ checkedAt, latestCommit, pendingDeployment }) => {
        const currentDeployments = ui.state.deployments ?? [];
        const nextDeployments = prependPendingDeployment(
          currentDeployments,
          pendingDeployment
        );
        const latestDeploymentSummary =
          getLatestDeploymentSummary(nextDeployments);

        ui.update({
          deployments: nextDeployments,
          lastCheckAt: checkedAt ?? Date.now(),
          lastDeployAt: latestDeploymentSummary.lastDeployAt,
          lastDeployStatus: latestDeploymentSummary.lastDeployStatus,
          latestCommit: latestCommit ?? ui.state.latestCommit,
          nextCheckAt: null,
        });
      },
      onIterationResult: (iterationResult) => {
        const latestDeploymentSummary = getLatestDeploymentSummary(
          iterationResult.deployments ?? ui.state.deployments
        );
        ui.update({
          currentBlueGreen:
            iterationResult.currentBlueGreen ?? ui.state.currentBlueGreen,
          dockerResources:
            iterationResult.dockerResources ?? ui.state.dockerResources,
          deploymentPin: readDeploymentPin(paths, fsImpl),
          deployments: iterationResult.deployments ?? ui.state.deployments,
          lastCheckAt: iterationResult.checkedAt ?? Date.now(),
          lastDeployAt:
            iterationResult.status === 'deployed' ||
            iterationResult.status === 'deploy-failed' ||
            iterationResult.status === 'pin-deploy-failed' ||
            iterationResult.status === 'pinned-deployed' ||
            iterationResult.status === 'recovered' ||
            iterationResult.status === 'standby-refreshed' ||
            iterationResult.status === 'standby-refresh-failed' ||
            iterationResult.status === 'restarting'
              ? (iterationResult.deployments?.[0]?.finishedAt ??
                iterationResult.checkedAt ??
                Date.now())
              : (ui.state.lastDeployAt ?? latestDeploymentSummary.lastDeployAt),
          lastDeployStatus:
            iterationResult.status === 'deploy-failed' ||
            iterationResult.status === 'pin-deploy-failed' ||
            iterationResult.status === 'standby-refresh-failed'
              ? 'failed'
              : iterationResult.status === 'deploying'
                ? 'deploying'
                : iterationResult.status === 'building'
                  ? 'building'
                  : iterationResult.status === 'deployed' ||
                      iterationResult.status === 'pinned-deployed' ||
                      iterationResult.status === 'recovered' ||
                      iterationResult.status === 'standby-refreshed' ||
                      iterationResult.status === 'restarting'
                    ? 'successful'
                    : (ui.state.lastDeployStatus ??
                      latestDeploymentSummary.lastDeployStatus),
          lastResult: iterationResult,
          latestCommit: iterationResult.latestCommit ?? ui.state.latestCommit,
          nextCheckAt:
            iterationResult.restartRequired || parsed.once
              ? null
              : Date.now() + (iterationResult.sleepMs ?? parsed.intervalMs),
        });
      },
      onIterationStart: (startedAt) => {
        ui.update({
          deploymentPin: readDeploymentPin(paths, fsImpl),
          lastCheckAt: startedAt,
          nextCheckAt: startedAt + parsed.intervalMs,
        });
      },
      paths,
      rootDir,
      runCommand: run,
      sleepImpl: options.sleepImpl ?? sleep,
    });

    if (result?.restartRequired) {
      cleanup();
      if (env[WATCHER_CONTAINER_ENV] === '1') {
        ui.info(
          'Watcher script changed. Restarting the containerized watcher process.'
        );
        ui.close();
        processImpl.exit?.(CONTAINER_SELF_RESTART_EXIT_CODE);
        return;
      }

      await spawnReplacementWatcher({
        argv: options.restartArgv ?? process.argv.slice(1),
        cwd: rootDir,
        env: {
          ...env,
          [WATCH_PENDING_DEPLOY_ENV]: '1',
        },
        execPath: options.execPath ?? process.execPath,
        spawnImpl: options.spawnImpl ?? spawn,
      });
      ui.close();
      return;
    }

    if (result?.containerRefreshRequired) {
      cleanup();
      if (env[WATCHER_CONTAINER_ENV] === '1') {
        ui.info(
          'Critical watcher container files changed. Requesting host-supervised watcher service recreation.'
        );
        ui.close();
        processImpl.exit?.(CONTAINER_REFRESH_EXIT_CODE);
        return;
      }

      ui.close();
      return;
    }
  } catch (error) {
    ui.error(error instanceof Error ? error.message : String(error));
    processImpl.exitCode =
      error && typeof error === 'object' && typeof error.exitCode === 'number'
        ? error.exitCode
        : 1;
  } finally {
    await restoreDetachedCheckout();
    cleanup();
    ui.close();
  }
}

module.exports = {
  ...deployWatcherRuntime,
  BLUE_GREEN_WATCHER_SERVICE,
  CONTAINER_REFRESH_EXIT_CODE,
  CONTAINER_SELF_RESTART_EXIT_CODE,
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_GIT_FAILURE_BACKOFF_MS,
  DEFAULT_DOCKER_DAEMON_RESTART_AFTER_MS,
  DEFAULT_DOCKER_DAEMON_RESTART_COOLDOWN_MS,
  DEFAULT_DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS,
  DEFAULT_STALE_GIT_INDEX_LOCK_MS,
  DEFAULT_INTERVAL_MS,
  DISPLAY_DEPLOYMENTS,
  MAX_GIT_FAILURE_BACKOFF_MS,
  MAX_FAILED_DEPLOYMENTS_PER_COMMIT,
  MAX_RECOVERY_CACHE_IMAGES,
  MAX_DEPLOYMENTS,
  MAX_EVENTS,
  MIGRATION_PROXY_HANDOFF_TIMEOUT_MS,
  MIGRATION_STAGING_PORT_ENV,
  CONTAINER_REFRESH_WATCHED_FILES,
  SELF_WATCHED_FILES,
  WATCH_ARGS_FILE,
  WATCH_HISTORY_FILE,
  WATCH_LOCK_FILE,
  WATCH_LOG_FILE,
  WATCH_PENDING_DEPLOY_FILE,
  WATCH_PENDING_DEPLOY_ENV,
  WATCH_RUNTIME_DIR,
  WATCH_STATUS_FILE,
  WATCHER_CONTAINER_ENV,
  DOCKER_DAEMON_RESTART_AFTER_MS_ENV,
  DOCKER_DAEMON_RESTART_COMMAND_ENV,
  DOCKER_DAEMON_RESTART_COOLDOWN_MS_ENV,
  DOCKER_DAEMON_RESTART_DISABLED_ENV,
  DOCKER_DAEMON_POST_RESTART_COMMANDS_ENV,
  DOCKER_DAEMON_POST_RESTART_COMMAND_TIMEOUT_MS_ENV,
  DOCKER_DAEMON_RECOVERY_SETTINGS_FILE,
  acquireWatchLock,
  appendFailedDeploymentHistoryAndNotify,
  appendDeploymentHistory,
  buildDashboardView,
  clearInstantRolloutRequest,
  clearWatchStatus,
  clearContainerManagedWatcherState,
  clearPendingDeployRequest,
  createWatchUi,
  fetchTrackedBranch,
  forceSyncWatcherWorktree,
  finalizeComposeProjectMigrationIfRequested,
  formatClockTime,
  formatCountdown,
  formatDuration,
  formatRelativeTime,
  formatRequestsPerMinute,
  getGitFailureBackoffMs,
  getLatestCachedSuccessfulDeployment,
  getLatestDeploymentSummary,
  getFailedDeploymentCountForCommit,
  getChangedFilesForBuildScope,
  getLatestSuccessfulDeploymentCommitHash,
  getCommitMetadata,
  getCurrentBranch,
  getMigrationRequest,
  getMigrationTargetWatcherEnv,
  getDockerDaemonRestartAfterMs,
  getDockerDaemonRestartCommand,
  getDockerDaemonRestartCooldownMs,
  getDockerDaemonPostRestartCommands,
  getDockerDaemonPostRestartCommandTimeoutMs,
  getDockerDaemonRecoverySettingsEnv,
  getRevision,
  getTrackedUpstream,
  getWatcherContainerState,
  getWatcherStartupComposeEnv,
  getWatchPaths,
  hasDirtyWorktree,
  handoffLegacyWatcherToTargetProject,
  listDirtyWorktreePaths,
  hasWatchedScriptChanges,
  isWatcherWorktreeResetDisabled,
  isRecoverableGitCommandError,
  isGitIndexLockError,
  isGitLockError,
  isAncestor,
  isProcessAlive,
  listChangedFilesBetweenRevisions,
  main,
  mirrorExistingWatchSession,
  parseArgs,
  parseContainerConsoleLogEntries,
  parseProxyLogEntries,
  parseUpstreamRef,
  prependPendingDeployment,
  pullTrackedBranch,
  readDeploymentHistory,
  readDockerDaemonRecoverySettings,
  readInstantRolloutRequest,
  readPendingDeployRequest,
  readWatchArgsFile,
  readWatchLock,
  readWatchStatus,
  releaseWatchLock,
  restoreTargetBranchIfDetached,
  resolveLockedBranchTarget,
  resolvePlatformProjectTarget,
  runBunFrozenInstall,
  runBlueGreenDeploy,
  runPendingDeployAfterRestart,
  runDeployWatchIteration,
  runDeploymentRevertRequestIteration,
  runDeployWatchLoop,
  runWatcherCommand,
  removeUntrackedWorktreeFiles,
  removeStaleGitLock,
  removeStaleGitIndexLock,
  resetTrackedWorktreeChanges,
  sleep,
  spawnReplacementWatcher,
  startBlueGreenWatcherContainer,
  stripAnsi,
  summarizeRequestRate,
  streamBlueGreenWatcherLogs,
  terminateExistingWatcher,
  waitForDockerDaemonRecovery,
  createPendingDeploymentEntry,
  createQuietRunCommand,
  hasPersistedPendingDeployRequest,
  summarizeBlueGreenRuntime,
  summarizeResult,
  waitForProcessExit,
  writeWatchArgsFile,
  writePendingDeployRequest,
  writeWatchStatus,
  writeDeploymentHistory,
};
