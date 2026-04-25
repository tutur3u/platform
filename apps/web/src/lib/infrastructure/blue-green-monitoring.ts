import fs from 'node:fs';
import path from 'node:path';
import type {
  BlueGreenDeploymentPin,
  BlueGreenInstantRolloutRequest,
  BlueGreenMonitoringDockerContainer,
  BlueGreenMonitoringDockerHealth,
  BlueGreenMonitoringPaginatedResult,
  BlueGreenMonitoringPeriodMetric,
  BlueGreenMonitoringRequestArchive,
  BlueGreenMonitoringRequestLog,
  BlueGreenMonitoringRouteSummary,
  BlueGreenMonitoringServiceHealth,
  BlueGreenMonitoringSnapshot,
  BlueGreenMonitoringStatus,
  BlueGreenMonitoringWatcherHealth,
  BlueGreenMonitoringWatcherLog,
} from '@tuturuuu/internal-api/infrastructure';

type FsLike = Pick<typeof fs, 'existsSync' | 'readFileSync'> &
  Partial<Pick<typeof fs, 'statSync'>>;
type DockerAggregateContainer = {
  cpuPercent: number | null;
  memoryBytes: number | null;
};

const DOCKER_WEB_ENV_KEY = 'PLATFORM_BLUE_GREEN_MONITORING_DIR';
const DEFAULT_ARCHIVE_PAGE_SIZE = 25;
const DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS = 7;
const DEFAULT_RECOVERY_CACHE_LIMIT = 3;
const MAX_ARCHIVE_PAGE_SIZE = 100;
const REQUEST_ARCHIVE_AGGREGATE_CACHE_TTL_MS = 10_000;
const REQUEST_ARCHIVE_TOP_ROUTE_LIMIT = 100;

interface RequestArchiveAggregateCacheEntry {
  analytics: BlueGreenMonitoringRequestArchive['analytics'];
  createdAt: number;
  items: BlueGreenMonitoringRequestLog[];
  signature: string;
}

const requestArchiveAggregateCache = new Map<
  string,
  RequestArchiveAggregateCacheEntry
>();

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

