const fs = require('node:fs');

const { getWatchPaths } = require('./paths.js');

const MAX_WATCHER_LOG_ENTRIES = 2_000;

function getLogDeploymentKey(deployment) {
  if (
    typeof deployment?.deploymentStamp === 'string' &&
    deployment.deploymentStamp
  ) {
    return `stamp:${deployment.deploymentStamp}`;
  }

  if (typeof deployment?.commitHash === 'string' && deployment.commitHash) {
    return `commit:${deployment.commitHash}`;
  }

  const startedAt =
    typeof deployment?.startedAt === 'number'
      ? deployment.startedAt
      : typeof deployment?.finishedAt === 'number'
        ? deployment.finishedAt
        : null;

  if (typeof deployment?.activeColor === 'string' && startedAt != null) {
    return `color:${deployment.activeColor}:${startedAt}`;
  }

  return null;
}

function readWatcherLogEntries(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.logFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(paths.logFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWatcherLogEntries(
  entries,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.logFile,
    JSON.stringify(entries.slice(0, MAX_WATCHER_LOG_ENTRIES), null, 2),
    'utf8'
  );
}

function appendWatcherLogEntry(
  entry,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  const nextEntries = [entry, ...readWatcherLogEntries(paths, fsImpl)].slice(
    0,
    MAX_WATCHER_LOG_ENTRIES
  );

  writeWatcherLogEntries(nextEntries, {
    fsImpl,
    paths,
  });

  return nextEntries;
}

function createWatcherLogEntry(event, state) {
  const latestDeployment = Array.isArray(state?.deployments)
    ? (state.deployments[0] ?? null)
    : null;

  return {
    activeColor:
      typeof latestDeployment?.activeColor === 'string'
        ? latestDeployment.activeColor
        : null,
    commitHash:
      typeof latestDeployment?.commitHash === 'string'
        ? latestDeployment.commitHash
        : null,
    commitShortHash:
      typeof latestDeployment?.commitShortHash === 'string'
        ? latestDeployment.commitShortHash
        : null,
    deploymentKey: getLogDeploymentKey(latestDeployment),
    deploymentKind:
      typeof latestDeployment?.deploymentKind === 'string'
        ? latestDeployment.deploymentKind
        : null,
    deploymentStamp:
      typeof latestDeployment?.deploymentStamp === 'string'
        ? latestDeployment.deploymentStamp
        : null,
    deploymentStatus:
      typeof latestDeployment?.status === 'string'
        ? latestDeployment.status
        : null,
    level: event.level,
    message: event.message,
    time: event.time,
  };
}

module.exports = {
  MAX_WATCHER_LOG_ENTRIES,
  appendWatcherLogEntry,
  createWatcherLogEntry,
  getLogDeploymentKey,
  readWatcherLogEntries,
  writeWatcherLogEntries,
};
