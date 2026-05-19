const fs = require('node:fs');

const {
  readBlueGreenActiveColor,
  readBlueGreenDeploymentStamp,
  readBlueGreenProxyActiveColor,
  runBlueGreenStandbyRefresh,
} = require('../docker-web/blue-green.js');
const { WEB_ENV_FILE } = require('../docker-web/env.js');
const {
  appendDeploymentHistory,
  createPendingDeploymentEntry,
  readDeploymentHistory,
} = require('./history.js');
const {
  DeploymentBuildLockConflictError,
  describeActiveDeploymentConflict,
  readDeploymentBuildLock,
  tryInvalidateStaleDeploymentBuildLock,
} = require('./build-lock.js');
const { getWatchPaths, ROOT_DIR } = require('./paths.js');
const { runCommand } = require('../docker-web/compose.js');

module.exports = function createActiveRecovery({
  DEFAULT_DEPLOY_COMMAND,
  cacheBlueGreenDeploymentImage,
  finalizeComposeProjectMigrationIfRequested,
  getExpectedStandbyColor,
  getLatestCachedSuccessfulDeployment,
  pruneBlueGreenRecoveryCacheImages,
  runBlueGreenCachedRecovery,
  runBlueGreenDeploy,
  runBunFrozenInstall,
}) {
  function noBlueGreenComposeContainersForRecovery(currentBlueGreen) {
    if (!currentBlueGreen || currentBlueGreen.state === 'unknown') {
      return false;
    }

    const sc = currentBlueGreen.serviceContainers ?? {};
    if (sc.proxy || sc['web-blue'] || sc['web-green']) {
      return false;
    }

    return true;
  }

  function reconcileDeploymentBuildLockWhenComposeStackIdle({
    currentBlueGreen,
    env,
    fsImpl,
    now,
    paths,
    processImpl = process,
  }) {
    if (!noBlueGreenComposeContainersForRecovery(currentBlueGreen)) {
      return;
    }

    const lock = readDeploymentBuildLock(paths, fsImpl);
    if (!lock) {
      return;
    }

    tryInvalidateStaleDeploymentBuildLock(lock, {
      env,
      fsImpl,
      now,
      paths,
      processImpl,
    });
  }

  async function runMissingActiveDeploymentRecovery(
    latestCommit,
    {
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
      processImpl = process,
      rootDir = ROOT_DIR,
      runCommand: run = runCommand,
      runtimeSnapshot = null,
    } = {}
  ) {
    const deploymentHistory = readDeploymentHistory(paths, fsImpl);
    const cachedDeployment =
      getLatestCachedSuccessfulDeployment(
        deploymentHistory,
        latestCommit.hash
      ) ?? getLatestCachedSuccessfulDeployment(deploymentHistory);

    log.warn?.(
      `No active blue/green deployment is serving traffic. Bootstrapping ${latestCommit.shortHash} as active and standby to avoid downtime.`
    );

    reconcileDeploymentBuildLockWhenComposeStackIdle({
      currentBlueGreen: runtimeSnapshot?.currentBlueGreen ?? null,
      env,
      fsImpl,
      now,
      paths,
      processImpl,
    });

    if (cachedDeployment) {
      const cachedCommit = {
        hash: cachedDeployment.commitHash ?? latestCommit.hash,
        shortHash:
          cachedDeployment.commitShortHash ??
          cachedDeployment.commitHash?.slice(0, 7) ??
          latestCommit.shortHash,
        subject: cachedDeployment.commitSubject ?? latestCommit.subject,
      };
      const activeStartedAt = now();
      onDeploymentStart({
        checkedAt,
        latestCommit: cachedCommit,
        pendingDeployment: createPendingDeploymentEntry({
          activeColor: cachedDeployment.activeColor ?? null,
          deploymentKind: 'recovery-cache',
          latestCommit: cachedCommit,
          startedAt: activeStartedAt,
          status: 'deploying',
        }),
      });

      try {
        const recovery = await runBlueGreenCachedRecovery({
          cachedImageTag: cachedDeployment.imageTag,
          env,
          envFilePath,
          fsImpl,
          latestCommit: cachedCommit,
          now,
          paths,
          rootDir,
          runCommand: run,
        });
        const activeFinishedAt = now();
        let history = appendDeploymentHistory(
          {
            activatedAt: activeFinishedAt,
            activeColor: recovery.activeColor,
            buildDurationMs: Math.max(0, activeFinishedAt - activeStartedAt),
            commitHash: cachedCommit.hash,
            commitShortHash: cachedCommit.shortHash,
            commitSubject: cachedCommit.subject,
            deploymentKind: 'recovery-cache',
            deploymentStamp: recovery.deploymentStamp,
            finishedAt: activeFinishedAt,
            imageTag: recovery.cachedImageTag,
            startedAt: activeStartedAt,
            status: 'successful',
          },
          {
            fsImpl,
            paths,
          }
        );
        const standbyStartedAt = now();
        onDeploymentStart({
          checkedAt,
          latestCommit: cachedCommit,
          pendingDeployment: createPendingDeploymentEntry({
            activeColor: recovery.standbyColor,
            deploymentKind: 'standby-refresh',
            latestCommit: cachedCommit,
            startedAt: standbyStartedAt,
            status: 'deploying',
          }),
        });
        const standbyFinishedAt = now();
        history = appendDeploymentHistory(
          {
            activatedAt: standbyFinishedAt,
            activeColor: recovery.standbyColor,
            buildDurationMs: Math.max(0, standbyFinishedAt - standbyStartedAt),
            commitHash: cachedCommit.hash,
            commitShortHash: cachedCommit.shortHash,
            commitSubject: cachedCommit.subject,
            deploymentKind: 'standby-refresh',
            deploymentStamp: recovery.deploymentStamp,
            finishedAt: standbyFinishedAt,
            imageTag: recovery.cachedImageTag,
            startedAt: standbyStartedAt,
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

        log.info?.(
          `Recovered blue/green runtime from cached image ${cachedDeployment.imageTag} with active ${recovery.activeColor} and standby ${recovery.standbyColor} for ${cachedCommit.shortHash}.`
        );

        const migration = await finalizeComposeProjectMigrationIfRequested({
          env,
          log,
          now,
          rootDir,
          runCommand: run,
        });

        return attachRuntime(
          {
            checkedAt,
            cachedImageTag: cachedDeployment.imageTag,
            latestCommit,
            migration,
            status: 'recovered',
          },
          history
        );
      } catch (error) {
        const activeFinishedAt = now();
        if (error instanceof DeploymentBuildLockConflictError) {
          const conflict = {
            elapsedMs: Math.max(0, now() - (error.lock?.startedAt ?? now())),
            lock: error.lock ?? null,
            source: 'lock',
            status: 'building',
          };

          log.warn?.(
            `Cached blue/green runtime recovery skipped for ${latestCommit.shortHash} because another deployment is active (${describeActiveDeploymentConflict(conflict)}).`
          );

          return attachRuntime({
            activeDeployment: conflict.lock,
            activeDeploymentSource: conflict.source,
            activeDeploymentStatus: conflict.status,
            checkedAt,
            error,
            latestCommit,
            status: 'deployment-active',
          });
        }

        const history = appendDeploymentHistory(
          {
            buildDurationMs: Math.max(0, activeFinishedAt - activeStartedAt),
            commitHash: cachedCommit.hash,
            commitShortHash: cachedCommit.shortHash,
            commitSubject: cachedCommit.subject,
            deploymentKind: 'recovery-cache',
            finishedAt: activeFinishedAt,
            imageTag: cachedDeployment.imageTag,
            startedAt: activeStartedAt,
            status: 'failed',
          },
          {
            fsImpl,
            paths,
          }
        );

        log.error?.(
          `Cached blue/green runtime recovery failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
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

    log.info?.(
      `Installing dependencies from the reviewed frozen lockfile for ${latestCommit.shortHash} before runtime recovery.`
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
        deploymentKind: 'recovery-bootstrap',
        latestCommit,
        startedAt: deployStartedAt,
        status: 'building',
      }),
    });

    let history;

    try {
      await runBlueGreenDeploy({
        deploymentKind: 'pending-restart',
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

      history = appendDeploymentHistory(
        {
          activatedAt: deployFinishedAt,
          activeColor,
          buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
          commitHash: latestCommit.hash,
          commitShortHash: latestCommit.shortHash,
          commitSubject: latestCommit.subject,
          deploymentKind: 'recovery-bootstrap',
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
    } catch (error) {
      const deployFinishedAt = now();
      if (error instanceof DeploymentBuildLockConflictError) {
        const conflict = {
          elapsedMs: Math.max(0, now() - (error.lock?.startedAt ?? now())),
          lock: error.lock ?? null,
          source: 'lock',
          status: 'building',
        };

        log.warn?.(
          `Blue/green runtime recovery skipped for ${latestCommit.shortHash} because another deployment is active (${describeActiveDeploymentConflict(conflict)}).`
        );

        return attachRuntime({
          activeDeployment: conflict.lock,
          activeDeploymentSource: conflict.source,
          activeDeploymentStatus: conflict.status,
          checkedAt,
          error,
          latestCommit,
          status: 'deployment-active',
        });
      }

      history = appendDeploymentHistory(
        {
          buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
          commitHash: latestCommit.hash,
          commitShortHash: latestCommit.shortHash,
          commitSubject: latestCommit.subject,
          deploymentKind: 'recovery-bootstrap',
          finishedAt: deployFinishedAt,
          startedAt: deployStartedAt,
          status: 'failed',
        },
        {
          fsImpl,
          paths,
        }
      );

      log.error?.(
        `Blue/green runtime recovery failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
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

    const activeColor =
      readBlueGreenActiveColor(paths.blueGreen, fsImpl) ??
      readBlueGreenProxyActiveColor(paths.blueGreen, fsImpl);
    const standbyColor = getExpectedStandbyColor(activeColor);
    const standbyStartedAt = now();

    onDeploymentStart({
      checkedAt,
      latestCommit,
      pendingDeployment: createPendingDeploymentEntry({
        activeColor: standbyColor,
        deploymentKind: 'standby-refresh',
        latestCommit,
        startedAt: standbyStartedAt,
        status: 'building',
      }),
    });

    try {
      const standbyResult = await runBlueGreenStandbyRefresh({
        env,
        envFilePath,
        fsImpl,
        latestCommit,
        now,
        paths,
        rootDir,
        runCommand: run,
      });
      const standbyFinishedAt = now();
      const deploymentStamp = readBlueGreenDeploymentStamp(
        paths.blueGreen,
        fsImpl
      );
      const standbyImageTag = await cacheBlueGreenDeploymentImage({
        activeColor: standbyResult.standbyColor ?? standbyColor,
        env,
        envFilePath,
        fsImpl,
        latestCommit,
        log,
        rootDir,
        runCommand: run,
      });
      history = appendDeploymentHistory(
        {
          activatedAt: standbyFinishedAt,
          activeColor: standbyResult.standbyColor ?? standbyColor,
          buildDurationMs: Math.max(0, standbyFinishedAt - standbyStartedAt),
          commitHash: latestCommit.hash,
          commitShortHash: latestCommit.shortHash,
          commitSubject: latestCommit.subject,
          deploymentKind: 'standby-refresh',
          deploymentStamp,
          finishedAt: standbyFinishedAt,
          ...(standbyImageTag ? { imageTag: standbyImageTag } : {}),
          startedAt: standbyStartedAt,
          status: 'successful',
        },
        {
          fsImpl,
          paths,
        }
      );
      await pruneBlueGreenRecoveryCacheImages(history, {
        env,
        extraImageTag: standbyImageTag ?? imageTag,
        log,
        runCommand: run,
      });

      log.info?.(
        `Recovered blue/green runtime with active ${activeColor ?? 'unknown'} and standby ${standbyResult.standbyColor ?? standbyColor ?? 'unknown'} for ${latestCommit.shortHash}.`
      );

      const migration = await finalizeComposeProjectMigrationIfRequested({
        env,
        log,
        now,
        rootDir,
        runCommand: run,
      });

      return attachRuntime(
        {
          checkedAt,
          latestCommit,
          migration,
          status: 'recovered',
        },
        history
      );
    } catch (error) {
      const standbyFinishedAt = now();
      history = appendDeploymentHistory(
        {
          activeColor: standbyColor,
          buildDurationMs: Math.max(0, standbyFinishedAt - standbyStartedAt),
          commitHash: latestCommit.hash,
          commitShortHash: latestCommit.shortHash,
          commitSubject: latestCommit.subject,
          deploymentKind: 'standby-refresh',
          finishedAt: standbyFinishedAt,
          startedAt: standbyStartedAt,
          status: 'failed',
        },
        {
          fsImpl,
          paths,
        }
      );

      log.error?.(
        `Recovered active ${activeColor ?? 'unknown'} but standby recovery failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
      );

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

  return {
    noBlueGreenComposeContainersForRecovery,
    reconcileDeploymentBuildLockWhenComposeStackIdle,
    runMissingActiveDeploymentRecovery,
  };
};