function getFileSignature(filePath: string, fsImpl: FsLike = fs) {
  if (!fsImpl.existsSync(filePath) || typeof fsImpl.statSync !== 'function') {
    return 'missing';
  }

  try {
    const stat = fsImpl.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'unreadable';
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

function toPositiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function clampArchivePageSize(pageSize: unknown) {
  const parsed = toPositiveInteger(pageSize) ?? DEFAULT_ARCHIVE_PAGE_SIZE;
  return Math.min(parsed, MAX_ARCHIVE_PAGE_SIZE);
}

function getArchivePage(page: unknown, total: number, pageSize: number) {
  const requestedPage = toPositiveInteger(page) ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    offset: (Math.min(requestedPage, pageCount) - 1) * pageSize,
    page: Math.min(requestedPage, pageCount),
    pageCount,
  };
}

function slicePreviewItems<T>(items: T[], limit: number | null | undefined) {
  if (limit == null) {
    return items;
  }

  if (limit <= 0) {
    return [];
  }

  return items.slice(0, limit);
}

function readJsonLinesFile<T>(filePath: string, fsImpl: FsLike = fs): T[] {
  if (!fsImpl.existsSync(filePath)) {
    return [];
  }

  try {
    return fsImpl
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function buildArchiveWindow<T extends { time: number }>(items: T[]) {
  return {
    newestAt: items[0]?.time ?? null,
    oldestAt: items[items.length - 1]?.time ?? null,
  };
}

function getMonitoringStatusFamily(status: number | null | undefined) {
  if (status == null || !Number.isFinite(status)) {
    return 'unknown';
  }

  if (status >= 500) {
    return 'serverError';
  }

  if (status >= 400) {
    return 'clientError';
  }

  if (status >= 300) {
    return 'redirect';
  }

  if (status >= 200) {
    return 'success';
  }

  if (status >= 100) {
    return 'informational';
  }

  return 'unknown';
}

function parseMonitoringRequestPath(rawPath: string) {
  try {
    const url = new URL(rawPath, 'http://127.0.0.1');
    const pathname = url.pathname || '/';
    const searchParamKeys = [...new Set(url.searchParams.keys())].sort();

    return {
      isServerComponentRequest: url.searchParams.has('_rsc'),
      pathname,
      querySignature:
        searchParamKeys.length > 0 ? `?${searchParamKeys.join('&')}` : '',
    };
  } catch {
    return {
      isServerComponentRequest: rawPath.includes('_rsc='),
      pathname: rawPath || '/',
      querySignature: '',
    };
  }
}

function normalizeRequestTimeframe({
  now,
  timeframeDays,
}: {
  now: number;
  timeframeDays?: number | null;
}) {
  const days =
    typeof timeframeDays === 'number' &&
    Number.isInteger(timeframeDays) &&
    timeframeDays >= 0
      ? timeframeDays
      : DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS;

  return {
    days: days === 0 ? null : days,
    endAt: now,
    startAt: days === 0 ? null : now - days * 24 * 60 * 60 * 1000,
  };
}

function isRequestInTimeframe(
  request: BlueGreenMonitoringRequestLog,
  timeframe: ReturnType<typeof normalizeRequestTimeframe>
) {
  return (
    request.time <= timeframe.endAt &&
    (timeframe.startAt == null || request.time >= timeframe.startAt)
  );
}

function buildRequestRouteSummaries(
  requests: BlueGreenMonitoringRequestLog[]
): BlueGreenMonitoringRouteSummary[] {
  const summaryMap = new Map<
    string,
    BlueGreenMonitoringRouteSummary & {
      hostSet: Set<string>;
      latencyTotal: number;
      latencySamples: number;
      methodSet: Set<string>;
      querySignatureSet: Set<string>;
    }
  >();

  for (const request of requests) {
    const parsedPath = parseMonitoringRequestPath(request.path);
    const existing = summaryMap.get(parsedPath.pathname) ?? {
      averageLatencyMs: null,
      errorCount: 0,
      firstRequestAt: null,
      hostSet: new Set<string>(),
      hostnames: [],
      internalCount: 0,
      isServerComponentRoute: false,
      lastRequestAt: null,
      latencySamples: 0,
      latencyTotal: 0,
      methodSet: new Set<string>(),
      methods: [],
      pathname: parsedPath.pathname,
      querySignatureSet: new Set<string>(),
      querySignatures: [],
      requestCount: 0,
      rscCount: 0,
      statusCounts: {
        clientError: 0,
        informational: 0,
        redirect: 0,
        serverError: 0,
        success: 0,
        unknown: 0,
      },
    };

    existing.requestCount += 1;
    existing.firstRequestAt =
      existing.firstRequestAt == null
        ? request.time
        : Math.min(existing.firstRequestAt, request.time);
    existing.lastRequestAt =
      existing.lastRequestAt == null
        ? request.time
        : Math.max(existing.lastRequestAt, request.time);
    existing.isServerComponentRoute =
      existing.isServerComponentRoute || parsedPath.isServerComponentRequest;

    if (request.isInternal) {
      existing.internalCount += 1;
    }

    if (parsedPath.isServerComponentRequest) {
      existing.rscCount += 1;
    }

    if ((request.status ?? 0) >= 400) {
      existing.errorCount += 1;
    }

    existing.statusCounts[getMonitoringStatusFamily(request.status)] += 1;

    if (
      request.requestTimeMs != null &&
      Number.isFinite(request.requestTimeMs)
    ) {
      existing.latencyTotal += request.requestTimeMs;
      existing.latencySamples += 1;
    }

    if (request.method) {
      existing.methodSet.add(request.method);
    }

    if (request.host) {
      existing.hostSet.add(request.host);
    }

    if (parsedPath.querySignature) {
      existing.querySignatureSet.add(parsedPath.querySignature);
    }

    summaryMap.set(parsedPath.pathname, existing);
  }

  return [...summaryMap.values()]
    .map(
      ({
        hostSet,
        latencySamples,
        latencyTotal,
        methodSet,
        querySignatureSet,
        ...summary
      }) => ({
        ...summary,
        averageLatencyMs:
          latencySamples > 0 ? latencyTotal / latencySamples : null,
        hostnames: [...hostSet].sort().slice(0, 8),
        methods: [...methodSet].sort(),
        querySignatures: [...querySignatureSet].sort().slice(0, 8),
      })
    )
    .sort((left, right) => {
      if (right.requestCount !== left.requestCount) {
        return right.requestCount - left.requestCount;
      }

      return left.pathname.localeCompare(right.pathname);
    });
}

function buildRequestArchiveAnalytics({
  requests,
  retainedRequestCount,
  timeframe,
}: {
  requests: BlueGreenMonitoringRequestLog[];
  retainedRequestCount: number;
  timeframe: ReturnType<typeof normalizeRequestTimeframe>;
}): BlueGreenMonitoringRequestArchive['analytics'] {
  const latencySamples = requests
    .map((request) => request.requestTimeMs)
    .filter(
      (value): value is number => value != null && Number.isFinite(value)
    );
  const statusCodes = [
    ...new Set(
      requests
        .map((request) => request.status)
        .filter(
          (value): value is number => value != null && Number.isFinite(value)
        )
    ),
  ].sort((left, right) => left - right);
  const topRoutes = buildRequestRouteSummaries(requests);

  return {
    averageLatencyMs:
      latencySamples.length > 0
        ? latencySamples.reduce((sum, value) => sum + value, 0) /
          latencySamples.length
        : null,
    distinctRoutes: topRoutes.length,
    errorRequestCount: requests.filter(
      (request) => (request.status ?? 0) >= 400
    ).length,
    externalRequestCount: requests.filter((request) => !request.isInternal)
      .length,
    internalRequestCount: requests.filter((request) => request.isInternal)
      .length,
    requestCount: requests.length,
    retainedRequestCount,
    rscRequestCount: requests.filter(
      (request) =>
        parseMonitoringRequestPath(request.path).isServerComponentRequest
    ).length,
    statusCodes,
    timeframe,
    topRoutes: topRoutes.slice(0, REQUEST_ARCHIVE_TOP_ROUTE_LIMIT),
  };
}

function getRequestArchiveCacheSignature(
  watchDir: string,
  fsImpl: FsLike = fs
) {
  const statePath = path.join(
    watchDir,
    'blue-green-request-telemetry.state.json'
  );
  const state = toRecord(
    readJsonFile<Record<string, unknown>>(statePath, fsImpl)
  );
  const currentChunkFile =
    typeof state?.currentChunkFile === 'string' ? state.currentChunkFile : null;
  const currentChunkSignature = currentChunkFile
    ? getFileSignature(
        path.join(watchDir, 'blue-green-request-logs', currentChunkFile),
        fsImpl
      )
    : 'none';

  return [
    getFileSignature(statePath, fsImpl),
    getFileSignature(
      path.join(watchDir, 'blue-green-request-telemetry.summary.json'),
      fsImpl
    ),
    currentChunkFile ?? 'none',
    currentChunkSignature,
  ].join('|');
}

function readCachedRequestArchiveAggregate({
  fsImpl = fs,
  now,
  timeframe,
  watchDir,
}: {
  fsImpl?: FsLike;
  now: number;
  timeframe: ReturnType<typeof normalizeRequestTimeframe>;
  watchDir: string;
}) {
  const cacheKey = `${watchDir}:${timeframe.days ?? 'all'}`;
  const signature = getRequestArchiveCacheSignature(watchDir, fsImpl);
  const cached = requestArchiveAggregateCache.get(cacheKey);

  if (
    cached &&
    cached.signature === signature &&
    now - cached.createdAt <= REQUEST_ARCHIVE_AGGREGATE_CACHE_TTL_MS
  ) {
    return cached;
  }

  const allItems = readAllRequestArchiveItems(watchDir, fsImpl, timeframe);
  const analytics = buildRequestArchiveAnalytics({
    requests: allItems.items,
    retainedRequestCount: allItems.totalRecords,
    timeframe,
  });
  const nextEntry = {
    analytics,
    createdAt: now,
    items: allItems.items,
    signature,
  };

  requestArchiveAggregateCache.set(cacheKey, nextEntry);

  for (const key of requestArchiveAggregateCache.keys()) {
    if (key.startsWith(`${watchDir}:`) && key !== cacheKey) {
      const entry = requestArchiveAggregateCache.get(key);
      if (
        entry &&
        (entry.signature !== signature ||
          now - entry.createdAt > REQUEST_ARCHIVE_AGGREGATE_CACHE_TTL_MS)
      ) {
        requestArchiveAggregateCache.delete(key);
      }
    }
  }

  return nextEntry;
}

function createArchiveResponse<T extends { time: number }>(
  items: T[],
  page: number,
  pageSize: number,
  total: number
): BlueGreenMonitoringPaginatedResult<T> {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    hasNextPage: page < pageCount,
    hasPreviousPage: page > 1,
    items,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    page,
    pageCount,
    total,
    window: buildArchiveWindow(items),
  };
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

function normalizeStatusCounts(value: unknown) {
  const record = toRecord(value);

  return {
    clientError: toFiniteNumber(record?.clientError) ?? 0,
    informational: toFiniteNumber(record?.informational) ?? 0,
    redirect: toFiniteNumber(record?.redirect) ?? 0,
    serverError: toFiniteNumber(record?.serverError) ?? 0,
    success: toFiniteNumber(record?.success) ?? 0,
  };
}

function getDeploymentStorageKey(entry: Record<string, unknown>) {
  if (typeof entry.deploymentStamp === 'string' && entry.deploymentStamp) {
    return `stamp:${entry.deploymentStamp}`;
  }

  if (typeof entry.commitHash === 'string' && entry.commitHash) {
    return `commit:${entry.commitHash}`;
  }

  const activatedAt =
    toFiniteNumber(entry.activatedAt) ??
    toFiniteNumber(entry.finishedAt) ??
    toFiniteNumber(entry.startedAt);

  if (typeof entry.activeColor === 'string' && activatedAt != null) {
    return `color:${entry.activeColor}:${activatedAt}`;
  }

  return `deployment:${activatedAt ?? 'unknown'}`;
}

function mergeDeploymentMetrics(
  deployments: Array<Record<string, unknown>>,
  telemetrySummary: Record<string, unknown> | null,
  now: number
): Array<Record<string, unknown>> {
  const metrics = toRecord(telemetrySummary?.deploymentMetrics) ?? {};

  return deployments.map((deployment) => {
    const metric = toRecord(metrics[getDeploymentStorageKey(deployment)]);
    const activatedAt = toFiniteNumber(deployment.activatedAt);
    const lifetimeMs =
      activatedAt != null
        ? Math.max(0, (toFiniteNumber(deployment.endedAt) ?? now) - activatedAt)
        : null;
    const requestCount = toFiniteNumber(metric?.requestCount);

    if (!metric || requestCount == null) {
      return {
        ...deployment,
        lifetimeMs,
      };
    }

    return {
      ...deployment,
      averageLatencyMs:
        requestCount > 0
          ? (toFiniteNumber(metric.totalLatencyMs) ?? 0) / requestCount
          : null,
      averageRequestsPerMinute:
        lifetimeMs != null && lifetimeMs > 0
          ? requestCount / Math.max(lifetimeMs / 60_000, 1 / 60)
          : null,
      dailyAverageRequests:
        lifetimeMs != null && lifetimeMs > 0
          ? requestCount / Math.max(lifetimeMs / 86_400_000, 1 / 86_400)
          : null,
      dailyPeakRequests: toFiniteNumber(metric.dailyPeakRequests),
      dailyRequestCount: toFiniteNumber(metric.dailyRequestCount),
      deploymentStamp:
        typeof metric.deploymentStamp === 'string'
          ? metric.deploymentStamp
          : deployment.deploymentStamp,
      errorCount: toFiniteNumber(metric.errorCount),
      firstRequestAt: toFiniteNumber(metric.firstRequestAt),
      lastRequestAt: toFiniteNumber(metric.lastRequestAt),
      lifetimeMs,
      peakRequestsPerMinute: toFiniteNumber(metric.peakRequestsPerMinute),
      requestCount,
    };
  });
}

function normalizePeriodMetrics(
  entries: unknown
): BlueGreenMonitoringPeriodMetric[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    const record = toRecord(entry);
    const bucketStart = toFiniteNumber(record?.bucketStart);
    const bucketLabel =
      typeof record?.bucketLabel === 'string' ? record.bucketLabel : null;

    if (bucketStart == null || !bucketLabel) {
      return [];
    }

    const requestCount = toFiniteNumber(record?.requestCount) ?? 0;
    const errorCount = toFiniteNumber(record?.errorCount) ?? 0;
    const totalLatencyMs = toFiniteNumber(record?.totalLatencyMs) ?? 0;

    return [
      {
        averageLatencyMs:
          requestCount > 0 ? totalLatencyMs / requestCount : null,
        bucketLabel,
        bucketStart,
        deploymentCount: Array.isArray(record?.deploymentKeys)
          ? record.deploymentKeys.length
          : 0,
        errorCount,
        errorRate: requestCount > 0 ? errorCount / requestCount : 0,
        peakRequestsPerMinute:
          toFiniteNumber(record?.peakRequestsPerMinute) ?? 0,
        requestCount,
        statusCounts: normalizeStatusCounts(record?.statusCounts),
      },
    ];
  });
}

function normalizeRecentRequests(
  entries: unknown
): BlueGreenMonitoringRequestLog[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    const record = toRecord(entry);
    const time = toFiniteNumber(record?.time);
    const path = typeof record?.path === 'string' ? record.path : null;

    if (time == null || !path) {
      return [];
    }

    return [
      {
        deploymentColor:
          typeof record?.deploymentColor === 'string'
            ? record.deploymentColor
            : null,
        deploymentKey:
          typeof record?.deploymentKey === 'string'
            ? record.deploymentKey
            : null,
        deploymentStamp:
          typeof record?.deploymentStamp === 'string'
            ? record.deploymentStamp
            : null,
        host: typeof record?.host === 'string' ? record.host : null,
        isInternal: record?.isInternal === true,
        method: typeof record?.method === 'string' ? record.method : null,
        path,
        requestTimeMs: toFiniteNumber(record?.requestTimeMs),
        status: toFiniteNumber(record?.status),
        time,
      },
    ];
  });
}

