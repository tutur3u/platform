const fs = require('node:fs');

const {
  DEFAULT_BUILDER_NAME,
  BUILDKIT_SERVICE_NAME,
} = require('../docker-web/buildkit-builder.js');
const {
  PROD_COMPOSE_FILE,
  getComposeCommandArgs,
  runCommand,
} = require('../docker-web/compose.js');
const {
  clearDeploymentBuildLock,
  describeActiveDeploymentConflict,
} = require('./build-lock.js');
const { appendDeploymentHistory } = require('./history.js');
const { ROOT_DIR, getWatchPaths } = require('./paths.js');

const BLUE_GREEN_WATCHER_SERVICE = 'web-blue-green-watcher';

async function cancelActiveBlueGreenBuild({
  cancellationSource = 'manual blue/green deploy',
  composeEnv,
  conflict,
  fsImpl = fs,
  latestCommit,
  now = () => Date.now(),
  paths = getWatchPaths(),
  processImpl = process,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  stopWatcherService = true,
} = {}) {
  const canceledAt = now();
  const reason = `Canceled active deployment before ${cancellationSource}: ${describeActiveDeploymentConflict(conflict)}`;
  const ownerPid = Number(conflict?.lock?.ownerPid ?? conflict?.lock?.pid);
  const shouldStopWatcherService =
    stopWatcherService &&
    (!Number.isInteger(ownerPid) || ownerPid !== processImpl.pid);
  const services = [
    ...(shouldStopWatcherService ? [BLUE_GREEN_WATCHER_SERVICE] : []),
    BUILDKIT_SERVICE_NAME,
  ];

  await run(
    'docker',
    getComposeCommandArgs(
      PROD_COMPOSE_FILE,
      ['--profile', 'redis'],
      'stop',
      '--timeout',
      '1',
      ...services
    ),
    {
      env: composeEnv,
      stdio: 'pipe',
    }
  );
  await run('docker', ['buildx', 'rm', DEFAULT_BUILDER_NAME], {
    env: composeEnv,
    stdio: 'pipe',
  });

  clearDeploymentBuildLock({ fsImpl, paths });
  if (fsImpl.existsSync(paths.statusFile)) {
    fsImpl.rmSync(paths.statusFile, { force: true });
  }

  appendDeploymentHistory(
    {
      buildDurationMs: Math.max(
        0,
        canceledAt - (conflict?.lock?.startedAt ?? canceledAt)
      ),
      cancellationReason: reason,
      commitHash: conflict?.lock?.commitHash ?? latestCommit?.hash ?? null,
      commitShortHash:
        conflict?.lock?.commitShortHash ?? latestCommit?.shortHash ?? null,
      commitSubject:
        conflict?.lock?.commitSubject ?? latestCommit?.subject ?? null,
      deploymentKind: conflict?.lock?.deploymentKind ?? 'manual-interrupt',
      finishedAt: canceledAt,
      rootDir,
      startedAt: conflict?.lock?.startedAt ?? canceledAt,
      status: 'canceled',
    },
    {
      fsImpl,
      paths,
    }
  );

  return reason;
}

module.exports = {
  BLUE_GREEN_WATCHER_SERVICE,
  cancelActiveBlueGreenBuild,
};
