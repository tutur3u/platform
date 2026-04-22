const fs = require('node:fs');
const path = require('node:path');

const MAX_RECENT_REQUESTS = 120;
const MAX_REQUEST_LOG_RECORDS = 100_000_000;
const PERIOD_RETENTION = {
  daily: 35,
  monthly: 24,
  weekly: 26,
  yearly: 10,
};
const REQUEST_LOG_CHUNK_SIZE = 50_000;
const INTERNAL_PROXY_METRIC_EXCLUDE_PATHS = new Set([
  '/__platform/drain-status',
  '/api/health',
]);

function readJsonFile(filePath, fallback, fsImpl = fs) {
  if (!fsImpl.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createEmptyTelemetryState() {
  return {
    chunks: [],
    currentChunkCount: 0,
    currentChunkFile: null,
    cursor: null,
    totalRecords: 0,
  };
}

function createEmptyTelemetrySummary() {
  return {
    daily: [],
    deploymentMetrics: {},
    latestRequestAt: null,
    monthly: [],
    recentRequests: [],
    requestStatus: {
      clientError: 0,
      informational: 0,
      redirect: 0,
      serverError: 0,
      success: 0,
    },
    totalLogEntries: 0,
    totalRequestsServed: 0,
    updatedAt: null,
    weekly: [],
    yearly: [],
  };
}

function readTelemetryState(paths, fsImpl = fs) {
  const parsed = readJsonFile(
    paths.requestStateFile,
    createEmptyTelemetryState(),
    fsImpl
  );

  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? {
        ...createEmptyTelemetryState(),
        ...parsed,
      }
    : createEmptyTelemetryState();
}

function readTelemetrySummary(paths, fsImpl = fs) {
  const parsed = readJsonFile(
    paths.requestSummaryFile,
    createEmptyTelemetrySummary(),
    fsImpl
  );

  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? {
        ...createEmptyTelemetrySummary(),
        ...parsed,
      }
    : createEmptyTelemetrySummary();
}

function writeTelemetryState(paths, state, fsImpl = fs) {
  writeJsonFile(paths.requestStateFile, state, fsImpl);
}

function writeTelemetrySummary(paths, summary, fsImpl = fs) {
  writeJsonFile(paths.requestSummaryFile, summary, fsImpl);
}

function normalizePath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '/';
  }

  try {
    const url = new URL(value, 'http://127.0.0.1');
    const pathname = url.pathname || '/';
    return `${pathname}${url.search}`;
  } catch {
    return value;
  }
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function classifyStatus(status) {
  if (!Number.isFinite(status) || status < 100) {
    return 'success';
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

  return 'informational';
}

function isInternalProxyPath(pathname) {
  try {
    const parsed = new URL(pathname, 'http://127.0.0.1');
    return INTERNAL_PROXY_METRIC_EXCLUDE_PATHS.has(parsed.pathname);
  } catch {
    return INTERNAL_PROXY_METRIC_EXCLUDE_PATHS.has(pathname);
  }
}

function parseStructuredProxyMessage(message, time, rawLine) {
  try {
    const parsed = JSON.parse(message);
    const method =
      typeof parsed.method === 'string'
        ? parsed.method
        : typeof parsed.request_method === 'string'
          ? parsed.request_method
          : null;
    const pathValue =
      typeof parsed.path === 'string'
        ? parsed.path
        : typeof parsed.requestUri === 'string'
          ? parsed.requestUri
          : typeof parsed.request_uri === 'string'
            ? parsed.request_uri
            : typeof parsed.uri === 'string'
              ? parsed.uri
              : '/';
    const status =
      parseNumber(parsed.status) ??
      parseNumber(parsed.statusCode) ??
      parseNumber(parsed.status_code);
    const requestTimeSeconds =
      parseNumber(parsed.requestTime) ??
      parseNumber(parsed.request_time) ??
      parseNumber(parsed.requestDuration);

    return {
      deploymentColor:
        typeof parsed.deploymentColor === 'string'
          ? parsed.deploymentColor || null
          : typeof parsed.deployment_color === 'string'
            ? parsed.deployment_color || null
            : null,
      deploymentStamp:
        typeof parsed.deploymentStamp === 'string'
          ? parsed.deploymentStamp || null
          : typeof parsed.deployment_stamp === 'string'
            ? parsed.deployment_stamp || null
            : null,
      host: typeof parsed.host === 'string' ? parsed.host : null,
      isInternal: isInternalProxyPath(normalizePath(pathValue)),
      method,
      path: normalizePath(pathValue),
      rawLine,
      requestTimeMs:
        requestTimeSeconds != null
          ? Math.round(requestTimeSeconds * 1000)
          : null,
      sourceFormat: 'json',
      status,
      time,
      upstreamAddress:
        typeof parsed.upstreamAddr === 'string'
          ? parsed.upstreamAddr
          : typeof parsed.upstream_addr === 'string'
            ? parsed.upstream_addr
            : null,
    };
  } catch {
    return null;
  }
}

function parseLegacyProxyMessage(message, time, rawLine) {
  const requestMatch = message.match(/"([A-Z]+)\s+([^"\s]+)\s+HTTP\/[0-9.]+"/);

  if (!requestMatch) {
    return null;
  }

  const statusMatch = message.match(/"\s+(\d{3})\s+/);

  return {
    deploymentColor: null,
    deploymentStamp: null,
    host: null,
    isInternal: isInternalProxyPath(normalizePath(requestMatch[2])),
    method: requestMatch[1],
    path: normalizePath(requestMatch[2]),
    rawLine,
    requestTimeMs: null,
    sourceFormat: 'legacy',
    status: statusMatch ? Number(statusMatch[1]) : null,
    time,
    upstreamAddress: null,
  };
}

function parseProxyLogEntries(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$/);

      if (!timestampMatch) {
        return null;
      }

      const [, isoTime, message] = timestampMatch;
      const time = Date.parse(isoTime);

      if (!Number.isFinite(time)) {
        return null;
      }

      if (message.startsWith('{')) {
        return parseStructuredProxyMessage(message, time, line);
      }

      return parseLegacyProxyMessage(message, time, line);
    })
    .filter(Boolean);
}