function normalizeWatcherLogs(
  entries: unknown
): BlueGreenMonitoringWatcherLog[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    const record = toRecord(entry);
    const time = toFiniteNumber(record?.time);
    const message = typeof record?.message === 'string' ? record.message : null;
    const level = typeof record?.level === 'string' ? record.level : null;

    if (time == null || !message || !level) {
      return [];
    }

    return [
      {
        activeColor:
          typeof record?.activeColor === 'string' ? record.activeColor : null,
        commitHash:
          typeof record?.commitHash === 'string' ? record.commitHash : null,
        commitShortHash:
          typeof record?.commitShortHash === 'string'
            ? record.commitShortHash
            : null,
        deploymentKey:
          typeof record?.deploymentKey === 'string'
            ? record.deploymentKey
            : null,
        deploymentKind:
          typeof record?.deploymentKind === 'string'
            ? record.deploymentKind
            : null,
        deploymentStamp:
          typeof record?.deploymentStamp === 'string'
            ? record.deploymentStamp
            : null,
        deploymentStatus:
          typeof record?.deploymentStatus === 'string'
            ? record.deploymentStatus
            : null,
        level,
        message,
        time,
      },
    ];
  });
}

function getDeploymentSortTime(deployment: Record<string, unknown>) {
  return (
    toFiniteNumber(deployment.finishedAt) ??
    toFiniteNumber(deployment.activatedAt) ??
    toFiniteNumber(deployment.startedAt) ??
    0
  );
}

