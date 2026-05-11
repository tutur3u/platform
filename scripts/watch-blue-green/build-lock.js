const crypto = require('node:crypto');
const fs = require('node:fs');

const { getWatchPaths } = require('./paths.js');

const DEPLOYMENT_BUILD_LOCK_TOKEN_ENV = 'DOCKER_WEB_DEPLOYMENT_LOCK_TOKEN';
const CANCEL_ACTIVE_BUILD_ENV = 'DOCKER_WEB_CANCEL_ACTIVE_BUILD';
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
  const currentLock = readDeploymentBuildLock(paths, fsImpl);
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

  if (currentLock && isDeploymentBuildLockLive(currentLock, processImpl)) {
    throw new DeploymentBuildLockConflictError(currentLock);
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

module.exports = {
  ACTIVE_DEPLOYMENT_STATUSES,
  CANCEL_ACTIVE_BUILD_ENV,
  DEPLOYMENT_BUILD_LOCK_TOKEN_ENV,
  DeploymentBuildLockConflictError,
  acquireDeploymentBuildLock,
  clearDeploymentBuildLock,
  createDeploymentBuildLock,
  createDeploymentBuildLockToken,
  getActiveDeploymentFromStatus,
  isActiveDeploymentStatus,
  isDeploymentBuildLockLive,
  isProcessAlive,
  readDeploymentBuildLock,
  releaseDeploymentBuildLock,
  writeDeploymentBuildLock,
};