function summarizeRequestRate(entries, startTime, endTime) {
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  ) {
    return {
      averageRequestsPerMinute: 0,
      dailyAverageRequests: 0,
      dailyPeakRequests: 0,
      dailyRequestCount: 0,
      errorCount: 0,
      peakRequestsPerMinute: 0,
      requestCount: 0,
    };
  }

  const minuteBucketCounts = new Map();
  const dayBucketCounts = new Map();
  let errorCount = 0;
  let requestCount = 0;

  for (const entry of entries) {
    if (
      entry.isInternal ||
      isInternalProxyPath(entry.path ?? '/') ||
      entry.time < startTime ||
      entry.time >= endTime
    ) {
      continue;
    }

    requestCount += 1;
    if ((entry.status ?? 200) >= 400) {
      errorCount += 1;
    }

    const minuteBucket = Math.floor(entry.time / 60_000);
    const dayBucket = Math.floor(entry.time / 86_400_000);
    minuteBucketCounts.set(
      minuteBucket,
      (minuteBucketCounts.get(minuteBucket) ?? 0) + 1
    );
    dayBucketCounts.set(dayBucket, (dayBucketCounts.get(dayBucket) ?? 0) + 1);
  }

  const durationMinutes = Math.max((endTime - startTime) / 60_000, 1 / 60);
  const durationDays = Math.max((endTime - startTime) / 86_400_000, 1 / 86_400);
  const finalDayBucket = Math.floor(
    Math.max(startTime, endTime - 1) / 86_400_000
  );

  return {
    averageRequestsPerMinute: requestCount / durationMinutes,
    dailyAverageRequests: requestCount / durationDays,
    dailyPeakRequests: Math.max(0, ...dayBucketCounts.values()),
    dailyRequestCount: dayBucketCounts.get(finalDayBucket) ?? 0,
    errorCount,
    peakRequestsPerMinute: Math.max(0, ...minuteBucketCounts.values()),
    requestCount,
  };
}