function getRecoverableCachedDeployments(
  deployments: Array<Record<string, unknown>>,
  limit = DEFAULT_RECOVERY_CACHE_LIMIT
) {
  const seenImageTags = new Set<string>();
  const recoverableDeployments = deployments
    .toSorted(
      (left, right) =>
        getDeploymentSortTime(right) - getDeploymentSortTime(left)
    )
    .filter((deployment) => {
      const imageTag =
        typeof deployment.imageTag === 'string' ? deployment.imageTag : null;

      if (
        deployment.status !== 'successful' ||
        !imageTag ||
        seenImageTags.has(imageTag)
      ) {
        return false;
      }

      seenImageTags.add(imageTag);
      return true;
    });

  return {
    deployments: recoverableDeployments.slice(0, limit),
    limit,
    total: recoverableDeployments.length,
  };
}

function normalizeDeploymentPin(value: unknown): BlueGreenDeploymentPin | null {
  const record = toRecord(value);
  const commitHash =
    typeof record?.commitHash === 'string' && record.commitHash.length >= 7
      ? record.commitHash
      : null;
  const requestedAt =
    typeof record?.requestedAt === 'string' && record.requestedAt.length > 0
      ? record.requestedAt
      : null;
  const requestedBy =
    typeof record?.requestedBy === 'string' && record.requestedBy.length > 0
      ? record.requestedBy
      : null;

  if (
    record?.kind !== 'deployment-pin' ||
    !commitHash ||
    !requestedAt ||
    !requestedBy
  ) {
    return null;
  }

  return {
    activeColor:
      typeof record.activeColor === 'string' ? record.activeColor : null,
    commitHash,
    commitShortHash:
      typeof record.commitShortHash === 'string'
        ? record.commitShortHash
        : null,
    commitSubject:
      typeof record.commitSubject === 'string' ? record.commitSubject : null,
    deploymentStamp:
      typeof record.deploymentStamp === 'string'
        ? record.deploymentStamp
        : null,
    kind: 'deployment-pin',
    requestedAt,
    requestedBy,
    requestedByEmail:
      typeof record.requestedByEmail === 'string'
        ? record.requestedByEmail
        : null,
  };
}

