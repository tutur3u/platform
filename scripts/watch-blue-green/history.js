const fs = require('node:fs');

const { getWatchPaths } = require('./paths.js');

const MAX_DEPLOYMENTS = 5;
const SKIP_WATCH_HISTORY_ENV = 'DOCKER_WEB_SKIP_WATCH_HISTORY';

function readDeploymentHistory(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.historyFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(paths.historyFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDeploymentHistory(history, paths = getWatchPaths(), fsImpl = fs) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.historyFile,
    JSON.stringify(history, null, 2),
    'utf8'
  );
}

function appendDeploymentHistory(
  entry,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  const history = readDeploymentHistory(paths, fsImpl);
  const nextHistory = history.map((existing, index) => {
    if (
      entry.status === 'successful' &&
      entry.deploymentKind !== 'standby-refresh' &&
      index >= 0 &&
      existing.status === 'successful' &&
      !existing.endedAt
    ) {
      return {
        ...existing,
        endedAt: entry.activatedAt ?? entry.finishedAt ?? entry.startedAt,
      };
    }

    return existing;
  });

  nextHistory.unshift(entry);

  const trimmed = nextHistory.slice(0, MAX_DEPLOYMENTS);
  writeDeploymentHistory(trimmed, paths, fsImpl);
  return trimmed;
}

function getLatestDeploymentSummary(deployments = []) {
  const latestDeployment = deployments[0];

  if (!latestDeployment) {
    return {
      lastDeployAt: null,
      lastDeployStatus: null,
    };
  }

  return {
    lastDeployAt:
      latestDeployment.finishedAt ??
      latestDeployment.activatedAt ??
      latestDeployment.startedAt ??
      null,
    lastDeployStatus:
      latestDeployment.status === 'failed'
        ? 'failed'
        : latestDeployment.status === 'building' ||
            latestDeployment.status === 'deploying'
          ? latestDeployment.status
          : 'successful',
  };
}

function createPendingDeploymentEntry({
  activeColor = null,
  deploymentKind = 'promotion',
  latestCommit = null,
  startedAt,
  status = 'deploying',
} = {}) {
  return {
    activeColor,
    buildDurationMs: null,
    commitHash: latestCommit?.hash ?? null,
    commitShortHash: latestCommit?.shortHash ?? null,
    commitSubject: latestCommit?.subject ?? null,
    deploymentKind,
    startedAt,
    status,
  };
}

function prependPendingDeployment(deployments, pendingDeployment) {
  return [
    pendingDeployment,
    ...(deployments ?? []).filter(
      (entry) =>
        !(
          pendingDeployment.commitHash &&
          entry.commitHash === pendingDeployment.commitHash &&
          (entry.status === 'building' || entry.status === 'deploying')
        )
    ),
  ].slice(0, MAX_DEPLOYMENTS);
}

module.exports = {
  MAX_DEPLOYMENTS,
  SKIP_WATCH_HISTORY_ENV,
  appendDeploymentHistory,
  createPendingDeploymentEntry,
  getLatestDeploymentSummary,
  prependPendingDeployment,
  readDeploymentHistory,
  writeDeploymentHistory,
};
