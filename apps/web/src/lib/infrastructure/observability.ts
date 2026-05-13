import type {
  BlueGreenMonitoringRequestConsoleLog,
  BlueGreenMonitoringRequestLog,
  BlueGreenMonitoringWatcherLog,
  ObservabilityAnalytics,
  ObservabilityCronRun,
  ObservabilityDeployment,
  ObservabilityLogEvent,
  ObservabilityOverview,
  ObservabilityPaginatedResult,
  ObservabilityRequest,
  ObservabilityResourceBucket,
  ObservabilityResources,
} from '@tuturuuu/internal-api/infrastructure';
import {
  readBlueGreenMonitoringRequestArchive,
  readBlueGreenMonitoringSnapshot,
  readBlueGreenMonitoringWatcherLogArchive,
} from './blue-green-monitoring';
import { readCronExecutionArchive } from './cron-monitoring';
import {
  ensureLogDrainSchema,
  getLogDrainSqlClient,
  pruneOldLogDrainRecords,
} from './log-drain';

interface ObservabilityFilters {
  level?: string | null;
  page?: number;
  pageSize?: number;
  projectId?: string | null;
  q?: string | null;
  since?: number | null;
  source?: string | null;
  status?: string | null;
  timeframeHours?: number;
  until?: number | null;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_TIMEFRAME_HOURS = 24;
const MAX_PAGE_SIZE = 200;
const MAX_AGGREGATE_ROWS = 5_000;
const RESOURCE_SAMPLE_MIN_INTERVAL_MS = 60_000;
const DEFAULT_PROJECT_ID = 'platform';
const RESOURCE_METRICS = {
  cpu: 'docker.cpu_percent',
  memory: 'docker.memory_bytes',
  rx: 'docker.rx_bytes',
  tx: 'docker.tx_bytes',
} as const;

function clampPage(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function clampPageSize(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Math.min(
    Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
}

function clampTimeframeHours(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, 24 * 90)
    : DEFAULT_TIMEFRAME_HOURS;
}

function parseTimestampFilter(value: unknown) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseObservabilityFilters(
  searchParams: URLSearchParams
): Required<
  Pick<ObservabilityFilters, 'page' | 'pageSize' | 'timeframeHours'>
> &
  Omit<ObservabilityFilters, 'page' | 'pageSize' | 'timeframeHours'> {
  const normalize = (value: string | null) => {
    const trimmed = value?.trim();
    return trimmed && trimmed !== 'all' ? trimmed : null;
  };

  return {
    level: normalize(searchParams.get('level')),
    page: clampPage(searchParams.get('page')),
    pageSize: clampPageSize(searchParams.get('pageSize')),
    projectId: normalize(searchParams.get('projectId')) ?? DEFAULT_PROJECT_ID,
    q: normalize(searchParams.get('q')),
    since: parseTimestampFilter(searchParams.get('since')),
    source: normalize(searchParams.get('source')),
    status: normalize(searchParams.get('status')),
    timeframeHours: clampTimeframeHours(searchParams.get('timeframeHours')),
    until: parseTimestampFilter(searchParams.get('until')),
  };
}

function shouldReadLegacyProject(
  filters: Pick<ObservabilityFilters, 'projectId'>
) {
  return !filters.projectId || filters.projectId === DEFAULT_PROJECT_ID;
}

function toMs(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function statusMatches(
  status: number | null,
  filter: string | null | undefined
) {
  if (!filter) {
    return true;
  }

  if (filter === '5xx') {
    return status != null && status >= 500;
  }

  if (filter === '4xx') {
    return status != null && status >= 400 && status < 500;
  }

  if (filter === '3xx') {
    return status != null && status >= 300 && status < 400;
  }

  if (filter === '2xx') {
    return status != null && status >= 200 && status < 300;
  }

  return String(status) === filter;
}

async function getSql() {
  await ensureLogDrainSchema();
  return getLogDrainSqlClient();
}

function paginate<T>(
  items: T[],
  filters: Required<Pick<ObservabilityFilters, 'page' | 'pageSize'>>
): ObservabilityPaginatedResult<T> {
  const offset = (filters.page - 1) * filters.pageSize;
  const pageItems = items.slice(offset, offset + filters.pageSize);

  return {
    hasNextPage: offset + filters.pageSize < items.length,
    items: pageItems,
    page: filters.page,
    pageSize: filters.pageSize,
    total: items.length,
  };
}

function filterText(value: string | null | undefined, q: string) {
  return value?.toLowerCase().includes(q.toLowerCase()) ?? false;
}

function shouldIncludeText(
  q: string | null | undefined,
  values: Array<string | null | undefined>
) {
  const normalized = q?.trim();
  return !normalized || values.some((value) => filterText(value, normalized));
}

function shouldIncludeTime(
  time: number,
  filters: Pick<ObservabilityFilters, 'since' | 'until'>
) {
  if (filters.since != null && time <= filters.since) {
    return false;
  }

  if (filters.until != null && time > filters.until) {
    return false;
  }

  return true;
}

function mapLegacyRequest(request: BlueGreenMonitoringRequestLog) {
  const startedAt = request.time;
  const id = `legacy-request-${request.time}-${request.method ?? 'GET'}-${request.path}`;
  const relatedLogs = (request.consoleLogs ?? []).map((log) =>
    mapLegacyConsoleLog(log, request)
  );

  return {
    cronJobId: null,
    deploymentColor: request.deploymentColor,
    deploymentStamp: request.deploymentStamp,
    durationMs: request.requestTimeMs,
    endedAt: startedAt + (request.requestTimeMs ?? 0),
    errorMessage: null,
    id,
    ipAddress: null,
    logCount: relatedLogs.length,
    method: request.method,
    path: request.path,
    relatedLogs,
    source: 'api' as const,
    startedAt,
    status: request.status,
    userAgent: null,
  };
}

function mapLegacyWatcherLog(
  log: BlueGreenMonitoringWatcherLog
): ObservabilityLogEvent {
  return {
    createdAt: log.time,
    deploymentColor: log.activeColor,
    deploymentStamp: log.deploymentStamp,
    durationMs: null,
    errorName: null,
    errorStack: null,
    id: `legacy-watcher-${log.time}-${log.message}`,
    ipAddress: null,
    level:
      log.level === 'error' || log.level === 'warn' || log.level === 'debug'
        ? log.level
        : 'info',
    message: log.message,
    metadata: {
      commitHash: log.commitHash,
      deploymentKey: log.deploymentKey,
      deploymentKind: log.deploymentKind,
      deploymentStatus: log.deploymentStatus,
      legacySource: 'blue-green-watcher',
    },
    requestId: null,
    route: null,
    source: 'server',
    status: null,
    userAgent: null,
  };
}

function mapLegacyConsoleLog(
  log: BlueGreenMonitoringRequestConsoleLog,
  request: BlueGreenMonitoringRequestLog
): ObservabilityLogEvent {
  return {
    createdAt: log.time,
    deploymentColor: log.deploymentColor ?? request.deploymentColor,
    deploymentStamp: request.deploymentStamp,
    durationMs: request.requestTimeMs,
    errorName: null,
    errorStack: null,
    id: `legacy-console-${log.time}-${request.path}-${log.message}`,
    ipAddress: null,
    level:
      log.level === 'error' || log.level === 'warn' || log.level === 'debug'
        ? log.level
        : 'info',
    message: log.message,
    metadata: {
      containerId: log.containerId,
      legacySource: 'blue-green-request-console',
    },
    requestId: `legacy-request-${request.time}-${request.method ?? 'GET'}-${request.path}`,
    route: request.path,
    source: 'api',
    status: request.status,
    userAgent: null,
  };
}

function getLegacyTimeframeDays(timeframeHours: number) {
  return Math.max(1, Math.ceil(timeframeHours / 24));
}

function loadLegacyRequests(
  filters: Required<Pick<ObservabilityFilters, 'timeframeHours'>> &
    Omit<ObservabilityFilters, 'timeframeHours'>
) {
  const archive = readBlueGreenMonitoringRequestArchive({
    page: 1,
    pageSize: 100,
    q: filters.q ?? undefined,
    status: filters.status ?? undefined,
    timeframeDays: getLegacyTimeframeDays(filters.timeframeHours),
  });
  const cutoff = Date.now() - filters.timeframeHours * 60 * 60 * 1000;

  return archive.items
    .filter((request) => request.time >= cutoff)
    .filter((request) => shouldIncludeTime(request.time, filters))
    .filter((request) => statusMatches(request.status, filters.status))
    .filter((request) =>
      shouldIncludeText(filters.q, [
        request.path,
        request.host,
        request.method,
        request.deploymentStamp,
      ])
    )
    .map(mapLegacyRequest);
}

function loadLegacyLogs(
  filters: Required<Pick<ObservabilityFilters, 'timeframeHours'>> &
    Omit<ObservabilityFilters, 'timeframeHours'>
) {
  const cutoff = Date.now() - filters.timeframeHours * 60 * 60 * 1000;
  const watcherLogs = readBlueGreenMonitoringWatcherLogArchive({
    page: 1,
    pageSize: 100,
  }).items.map(mapLegacyWatcherLog);
  const requestConsoleLogs = readBlueGreenMonitoringRequestArchive({
    page: 1,
    pageSize: 100,
    q: filters.q ?? undefined,
    status: filters.status ?? undefined,
    timeframeDays: getLegacyTimeframeDays(filters.timeframeHours),
  }).items.flatMap((request) =>
    (request.consoleLogs ?? []).map((log) => mapLegacyConsoleLog(log, request))
  );

  return [...watcherLogs, ...requestConsoleLogs]
    .filter((log) => log.createdAt >= cutoff)
    .filter((log) => !filters.level || log.level === filters.level)
    .filter((log) => !filters.source || log.source === filters.source)
    .filter((log) => statusMatches(log.status, filters.status))
    .filter((log) =>
      shouldIncludeText(filters.q, [
        log.message,
        log.route,
        log.requestId,
        log.deploymentStamp,
      ])
    );
}

async function loadRecentLogs(
  filters: Required<Pick<ObservabilityFilters, 'timeframeHours'>> &
    Omit<ObservabilityFilters, 'timeframeHours'>
) {
  const sql = await getSql();
  if (!sql) {
    return shouldReadLegacyProject(filters) ? loadLegacyLogs(filters) : [];
  }

  const rows = await sql<
    Array<{
      created_at: Date;
      deployment_color: string | null;
      deployment_stamp: string | null;
      duration_ms: number | null;
      error_name: string | null;
      error_stack: string | null;
      id: string;
      ip_address: string | null;
      level: ObservabilityLogEvent['level'];
      message: string;
      metadata: Record<string, unknown> | null;
      request_id: string | null;
      route: string | null;
      source: ObservabilityLogEvent['source'];
      status: number | null;
      user_agent: string | null;
    }>
  >`
    SELECT
      log_events.id::text,
      log_events.request_id,
      log_events.source,
      log_events.level,
      log_events.message,
      log_events.route,
      log_events.status,
      log_events.duration_ms,
      log_events.deployment_color,
      log_events.deployment_stamp,
      log_events.error_name,
      log_events.error_stack,
      COALESCE(log_events.ip_address, requests.ip_address) AS ip_address,
      COALESCE(log_events.user_agent, requests.user_agent) AS user_agent,
      log_events.metadata,
      log_events.created_at
    FROM log_events
    LEFT JOIN requests ON requests.id = log_events.request_id
    WHERE log_events.project_id = ${filters.projectId ?? DEFAULT_PROJECT_ID}
      AND log_events.created_at >= now() - make_interval(hours => ${filters.timeframeHours})
    ORDER BY log_events.created_at DESC
    LIMIT ${MAX_AGGREGATE_ROWS}
  `;

  const q = filters.q?.trim();

  const postgresLogs = rows
    .filter((row) => !filters.level || row.level === filters.level)
    .filter((row) => !filters.source || row.source === filters.source)
    .filter((row) => statusMatches(row.status, filters.status))
    .filter(
      (row) =>
        !q ||
        filterText(row.message, q) ||
        filterText(row.route, q) ||
        filterText(row.request_id, q)
    )
    .map((row) => ({
      createdAt: toMs(row.created_at) ?? Date.now(),
      deploymentColor: row.deployment_color,
      deploymentStamp: row.deployment_stamp,
      durationMs: row.duration_ms,
      errorName: row.error_name,
      errorStack: row.error_stack,
      id: row.id,
      ipAddress: row.ip_address,
      level: row.level,
      message: row.message,
      metadata: toRecord(row.metadata),
      requestId: row.request_id,
      route: row.route,
      source: row.source,
      status: row.status,
      userAgent: row.user_agent,
    }));

  return [
    ...postgresLogs,
    ...(shouldReadLegacyProject(filters) ? loadLegacyLogs(filters) : []),
  ].sort((left, right) => right.createdAt - left.createdAt);
}

async function loadRecentRequests(
  filters: Required<Pick<ObservabilityFilters, 'timeframeHours'>> &
    Omit<ObservabilityFilters, 'timeframeHours'>
) {
  const sql = await getSql();
  if (!sql) {
    return shouldReadLegacyProject(filters) ? loadLegacyRequests(filters) : [];
  }

  const rows = await sql<
    Array<{
      cron_job_id: string | null;
      deployment_color: string | null;
      deployment_stamp: string | null;
      duration_ms: number | null;
      ended_at: Date;
      error_message: string | null;
      id: string;
      ip_address: string | null;
      log_count: number;
      method: string | null;
      path: string | null;
      source: ObservabilityRequest['source'];
      started_at: Date;
      status: number | null;
      user_agent: string | null;
    }>
  >`
    SELECT
      requests.id,
      requests.source,
      requests.method,
      requests.path,
      requests.status,
      requests.duration_ms,
      requests.deployment_color,
      requests.deployment_stamp,
      requests.cron_job_id,
      requests.error_message,
      requests.ip_address,
      requests.user_agent,
      requests.started_at,
      requests.ended_at,
      count(log_events.id)::int AS log_count
    FROM requests
    LEFT JOIN log_events ON log_events.request_id = requests.id
    WHERE requests.project_id = ${filters.projectId ?? DEFAULT_PROJECT_ID}
      AND requests.started_at >= now() - make_interval(hours => ${filters.timeframeHours})
    GROUP BY requests.id
    ORDER BY requests.started_at DESC
    LIMIT ${MAX_AGGREGATE_ROWS}
  `;

  const q = filters.q?.trim();

  const postgresRequests = rows
    .filter((row) => !filters.source || row.source === filters.source)
    .filter((row) => statusMatches(row.status, filters.status))
    .filter((row) =>
      shouldIncludeTime(toMs(row.started_at) ?? Date.now(), filters)
    )
    .filter(
      (row) =>
        !q ||
        filterText(row.path, q) ||
        filterText(row.id, q) ||
        filterText(row.error_message, q) ||
        filterText(row.cron_job_id, q)
    )
    .map((row) => ({
      cronJobId: row.cron_job_id,
      deploymentColor: row.deployment_color,
      deploymentStamp: row.deployment_stamp,
      durationMs: row.duration_ms,
      endedAt: toMs(row.ended_at) ?? Date.now(),
      errorMessage: row.error_message,
      id: row.id,
      ipAddress: row.ip_address,
      logCount: row.log_count,
      method: row.method,
      path: row.path,
      relatedLogs: [],
      source: row.source,
      startedAt: toMs(row.started_at) ?? Date.now(),
      status: row.status,
      userAgent: row.user_agent,
    }));

  return [
    ...postgresRequests,
    ...(shouldReadLegacyProject(filters) ? loadLegacyRequests(filters) : []),
  ].sort((left, right) => right.startedAt - left.startedAt);
}

async function attachRelatedLogsToRequests(
  requests: ObservabilityRequest[]
): Promise<ObservabilityRequest[]> {
  const requestIds = requests
    .map((request) => request.id)
    .filter((id) => !id.startsWith('legacy-request-'));

  if (requestIds.length === 0) {
    return requests;
  }

  const sql = await getSql();
  if (!sql) {
    return requests;
  }

  const rows = await sql<
    Array<{
      created_at: Date;
      deployment_color: string | null;
      deployment_stamp: string | null;
      duration_ms: number | null;
      error_name: string | null;
      error_stack: string | null;
      id: string;
      ip_address: string | null;
      level: ObservabilityLogEvent['level'];
      message: string;
      metadata: Record<string, unknown> | null;
      request_id: string | null;
      route: string | null;
      source: ObservabilityLogEvent['source'];
      status: number | null;
      user_agent: string | null;
    }>
  >`
    SELECT
      log_events.id::text,
      log_events.request_id,
      log_events.source,
      log_events.level,
      log_events.message,
      log_events.route,
      log_events.status,
      log_events.duration_ms,
      log_events.deployment_color,
      log_events.deployment_stamp,
      log_events.error_name,
      log_events.error_stack,
      COALESCE(log_events.ip_address, requests.ip_address) AS ip_address,
      COALESCE(log_events.user_agent, requests.user_agent) AS user_agent,
      log_events.metadata,
      log_events.created_at
    FROM log_events
    LEFT JOIN requests ON requests.id = log_events.request_id
    WHERE log_events.request_id IN ${sql(requestIds)}
    ORDER BY log_events.created_at ASC
    LIMIT ${Math.min(requestIds.length * 20, MAX_AGGREGATE_ROWS)}
  `;
  const logsByRequest = new Map<string, ObservabilityLogEvent[]>();

  for (const row of rows) {
    if (!row.request_id) continue;

    const current = logsByRequest.get(row.request_id) ?? [];
    if (current.length >= 20) continue;

    current.push({
      createdAt: toMs(row.created_at) ?? Date.now(),
      deploymentColor: row.deployment_color,
      deploymentStamp: row.deployment_stamp,
      durationMs: row.duration_ms,
      errorName: row.error_name,
      errorStack: row.error_stack,
      id: row.id,
      ipAddress: row.ip_address,
      level: row.level,
      message: row.message,
      metadata: toRecord(row.metadata),
      requestId: row.request_id,
      route: row.route,
      source: row.source,
      status: row.status,
      userAgent: row.user_agent,
    });
    logsByRequest.set(row.request_id, current);
  }

  return requests.map((request) => ({
    ...request,
    relatedLogs:
      request.relatedLogs.length > 0
        ? request.relatedLogs
        : (logsByRequest.get(request.id) ?? []),
  }));
}

export async function readObservabilityLogs(
  filters: ObservabilityFilters = {}
) {
  return paginate(await loadRecentLogs(parseFilterDefaults(filters)), {
    page: clampPage(filters.page),
    pageSize: clampPageSize(filters.pageSize),
  });
}

export async function readObservabilityRequests(
  filters: ObservabilityFilters = {}
) {
  const page = paginate(
    await loadRecentRequests(parseFilterDefaults(filters)),
    {
      page: clampPage(filters.page),
      pageSize: clampPageSize(filters.pageSize),
    }
  );

  return {
    ...page,
    items: await attachRelatedLogsToRequests(page.items),
  };
}

export async function readObservabilityCronRuns(
  filters: ObservabilityFilters = {}
) {
  const sql = await getSql();
  if (!sql) {
    if (!shouldReadLegacyProject(filters)) {
      return {
        hasNextPage: false,
        items: [],
        page: clampPage(filters.page),
        pageSize: clampPageSize(filters.pageSize),
        total: 0,
      };
    }

    const archive = readCronExecutionArchive({
      page: clampPage(filters.page),
      pageSize: clampPageSize(filters.pageSize),
    });
    return {
      hasNextPage: archive.hasNextPage,
      items: archive.items.map((item) => ({
        durationMs: item.durationMs,
        endedAt: item.endedAt,
        errorMessage: item.error,
        httpStatus: item.httpStatus,
        id: item.id,
        jobId: item.jobId,
        path: item.path,
        requestId: item.triggerId,
        startedAt: item.startedAt,
        status: item.status,
      })),
      page: archive.page,
      pageSize: archive.limit,
      total: archive.total,
    };
  }

  const normalized = parseFilterDefaults(filters);
  const rows = await sql<
    Array<{
      duration_ms: number | null;
      ended_at: Date;
      error_message: string | null;
      http_status: number | null;
      id: string;
      job_id: string;
      path: string;
      request_id: string | null;
      started_at: Date;
      status: string;
    }>
  >`
    SELECT id, request_id, job_id, path, status, http_status, duration_ms, error_message, started_at, ended_at
    FROM cron_runs
    WHERE project_id = ${normalized.projectId}
      AND started_at >= now() - make_interval(hours => ${normalized.timeframeHours})
    ORDER BY started_at DESC
    LIMIT ${MAX_AGGREGATE_ROWS}
  `;

  const q = normalized.q?.trim();
  const items = rows
    .filter((row) => statusMatches(row.http_status, normalized.status))
    .filter(
      (row) =>
        !q ||
        filterText(row.id, q) ||
        filterText(row.job_id, q) ||
        filterText(row.path, q) ||
        filterText(row.error_message, q)
    )
    .map(
      (row): ObservabilityCronRun => ({
        durationMs: row.duration_ms,
        endedAt: toMs(row.ended_at) ?? Date.now(),
        errorMessage: row.error_message,
        httpStatus: row.http_status,
        id: row.id,
        jobId: row.job_id,
        path: row.path,
        requestId: row.request_id,
        startedAt: toMs(row.started_at) ?? Date.now(),
        status: row.status,
      })
    );

  return paginate(items, {
    page: clampPage(filters.page),
    pageSize: clampPageSize(filters.pageSize),
  });
}

export async function readObservabilityDeployments(
  filters: ObservabilityFilters = {}
) {
  const requests = await loadRecentRequests(parseFilterDefaults(filters));
  const deployments = new Map<string, ObservabilityDeployment>();
  const aliases = new Map<string, string>();
  const snapshot = readBlueGreenMonitoringSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 0,
  });
  const resolveDeploymentKey = (deployment: {
    activeColor?: string | null;
    commitHash?: string | null;
    deploymentStamp?: string | null;
  }) => {
    if (deployment.commitHash) {
      return `commit:${deployment.commitHash}`;
    }

    if (deployment.deploymentStamp) {
      return `stamp:${deployment.deploymentStamp}`;
    }

    if (deployment.activeColor) {
      return `color:${deployment.activeColor}`;
    }

    return 'unknown';
  };
  const registerAlias = (alias: string | null | undefined, key: string) => {
    if (alias) {
      aliases.set(alias, key);
    }
  };
  const mergeText = (
    left: string | null,
    right: string | null | undefined,
    separator = ' / '
  ) => {
    if (!right) return left;
    if (!left) return right;
    return left.split(separator).includes(right)
      ? left
      : `${left}${separator}${right}`;
  };
  const mergeDeployment = (
    left: ObservabilityDeployment,
    right: ObservabilityDeployment
  ): ObservabilityDeployment => {
    const runtimeState =
      left.runtimeState === 'active' || right.runtimeState === 'active'
        ? 'active'
        : left.runtimeState === 'standby' || right.runtimeState === 'standby'
          ? 'standby'
          : null;

    return {
      ...left,
      color: mergeText(left.color, right.color),
      commitHash: left.commitHash ?? right.commitHash,
      commitShortHash: left.commitShortHash ?? right.commitShortHash,
      commitSubject: left.commitSubject ?? right.commitSubject,
      deploymentStamp: mergeText(left.deploymentStamp, right.deploymentStamp),
      durationMs: Math.max(left.durationMs ?? 0, right.durationMs ?? 0) || null,
      errorCount: left.errorCount + right.errorCount,
      failureReason: mergeText(left.failureReason, right.failureReason, '\n'),
      lastRequestAt:
        Math.max(left.lastRequestAt ?? 0, right.lastRequestAt ?? 0) || null,
      requestCount: left.requestCount + right.requestCount,
      runtimeState,
      startedAt:
        left.startedAt == null
          ? right.startedAt
          : right.startedAt == null
            ? left.startedAt
            : Math.min(left.startedAt, right.startedAt),
      status:
        runtimeState ??
        (left.status === 'failed' || right.status === 'failed'
          ? 'failed'
          : left.status || right.status),
    };
  };
  const upsertDeployment = (deployment: ObservabilityDeployment) => {
    const key = resolveDeploymentKey({
      activeColor: deployment.color,
      commitHash: deployment.commitHash,
      deploymentStamp: deployment.deploymentStamp,
    });
    const current = deployments.get(key);
    deployments.set(
      key,
      current ? mergeDeployment(current, deployment) : deployment
    );
    registerAlias(deployment.color, key);
    registerAlias(deployment.deploymentStamp, key);
    registerAlias(deployment.commitHash, key);
  };

  for (const deployment of snapshot.deployments) {
    upsertDeployment({
      color: deployment.activeColor ?? null,
      commitHash: deployment.commitHash ?? null,
      commitShortHash: deployment.commitShortHash ?? null,
      commitSubject: deployment.commitSubject ?? null,
      deploymentStamp: deployment.deploymentStamp ?? null,
      durationMs: deployment.buildDurationMs ?? deployment.lifetimeMs ?? null,
      errorCount: deployment.errorCount ?? 0,
      failureReason: deployment.failureReason ?? null,
      lastRequestAt: deployment.lastRequestAt ?? null,
      requestCount: deployment.requestCount ?? 0,
      runtimeState: deployment.runtimeState ?? null,
      startedAt: deployment.startedAt ?? deployment.activatedAt ?? null,
      status: deployment.status ?? 'unknown',
    });
  }

  for (const request of requests) {
    if (!request.deploymentStamp && !request.deploymentColor) {
      continue;
    }

    const key =
      (request.deploymentStamp && aliases.get(request.deploymentStamp)) ??
      (request.deploymentColor && aliases.get(request.deploymentColor)) ??
      (request.deploymentStamp
        ? `stamp:${request.deploymentStamp}`
        : `color:${request.deploymentColor}`);
    const current = deployments.get(key) ?? {
      color: request.deploymentColor,
      commitHash: null,
      commitShortHash: null,
      commitSubject: null,
      deploymentStamp: request.deploymentStamp,
      durationMs: null,
      errorCount: 0,
      failureReason: null,
      lastRequestAt: null,
      runtimeState: null,
      requestCount: 0,
      startedAt: null,
      status: 'ready',
    };

    current.requestCount += 1;
    current.errorCount +=
      request.status != null && request.status >= 500 ? 1 : 0;
    current.lastRequestAt = Math.max(
      current.lastRequestAt ?? 0,
      request.startedAt
    );
    current.startedAt =
      current.startedAt == null
        ? request.startedAt
        : Math.min(current.startedAt, request.startedAt);
    deployments.set(key, current);
  }

  return paginate(
    [...deployments.values()].sort(
      (left, right) =>
        (right.startedAt ?? right.lastRequestAt ?? 0) -
        (left.startedAt ?? left.lastRequestAt ?? 0)
    ),
    {
      page: clampPage(filters.page),
      pageSize: clampPageSize(filters.pageSize),
    }
  );
}

function parseFilterDefaults(filters: ObservabilityFilters) {
  return {
    ...filters,
    page: clampPage(filters.page),
    pageSize: clampPageSize(filters.pageSize),
    projectId: filters.projectId?.trim() || DEFAULT_PROJECT_ID,
    timeframeHours: clampTimeframeHours(filters.timeframeHours),
  };
}

function normalizeProjectId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function getProjectServiceNeedle(projectId: string) {
  return `project-${normalizeProjectId(projectId)}`;
}

function isPlatformResourceName(value: string | null | undefined) {
  return !String(value ?? '').startsWith('project-');
}

function matchesProjectService(
  projectId: string,
  values: Array<string | null | undefined>
) {
  if (projectId === DEFAULT_PROJECT_ID) {
    return values.every(isPlatformResourceName);
  }

  const serviceNeedle = getProjectServiceNeedle(projectId);
  return values.some((value) => String(value ?? '').includes(serviceNeedle));
}

type ResourceMetricItem = {
  cpuPercent?: number | null;
  memoryBytes?: number | null;
  rxBytes?: number | null;
  txBytes?: number | null;
};

function sumResourceMetric(
  items: ResourceMetricItem[],
  key: keyof ResourceMetricItem
) {
  return items.reduce((total, item) => {
    const value = item[key];
    return (
      total + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
    );
  }, 0);
}

function scopeDockerResources(
  dockerResources: ObservabilityResources['dockerResources'],
  projectId: string
): ObservabilityResources['dockerResources'] {
  const allContainers = dockerResources.allContainers.filter((container) =>
    matchesProjectService(projectId, [container.serviceName, container.name])
  );
  const containers = dockerResources.containers.filter((container) =>
    matchesProjectService(projectId, [container.serviceName, container.label])
  );
  const serviceHealth = dockerResources.serviceHealth.filter((service) =>
    matchesProjectService(projectId, [service.serviceName, service.name])
  );
  const metricSource = allContainers.length > 0 ? allContainers : containers;

  return {
    ...dockerResources,
    allContainers,
    containers,
    serviceHealth,
    totalCpuPercent: sumResourceMetric(metricSource, 'cpuPercent'),
    totalMemoryBytes: sumResourceMetric(metricSource, 'memoryBytes'),
    totalRxBytes: sumResourceMetric(metricSource, 'rxBytes'),
    totalTxBytes: sumResourceMetric(metricSource, 'txBytes'),
  };
}

function getTopRoutes(requests: ObservabilityRequest[]) {
  const byPath = new Map<
    string,
    { duration: number; errorCount: number; requestCount: number }
  >();

  for (const request of requests) {
    const path = request.path ?? 'unknown';
    const current = byPath.get(path) ?? {
      duration: 0,
      errorCount: 0,
      requestCount: 0,
    };
    current.requestCount += 1;
    current.duration += request.durationMs ?? 0;
    current.errorCount +=
      request.status != null && request.status >= 500 ? 1 : 0;
    byPath.set(path, current);
  }

  return [...byPath.entries()]
    .map(([path, value]) => ({
      averageDurationMs:
        value.requestCount > 0 ? value.duration / value.requestCount : null,
      errorCount: value.errorCount,
      path,
      requestCount: value.requestCount,
    }))
    .sort((left, right) => right.requestCount - left.requestCount)
    .slice(0, 10);
}

export async function sampleObservabilityResources() {
  const snapshot = readBlueGreenMonitoringSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 0,
  });
  await persistResourceSample(snapshot.dockerResources);

  return {
    containers: snapshot.dockerResources.allContainers.length,
    cpuPercent: snapshot.dockerResources.totalCpuPercent,
    memoryBytes: snapshot.dockerResources.totalMemoryBytes,
    rxBytes: snapshot.dockerResources.totalRxBytes,
    services: snapshot.dockerResources.serviceHealth.length,
    state: snapshot.dockerResources.state,
    txBytes: snapshot.dockerResources.totalTxBytes,
  };
}