function normalizeInstantRolloutRequest(
  value: unknown
): BlueGreenInstantRolloutRequest | null {
  const record = toRecord(value);
  const requestedAt =
    typeof record?.requestedAt === 'string' && record.requestedAt.length > 0
      ? record.requestedAt
      : null;
  const requestedBy =
    typeof record?.requestedBy === 'string' && record.requestedBy.length > 0
      ? record.requestedBy
      : null;

  if (record?.kind !== 'sync-standby' || !requestedAt || !requestedBy) {
    return null;
  }

  return {
    kind: 'sync-standby',
    requestedAt,
    requestedBy,
    requestedByEmail:
      typeof record.requestedByEmail === 'string'
        ? record.requestedByEmail
        : null,
  };
}

function normalizeDockerHealth(
  value: unknown
): BlueGreenMonitoringDockerHealth {
  return value === 'healthy' ||
    value === 'none' ||
    value === 'starting' ||
    value === 'unknown' ||
    value === 'unhealthy'
    ? value
    : 'unknown';
}

function normalizeDockerContainers(
  entries: unknown
): BlueGreenMonitoringDockerContainer[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    const record = toRecord(entry);
    const containerId =
      typeof record?.containerId === 'string' ? record.containerId : null;
    const name = typeof record?.name === 'string' ? record.name : null;

    if (!containerId || !name) {
      return [];
    }

    return [
      {
        containerId,
        cpuPercent: toFiniteNumber(record?.cpuPercent),
        health: normalizeDockerHealth(record?.health),
        image: typeof record?.image === 'string' ? record.image : null,
        isMonitored: record?.isMonitored === true,
        memoryBytes: toFiniteNumber(record?.memoryBytes),
        name,
        ports: typeof record?.ports === 'string' ? record.ports : null,
        projectName:
          typeof record?.projectName === 'string' ? record.projectName : null,
        runningFor:
          typeof record?.runningFor === 'string' ? record.runningFor : null,
        rxBytes: toFiniteNumber(record?.rxBytes),
        serviceName:
          typeof record?.serviceName === 'string' ? record.serviceName : null,
        status: typeof record?.status === 'string' ? record.status : null,
        txBytes: toFiniteNumber(record?.txBytes),
      },
    ];
  });
}

