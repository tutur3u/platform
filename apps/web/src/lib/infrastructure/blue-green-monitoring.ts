import fs from 'node:fs';
import path from 'node:path';
import type {
  BlueGreenMonitoringSnapshot,
  BlueGreenMonitoringStatus,
  BlueGreenMonitoringWatcherHealth,
} from '@tuturuuu/internal-api/infrastructure';

type FsLike = Pick<typeof fs, 'existsSync' | 'readFileSync'>;

const DOCKER_WEB_ENV_KEY = 'PLATFORM_BLUE_GREEN_MONITORING_DIR';

function resolveMonitoringDir(fsImpl: FsLike = fs) {
  const configuredDir = process.env[DOCKER_WEB_ENV_KEY]?.trim();
  const candidates = [
    configuredDir,
    path.resolve(process.cwd(), 'tmp', 'docker-web'),
    path.resolve(process.cwd(), '..', 'tmp', 'docker-web'),
    path.resolve(process.cwd(), '..', '..', 'tmp', 'docker-web'),
  ].filter((value): value is string => Boolean(value));

  const existing = candidates.find((candidate) => fsImpl.existsSync(candidate));

  return {
    exists: Boolean(existing),
    path: existing ?? candidates[0] ?? path.resolve('tmp', 'docker-web'),
  };
}

