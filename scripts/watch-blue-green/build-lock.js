const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');

const { readWatchStatus } = require('./deploy-watcher-lock-status.js');
const { getWatchPaths } = require('./paths.js');

const DEPLOYMENT_BUILD_LOCK_TOKEN_ENV = 'DOCKER_WEB_DEPLOYMENT_LOCK_TOKEN';
const CANCEL_ACTIVE_BUILD_ENV = 'DOCKER_WEB_CANCEL_ACTIVE_BUILD';
const DEPLOYMENT_LOCK_STALE_AFTER_MS_ENV =
  'DOCKER_WEB_DEPLOYMENT_LOCK_STALE_AFTER_MS';
const DEFAULT_DEPLOYMENT_LOCK_STALE_AFTER_MS = 8 * 60 * 60 * 1000;
const ACTIVE_DEPLOYMENT_STATUSES = new Set(['building', 'deploying']);

class DeploymentBuildLockConflictError extends Error {
  constructor(lock) {
    const pid = lock?.ownerPid ?? lock?.pid ?? 'unknown';
    const command = lock?.command ? ` (${lock.command})` : '';
    super(
      `A blue/green deployment build is already active under PID ${pid}${command}.`
    );
    this.name = 'DeploymentBuildLockConflictError';
    this.lock = lock;
  }
}

function createDeploymentBuildLockToken() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeDeploymentCommit(latestCommit) {
  return {
    commitHash: latestCommit?.hash ?? latestCommit?.commitHash ?? null,
    commitShortHash:
      latestCommit?.shortHash ?? latestCommit?.commitShortHash ?? null,
    commitSubject: latestCommit?.subject ?? latestCommit?.commitSubject ?? null,
  };
}