function normalizeServiceHealth(
  entries: unknown
): BlueGreenMonitoringServiceHealth[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    const record = toRecord(entry);
    const containerId =
      typeof record?.containerId === 'string' ? record.containerId : null;
    const serviceName =
      typeof record?.serviceName === 'string' ? record.serviceName : null;
    const name = typeof record?.name === 'string' ? record.name : null;

    if (!containerId || !serviceName || !name) {
      return [];
    }

    return [
      {
        containerId,
        health: normalizeDockerHealth(record?.health),
        name,
        projectName:
          typeof record?.projectName === 'string' ? record.projectName : null,
        serviceName,
        status: typeof record?.status === 'string' ? record.status : null,
      },
    ];
  });
}

function sumDockerContainerMetric(
  containers: DockerAggregateContainer[],
  metric: keyof DockerAggregateContainer
) {
  return containers.reduce((sum, container) => {
    const value = container[metric];
    return typeof value === 'number' && Number.isFinite(value)
      ? sum + value
      : sum;
  }, 0);
}

function readNormalizedWatcherLogs(
  watchDir: string,
  fsImpl: FsLike = fs
): BlueGreenMonitoringWatcherLog[] {
  return normalizeWatcherLogs(
    readJsonFile<Array<Record<string, unknown>>>(
      path.join(watchDir, 'blue-green-auto-deploy.logs.json'),
      fsImpl
    ) ?? []
  );
}

interface RequestLogChunkMetadata {
  count: number;
  file: string;
  firstRequestAt: number | null;
  lastRequestAt: number | null;
}

function readRequestLogChunkMetadata(
  watchDir: string,
  fsImpl: FsLike = fs
): { chunks: RequestLogChunkMetadata[]; totalRecords: number } {
  const state = toRecord(
    readJsonFile<Record<string, unknown>>(
      path.join(watchDir, 'blue-green-request-telemetry.state.json'),
      fsImpl
    )
  );

  const chunks = Array.isArray(state?.chunks)
    ? state.chunks.flatMap((entry) => {
        const record = toRecord(entry);
        const file = typeof record?.file === 'string' ? record.file : null;

        if (!file) {
          return [];
        }

        return [
          {
            count: toPositiveInteger(record?.count) ?? 0,
            file,
            firstRequestAt: toFiniteNumber(record?.firstRequestAt),
            lastRequestAt: toFiniteNumber(record?.lastRequestAt),
          },
        ];
      })
    : [];

  return {
    chunks,
    totalRecords:
      toPositiveInteger(state?.totalRecords) ??
      chunks.reduce((sum, chunk) => sum + chunk.count, 0),
  };
}