function readJsonFile<T>(filePath: string, fsImpl: FsLike = fs): T | null {
  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readTextFile(filePath: string, fsImpl: FsLike = fs) {
  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const value = fsImpl.readFileSync(filePath, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

function toFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEvents(entries: Array<Record<string, unknown>>) {
  return entries.flatMap((entry) => {
    const level = typeof entry.level === 'string' ? entry.level : 'info';
    const message = typeof entry.message === 'string' ? entry.message : null;
    const time = toFiniteNumber(entry.time);

    if (!message || time == null) {
      return [];
    }

    return [{ level, message, time }];
  });
}

function normalizeWatcherHealth(
  updatedAt: number | null,
  intervalMs: number | null,
  runtimeMounted: boolean,
  isLocked: boolean,
  now: number
): BlueGreenMonitoringWatcherHealth {
  if (!runtimeMounted) {
    return 'missing';
  }

  if (updatedAt == null) {
    return isLocked ? 'offline' : 'offline';
  }

  const staleAfterMs = Math.max((intervalMs ?? 0) * 4, 15_000);
  return now - updatedAt > staleAfterMs ? 'stale' : 'live';
}

function normalizeWatcherStatus(
  health: BlueGreenMonitoringWatcherHealth
): BlueGreenMonitoringStatus {
  if (health === 'live') {
    return 'healthy';
  }

  if (health === 'stale') {
    return 'degraded';
  }

  return 'offline';
}

function humanizeStatus(status: unknown) {
  return typeof status === 'string' && status.length > 0 ? status : null;
}

export function readBlueGreenMonitoringSnapshot({
  fsImpl = fs,
  now = Date.now(),
}: {
  fsImpl?: FsLike;
  now?: number;
} = {}): BlueGreenMonitoringSnapshot {
  const monitoringDir = resolveMonitoringDir(fsImpl);
  const watchDir = path.join(monitoringDir.path, 'watch');
  const prodDir = path.join(monitoringDir.path, 'prod');

  const status = readJsonFile<Record<string, unknown>>(
    path.join(watchDir, 'blue-green-auto-deploy.status.json'),
    fsImpl
  );
  const lock = readJsonFile<Record<string, unknown>>(
    path.join(watchDir, 'blue-green-auto-deploy.lock'),
    fsImpl
  );
  const args =
    readJsonFile<string[]>(
      path.join(watchDir, 'blue-green-auto-deploy.args.json'),
      fsImpl
    ) ?? [];
  const history =
    readJsonFile<Array<Record<string, unknown>>>(
      path.join(watchDir, 'blue-green-auto-deploy.history.json'),
      fsImpl
    ) ?? [];

  const activeColor = readTextFile(path.join(prodDir, 'active-color'), fsImpl);
  const deploymentStamp = readTextFile(
    path.join(prodDir, 'deployment-stamp'),
    fsImpl
  );
  const runtime =
    (status?.currentBlueGreen as Record<string, unknown> | null) ?? null;
  const dockerResources =
    (status?.dockerResources as Record<string, unknown> | null) ?? null;
  const deployments =
    (Array.isArray(status?.deployments)
      ? (status?.deployments as Array<Record<string, unknown>>)
      : history) ?? [];
  const events = Array.isArray(status?.events)
    ? (status.events as Array<Record<string, unknown>>)
    : [];
  const latestCommitRecord = toRecord(status?.latestCommit);
  const lockRecord = toRecord(lock);
  const targetRecord = toRecord(status?.target);
  const updatedAt = toFiniteNumber(status?.updatedAt);
  const intervalMs = toFiniteNumber(status?.intervalMs);
  const watcherHealth = normalizeWatcherHealth(
    updatedAt,
    intervalMs,
    monitoringDir.exists,
    Boolean(lock),
    now
  );
  const successfulDeployments = deployments.filter(
    (entry) => entry.status === 'successful'
  );
  const failedDeployments = deployments.filter(
    (entry) => entry.status === 'failed'
  );
  const buildDurations = deployments
    .map((entry) => toFiniteNumber(entry.buildDurationMs))
    .filter((value): value is number => value != null);
  const requestTotals = deployments
    .map((entry) => toFiniteNumber(entry.requestCount))
    .filter((value): value is number => value != null);
  const currentRequests = toFiniteNumber(runtime?.requestCount);
  const currentAverageRpm = toFiniteNumber(runtime?.averageRequestsPerMinute);
  const currentPeakRpm = toFiniteNumber(runtime?.peakRequestsPerMinute);

  return {
    dockerResources: {
      containers: Array.isArray(dockerResources?.containers)
        ? (dockerResources?.containers as BlueGreenMonitoringSnapshot['dockerResources']['containers'])
        : [],
      message:
        typeof dockerResources?.message === 'string'
          ? dockerResources.message
          : null,
      state:
        typeof dockerResources?.state === 'string'
          ? dockerResources.state
          : 'idle',
      totalCpuPercent: toFiniteNumber(dockerResources?.totalCpuPercent) ?? 0,
      totalMemoryBytes: toFiniteNumber(dockerResources?.totalMemoryBytes) ?? 0,
      totalRxBytes: toFiniteNumber(dockerResources?.totalRxBytes) ?? 0,
      totalTxBytes: toFiniteNumber(dockerResources?.totalTxBytes) ?? 0,
    },
    deployments: deployments as BlueGreenMonitoringSnapshot['deployments'],
    overview: {
      averageBuildDurationMs:
        buildDurations.length > 0
          ? buildDurations.reduce((sum, value) => sum + value, 0) /
            buildDurations.length
          : null,
      currentAverageRequestsPerMinute: currentAverageRpm,
      currentPeakRequestsPerMinute: currentPeakRpm,
      currentRequestCount: currentRequests,
      failedDeployments: failedDeployments.length,
      successfulDeployments: successfulDeployments.length,
      totalDeployments: deployments.length,
      totalRequestsServed: requestTotals.reduce((sum, value) => sum + value, 0),
    },
    runtime: {
      activatedAt: toFiniteNumber(runtime?.activatedAt),
      activeColor:
        typeof runtime?.activeColor === 'string'
          ? runtime.activeColor
          : activeColor,
      averageRequestsPerMinute: currentAverageRpm,
      dailyAverageRequests: toFiniteNumber(runtime?.dailyAverageRequests),
      dailyPeakRequests: toFiniteNumber(runtime?.dailyPeakRequests),
      dailyRequestCount: toFiniteNumber(runtime?.dailyRequestCount),
      deploymentStamp,
      lifetimeMs: toFiniteNumber(runtime?.lifetimeMs),
      liveColors: Array.isArray(runtime?.liveColors)
        ? (runtime.liveColors.filter(
            (value): value is string => typeof value === 'string'
          ) as string[])
        : activeColor
          ? [activeColor]
          : [],
      peakRequestsPerMinute: currentPeakRpm,
      requestCount: currentRequests,
      serviceContainers:
        runtime?.serviceContainers &&
        typeof runtime.serviceContainers === 'object' &&
        !Array.isArray(runtime.serviceContainers)
          ? (runtime.serviceContainers as Record<string, string>)
          : {},
      standbyColor:
        typeof runtime?.standbyColor === 'string' ? runtime.standbyColor : null,
      state: typeof runtime?.state === 'string' ? runtime.state : 'idle',
    },
    source: {
      historyAvailable: history.length > 0,
      monitoringDirAvailable: monitoringDir.exists,
      statusAvailable: status != null,
    },
    watcher: {
      args,
      events: normalizeEvents(events),
      health: watcherHealth,
      intervalMs,
      lastCheckAt: toFiniteNumber(status?.lastCheckAt),
      lastDeployAt: toFiniteNumber(status?.lastDeployAt),
      lastDeployStatus: humanizeStatus(status?.lastDeployStatus),
      lastResult:
        status?.lastResult && typeof status.lastResult === 'object'
          ? (status.lastResult as Record<string, unknown>)
          : null,
      latestCommit: latestCommitRecord
        ? {
            committedAt:
              typeof latestCommitRecord.committedAt === 'string'
                ? latestCommitRecord.committedAt
                : null,
            hash:
              typeof latestCommitRecord.hash === 'string'
                ? latestCommitRecord.hash
                : null,
            shortHash:
              typeof latestCommitRecord.shortHash === 'string'
                ? latestCommitRecord.shortHash
                : null,
            subject:
              typeof latestCommitRecord.subject === 'string'
                ? latestCommitRecord.subject
                : null,
          }
        : null,
      lock: lockRecord
        ? {
            branch:
              typeof lockRecord.branch === 'string' ? lockRecord.branch : null,
            createdAt:
              typeof lockRecord.createdAt === 'string'
                ? lockRecord.createdAt
                : null,
            upstreamRef:
              typeof lockRecord.upstreamRef === 'string'
                ? lockRecord.upstreamRef
                : null,
          }
        : null,
      nextCheckAt: toFiniteNumber(status?.nextCheckAt),
      status: normalizeWatcherStatus(watcherHealth),
      target: targetRecord
        ? {
            branch:
              typeof targetRecord.branch === 'string'
                ? targetRecord.branch
                : null,
            upstreamRef:
              typeof targetRecord.upstreamRef === 'string'
                ? targetRecord.upstreamRef
                : null,
          }
        : lockRecord
          ? {
              branch:
                typeof lockRecord.branch === 'string'
                  ? lockRecord.branch
                  : null,
              upstreamRef:
                typeof lockRecord.upstreamRef === 'string'
                  ? lockRecord.upstreamRef
                  : null,
            }
          : null,
      updatedAt,
    },
  };
}
