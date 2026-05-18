const fs = require('node:fs');
const path = require('node:path');

const { getWatchPaths } = require('./paths.js');

const MAX_DEPLOYMENTS = 10_000;
const SKIP_WATCH_HISTORY_ENV = 'DOCKER_WEB_SKIP_WATCH_HISTORY';
const DEPLOYMENT_KIND_ENV = 'DOCKER_WEB_DEPLOYMENT_KIND';
const DEPLOYMENT_STAGES_FILE_ENV = 'DOCKER_WEB_DEPLOYMENT_STAGES_FILE';

function normalizeDeploymentStages(value) {
  return Array.isArray(value)
    ? value.filter(
        (stage) =>
          stage &&
          typeof stage === 'object' &&
          typeof stage.id === 'string' &&
          stage.id.length > 0
      )
    : [];
}

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

function readDeploymentStagesHandoff(filePath, fsImpl = fs) {
  if (!filePath || !fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    const record =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : { stages: parsed };
    const stages = normalizeDeploymentStages(record.stages);

    if (stages.length === 0) {
      return null;
    }

    return {
      commitHash:
        typeof record.commitHash === 'string' ? record.commitHash : null,
      deploymentKind:
        typeof record.deploymentKind === 'string'
          ? record.deploymentKind
          : null,
      stages,
      status: typeof record.status === 'string' ? record.status : null,
    };
  } catch {
    return null;
  }
}

function writeDeploymentStagesHandoff(
  { commitHash = null, deploymentKind = null, stages, status = null } = {},
  filePath,
  fsImpl = fs
) {
  const normalizedStages = normalizeDeploymentStages(stages);

  if (!filePath || normalizedStages.length === 0) {
    return false;
  }

  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(
    filePath,
    JSON.stringify(
      {
        commitHash,
        deploymentKind,
        stages: normalizedStages,
        status,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  return true;
}

function clearDeploymentStagesHandoff(filePath, fsImpl = fs) {
  if (!filePath || !fsImpl.existsSync(filePath)) {
    return;
  }

  if (typeof fsImpl.rmSync === 'function') {
    fsImpl.rmSync(filePath, { force: true });
    return;
  }

  fsImpl.unlinkSync(filePath);
}

function deploymentStagesHandoffMatches(entry, handoff) {
  if (!handoff) {
    return false;
  }

  if (
    entry.commitHash &&
    handoff.commitHash &&
    entry.commitHash !== handoff.commitHash
  ) {
    return false;
  }

  if (
    entry.deploymentKind &&
    handoff.deploymentKind &&
    entry.deploymentKind !== handoff.deploymentKind
  ) {
    return false;
  }

  if (entry.status === 'failed' && handoff.status === 'successful') {
    return false;
  }

  if (entry.status === 'successful' && handoff.status === 'failed') {
    return false;
  }

  return true;
}

function hydrateDeploymentHistoryEntryWithStages(
  entry,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  if (normalizeDeploymentStages(entry.stages).length > 0) {
    return { consumed: false, entry };
  }

  const handoff = readDeploymentStagesHandoff(
    paths.deploymentStagesFile,
    fsImpl
  );

  if (!deploymentStagesHandoffMatches(entry, handoff)) {
    return { consumed: false, entry };
  }

  return {
    consumed: true,
    entry: {
      ...entry,
      stages: handoff.stages,
    },
  };
}

function appendDeploymentHistory(
  entry,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  const history = readDeploymentHistory(paths, fsImpl);
  const { consumed, entry: hydratedEntry } =
    hydrateDeploymentHistoryEntryWithStages(entry, { fsImpl, paths });
  const nextHistory = history.map((existing, index) => {
    if (
      hydratedEntry.status === 'successful' &&
      hydratedEntry.deploymentKind !== 'standby-refresh' &&
      index >= 0 &&
      existing.status === 'successful' &&
      !existing.endedAt
    ) {
      return {
        ...existing,
        endedAt:
          hydratedEntry.activatedAt ??
          hydratedEntry.finishedAt ??
          hydratedEntry.startedAt,
      };
    }

    return existing;
  });

  nextHistory.unshift(hydratedEntry);

  const trimmed = nextHistory.slice(0, MAX_DEPLOYMENTS);
  writeDeploymentHistory(trimmed, paths, fsImpl);
  if (consumed) {
    clearDeploymentStagesHandoff(paths.deploymentStagesFile, fsImpl);
  }
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
  const inProgressStatuses = new Set(['building', 'deploying']);

  return [
    pendingDeployment,
    ...(deployments ?? []).filter(
      (entry) => !inProgressStatuses.has(String(entry?.status ?? ''))
    ),
  ].slice(0, MAX_DEPLOYMENTS);
}

module.exports = {
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
  readDeploymentStagesHandoff,
  writeDeploymentStagesHandoff,
  writeDeploymentHistory,
};