function readAllRequestArchiveItems(
  watchDir: string,
  fsImpl: FsLike = fs,
  timeframe?: ReturnType<typeof normalizeRequestTimeframe>
) {
  const { chunks, totalRecords } = readRequestLogChunkMetadata(
    watchDir,
    fsImpl
  );
  const requestLogDir = path.join(watchDir, 'blue-green-request-logs');

  if (chunks.length === 0) {
    const summary = toRecord(
      readJsonFile<Record<string, unknown>>(
        path.join(watchDir, 'blue-green-request-telemetry.summary.json'),
        fsImpl
      )
    );
    const items = normalizeRecentRequests(summary?.recentRequests).filter(
      (entry) => !timeframe || isRequestInTimeframe(entry, timeframe)
    );

    return {
      items,
      totalRecords: normalizeRecentRequests(summary?.recentRequests).length,
    };
  }

  const items: BlueGreenMonitoringRequestLog[] = [];

  for (const chunk of [...chunks].reverse()) {
    if (
      timeframe?.startAt != null &&
      chunk.lastRequestAt != null &&
      chunk.lastRequestAt < timeframe.startAt
    ) {
      continue;
    }

    if (
      timeframe &&
      chunk.firstRequestAt != null &&
      chunk.firstRequestAt > timeframe.endAt
    ) {
      continue;
    }

    const rawEntries = readJsonLinesFile<Record<string, unknown>>(
      path.join(requestLogDir, chunk.file),
      fsImpl
    );
    items.push(
      ...normalizeRecentRequests(rawEntries)
        .filter((entry) => !timeframe || isRequestInTimeframe(entry, timeframe))
        .reverse()
    );
  }

  return { items, totalRecords };
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
  requestPreviewLimit,
  watcherLogLimit,
}: {
  fsImpl?: FsLike;
  now?: number;
  requestPreviewLimit?: number | null;
  watcherLogLimit?: number | null;
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
  const telemetrySummary =
    readJsonFile<Record<string, unknown>>(
      path.join(watchDir, 'blue-green-request-telemetry.summary.json'),
      fsImpl
    ) ?? null;
  const watcherLogs = readNormalizedWatcherLogs(watchDir, fsImpl);
  const deploymentPin = normalizeDeploymentPin(
    readJsonFile<Record<string, unknown>>(
      path.join(watchDir, 'control', 'blue-green-deployment-pin.json'),
      fsImpl
    )
  );
  const instantRolloutRequest = normalizeInstantRolloutRequest(
    readJsonFile<Record<string, unknown>>(
      path.join(watchDir, 'control', 'blue-green-instant-rollout.request.json'),
      fsImpl
    )
  );

  const activeColor = readTextFile(path.join(prodDir, 'active-color'), fsImpl);
  const deploymentStamp = readTextFile(
    path.join(prodDir, 'deployment-stamp'),
    fsImpl
  );
  const runtime =
    (status?.currentBlueGreen as Record<string, unknown> | null) ?? null;
  const dockerResources =
    (status?.dockerResources as Record<string, unknown> | null) ?? null;
  const rawDeployments =
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
  const deployments = mergeDeploymentMetrics(
    rawDeployments,
    telemetrySummary,
    now
  );
  const recoveryCache = getRecoverableCachedDeployments(deployments);
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
  const activeDeployment =
    deployments.find((entry) => entry.runtimeState === 'active') ??
    deployments.find(
      (entry) =>
        entry.status === 'successful' && entry.activeColor === activeColor
    ) ??
    null;
  const currentRequests =
    toFiniteNumber(runtime?.requestCount) ??
    toFiniteNumber(activeDeployment?.requestCount);
  const currentAverageRpm =
    toFiniteNumber(runtime?.averageRequestsPerMinute) ??
    toFiniteNumber(activeDeployment?.averageRequestsPerMinute);
  const currentPeakRpm =
    toFiniteNumber(runtime?.peakRequestsPerMinute) ??
    toFiniteNumber(activeDeployment?.peakRequestsPerMinute);
  const dailyMetrics = normalizePeriodMetrics(telemetrySummary?.daily);
  const weeklyMetrics = normalizePeriodMetrics(telemetrySummary?.weekly);
  const monthlyMetrics = normalizePeriodMetrics(telemetrySummary?.monthly);
  const yearlyMetrics = normalizePeriodMetrics(telemetrySummary?.yearly);
  const normalizedRecentRequests = normalizeRecentRequests(
    telemetrySummary?.recentRequests
  );
  const recentRequests = slicePreviewItems(
    normalizedRecentRequests,
    requestPreviewLimit
  );
  const totalPersistedLogs =
    toFiniteNumber(telemetrySummary?.totalLogEntries) ??
    normalizedRecentRequests.length;
  const totalRequestsServed =
    toFiniteNumber(telemetrySummary?.totalRequestsServed) ??
    requestTotals.reduce((sum, value) => sum + value, 0);
  const allContainers = normalizeDockerContainers(
    dockerResources?.allContainers
  );
  const resourceContainers = Array.isArray(dockerResources?.containers)
    ? (dockerResources?.containers as BlueGreenMonitoringSnapshot['dockerResources']['containers'])
    : [];
  const aggregateContainers: DockerAggregateContainer[] =
    allContainers.length > 0 ? allContainers : resourceContainers;

  return {
    analytics: {
      current: {
        daily: dailyMetrics[0] ?? null,
        monthly: monthlyMetrics[0] ?? null,
        weekly: weeklyMetrics[0] ?? null,
        yearly: yearlyMetrics[0] ?? null,
      },
      recentRequests,
      totalPersistedLogs,
      trends: {
        daily: dailyMetrics,
        monthly: monthlyMetrics,
        weekly: weeklyMetrics,
        yearly: yearlyMetrics,
      },
    },
    control: {
      deploymentPin,
      instantRolloutRequest,
    },
    dockerResources: {
      allContainers,
      containers: resourceContainers,
      message:
        typeof dockerResources?.message === 'string'
          ? dockerResources.message
          : null,
      serviceHealth: normalizeServiceHealth(dockerResources?.serviceHealth),
      state:
        typeof dockerResources?.state === 'string'
          ? dockerResources.state
          : 'idle',
      totalCpuPercent:
        aggregateContainers.length > 0
          ? sumDockerContainerMetric(aggregateContainers, 'cpuPercent')
          : (toFiniteNumber(dockerResources?.totalCpuPercent) ?? 0),
      totalMemoryBytes:
        aggregateContainers.length > 0
          ? sumDockerContainerMetric(aggregateContainers, 'memoryBytes')
          : (toFiniteNumber(dockerResources?.totalMemoryBytes) ?? 0),
      totalRxBytes: toFiniteNumber(dockerResources?.totalRxBytes) ?? 0,
      totalTxBytes: toFiniteNumber(dockerResources?.totalTxBytes) ?? 0,
    },
    deployments: deployments as BlueGreenMonitoringSnapshot['deployments'],
    recoveryCache:
      recoveryCache as BlueGreenMonitoringSnapshot['recoveryCache'],
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
      totalPersistedLogs,
      totalRequestsServed,
    },
    runtime: {
      activatedAt: toFiniteNumber(runtime?.activatedAt),
      activeColor:
        typeof runtime?.activeColor === 'string'
          ? runtime.activeColor
          : activeColor,
      averageRequestsPerMinute: currentAverageRpm,
      dailyAverageRequests:
        toFiniteNumber(runtime?.dailyAverageRequests) ??
        toFiniteNumber(activeDeployment?.dailyAverageRequests),
      dailyPeakRequests:
        toFiniteNumber(runtime?.dailyPeakRequests) ??
        toFiniteNumber(activeDeployment?.dailyPeakRequests),
      dailyRequestCount:
        toFiniteNumber(runtime?.dailyRequestCount) ??
        toFiniteNumber(activeDeployment?.dailyRequestCount),
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
      logs: slicePreviewItems(watcherLogs, watcherLogLimit),
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

export function readBlueGreenMonitoringRequestArchive({
  fsImpl = fs,
  now = Date.now(),
  page = 1,
  pageSize = DEFAULT_ARCHIVE_PAGE_SIZE,
  timeframeDays = DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS,
}: {
  fsImpl?: FsLike;
  now?: number;
  page?: number;
  pageSize?: number;
  timeframeDays?: number | null;
} = {}): BlueGreenMonitoringRequestArchive {
  const monitoringDir = resolveMonitoringDir(fsImpl);
  const watchDir = path.join(monitoringDir.path, 'watch');
  const normalizedPageSize = clampArchivePageSize(pageSize);
  const timeframe = normalizeRequestTimeframe({ now, timeframeDays });
  const aggregate = readCachedRequestArchiveAggregate({
    fsImpl,
    now,
    timeframe,
    watchDir,
  });
  const total = aggregate.items.length;
  const archivePage = getArchivePage(page, total, normalizedPageSize);
  const items = aggregate.items.slice(
    archivePage.offset,
    archivePage.offset + normalizedPageSize
  );

  return {
    ...createArchiveResponse(
      items,
      archivePage.page,
      normalizedPageSize,
      total
    ),
    analytics: aggregate.analytics,
  };
}

export function readBlueGreenMonitoringWatcherLogArchive({
  fsImpl = fs,
  page = 1,
  pageSize = DEFAULT_ARCHIVE_PAGE_SIZE,
}: {
  fsImpl?: FsLike;
  page?: number;
  pageSize?: number;
} = {}): BlueGreenMonitoringPaginatedResult<BlueGreenMonitoringWatcherLog> {
  const monitoringDir = resolveMonitoringDir(fsImpl);
  const watchDir = path.join(monitoringDir.path, 'watch');
  const normalizedPageSize = clampArchivePageSize(pageSize);
  const allLogs = readNormalizedWatcherLogs(watchDir, fsImpl);
  const archivePage = getArchivePage(page, allLogs.length, normalizedPageSize);
  const items = allLogs.slice(
    archivePage.offset,
    archivePage.offset + normalizedPageSize
  );

  return createArchiveResponse(
    items,
    archivePage.page,
    normalizedPageSize,
    allLogs.length
  );
}