function getDeploymentStorageKey(entry) {
  if (typeof entry?.deploymentStamp === 'string' && entry.deploymentStamp) {
    return `stamp:${entry.deploymentStamp}`;
  }

  if (typeof entry?.commitHash === 'string' && entry.commitHash) {
    return `commit:${entry.commitHash}`;
  }

  if (
    typeof entry?.activeColor === 'string' &&
    Number.isFinite(entry?.activatedAt ?? entry?.finishedAt ?? entry?.startedAt)
  ) {
    return `color:${entry.activeColor}:${entry.activatedAt ?? entry.finishedAt ?? entry.startedAt}`;
  }

  return `deployment:${entry?.startedAt ?? entry?.finishedAt ?? entry?.activatedAt ?? 'unknown'}`;
}

function matchDeploymentForEntry(entry, deployments, now = Date.now()) {
  if (typeof entry.deploymentStamp === 'string' && entry.deploymentStamp) {
    const byStamp = deployments.find(
      (deployment) => deployment.deploymentStamp === entry.deploymentStamp
    );

    if (byStamp) {
      return byStamp;
    }
  }

  return deployments.find((deployment) => {
    if (deployment.status !== 'successful' || !deployment.activatedAt) {
      return false;
    }

    const startTime = deployment.activatedAt;
    const endTime = deployment.endedAt ?? now;

    if (entry.time < startTime || entry.time >= endTime) {
      return false;
    }

    if (
      entry.deploymentColor &&
      typeof deployment.activeColor === 'string' &&
      entry.deploymentColor !== deployment.activeColor
    ) {
      return false;
    }

    return true;
  });
}

function toCompactRequestEntry(entry, deploymentKey = null) {
  return {
    deploymentColor: entry.deploymentColor ?? null,
    deploymentKey,
    deploymentStamp: entry.deploymentStamp ?? null,
    host: entry.host ?? null,
    isInternal: Boolean(entry.isInternal),
    method: entry.method ?? null,
    path: entry.path,
    requestTimeMs: entry.requestTimeMs ?? null,
    status: entry.status ?? null,
    time: entry.time,
  };
}

function getPeriodStart(kind, time) {
  const date = new Date(time);

  if (kind === 'daily') {
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }

  if (kind === 'weekly') {
    date.setUTCHours(0, 0, 0, 0);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return date.getTime();
  }

  if (kind === 'monthly') {
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(1);
    return date.getTime();
  }

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(0, 1);
  return date.getTime();
}

function getPeriodLabel(kind, startTime) {
  const date = new Date(startTime);

  if (kind === 'daily') {
    return date.toISOString().slice(0, 10);
  }

  if (kind === 'weekly') {
    return `W${Math.ceil(
      ((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000 +
        1) /
        7
    )}-${date.getUTCFullYear()}`;
  }

  if (kind === 'monthly') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  return `${date.getUTCFullYear()}`;
}

function updateRollingPeak(target, entryTime) {
  const minuteKey = Math.floor(entryTime / 60_000);

  if (target.currentMinuteKey !== minuteKey) {
    target.currentMinuteKey = minuteKey;
    target.currentMinuteCount = 0;
  }

  target.currentMinuteCount += 1;
  target.peakRequestsPerMinute = Math.max(
    target.peakRequestsPerMinute ?? 0,
    target.currentMinuteCount
  );
}

