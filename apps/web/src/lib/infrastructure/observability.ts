import type {
  BlueGreenMonitoringDeployment,
  BlueGreenMonitoringRequestConsoleLog,
  BlueGreenMonitoringRequestLog,
  BlueGreenMonitoringWatcherLog,
  BlueGreenTargetRuntime,
  ObservabilityAnalytics,
  ObservabilityBuildResources,
  ObservabilityCronRun,
  ObservabilityDeployment,
  ObservabilityLogEvent,
  ObservabilityLogFacet,
  ObservabilityLogFacets,
  ObservabilityLogGroup,
  ObservabilityLogsResult,
  ObservabilityOverview,
  ObservabilityPaginatedResult,
  ObservabilityRequest,
  ObservabilityResourceBucket,
  ObservabilityResourceSampling,
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
import {
  createDeploymentStageSummary,
  createDeploymentStagesForObservability,
} from './observability-deployment-stages';

interface ObservabilityFilters {
  deploymentStamp?: string | null;
  level?: string | null;
  page?: number;
  pageSize?: number;
  projectId?: string | null;
  q?: string | null;
  requestId?: string | null;
  route?: string | null;
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
const RESOURCE_SAMPLE_STALE_AFTER_MS = RESOURCE_SAMPLE_MIN_INTERVAL_MS * 5;
const DEFAULT_PROJECT_ID = 'platform';
const RESOURCE_METRICS = {
  cpu: 'docker.cpu_percent',
  memory: 'docker.memory_bytes',
  rx: 'docker.rx_bytes',
  tx: 'docker.tx_bytes',
} as const;
const BUILD_RESOURCE_METRICS = {
  cpu: 'docker.build.cpu_percent',
  memory: 'docker.build.memory_bytes',
  rx: 'docker.build.rx_bytes',
  tx: 'docker.build.tx_bytes',
} as const;
const ACTIVE_BUILD_DEPLOYMENT_STATUSES = new Set(['building', 'deploying']);
type ResourceMetricNames = Record<keyof typeof RESOURCE_METRICS, string>;

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
    deploymentStamp: normalize(searchParams.get('deploymentStamp')),
    level: normalize(searchParams.get('level')),
    page: clampPage(searchParams.get('page')),
    pageSize: clampPageSize(searchParams.get('pageSize')),
    projectId: normalize(searchParams.get('projectId')) ?? DEFAULT_PROJECT_ID,
    q: normalize(searchParams.get('q')),
    requestId: normalize(searchParams.get('requestId')),
    route: normalize(searchParams.get('route')),
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

  if (filter === 'unknown') {
    return status == null;
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

function getStatusFacetValue(status: number | null | undefined) {
  if (status == null) {
    return 'unknown';
  }

  if (status >= 500) {
    return '5xx';
  }

  if (status >= 400) {
    return '4xx';
  }

  if (status >= 300) {
    return '3xx';
  }

  if (status >= 200) {
    return '2xx';
  }

  return String(status);
}

function normalizeRoutePath(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed, 'http://localhost').pathname;
  } catch {
    return trimmed.split(/[?#]/u)[0] || trimmed;
  }
}

function routeMatches(
  route: string | null | undefined,
  filter: string | null | undefined
) {
  const normalizedFilter = normalizeRoutePath(filter);
  if (!normalizedFilter) {
    return true;
  }

  return normalizeRoutePath(route) === normalizedFilter;
}

function deploymentStampMatches(
  deploymentStamp: string | null | undefined,
  filter: string | null | undefined
) {
  return !filter || deploymentStamp === filter;
}

function requestIdMatches(
  requestId: string | null | undefined,
  filter: string | null | undefined
) {
  return !filter || requestId === filter;
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
      eventId: log.eventId,
      eventType: log.eventType,
      incidentId: log.incidentId,
      legacySource: 'blue-green-watcher',
      ...(log.metadata ?? {}),
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
    status: filters.status ?? undefined,
    timeframeDays: getLegacyTimeframeDays(filters.timeframeHours),
  }).items.flatMap((request) =>
    (request.consoleLogs ?? []).map((log) => mapLegacyConsoleLog(log, request))
  );

  return [...watcherLogs, ...requestConsoleLogs]
    .filter((log) => log.createdAt >= cutoff)
    .filter((log) => shouldIncludeTime(log.createdAt, filters))
    .filter((log) => !filters.level || log.level === filters.level)
    .filter((log) => !filters.source || log.source === filters.source)
    .filter((log) => statusMatches(log.status, filters.status))
    .filter((log) => routeMatches(log.route, filters.route))
    .filter((log) => requestIdMatches(log.requestId, filters.requestId))
    .filter((log) =>
      deploymentStampMatches(log.deploymentStamp, filters.deploymentStamp)
    )
    .filter((log) =>
      shouldIncludeText(filters.q, [
        log.message,
        log.route,
        normalizeRoutePath(log.route),
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
    .filter((row) =>
      shouldIncludeTime(toMs(row.created_at) ?? Date.now(), filters)
    )
    .filter((row) => !filters.level || row.level === filters.level)
    .filter((row) => !filters.source || row.source === filters.source)
    .filter((row) => statusMatches(row.status, filters.status))
    .filter((row) => routeMatches(row.route, filters.route))
    .filter((row) => requestIdMatches(row.request_id, filters.requestId))
    .filter((row) =>
      deploymentStampMatches(row.deployment_stamp, filters.deploymentStamp)
    )
    .filter(
      (row) =>
        !q ||
        filterText(row.message, q) ||
        filterText(row.route, q) ||
        filterText(normalizeRoutePath(row.route), q) ||
        filterText(row.request_id, q) ||
        filterText(row.deployment_stamp, q) ||
        filterText(row.source, q) ||
        filterText(row.level, q) ||
        filterText(row.status == null ? null : String(row.status), q)
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

const LOG_LEVEL_RANK: Record<ObservabilityLogEvent['level'], number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogGroupKey(log: ObservabilityLogEvent) {
  if (log.requestId) {
    return `request:${log.requestId}`;
  }

  const route = normalizeRoutePath(log.route) ?? log.route ?? log.source;
  const deployment =
    log.deploymentStamp ?? log.deploymentColor ?? 'no-deployment';
  const minuteBucket = Math.floor(log.createdAt / 60_000);

  return `fallback:${log.source}:${route}:${deployment}:${minuteBucket}`;
}

function getRepresentativeStatus(events: ObservabilityLogEvent[]) {
  return (
    events.find((event) => (event.status ?? 0) >= 500)?.status ??
    events.find((event) => (event.status ?? 0) >= 400)?.status ??
    events.find((event) => event.status != null)?.status ??
    null
  );
}

function getRepresentativeLevel(events: ObservabilityLogEvent[]) {
  return events.reduce<ObservabilityLogEvent['level']>(
    (level, event) =>
      LOG_LEVEL_RANK[event.level] > LOG_LEVEL_RANK[level] ? event.level : level,
    'debug'
  );
}

function getRepresentativeMessage(events: ObservabilityLogEvent[]) {
  return (
    events.find((event) => {
      const message = event.message.trim();
      return message && !/^[}\]),;\s]+$/u.test(message);
    })?.message ??
    events[0]?.message ??
    ''
  );
}

function groupObservabilityLogs(
  logs: ObservabilityLogEvent[]
): ObservabilityLogGroup[] {
  const groups = new Map<string, ObservabilityLogEvent[]>();

  for (const log of logs) {
    const key = getLogGroupKey(log);
    groups.set(key, [...(groups.get(key) ?? []), log]);
  }

  return [...groups.entries()]
    .map(([key, groupLogs]) => {
      const events = [...groupLogs].sort(
        (left, right) => left.createdAt - right.createdAt
      );
      const latest = events[events.length - 1] as ObservabilityLogEvent;

      return {
        createdAt: latest.createdAt,
        deploymentColor:
          latest.deploymentColor ??
          events.find((event) => event.deploymentColor)?.deploymentColor ??
          null,
        deploymentStamp:
          latest.deploymentStamp ??
          events.find((event) => event.deploymentStamp)?.deploymentStamp ??
          null,
        durationMs:
          events
            .map((event) => event.durationMs)
            .filter((duration): duration is number => duration != null)
            .sort((left, right) => right - left)[0] ?? null,
        errorName:
          latest.errorName ??
          events.find((event) => event.errorName)?.errorName ??
          null,
        errorStack:
          latest.errorStack ??
          events.find((event) => event.errorStack)?.errorStack ??
          null,
        eventCount: events.length,
        events,
        firstEventAt: events[0]?.createdAt ?? latest.createdAt,
        id: key,
        ipAddress:
          latest.ipAddress ??
          events.find((event) => event.ipAddress)?.ipAddress ??
          null,
        level: getRepresentativeLevel(events),
        message: getRepresentativeMessage(events),
        metadata: latest.metadata,
        requestId:
          latest.requestId ??
          events.find((event) => event.requestId)?.requestId ??
          null,
        route:
          latest.route ?? events.find((event) => event.route)?.route ?? null,
        source: latest.source,
        status: getRepresentativeStatus(events),
        userAgent:
          latest.userAgent ??
          events.find((event) => event.userAgent)?.userAgent ??
          null,
      };
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}

function createLogFacet(
  logs: ObservabilityLogEvent[],
  getValue: (log: ObservabilityLogEvent) => string | null | undefined
): ObservabilityLogFacet[] {
  const counts = new Map<string, { count: number; errorCount: number }>();

  for (const log of logs) {
    const value = getValue(log);
    if (!value) {
      continue;
    }

    const current = counts.get(value) ?? { count: 0, errorCount: 0 };
    counts.set(value, {
      count: current.count + 1,
      errorCount:
        current.errorCount + (log.status != null && log.status >= 500 ? 1 : 0),
    });
  }

  return [...counts.entries()]
    .map(([value, entry]) => ({
      count: entry.count,
      errorCount: entry.errorCount,
      value,
    }))
    .sort(
      (left, right) =>
        right.errorCount - left.errorCount ||
        right.count - left.count ||
        left.value.localeCompare(right.value)
    )
    .slice(0, 50);
}

function createLogFacets(
  logs: ObservabilityLogEvent[]
): ObservabilityLogFacets {
  return {
    levels: createLogFacet(logs, (log) => log.level),
    routes: createLogFacet(logs, (log) => normalizeRoutePath(log.route)),
    sources: createLogFacet(logs, (log) => log.source),
    statuses: createLogFacet(logs, (log) => getStatusFacetValue(log.status)),
  };
}

export async function readObservabilityLogs(
  filters: ObservabilityFilters = {}
): Promise<ObservabilityLogsResult> {
  const logs = await loadRecentLogs(parseFilterDefaults(filters));
  const page = paginate(groupObservabilityLogs(logs), {
    page: clampPage(filters.page),
    pageSize: clampPageSize(filters.pageSize),
  });

  return {
    ...page,
    facets: createLogFacets(logs),
  };
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

function createEmptyTargetState(): BlueGreenTargetRuntime {
  return {
    activeColor: null,
    commitHash: null,
    commitShortHash: null,
    deploymentStamp: null,
    health: 'unknown',
    lastPromotedAt: null,
    standbyColor: null,
  };
}

function createDeploymentTargetStates(
  snapshotTargets: Record<'hive' | 'web', BlueGreenTargetRuntime>
): Record<'hive' | 'web', BlueGreenTargetRuntime> {
  return {
    hive: snapshotTargets.hive ?? createEmptyTargetState(),
    web: snapshotTargets.web ?? createEmptyTargetState(),
  };
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
  const targetStates = createDeploymentTargetStates(snapshot.runtime.targets);
  const supportBuildCacheEntries = snapshot.buildCache.history ?? [];
  const supportBuildCacheByCommit = new Map(
    supportBuildCacheEntries
      .filter((entry) => entry.commitHash)
      .map((entry) => [entry.commitHash, entry])
  );
  const supportBuildCacheByStamp = new Map(
    supportBuildCacheEntries
      .filter((entry) => entry.deploymentStamp)
      .map((entry) => [entry.deploymentStamp, entry])
  );
  const getSupportBuildCacheEntry = (deployment: {
    commitHash?: string | null;
    deploymentStamp?: string | null;
  }) =>
    (deployment.deploymentStamp &&
      supportBuildCacheByStamp.get(deployment.deploymentStamp)) ||
    (deployment.commitHash &&
      supportBuildCacheByCommit.get(deployment.commitHash)) ||
    null;
  const getSupportBuildCacheStats = (
    entry: (typeof supportBuildCacheEntries)[number] | null
  ) => {
    const supportBuildServices =
      entry?.buildServices.filter((service) => !service.startsWith('web-')) ??
      [];
    const supportBuildServiceCount = Object.keys(
      entry?.serviceHashes ?? {}
    ).length;

    return {
      supportBuildCacheHits: Math.max(
        0,
        supportBuildServiceCount - supportBuildServices.length
      ),
      supportBuildServiceCount,
      supportBuildServices,
    };
  };
  const resolveDeploymentKey = (deployment: {
    activeColor?: string | null;
    commitHash?: string | null;
    deploymentStamp?: string | null;
    startedAt?: number | null;
    status?: string | null;
  }) => {
    if (deployment.status === 'failed') {
      return deployment.deploymentStamp
        ? `failed-stamp:${deployment.deploymentStamp}`
        : `failed:${deployment.commitHash ?? 'unknown'}:${deployment.startedAt ?? 'unknown'}`;
    }

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

    const stages = right.stages.length > 0 ? right.stages : left.stages;
    const synthesizedStages =
      right.stages.length > 0
        ? right.synthesizedStages
        : left.synthesizedStages;
    const supportBuildCacheHits = Math.max(
      left.supportBuildCacheHits,
      right.supportBuildCacheHits
    );
    const supportBuildServiceCount = Math.max(
      left.supportBuildServiceCount,
      right.supportBuildServiceCount
    );
    const supportBuildServices = [
      ...new Set([...left.supportBuildServices, ...right.supportBuildServices]),
    ];

    return {
      ...left,
      color: mergeText(left.color, right.color),
      commitHash: left.commitHash ?? right.commitHash,
      commitShortHash: left.commitShortHash ?? right.commitShortHash,
      commitSubject: left.commitSubject ?? right.commitSubject,
      deploymentKind: mergeText(left.deploymentKind, right.deploymentKind),
      deploymentStamp: mergeText(left.deploymentStamp, right.deploymentStamp),
      durationMs: Math.max(left.durationMs ?? 0, right.durationMs ?? 0) || null,
      errorCount: left.errorCount + right.errorCount,
      failureReason: mergeText(left.failureReason, right.failureReason, '\n'),
      imageTag: left.imageTag ?? right.imageTag,
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
      stageSummary: createDeploymentStageSummary(
        stages,
        supportBuildCacheHits,
        supportBuildServices
      ),
      stages,
      synthesizedStages,
      supportBuildCacheHits,
      supportBuildServiceCount,
      supportBuildServices,
      targetStates: {
        hive: right.targetStates.hive ?? left.targetStates.hive,
        web: right.targetStates.web ?? left.targetStates.web,
      },
    };
  };
  const upsertDeployment = (deployment: ObservabilityDeployment) => {
    const key = resolveDeploymentKey({
      activeColor: deployment.color,
      commitHash: deployment.commitHash,
      deploymentStamp: deployment.deploymentStamp,
      startedAt: deployment.startedAt,
      status: deployment.status,
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
    const supportBuildCacheStats = getSupportBuildCacheStats(
      getSupportBuildCacheEntry(deployment)
    );
    const { stages: deploymentStages, synthesizedStages } =
      createDeploymentStagesForObservability(
        deployment,
        supportBuildCacheStats
      );

    upsertDeployment({
      color: deployment.activeColor ?? null,
      commitHash: deployment.commitHash ?? null,
      commitShortHash: deployment.commitShortHash ?? null,
      commitSubject: deployment.commitSubject ?? null,
      deploymentKind: deployment.deploymentKind ?? null,
      deploymentStamp: deployment.deploymentStamp ?? null,
      durationMs: deployment.buildDurationMs ?? deployment.lifetimeMs ?? null,
      errorCount: deployment.errorCount ?? 0,
      failureReason: deployment.failureReason ?? null,
      imageTag: deployment.imageTag ?? null,
      lastRequestAt: deployment.lastRequestAt ?? null,
      requestCount: deployment.requestCount ?? 0,
      runtimeState: deployment.runtimeState ?? null,
      startedAt: deployment.startedAt ?? deployment.activatedAt ?? null,
      stageSummary: createDeploymentStageSummary(
        deploymentStages,
        supportBuildCacheStats.supportBuildCacheHits,
        supportBuildCacheStats.supportBuildServices
      ),
      stages: deploymentStages,
      status: deployment.status ?? 'unknown',
      synthesizedStages,
      ...supportBuildCacheStats,
      targetStates,
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
      deploymentKind: null,
      deploymentStamp: request.deploymentStamp,
      durationMs: null,
      errorCount: 0,
      failureReason: null,
      imageTag: null,
      lastRequestAt: null,
      runtimeState: null,
      requestCount: 0,
      startedAt: null,
      status: 'ready',
      stageSummary: createDeploymentStageSummary([], 0, []),
      stages: [],
      synthesizedStages: false,
      supportBuildCacheHits: 0,
      supportBuildServiceCount: 0,
      supportBuildServices: [],
      targetStates,
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

function isDockerBuildResourceContainer(
  container: ObservabilityResources['dockerResources']['allContainers'][number]
) {
  return [
    container.image,
    container.name,
    container.projectName,
    container.serviceName,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.toLowerCase())
    .some(
      (value) =>
        value === 'buildkit' ||
        value.includes('buildkit') ||
        value.includes('buildx_buildkit') ||
        value.includes('moby/buildkit')
    );
}

function isDockerBuilderProcessContainer(
  container: ObservabilityResources['dockerResources']['allContainers'][number]
) {
  return [
    container.image,
    container.name,
    container.projectName,
    container.serviceName,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.toLowerCase())
    .some(
      (value) =>
        value === 'web-blue-green-watcher' ||
        value.includes('web-blue-green-watcher') ||
        value.includes('blue-green-watcher') ||
        value.includes('watch-blue-green-deploy')
    );
}

function dedupeDockerContainers(
  containers: ObservabilityResources['dockerResources']['allContainers']
) {
  const seen = new Set<string>();

  return containers.filter((container) => {
    const key = container.containerId || container.name;

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getActiveBuildProcesses(
  deployments: BlueGreenMonitoringDeployment[] = []
): ObservabilityBuildResources['activeBuilds'] {
  return deployments.flatMap((deployment, index) => {
    const status =
      typeof deployment.status === 'string' ? deployment.status : null;

    if (!status || !ACTIVE_BUILD_DEPLOYMENT_STATUSES.has(status)) {
      return [];
    }

    const startedAt =
      typeof deployment.startedAt === 'number' &&
      Number.isFinite(deployment.startedAt)
        ? deployment.startedAt
        : null;
    const commitShortHash =
      typeof deployment.commitShortHash === 'string'
        ? deployment.commitShortHash
        : null;
    const deploymentKind =
      typeof deployment.deploymentKind === 'string'
        ? deployment.deploymentKind
        : null;
    const name =
      typeof deployment.commitSubject === 'string' &&
      deployment.commitSubject.trim().length > 0
        ? deployment.commitSubject.trim()
        : (deploymentKind ?? commitShortHash ?? status);
    const idParts = [
      'watcher',
      deploymentKind,
      commitShortHash ?? deployment.commitHash,
      startedAt,
      index,
    ].filter((value) => value != null && String(value).trim().length > 0);

    return [
      {
        commitShortHash,
        deploymentKind,
        id: idParts.join('-'),
        name,
        source: 'watcher' as const,
        startedAt,
        status,
      },
    ];
  });
}

export function getBuildResources(
  dockerResources: ObservabilityResources['dockerResources'],
  deployments: BlueGreenMonitoringDeployment[] = []
): ObservabilityBuildResources {
  const activeBuilds = getActiveBuildProcesses(deployments);
  const buildkitContainers = dockerResources.allContainers.filter(
    isDockerBuildResourceContainer
  );
  const builderProcessContainers =
    activeBuilds.length > 0
      ? dockerResources.allContainers.filter(isDockerBuilderProcessContainer)
      : [];
  const containers = dedupeDockerContainers([
    ...buildkitContainers,
    ...builderProcessContainers,
  ]);

  return {
    activeBuilds,
    containers,
    state:
      activeBuilds.length > 0
        ? 'building'
        : containers.length > 0
          ? dockerResources.state
          : 'idle',
    totalCpuPercent: sumResourceMetric(containers, 'cpuPercent'),
    totalMemoryBytes: sumResourceMetric(containers, 'memoryBytes'),
    totalRxBytes: sumResourceMetric(containers, 'rxBytes'),
    totalTxBytes: sumResourceMetric(containers, 'txBytes'),
  };
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
  await persistResourceSample(snapshot.dockerResources, snapshot.deployments);
  const buildResources = getBuildResources(
    snapshot.dockerResources,
    snapshot.deployments
  );

  return {
    activeBuilds: buildResources.activeBuilds.length,
    buildContainers: buildResources.containers.length,
    buildCpuPercent: buildResources.totalCpuPercent,
    buildMemoryBytes: buildResources.totalMemoryBytes,
    buildProcesses: Math.max(
      buildResources.activeBuilds.length,
      buildResources.containers.length
    ),
    buildState: buildResources.state,
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
  dockerResources: ObservabilityResources['dockerResources'],
  deployments: BlueGreenMonitoringDeployment[] = []
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

  const buildResources = getBuildResources(dockerResources, deployments);
  const metadata = JSON.stringify({
    activeBuilds: buildResources.activeBuilds.length,
    buildContainers: buildResources.containers.length,
    containers: dockerResources.allContainers.length,
    services: dockerResources.serviceHealth.length,
    state: dockerResources.state,
    buildState: buildResources.state,
  });

  await sql`
    INSERT INTO usage_events (project_id, source, metric, value, unit, metadata)
    VALUES
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.cpu}, ${dockerResources.totalCpuPercent}, 'percent', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.memory}, ${dockerResources.totalMemoryBytes}, 'bytes', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.rx}, ${dockerResources.totalRxBytes}, 'bytes', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${RESOURCE_METRICS.tx}, ${dockerResources.totalTxBytes}, 'bytes', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${BUILD_RESOURCE_METRICS.cpu}, ${buildResources.totalCpuPercent}, 'percent', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${BUILD_RESOURCE_METRICS.memory}, ${buildResources.totalMemoryBytes}, 'bytes', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${BUILD_RESOURCE_METRICS.rx}, ${buildResources.totalRxBytes}, 'bytes', ${metadata}::jsonb),
      (${DEFAULT_PROJECT_ID}, 'server', ${BUILD_RESOURCE_METRICS.tx}, ${buildResources.totalTxBytes}, 'bytes', ${metadata}::jsonb)
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

function getCurrentResourceBucket(metrics: ResourceMetricItem) {
  return {
    bucketStart: Date.now(),
    cpuPercent: metrics.cpuPercent ?? null,
    hasLiveSample: true,
    memoryBytes: metrics.memoryBytes ?? null,
    rxBytes: metrics.rxBytes ?? null,
    sampleCount: 0,
    txBytes: metrics.txBytes ?? null,
  };
}

type ResourceBucketReadResult = {
  buckets: ObservabilityResourceBucket[];
  sampling: ObservabilityResourceSampling;
};

export function createResourceSamplingSummary({
  buckets,
  latestSampleAt,
  now = Date.now(),
}: {
  buckets: ObservabilityResourceBucket[];
  latestSampleAt: number | null;
  now?: number;
}): ObservabilityResourceSampling {
  const sampledBucketCount = buckets.filter(
    (bucket) => (bucket.sampleCount ?? 0) > 0
  ).length;
  const gapBucketCount = buckets.filter(
    (bucket) => (bucket.sampleCount ?? 0) === 0 && !bucket.hasLiveSample
  ).length;
  const latestSampleAgeMs =
    latestSampleAt != null ? Math.max(0, now - latestSampleAt) : null;
  const status =
    sampledBucketCount === 0
      ? 'live-only'
      : latestSampleAgeMs != null &&
          latestSampleAgeMs > RESOURCE_SAMPLE_STALE_AFTER_MS
        ? 'stale'
        : gapBucketCount > 0
          ? 'gapped'
          : 'healthy';

  return {
    bucketCount: buckets.length,
    expectedIntervalMs: RESOURCE_SAMPLE_MIN_INTERVAL_MS,
    gapBucketCount,
    latestSampleAgeMs,
    latestSampleAt,
    sampledBucketCount,
    status,
  };
}

async function readResourceBuckets(
  projectId: string,
  timeframeHours: number,
  currentMetrics: ResourceMetricItem,
  metricNames: ResourceMetricNames = RESOURCE_METRICS
): Promise<ResourceBucketReadResult> {
  const sql = await getSql();
  if (!sql) {
    const buckets = [getCurrentResourceBucket(currentMetrics)];
    return {
      buckets,
      sampling: createResourceSamplingSummary({
        buckets,
        latestSampleAt: null,
      }),
    };
  }

  const rows = await sql<
    Array<{ created_at: Date; metric: string; value: number }>
  >`
    SELECT metric, value, created_at
    FROM usage_events
    WHERE project_id = ${projectId}
      AND metric IN ${sql(Object.values(metricNames))}
      AND created_at >= now() - make_interval(hours => ${timeframeHours})
    ORDER BY created_at ASC
    LIMIT ${MAX_AGGREGATE_ROWS}
  `;

  if (rows.length === 0) {
    const buckets = [getCurrentResourceBucket(currentMetrics)];
    return {
      buckets,
      sampling: createResourceSamplingSummary({
        buckets,
        latestSampleAt: null,
      }),
    };
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

    if (row.metric === metricNames.cpu) bucket.cpu.push(row.value);
    else if (row.metric === metricNames.memory) {
      bucket.memory.push(row.value);
    } else if (row.metric === metricNames.rx) bucket.rx.push(row.value);
    else if (row.metric === metricNames.tx) bucket.tx.push(row.value);
  }

  const average = (values: number[]) =>
    values.length > 0
      ? values.reduce((total, value) => total + value, 0) / values.length
      : null;
  const sampleCount = (bucket: (typeof buckets)[number]) =>
    Math.max(
      bucket.cpu.length,
      bucket.memory.length,
      bucket.rx.length,
      bucket.tx.length
    );
  const persistedSampleCounts = buckets.map(sampleCount);
  const currentBucket = buckets.at(-1);
  if (currentBucket) {
    currentBucket.cpu.push(currentMetrics.cpuPercent ?? 0);
    currentBucket.memory.push(currentMetrics.memoryBytes ?? 0);
    currentBucket.rx.push(currentMetrics.rxBytes ?? 0);
    currentBucket.tx.push(currentMetrics.txBytes ?? 0);
  }
  const latestSampleAt =
    rows
      .map((row) => toMs(row.created_at))
      .filter((value): value is number => value != null)
      .sort((left, right) => right - left)[0] ?? null;

  const resourceBuckets = buckets.map((bucket, index) => ({
    bucketStart: bucket.bucketStart,
    cpuPercent: average(bucket.cpu),
    hasLiveSample: index === buckets.length - 1,
    memoryBytes: average(bucket.memory),
    rxBytes: average(bucket.rx),
    sampleCount: persistedSampleCounts[index] ?? 0,
    txBytes: average(bucket.tx),
  }));

  return {
    buckets: resourceBuckets,
    sampling: createResourceSamplingSummary({
      buckets: resourceBuckets,
      latestSampleAt,
      now,
    }),
  };
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
  const buildResources = getBuildResources(
    snapshot.dockerResources,
    snapshot.deployments
  );
  const [runtimeHistory, buildHistory] = await Promise.all([
    readResourceBuckets(
      normalized.projectId,
      normalized.timeframeHours,
      {
        cpuPercent: scopedDockerResources.totalCpuPercent,
        memoryBytes: scopedDockerResources.totalMemoryBytes,
        rxBytes: scopedDockerResources.totalRxBytes,
        txBytes: scopedDockerResources.totalTxBytes,
      },
      RESOURCE_METRICS
    ),
    readResourceBuckets(
      DEFAULT_PROJECT_ID,
      normalized.timeframeHours,
      {
        cpuPercent: buildResources.totalCpuPercent,
        memoryBytes: buildResources.totalMemoryBytes,
        rxBytes: buildResources.totalRxBytes,
        txBytes: buildResources.totalTxBytes,
      },
      BUILD_RESOURCE_METRICS
    ),
  ]);

  return {
    buildBuckets: buildHistory.buckets,
    buildResources,
    buckets: runtimeHistory.buckets,
    dockerResources: scopedDockerResources,
    sampling: {
      build: buildHistory.sampling,
      runtime: runtimeHistory.sampling,
    },
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
