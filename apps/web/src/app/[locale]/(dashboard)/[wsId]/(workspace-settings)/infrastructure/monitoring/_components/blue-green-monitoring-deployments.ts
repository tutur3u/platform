import type { BlueGreenMonitoringDeployment } from '@tuturuuu/internal-api/infrastructure';

export type BlueGreenMonitoringDeploymentRollup =
  BlueGreenMonitoringDeployment & {
    activeColors: string[];
    deploymentStamps: string[];
    mergedDeploymentCount: number;
    runtimeStates: Array<'active' | 'standby'>;
  };

function getDeploymentTimestamp(deployment: BlueGreenMonitoringDeployment) {
  return (
    deployment.activatedAt ??
    deployment.finishedAt ??
    deployment.startedAt ??
    deployment.endedAt ??
    0
  );
}

function getDeploymentDedupeKey(
  deployment: BlueGreenMonitoringDeployment,
  index: number
) {
  if (deployment.status === 'successful' && deployment.commitHash) {
    return `successful:${deployment.commitHash}`;
  }

  return (
    deployment.deploymentStamp ??
    (deployment.startedAt != null
      ? `${deployment.status ?? 'unknown'}:${deployment.startedAt}`
      : `entry:${index}`)
  );
}

function mergeUniqueStrings(left: string[], value: string | null | undefined) {
  return value && !left.includes(value) ? [...left, value] : left;
}

function mergeUniqueRuntimeStates(
  left: Array<'active' | 'standby'>,
  value: BlueGreenMonitoringDeployment['runtimeState']
) {
  return value && !left.includes(value) ? [...left, value] : left;
}

function sumNullableNumbers(
  left: number | null | undefined,
  right: number | null | undefined
) {
  if (left == null) {
    return right ?? null;
  }

  if (right == null) {
    return left;
  }

  return left + right;
}

function maxNullableNumber(
  left: number | null | undefined,
  right: number | null | undefined
) {
  if (left == null) {
    return right ?? null;
  }

  if (right == null) {
    return left;
  }

  return Math.max(left, right);
}

function minNullableNumber(
  left: number | null | undefined,
  right: number | null | undefined
) {
  if (left == null) {
    return right ?? null;
  }

  if (right == null) {
    return left;
  }

  return Math.min(left, right);
}

function toRollup(
  deployment: BlueGreenMonitoringDeployment
): BlueGreenMonitoringDeploymentRollup {
  return {
    ...deployment,
    activeColors: deployment.activeColor ? [deployment.activeColor] : [],
    deploymentStamps: deployment.deploymentStamp
      ? [deployment.deploymentStamp]
      : [],
    mergedDeploymentCount: 1,
    runtimeStates: deployment.runtimeState ? [deployment.runtimeState] : [],
  };
}

function mergeDeployments(
  left: BlueGreenMonitoringDeploymentRollup,
  right: BlueGreenMonitoringDeployment
): BlueGreenMonitoringDeploymentRollup {
  const activeColors = mergeUniqueStrings(left.activeColors, right.activeColor);
  const deploymentStamps = mergeUniqueStrings(
    left.deploymentStamps,
    right.deploymentStamp
  );
  const runtimeStates = mergeUniqueRuntimeStates(
    left.runtimeStates,
    right.runtimeState
  );

  return {
    ...left,
    activeColor: activeColors.join(' / ') || left.activeColor,
    activatedAt: maxNullableNumber(left.activatedAt, right.activatedAt),
    activeColors,
    averageLatencyMs: maxNullableNumber(
      left.averageLatencyMs,
      right.averageLatencyMs
    ),
    averageRequestsPerMinute: sumNullableNumbers(
      left.averageRequestsPerMinute,
      right.averageRequestsPerMinute
    ),
    buildDurationMs: maxNullableNumber(
      left.buildDurationMs,
      right.buildDurationMs
    ),
    dailyAverageRequests: sumNullableNumbers(
      left.dailyAverageRequests,
      right.dailyAverageRequests
    ),
    dailyPeakRequests: maxNullableNumber(
      left.dailyPeakRequests,
      right.dailyPeakRequests
    ),
    dailyRequestCount: sumNullableNumbers(
      left.dailyRequestCount,
      right.dailyRequestCount
    ),
    deploymentStamp: deploymentStamps.join(' / ') || left.deploymentStamp,
    deploymentStamps,
    endedAt: maxNullableNumber(left.endedAt, right.endedAt),
    errorCount: sumNullableNumbers(left.errorCount, right.errorCount),
    finishedAt: maxNullableNumber(left.finishedAt, right.finishedAt),
    firstRequestAt: minNullableNumber(
      left.firstRequestAt,
      right.firstRequestAt
    ),
    lastRequestAt: maxNullableNumber(left.lastRequestAt, right.lastRequestAt),
    lifetimeMs: maxNullableNumber(left.lifetimeMs, right.lifetimeMs),
    mergedDeploymentCount: left.mergedDeploymentCount + 1,
    peakRequestsPerMinute: maxNullableNumber(
      left.peakRequestsPerMinute,
      right.peakRequestsPerMinute
    ),
    requestCount: sumNullableNumbers(left.requestCount, right.requestCount),
    runtimeState: runtimeStates.includes('active')
      ? 'active'
      : (runtimeStates[0] ?? left.runtimeState),
    runtimeStates,
    startedAt: minNullableNumber(left.startedAt, right.startedAt),
  };
}

export function dedupeBlueGreenDeployments(
  deployments: BlueGreenMonitoringDeployment[]
): BlueGreenMonitoringDeploymentRollup[] {
  const rollups = new Map<string, BlueGreenMonitoringDeploymentRollup>();

  deployments.forEach((deployment, index) => {
    const key = getDeploymentDedupeKey(deployment, index);
    const existing = rollups.get(key);
    rollups.set(
      key,
      existing ? mergeDeployments(existing, deployment) : toRollup(deployment)
    );
  });

  return [...rollups.values()].sort(
    (left, right) =>
      getDeploymentTimestamp(right) - getDeploymentTimestamp(left)
  );
}
