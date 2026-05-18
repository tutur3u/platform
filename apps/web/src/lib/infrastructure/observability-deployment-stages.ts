import type {
  BlueGreenDeploymentStage,
  BlueGreenDeploymentTarget,
  BlueGreenMonitoringDeployment,
  ObservabilityDeployment,
} from '@tuturuuu/internal-api/infrastructure';

export interface ObservabilitySupportBuildStats {
  supportBuildCacheHits: number;
  supportBuildServiceCount: number;
  supportBuildServices: string[];
}

export function createDeploymentStageSummary(
  stages: BlueGreenDeploymentStage[],
  supportBuildCacheHits: number,
  supportBuildServices: string[]
): ObservabilityDeployment['stageSummary'] {
  const promotedTargets = new Set<BlueGreenDeploymentTarget>();
  const blockedTargets = new Set<BlueGreenDeploymentTarget>();

  for (const stage of stages) {
    if (stage.status === 'succeeded' && stage.target !== 'proxy') {
      promotedTargets.add(stage.target);
    }

    if (stage.status === 'failed') {
      blockedTargets.add(stage.target);
    }
  }

  return {
    blockedTargets: [...blockedTargets],
    cacheHitCount: supportBuildCacheHits,
    failedStageCount: stages.filter((stage) => stage.status === 'failed')
      .length,
    promotedTargets: [...promotedTargets],
    rebuildCount: supportBuildServices.length,
    runningStageCount: stages.filter((stage) => stage.status === 'running')
      .length,
    skippedStageCount: stages.filter((stage) => stage.status === 'skipped')
      .length,
    totalStageCount: stages.length,
  };
}

function createSyntheticDeploymentStages(
  deployment: BlueGreenMonitoringDeployment
): BlueGreenDeploymentStage[] {
  const status = String(deployment.status ?? '');

  if (status !== 'building' && status !== 'deploying') {
    return [];
  }

  const startedAt =
    typeof deployment.startedAt === 'number' &&
    Number.isFinite(deployment.startedAt)
      ? deployment.startedAt
      : null;
  const color =
    typeof deployment.activeColor === 'string' ? deployment.activeColor : null;
  const id = status === 'deploying' ? 'web-promote' : 'web-build';

  return [
    {
      buildServices: [],
      color,
      durationMs: null,
      failureReason: null,
      finishedAt: null,
      id,
      serviceNames: color ? [`web-${color}`] : [],
      skippedReason: null,
      startedAt,
      status: 'running',
      target: 'web',
    },
  ];
}

function isHiveBuildService(serviceName: string) {
  return serviceName.startsWith('hive-') || serviceName === 'hive-realtime';
}

function createInferredDeploymentStage(
  id: string,
  target: BlueGreenDeploymentTarget,
  {
    buildServices = [],
    color = null,
    finishedAt,
    serviceNames = [],
    skippedReason = null,
    startedAt,
    status = 'succeeded',
  }: {
    buildServices?: string[];
    color?: string | null;
    finishedAt: number | null;
    serviceNames?: string[];
    skippedReason?: string | null;
    startedAt: number | null;
    status?: BlueGreenDeploymentStage['status'];
  }
): BlueGreenDeploymentStage {
  return {
    buildServices,
    color,
    durationMs:
      startedAt != null && finishedAt != null
        ? Math.max(0, finishedAt - startedAt)
        : null,
    failureReason: null,
    finishedAt,
    id,
    serviceNames,
    skippedReason,
    startedAt,
    status,
    target,
  };
}