function updateDailyRollingCount(target, entryTime) {
  const dayKey = Math.floor(entryTime / 86_400_000);

  if (target.currentDayKey !== dayKey) {
    target.currentDayKey = dayKey;
    target.currentDayCount = 0;
  }

  target.currentDayCount += 1;
  target.dailyPeakRequests = Math.max(
    target.dailyPeakRequests ?? 0,
    target.currentDayCount
  );
  target.dailyRequestCount = target.currentDayCount;
}

function updatePeriodBucket(bucket, entry) {
  bucket.firstRequestAt =
    bucket.firstRequestAt == null
      ? entry.time
      : Math.min(bucket.firstRequestAt, entry.time);
  bucket.lastRequestAt =
    bucket.lastRequestAt == null
      ? entry.time
      : Math.max(bucket.lastRequestAt, entry.time);
  bucket.requestCount += 1;
  if ((entry.status ?? 200) >= 400) {
    bucket.errorCount += 1;
  }

  bucket.statusCounts[classifyStatus(entry.status)] += 1;
  if (entry.requestTimeMs != null) {
    bucket.maxLatencyMs = Math.max(
      bucket.maxLatencyMs ?? 0,
      entry.requestTimeMs
    );
    bucket.totalLatencyMs += entry.requestTimeMs;
  }

  if (
    entry.deploymentKey &&
    !bucket.deploymentKeys.includes(entry.deploymentKey)
  ) {
    bucket.deploymentKeys.push(entry.deploymentKey);
  }

  updateRollingPeak(bucket, entry.time);
}

function getOrCreatePeriodBucket(summary, kind, entryTime) {
  const collection = Array.isArray(summary[kind]) ? summary[kind] : [];
  const bucketStart = getPeriodStart(kind, entryTime);
  let bucket = collection.find(
    (candidate) => candidate.bucketStart === bucketStart
  );

  if (!bucket) {
    bucket = {
      bucketLabel: getPeriodLabel(kind, bucketStart),
      bucketStart,
      currentMinuteCount: 0,
      currentMinuteKey: null,
      dailyPeakRequests: 0,
      dailyRequestCount: 0,
      deploymentKeys: [],
      errorCount: 0,
      firstRequestAt: null,
      lastRequestAt: null,
      maxLatencyMs: 0,
      peakRequestsPerMinute: 0,
      requestCount: 0,
      statusCounts: {
        clientError: 0,
        informational: 0,
        redirect: 0,
        serverError: 0,
        success: 0,
      },
      totalLatencyMs: 0,
    };
    collection.push(bucket);
    summary[kind] = collection;
  }

  return bucket;
}

function getOrCreateDeploymentMetric(summary, deploymentKey, deployment) {
  const metrics =
    summary.deploymentMetrics &&
    typeof summary.deploymentMetrics === 'object' &&
    !Array.isArray(summary.deploymentMetrics)
      ? summary.deploymentMetrics
      : {};
  summary.deploymentMetrics = metrics;

  if (!metrics[deploymentKey]) {
    metrics[deploymentKey] = {
      activeColor: deployment?.activeColor ?? null,
      commitHash: deployment?.commitHash ?? null,
      commitShortHash: deployment?.commitShortHash ?? null,
      currentDayCount: 0,
      currentDayKey: null,
      currentMinuteCount: 0,
      currentMinuteKey: null,
      dailyPeakRequests: 0,
      dailyRequestCount: 0,
      deploymentKey,
      deploymentStamp: deployment?.deploymentStamp ?? null,
      errorCount: 0,
      firstRequestAt: null,
      lastRequestAt: null,
      maxLatencyMs: 0,
      peakRequestsPerMinute: 0,
      requestCount: 0,
      totalLatencyMs: 0,
    };
  }

  return metrics[deploymentKey];
}