async function persistResourceSample(
  dockerResources: ObservabilityResources['dockerResources']
) {
  const sql = await getSql();
  if (!sql) {
    return;
  }

  const recent = await sql<Array<{ created_at: Date }>>`
    SELECT created_at
    FROM usage_events
    WHERE project_id = ${DEFAULT_PROJECT_ID}
      AND metric = ${RESOURCE_METRICS.cpu}
      AND created_at >= now() - make_interval(secs => ${Math.ceil(
        RESOURCE_SAMPLE_MIN_INTERVAL_MS / 1000
      )})
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (recent.length > 0) {
    return;
  }

  const metadata = JSON.stringify({
    containers: dockerResources.allContainers.length,
    services: dockerResources.serviceHealth.length,
    state: dockerResources.state,
  });

  await sql`
    INSERT INTO usage_events (project_id, source, metric, value, unit, metadata)
    VALUES
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.cpu}, ${dockerResources.totalCpuPercent}, 'percent', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.memory}, ${dockerResources.totalMemoryBytes}, 'bytes', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.rx}, ${dockerResources.totalRxBytes}, 'bytes', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.tx}, ${dockerResources.totalTxBytes}, 'bytes', ${metadata}::jsonb)
  `;
  await pruneOldLogDrainRecords();
}

function getResourceBucketCount(timeframeHours: number) {
  if (timeframeHours <= 1) return 30;
  if (timeframeHours <= 6) return 36;
  if (timeframeHours <= 12) return 48;
  if (timeframeHours <= 24) return 48;
  if (timeframeHours <= 72) return 72;
  return 84;
}

function getCurrentResourceBucket(
  dockerResources: ObservabilityResources['dockerResources']
): ObservabilityResourceBucket {
  return {
    bucketStart: Date.now(),
    cpuPercent: dockerResources.totalCpuPercent,
    memoryBytes: dockerResources.totalMemoryBytes,
    rxBytes: dockerResources.totalRxBytes,
    txBytes: dockerResources.totalTxBytes,
  };
}

async function readResourceBuckets(
  projectId: string,
  timeframeHours: number,
  dockerResources: ObservabilityResources['dockerResources']
): Promise<ObservabilityResourceBucket[]> {
  const sql = await getSql();
  if (!sql) {
    return [getCurrentResourceBucket(dockerResources)];
  }

  const rows = await sql<
    Array<{ created_at: Date; metric: string; value: number }>
  >`
    SELECT metric, value, created_at
    FROM usage_events
    WHERE project_id = ${projectId}
      AND metric IN ${sql(Object.values(RESOURCE_METRICS))}
      AND created_at >= now() - make_interval(hours => ${timeframeHours})
    ORDER BY created_at ASC
    LIMIT ${MAX_AGGREGATE_ROWS}
  `;

  if (rows.length === 0) {
    return [getCurrentResourceBucket(dockerResources)];
  }

  const bucketCount = getResourceBucketCount(timeframeHours);
  const now = Date.now();
  const start = now - timeframeHours * 60 * 60 * 1000;
  const bucketMs = (now - start) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucketStart: start + index * bucketMs,
    cpu: [] as number[],
    memory: [] as number[],
    rx: [] as number[],
    tx: [] as number[],
  }));

  for (const row of rows) {
    const createdAt = toMs(row.created_at) ?? now;
    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((createdAt - start) / bucketMs))
    );
    const bucket = buckets[bucketIndex];
    if (!bucket) continue;

    if (row.metric === RESOURCE_METRICS.cpu) bucket.cpu.push(row.value);
    else if (row.metric === RESOURCE_METRICS.memory) {
      bucket.memory.push(row.value);
    } else if (row.metric === RESOURCE_METRICS.rx) bucket.rx.push(row.value);
    else if (row.metric === RESOURCE_METRICS.tx) bucket.tx.push(row.value);
  }

  const currentBucket = buckets.at(-1);
  if (currentBucket) {
    currentBucket.cpu.push(dockerResources.totalCpuPercent);
    currentBucket.memory.push(dockerResources.totalMemoryBytes);
    currentBucket.rx.push(dockerResources.totalRxBytes);
    currentBucket.tx.push(dockerResources.totalTxBytes);
  }

  const average = (values: number[]) =>
    values.length > 0
      ? values.reduce((total, value) => total + value, 0) / values.length
      : null;

  return buckets.map((bucket) => ({
    bucketStart: bucket.bucketStart,
    cpuPercent: average(bucket.cpu),
    memoryBytes: average(bucket.memory),
    rxBytes: average(bucket.rx),
    txBytes: average(bucket.tx),
  }));
}

export async function readObservabilityResources(
  filters: ObservabilityFilters = {}
): Promise<ObservabilityResources> {
  const normalized = parseFilterDefaults(filters);
  const snapshot = readBlueGreenMonitoringSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 0,
  });
  const scopedDockerResources = scopeDockerResources(
    snapshot.dockerResources,
    normalized.projectId
  );

  return {
    buckets: await readResourceBuckets(
      normalized.projectId,
      normalized.timeframeHours,
      scopedDockerResources
    ),
    dockerResources: scopedDockerResources,
  };
}

export async function readObservabilityOverview(
  filters: ObservabilityFilters = {}
): Promise<ObservabilityOverview> {
  const normalized = parseFilterDefaults(filters);
  const [requests, logs, cronRuns] = await Promise.all([
    loadRecentRequests(normalized),
    loadRecentLogs(normalized),
    readObservabilityCronRuns({
      ...normalized,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
    }),
  ]);
  const serverErrorCount = requests.filter(
    (request) => request.status != null && request.status >= 500
  ).length;
  const durations = requests
    .map((request) => request.durationMs)
    .filter((duration): duration is number => duration != null)
    .sort((left, right) => left - right);
  const p95Index =
    durations.length > 0 ? Math.floor((durations.length - 1) * 0.95) : -1;
  const failedCronRuns = cronRuns.items.filter(
    (run) => run.status === 'failed'
  ).length;
  const sourceCounts = requests.reduce<Record<string, number>>(
    (counts, request) => {
      counts[request.source] = (counts[request.source] ?? 0) + 1;
      return counts;
    },
    {}
  );

  return {
    cronFailureRate:
      cronRuns.total > 0
        ? Math.round((failedCronRuns / cronRuns.total) * 100)
        : 0,
    errorRate:
      requests.length > 0
        ? Math.round((serverErrorCount / requests.length) * 100)
        : 0,
    lastEventAt: logs[0]?.createdAt ?? requests[0]?.startedAt ?? null,
    p95DurationMs: p95Index >= 0 ? (durations[p95Index] ?? null) : null,
    recentErrors: logs.filter((log) => log.level === 'error').slice(0, 5),
    requestCount: requests.length,
    serverErrorCount,
    slowRequestCount: requests.filter(
      (request) => (request.durationMs ?? 0) >= 1_000
    ).length,
    sourceCounts,
    topRoutes: getTopRoutes(requests),
  };
}

export async function readObservabilityAnalytics(
  filters: ObservabilityFilters = {}
): Promise<ObservabilityAnalytics> {
  const normalized = parseFilterDefaults(filters);
  const [requests, cronRuns] = await Promise.all([
    loadRecentRequests(normalized),
    readObservabilityCronRuns({
      ...normalized,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
    }),
  ]);
  const bucketCount = Math.min(24, normalized.timeframeHours);
  const bucketMs = (normalized.timeframeHours * 60 * 60 * 1000) / bucketCount;
  const start = Date.now() - normalized.timeframeHours * 60 * 60 * 1000;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucketStart: start + index * bucketMs,
    cronRuns: 0,
    errors: 0,
    requests: 0,
    serverErrors: 0,
  }));
  const statusFamilies: ObservabilityAnalytics['statusFamilies'] = {
    clientError: 0,
    redirect: 0,
    serverError: 0,
    success: 0,
    unknown: 0,
  };

  for (const request of requests) {
    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((request.startedAt - start) / bucketMs))
    );
    const bucket = buckets[bucketIndex];
    if (!bucket) {
      continue;
    }
    bucket.requests += 1;
    if (request.status == null) statusFamilies.unknown += 1;
    else if (request.status >= 500) {
      statusFamilies.serverError += 1;
      bucket.serverErrors += 1;
    } else if (request.status >= 400) statusFamilies.clientError += 1;
    else if (request.status >= 300) statusFamilies.redirect += 1;
    else statusFamilies.success += 1;
  }

  const cronByJob = new Map<
    string,
    { failureCount: number; runCount: number }
  >();
  for (const run of cronRuns.items) {
    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((run.startedAt - start) / bucketMs))
    );
    const bucket = buckets[bucketIndex];
    if (!bucket) {
      continue;
    }
    bucket.cronRuns += 1;
    bucket.errors += run.status === 'failed' ? 1 : 0;
    const current = cronByJob.get(run.jobId) ?? {
      failureCount: 0,
      runCount: 0,
    };
    current.runCount += 1;
    current.failureCount += run.status === 'failed' ? 1 : 0;
    cronByJob.set(run.jobId, current);
  }

  return {
    buckets,
    statusFamilies,
    topCronJobs: [...cronByJob.entries()]
      .map(([jobId, value]) => ({ jobId, ...value }))
      .sort((left, right) => right.runCount - left.runCount)
      .slice(0, 10),
    topRoutes: getTopRoutes(requests),
  };
}