function readDeploymentBuildLock(paths = getWatchPaths(), fsImpl = fs) {
  const lockFile = paths.deploymentBuildLockFile;

  if (!lockFile || !fsImpl.existsSync(lockFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(lockFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeDeploymentBuildLock(
  lock,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.deploymentBuildLockFile,
    JSON.stringify(lock, null, 2),
    'utf8'
  );
}

function clearDeploymentBuildLock({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  const lockFile = paths.deploymentBuildLockFile;

  if (lockFile && fsImpl.existsSync(lockFile)) {
    fsImpl.rmSync(lockFile, { force: true });
  }
}

function isProcessAlive(pid, processImpl = process) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    processImpl.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** @returns {'alive'|'dead'|'perm'} */
function signalPidZero(pid, processImpl = process) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return 'dead';
  }

  try {
    processImpl.kill(pid, 0);
    return 'alive';
  } catch (error) {
    if (error?.code === 'EPERM') {
      return 'perm';
    }

    return 'dead';
  }
}

function getDeploymentLockStaleAfterMs(env = process.env) {
  const raw = env?.[DEPLOYMENT_LOCK_STALE_AFTER_MS_ENV];
  if (raw == null || String(raw).trim() === '') {
    return DEFAULT_DEPLOYMENT_LOCK_STALE_AFTER_MS;
  }

  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeProcessCmdline(raw) {
  if (typeof raw !== 'string') {
    return '';
  }

  return raw.replace(/\0/g, ' ').trim().toLowerCase();
}

function readLinuxProcessCmdline(pid, fsImpl = fs) {
  if (os.platform() !== 'linux' || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  try {
    return normalizeProcessCmdline(
      fsImpl.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    );
  } catch {
    return null;
  }
}

function deploymentLockMatchesProcessCmdline(lock, cmdlineLower) {
  if (!cmdlineLower) {
    return false;
  }

  const kind = String(lock?.deploymentKind ?? '').trim();
  const cmd = String(lock?.command ?? '').toLowerCase();

  if (cmd.includes('serve:web:docker:bg')) {
    return (
      cmdlineLower.includes('serve:web:docker:bg') ||
      cmdlineLower.includes('docker-web.js') ||
      cmdlineLower.includes('scripts/docker-web')
    );
  }

  if (
    cmd.includes('standby-refresh') ||
    kind === 'standby-refresh' ||
    cmd === 'standby-refresh'
  ) {
    return (
      cmdlineLower.includes('bun') &&
      (cmdlineLower.includes('watch-blue-green') ||
        cmdlineLower.includes('docker-web'))
    );
  }

  if (
    cmd.includes('cached-recovery') ||
    kind === 'cached-recovery' ||
    cmd === 'cached-recovery'
  ) {
    return (
      cmdlineLower.includes('bun') &&
      (cmdlineLower.includes('watch-blue-green') ||
        cmdlineLower.includes('docker-web'))
    );
  }

  if (
    [
      'watcher',
      'recovery-bootstrap',
      'reconcile',
      'pending-restart',
      'manual',
    ].includes(kind) &&
    cmd
  ) {
    if (cmd.includes('serve:web:docker:bg')) {
      return cmdlineLower.includes('serve:web:docker:bg');
    }

    if (cmd.includes('docker-web') || cmdlineLower.includes('docker-web')) {
      return cmdlineLower.includes('bun') || cmdlineLower.includes('node');
    }
  }

  const tokens = cmd
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) {
    return cmdlineLower.includes('bun');
  }

  return tokens.some((t) => cmdlineLower.includes(t.toLowerCase()));
}

function lockAgeExceedsThreshold(lock, now, staleAfterMs) {
  if (staleAfterMs == null) {
    return false;
  }

  const startedAt = Number(lock?.startedAt);
  if (!Number.isFinite(startedAt)) {
    return false;
  }

  return now() - startedAt > staleAfterMs;
}

/**
 * Clears a deployment build lock file when the recorded owner PID is
 * obviously stale (dead, PID reuse, Docker CLI on Linux) or stale by age
 * when /proc cannot be read. On non-Linux hosts, age-based invalidation still
 * applies so abandoned lock files cannot block deploys indefinitely.
 * @param {string} [options.platform] Override `os.platform()` (for example in tests).
 * @returns {boolean} true when the lock file was removed
 */
function tryInvalidateStaleDeploymentBuildLock(
  lock,
  {
    env = process.env,
    fsImpl = fs,
    now = () => Date.now(),
    paths = getWatchPaths(),
    processImpl = process,
    platform = os.platform(),
  } = {}
) {
  const pid = Number(lock?.ownerPid ?? lock?.pid);
  const staleAfterMs = getDeploymentLockStaleAfterMs(env);
  const sig = signalPidZero(pid, processImpl);

  if (sig === 'dead') {
    clearDeploymentBuildLock({ fsImpl, paths });
    return true;
  }

  const linux = platform === 'linux';
  const cmdline = linux ? readLinuxProcessCmdline(pid, fsImpl) : null;

  if (linux) {
    if (lockAgeExceedsThreshold(lock, now, staleAfterMs)) {
      if (cmdline == null || cmdline.length === 0) {
        clearDeploymentBuildLock({ fsImpl, paths });
        return true;
      }

      if (!deploymentLockMatchesProcessCmdline(lock, cmdline)) {
        clearDeploymentBuildLock({ fsImpl, paths });
        return true;
      }
    }

    if (cmdline != null && cmdline.length > 0) {
      if (!deploymentLockMatchesProcessCmdline(lock, cmdline)) {
        clearDeploymentBuildLock({ fsImpl, paths });
        return true;
      }

      return false;
    }

    if (sig === 'perm' && lockAgeExceedsThreshold(lock, now, staleAfterMs)) {
      clearDeploymentBuildLock({ fsImpl, paths });
      return true;
    }
  } else if (lockAgeExceedsThreshold(lock, now, staleAfterMs)) {
    clearDeploymentBuildLock({ fsImpl, paths });
    return true;
  }

  return false;
}

/**
 * After stale invalidation, returns true when another actor still holds
 * a legitimate deployment build lock (manual conflict UX / cancel flows).
 * @param {string} [options.platform] Override `os.platform()` (for example in tests).
 */
function isDeploymentBuildLockBlocking(
  lock,
  {
    env = process.env,
    fsImpl = fs,
    now = () => Date.now(),
    processImpl = process,
    platform = os.platform(),
  } = {}
) {
  if (!lock) {
    return false;
  }

  const staleAfterMs = getDeploymentLockStaleAfterMs(env);
  if (
    platform !== 'linux' &&
    lockAgeExceedsThreshold(lock, now, staleAfterMs)
  ) {
    return false;
  }

  const pid = Number(lock.ownerPid ?? lock.pid);
  const sig = signalPidZero(pid, processImpl);
  if (sig === 'dead') {
    return false;
  }

  if (platform === 'linux') {
    const cmd = readLinuxProcessCmdline(pid, fsImpl);
    if (cmd && deploymentLockMatchesProcessCmdline(lock, cmd)) {
      return true;
    }

    if (cmd) {
      return false;
    }

    return !lockAgeExceedsThreshold(lock, now, staleAfterMs);
  }

  return sig === 'alive' || sig === 'perm';
}

function isDeploymentBuildLockLive(lock, processImpl = process) {
  const pid = Number(lock?.ownerPid ?? lock?.pid);
  return isProcessAlive(pid, processImpl);
}

function createDeploymentBuildLock({
  command,
  deploymentKind = 'manual',
  latestCommit = null,
  now = () => Date.now(),
  processImpl = process,
} = {}) {
  const startedAt = now();

  return {
    ...normalizeDeploymentCommit(latestCommit),
    command: Array.isArray(command) ? command.join(' ') : (command ?? null),
    deploymentKind,
    lockToken: createDeploymentBuildLockToken(),
    ownerPid: processImpl.pid,
    startedAt,
    startedAtIso: new Date(startedAt).toISOString(),
  };
}

function releaseDeploymentBuildLock(
  lock,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  const currentLock = readDeploymentBuildLock(paths, fsImpl);

  if (currentLock?.lockToken === lock?.lockToken) {
    clearDeploymentBuildLock({ fsImpl, paths });
    return true;
  }

  return false;
}

function acquireDeploymentBuildLock({
  command,
  deploymentKind = 'manual',
  env = process.env,
  fsImpl = fs,
  latestCommit = null,
  now = () => Date.now(),
  paths = getWatchPaths(),
  processImpl = process,
} = {}) {
  let currentLock = readDeploymentBuildLock(paths, fsImpl);
  if (currentLock) {
    tryInvalidateStaleDeploymentBuildLock(currentLock, {
      env,
      fsImpl,
      now,
      paths,
      processImpl,
    });
    currentLock = readDeploymentBuildLock(paths, fsImpl);
  }

  const requestedToken = env?.[DEPLOYMENT_BUILD_LOCK_TOKEN_ENV];

  if (
    currentLock?.lockToken &&
    requestedToken &&
    currentLock.lockToken === requestedToken &&
    isDeploymentBuildLockLive(currentLock, processImpl)
  ) {
    return {
      lock: currentLock,
      reentrant: true,
      release: () => false,
      token: currentLock.lockToken,
    };
  }

  if (currentLock) {
    const pid = Number(currentLock.ownerPid ?? currentLock.pid);
    const sig = signalPidZero(pid, processImpl);
    const staleAfterMs = getDeploymentLockStaleAfterMs(env);

    if (sig === 'dead') {
      clearDeploymentBuildLock({ fsImpl, paths });
    } else if (os.platform() === 'linux') {
      const cmd = readLinuxProcessCmdline(pid, fsImpl);
      if (cmd && deploymentLockMatchesProcessCmdline(currentLock, cmd)) {
        throw new DeploymentBuildLockConflictError(currentLock);
      }

      if (cmd) {
        clearDeploymentBuildLock({ fsImpl, paths });
      } else if (lockAgeExceedsThreshold(currentLock, now, staleAfterMs)) {
        clearDeploymentBuildLock({ fsImpl, paths });
      } else {
        throw new DeploymentBuildLockConflictError(currentLock);
      }
    } else if (sig === 'alive' || sig === 'perm') {
      if (lockAgeExceedsThreshold(currentLock, now, staleAfterMs)) {
        clearDeploymentBuildLock({ fsImpl, paths });
      } else {
        throw new DeploymentBuildLockConflictError(currentLock);
      }
    }
  }

  const lock = createDeploymentBuildLock({
    command,
    deploymentKind,
    latestCommit,
    now,
    processImpl,
  });

  writeDeploymentBuildLock(lock, { fsImpl, paths });

  return {
    lock,
    reentrant: false,
    release: () => releaseDeploymentBuildLock(lock, { fsImpl, paths }),
    token: lock.lockToken,
  };
}

function isActiveDeploymentStatus(value) {
  return ACTIVE_DEPLOYMENT_STATUSES.has(String(value ?? '').trim());
}

function formatElapsedDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function getActiveDeploymentFromStatus(status) {
  const deployments = Array.isArray(status?.deployments)
    ? status.deployments
    : [];
  const activeDeployment = deployments.find((deployment) =>
    isActiveDeploymentStatus(deployment?.status)
  );

  if (activeDeployment) {
    return activeDeployment;
  }

  if (isActiveDeploymentStatus(status?.lastDeployStatus)) {
    return {
      commitHash: status?.latestCommit?.hash ?? null,
      commitShortHash: status?.latestCommit?.shortHash ?? null,
      commitSubject: status?.latestCommit?.subject ?? null,
      deploymentKind: 'watcher',
      startedAt: status?.lastDeployAt ?? status?.startedAt ?? null,
      status: status.lastDeployStatus,
    };
  }

  return null;
}

function getActiveDeploymentConflict({
  env = process.env,
  fsImpl = fs,
  now = () => Date.now(),
  paths = getWatchPaths(),
  platform,
  processImpl = process,
  readStatus = readWatchStatus,
} = {}) {
  let lock = readDeploymentBuildLock(paths, fsImpl);
  if (lock) {
    tryInvalidateStaleDeploymentBuildLock(lock, {
      env,
      fsImpl,
      now,
      paths,
      platform,
      processImpl,
    });
    lock = readDeploymentBuildLock(paths, fsImpl);
  }

  if (
    lock &&
    isDeploymentBuildLockBlocking(lock, {
      env,
      fsImpl,
      now,
      platform,
      processImpl,
    })
  ) {
    return {
      elapsedMs: Math.max(0, now() - (lock.startedAt ?? now())),
      lock,
      source: 'lock',
      status: 'building',
    };
  }

  const status = readStatus(paths, fsImpl);
  const activeDeployment = getActiveDeploymentFromStatus(status);

  if (!activeDeployment) {
    return null;
  }

  const ownerPid = Number(status?.ownerPid ?? status?.pid);
  if (
    Number.isInteger(ownerPid) &&
    ownerPid > 0 &&
    !isProcessAlive(ownerPid, processImpl)
  ) {
    return null;
  }

  return {
    elapsedMs: Math.max(0, now() - (activeDeployment.startedAt ?? now())),
    lock: {
      command: 'blue/green watcher',
      commitHash: activeDeployment.commitHash ?? null,
      commitShortHash: activeDeployment.commitShortHash ?? null,
      commitSubject: activeDeployment.commitSubject ?? null,
      deploymentKind: activeDeployment.deploymentKind ?? 'watcher',
      ownerPid: Number.isInteger(ownerPid) && ownerPid > 0 ? ownerPid : null,
      startedAt: activeDeployment.startedAt ?? null,
    },
    source: 'watch-status',
    status: activeDeployment.status,
  };
}

function describeActiveDeploymentConflict(conflict) {
  const lock = conflict?.lock ?? {};
  const details = [
    `status=${conflict?.status ?? 'unknown'}`,
    `source=${conflict?.source ?? 'unknown'}`,
    lock.ownerPid ? `pid=${lock.ownerPid}` : null,
    lock.command ? `command=${lock.command}` : null,
    lock.deploymentKind ? `kind=${lock.deploymentKind}` : null,
    lock.commitShortHash ? `commit=${lock.commitShortHash}` : null,
    lock.commitSubject ? `subject=${lock.commitSubject}` : null,
    conflict?.elapsedMs != null
      ? `elapsed=${formatElapsedDuration(conflict.elapsedMs)}`
      : null,
  ].filter(Boolean);

  return details.join(', ');
}

module.exports = {
  ACTIVE_DEPLOYMENT_STATUSES,
  CANCEL_ACTIVE_BUILD_ENV,
  DEPLOYMENT_BUILD_LOCK_TOKEN_ENV,
  DEPLOYMENT_LOCK_STALE_AFTER_MS_ENV,
  DeploymentBuildLockConflictError,
  acquireDeploymentBuildLock,
  clearDeploymentBuildLock,
  createDeploymentBuildLock,
  createDeploymentBuildLockToken,
  describeActiveDeploymentConflict,
  deploymentLockMatchesProcessCmdline,
  getActiveDeploymentConflict,
  getActiveDeploymentFromStatus,
  getDeploymentLockStaleAfterMs,
  isActiveDeploymentStatus,
  isDeploymentBuildLockBlocking,
  isDeploymentBuildLockLive,
  isProcessAlive,
  readDeploymentBuildLock,
  readLinuxProcessCmdline,
  releaseDeploymentBuildLock,
  tryInvalidateStaleDeploymentBuildLock,
  writeDeploymentBuildLock,
};