function trimPeriodBuckets(summary) {
  for (const [kind, limit] of Object.entries(PERIOD_RETENTION)) {
    if (!Array.isArray(summary[kind])) {
      summary[kind] = [];
      continue;
    }

    summary[kind] = summary[kind]
      .sort((left, right) => right.bucketStart - left.bucketStart)
      .slice(0, limit);
  }
}

function trimDeploymentMetrics(summary, deployments) {
  const keepKeys = new Set(
    deployments.map((entry) => getDeploymentStorageKey(entry))
  );
  const metrics =
    summary.deploymentMetrics &&
    typeof summary.deploymentMetrics === 'object' &&
    !Array.isArray(summary.deploymentMetrics)
      ? summary.deploymentMetrics
      : {};

  summary.deploymentMetrics = Object.fromEntries(
    Object.entries(metrics)
      .filter(([key]) => keepKeys.has(key))
      .sort(
        (left, right) =>
          (right[1]?.lastRequestAt ?? 0) - (left[1]?.lastRequestAt ?? 0)
      )
      .slice(0, 10_000)
  );
}

function entryFingerprint(entry) {
  return [
    entry.time,
    entry.method ?? '',
    entry.path,
    entry.status ?? '',
    entry.deploymentStamp ?? '',
    entry.requestTimeMs ?? '',
    entry.host ?? '',
  ].join('|');
}

function filterEntriesAfterCursor(entries, cursor) {
  if (!cursor?.lastTimestamp) {
    return entries;
  }

  const seenAtTimestamp = new Set(cursor.fingerprints ?? []);
  return entries.filter((entry) => {
    if (entry.time > cursor.lastTimestamp) {
      return true;
    }

    if (entry.time < cursor.lastTimestamp) {
      return false;
    }

    return !seenAtTimestamp.has(entryFingerprint(entry));
  });
}

function getInitialSinceTime(deployments, summary, now = Date.now()) {
  const earliestDeployment = deployments
    .filter((entry) => entry.status === 'successful' && entry.activatedAt)
    .reduce(
      (minimum, entry) =>
        minimum == null || entry.activatedAt < minimum
          ? entry.activatedAt
          : minimum,
      null
    );

  return (
    earliestDeployment ?? summary.latestRequestAt ?? now - 24 * 60 * 60 * 1_000
  );
}

function ensureCurrentChunk(state, paths, fsImpl = fs) {
  fsImpl.mkdirSync(paths.requestLogDir, { recursive: true });

  if (
    state.currentChunkFile &&
    state.currentChunkCount < REQUEST_LOG_CHUNK_SIZE &&
    fsImpl.existsSync(path.join(paths.requestLogDir, state.currentChunkFile))
  ) {
    return state.currentChunkFile;
  }

  const chunkName = `requests-${Date.now()}.jsonl`;
  state.currentChunkFile = chunkName;
  state.currentChunkCount = 0;
  state.chunks = [
    ...(Array.isArray(state.chunks) ? state.chunks : []),
    {
      count: 0,
      file: chunkName,
      firstRequestAt: null,
      lastRequestAt: null,
    },
  ];

  return chunkName;
}

function appendEntriesToLogStore(entries, paths, state, fsImpl = fs) {
  if (entries.length === 0) {
    return;
  }

  for (const entry of entries) {
    const chunkFile = ensureCurrentChunk(state, paths, fsImpl);
    const chunkPath = path.join(paths.requestLogDir, chunkFile);
    fsImpl.appendFileSync(
      chunkPath,
      `${JSON.stringify(toCompactRequestEntry(entry, entry.deploymentKey ?? null))}\n`,
      'utf8'
    );

    state.currentChunkCount += 1;
    state.totalRecords += 1;
    const chunkMetadata = state.chunks[state.chunks.length - 1];
    chunkMetadata.count += 1;
    chunkMetadata.firstRequestAt =
      chunkMetadata.firstRequestAt == null
        ? entry.time
        : Math.min(chunkMetadata.firstRequestAt, entry.time);
    chunkMetadata.lastRequestAt =
      chunkMetadata.lastRequestAt == null
        ? entry.time
        : Math.max(chunkMetadata.lastRequestAt, entry.time);
  }

  while (
    state.totalRecords > MAX_REQUEST_LOG_RECORDS &&
    state.chunks.length > 1
  ) {
    const oldestChunk = state.chunks.shift();

    if (!oldestChunk) {
      break;
    }

    fsImpl.rmSync(path.join(paths.requestLogDir, oldestChunk.file), {
      force: true,
    });
    state.totalRecords = Math.max(0, state.totalRecords - oldestChunk.count);
  }
}