function createInferredCompletedDeploymentStages(
  deployment: BlueGreenMonitoringDeployment,
  supportBuildStats: ObservabilitySupportBuildStats
): BlueGreenDeploymentStage[] {
  if (deployment.status !== 'successful') {
    return [];
  }

  const hasModernDeploymentContext = Boolean(
    deployment.deploymentStamp ||
      deployment.deploymentKind ||
      deployment.imageTag ||
      supportBuildStats.supportBuildCacheHits > 0 ||
      supportBuildStats.supportBuildServiceCount > 0 ||
      supportBuildStats.supportBuildServices.length > 0
  );

  if (!hasModernDeploymentContext) {
    return [];
  }

  const startedAt =
    typeof deployment.startedAt === 'number' &&
    Number.isFinite(deployment.startedAt)
      ? deployment.startedAt
      : null;
  const finishedAt =
    typeof deployment.finishedAt === 'number' &&
    Number.isFinite(deployment.finishedAt)
      ? deployment.finishedAt
      : null;
  const color =
    typeof deployment.activeColor === 'string' ? deployment.activeColor : null;
  const webService = color ? [`web-${color}`] : [];
  const hiveBuildServices =
    supportBuildStats.supportBuildServices.filter(isHiveBuildService);
  const supportRefreshServices = supportBuildStats.supportBuildServices.filter(
    (serviceName) => !isHiveBuildService(serviceName)
  );
  const refreshedHive = hiveBuildServices.length > 0;
  const refreshedSupport = supportRefreshServices.length > 0;
  const standbyRefresh =
    deployment.runtimeState === 'standby' ||
    deployment.deploymentKind?.includes('standby-refresh') === true;

  return [
    createInferredDeploymentStage('web-build', 'web', {
      buildServices: webService,
      color,
      finishedAt,
      serviceNames: webService,
      startedAt,
    }),
    createInferredDeploymentStage('web-promote', 'web', {
      color,
      finishedAt,
      serviceNames: webService,
      skippedReason: standbyRefresh
        ? 'standby refresh does not promote live web traffic'
        : null,
      startedAt,
      status: standbyRefresh ? 'skipped' : 'succeeded',
    }),
    createInferredDeploymentStage('hive-migrate', 'hive', {
      color,
      finishedAt,
      serviceNames: refreshedHive ? ['hive-db-migrate'] : [],
      skippedReason: refreshedHive ? null : 'no Hive changes',
      startedAt,
      status: refreshedHive ? 'succeeded' : 'skipped',
    }),
    createInferredDeploymentStage('hive-promote', 'hive', {
      buildServices: hiveBuildServices,
      color,
      finishedAt,
      serviceNames: refreshedHive
        ? [color ? `hive-${color}` : null, 'hive-realtime'].filter(
            (serviceName): serviceName is string => Boolean(serviceName)
          )
        : [],
      skippedReason: refreshedHive ? null : 'no Hive changes',
      startedAt,
      status: refreshedHive ? 'succeeded' : 'skipped',
    }),
    createInferredDeploymentStage('support-refresh', 'support', {
      buildServices: supportRefreshServices,
      finishedAt,
      serviceNames: supportRefreshServices,
      skippedReason: refreshedSupport ? null : 'support build inputs unchanged',
      startedAt,
      status: refreshedSupport ? 'succeeded' : 'skipped',
    }),
    createInferredDeploymentStage('proxy-reload', 'proxy', {
      color,
      finishedAt,
      serviceNames: ['web-proxy'],
      startedAt,
    }),
  ];
}

export function createDeploymentStagesForObservability(
  deployment: BlueGreenMonitoringDeployment,
  supportBuildStats: ObservabilitySupportBuildStats
) {
  const persistedDeploymentStages = deployment.stages ?? [];
  const hasPersistedDeploymentStages = persistedDeploymentStages.length > 0;

  if (hasPersistedDeploymentStages) {
    return {
      stages: persistedDeploymentStages,
      synthesizedStages: false,
    };
  }

  const syntheticDeploymentStages = createSyntheticDeploymentStages(deployment);

  if (syntheticDeploymentStages.length > 0) {
    return {
      stages: syntheticDeploymentStages,
      synthesizedStages: true,
    };
  }

  const inferredDeploymentStages = createInferredCompletedDeploymentStages(
    deployment,
    supportBuildStats
  );

  return {
    stages: inferredDeploymentStages,
    synthesizedStages: inferredDeploymentStages.length > 0,
  };
}