function applyEntriesToTelemetrySummary(summary, entries, deployments, now) {
  for (const rawEntry of entries) {
    summary.totalLogEntries += 1;
    summary.latestRequestAt = Math.max(
      summary.latestRequestAt ?? 0,
      rawEntry.time
    );

    const deployment = matchDeploymentForEntry(rawEntry, deployments, now);
    const deploymentKey = deployment
      ? getDeploymentStorageKey(deployment)
      : null;
    const entry = {
      ...rawEntry,
      deploymentKey,
    };

    summary.recentRequests = [
      toCompactRequestEntry(entry, deploymentKey),
      ...summary.recentRequests,
    ].slice(0, MAX_RECENT_REQUESTS);

    if (entry.isInternal) {
      continue;
    }

    summary.totalRequestsServed += 1;
    summary.requestStatus[classifyStatus(entry.status)] += 1;

    for (const kind of ['daily', 'weekly', 'monthly', 'yearly']) {
      const bucket = getOrCreatePeriodBucket(summary, kind, entry.time);
      updatePeriodBucket(bucket, entry);
    }

    if (!deploymentKey || !deployment) {
      continue;
    }

    const metric = getOrCreateDeploymentMetric(
      summary,
      deploymentKey,
      deployment
    );
    metric.firstRequestAt =
      metric.firstRequestAt == null
        ? entry.time
        : Math.min(metric.firstRequestAt, entry.time);
    metric.lastRequestAt =
      metric.lastRequestAt == null
        ? entry.time
        : Math.max(metric.lastRequestAt, entry.time);
    metric.requestCount += 1;
    if ((entry.status ?? 200) >= 400) {
      metric.errorCount += 1;
    }

    if (entry.requestTimeMs != null) {
      metric.maxLatencyMs = Math.max(
        metric.maxLatencyMs ?? 0,
        entry.requestTimeMs
      );
      metric.totalLatencyMs += entry.requestTimeMs;
    }

    updateRollingPeak(metric, entry.time);
    updateDailyRollingCount(metric, entry.time);
  }

  trimPeriodBuckets(summary);
  trimDeploymentMetrics(summary, deployments);
  summary.updatedAt = now;
  return summary;
}

async function syncProxyTrafficStore(
  deployments,
  {
    containerId,
    env,
    fsImpl = fs,
    now = Date.now(),
    paths,
    runCommand,
    runChecked,
  }
) {
  const state = readTelemetryState(paths, fsImpl);
  const summary = readTelemetrySummary(paths, fsImpl);

  if (!containerId) {
    summary.updatedAt = now;
    writeTelemetrySummary(paths, summary, fsImpl);
    return { ingestedEntries: [], state, summary };
  }

  const sinceTime = state.cursor?.lastTimestamp
    ? state.cursor.lastTimestamp
    : getInitialSinceTime(deployments, summary, now);
  const result = await runChecked(
    'docker',
    [
      'logs',
      '--timestamps',
      '--since',
      new Date(sinceTime).toISOString(),
      containerId,
    ],
    {
      env,
      runCommand,
      stdio: 'pipe',
    }
  );
  const parsedEntries = parseProxyLogEntries(result.stdout);
  const freshEntries = filterEntriesAfterCursor(parsedEntries, state.cursor);

  if (freshEntries.length === 0) {
    summary.updatedAt = now;
    writeTelemetrySummary(paths, summary, fsImpl);
    state.cursor = {
      ...(state.cursor ?? {}),
      containerId,
    };
    writeTelemetryState(paths, state, fsImpl);
    return { ingestedEntries: [], state, summary };
  }

  const enrichedEntries = freshEntries.map((entry) => {
    const deployment = matchDeploymentForEntry(entry, deployments, now);
    return {
      ...entry,
      deploymentKey: deployment ? getDeploymentStorageKey(deployment) : null,
    };
  });

  appendEntriesToLogStore(enrichedEntries, paths, state, fsImpl);
  applyEntriesToTelemetrySummary(summary, enrichedEntries, deployments, now);

  const lastTimestamp = enrichedEntries[enrichedEntries.length - 1].time;
  state.cursor = {
    containerId,
    fingerprints: enrichedEntries
      .filter((entry) => entry.time === lastTimestamp)
      .map((entry) => entryFingerprint(entry)),
    lastTimestamp,
  };

  writeTelemetryState(paths, state, fsImpl);
  writeTelemetrySummary(paths, summary, fsImpl);

  return {
    ingestedEntries: enrichedEntries,
    state,
    summary,
  };
}

function enrichDeploymentsWithTelemetry(
  deployments,
  summary,
  { now = Date.now() } = {}
) {
  const metrics =
    summary?.deploymentMetrics &&
    typeof summary.deploymentMetrics === 'object' &&
    !Array.isArray(summary.deploymentMetrics)
      ? summary.deploymentMetrics
      : {};

  return deployments.map((deployment) => {
    const lifetimeMs =
      deployment.status === 'successful' && deployment.activatedAt
        ? Math.max(0, (deployment.endedAt ?? now) - deployment.activatedAt)
        : null;
    const metric = metrics[getDeploymentStorageKey(deployment)] ?? null;

    if (!metric) {
      return {
        ...deployment,
        averageLatencyMs: null,
        averageRequestsPerMinute: null,
        dailyAverageRequests: null,
        dailyPeakRequests: null,
        dailyRequestCount: null,
        errorCount: null,
        firstRequestAt: null,
        lastRequestAt: null,
        lifetimeMs,
        peakRequestsPerMinute: null,
        requestCount: null,
      };
    }

    const durationMinutes = Math.max((lifetimeMs ?? 0) / 60_000, 1 / 60);
    const durationDays = Math.max((lifetimeMs ?? 0) / 86_400_000, 1 / 86_400);

    return {
      ...deployment,
      averageLatencyMs:
        metric.requestCount > 0
          ? metric.totalLatencyMs / metric.requestCount
          : null,
      averageRequestsPerMinute: metric.requestCount / durationMinutes,
      dailyAverageRequests: metric.requestCount / durationDays,
      dailyPeakRequests: metric.dailyPeakRequests ?? 0,
      dailyRequestCount: metric.dailyRequestCount ?? 0,
      errorCount: metric.errorCount ?? 0,
      firstRequestAt: metric.firstRequestAt ?? null,
      lastRequestAt: metric.lastRequestAt ?? null,
      lifetimeMs,
      peakRequestsPerMinute: metric.peakRequestsPerMinute ?? 0,
      requestCount: metric.requestCount ?? 0,
    };
  });
}

module.exports = {
  INTERNAL_PROXY_METRIC_EXCLUDE_PATHS,
  MAX_REQUEST_LOG_RECORDS,
  PERIOD_RETENTION,
  createEmptyTelemetrySummary,
  enrichDeploymentsWithTelemetry,
  getDeploymentStorageKey,
  parseProxyLogEntries,
  readTelemetryState,
  readTelemetrySummary,
  summarizeRequestRate,
  syncProxyTrafficStore,
  writeTelemetryState,
  writeTelemetrySummary,
};
