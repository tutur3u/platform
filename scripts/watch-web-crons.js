#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const {
  parseContainerConsoleLogEntries,
} = require('./watch-blue-green/telemetry.js');
const {
  ROOT_DIR,
  WEB_CRON_CONFIG_PATH,
  readCronConfig,
} = require('./web-crons.js');
const {
  getWatcherComposeEnv,
} = require('./watch-blue-green/deploy-watcher-runtime.js');
const {
  getBlueGreenFrontend,
  getBlueGreenServiceName,
} = require('./docker-web/blue-green.js');

const DEFAULT_INTERNAL_WEB_API_ORIGIN = 'http://web-proxy:7803';
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_STATUS_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_DOCKER_TELEMETRY_TIMEOUT_MS = 10_000;
const CRON_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web', 'cron');
const CRON_CONTROL_DIR = path.join(
  ROOT_DIR,
  'tmp',
  'docker-web',
  'watch',
  'control'
);
const CRON_RUN_REQUESTS_DIR = path.join(CRON_CONTROL_DIR, 'cron-run-requests');
const WATCHER_RECOVERY_REQUEST_FILE =
  'blue-green-watcher-recovery.request.json';
const WATCHER_RECOVERY_RETRY_MS = 60_000;
const WATCHER_SERVICE_NAME = 'web-blue-green-watcher';

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    intervalMs: DEFAULT_INTERVAL_MS,
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--once') {
      parsed.once = true;
      continue;
    }

    if (arg === '--interval-ms') {
      parsed.intervalMs = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.intervalMs) || parsed.intervalMs <= 0) {
    throw new Error('--interval-ms must be a positive integer.');
  }

  return parsed;
}

function ensureDir(dirPath, fsImpl = fs) {
  fsImpl.mkdirSync(dirPath, { recursive: true });
}

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
  ensureDir(path.dirname(filePath), fsImpl);
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function getPositiveIntegerEnv(env, name, fallback) {
  const value = env?.[name];

  if (value == null || String(value).trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStatusHeartbeatIntervalMs(env = process.env) {
  return getPositiveIntegerEnv(
    env,
    'PLATFORM_CRON_STATUS_HEARTBEAT_INTERVAL_MS',
    DEFAULT_STATUS_HEARTBEAT_INTERVAL_MS
  );
}

function getDockerTelemetryTimeoutMs(env = process.env) {
  return getPositiveIntegerEnv(
    env,
    'PLATFORM_CRON_DOCKER_TELEMETRY_TIMEOUT_MS',
    DEFAULT_DOCKER_TELEMETRY_TIMEOUT_MS
  );
}

function normalizeWatcherRecoveryRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return null;
  }

  if (
    request.kind !== 'watcher-recovery' ||
    typeof request.projectId !== 'string' ||
    typeof request.reason !== 'string' ||
    typeof request.requestedAt !== 'string'
  ) {
    return null;
  }

  return {
    ...request,
    attemptCount:
      typeof request.attemptCount === 'number' ? request.attemptCount : 0,
    lastAttemptAt:
      typeof request.lastAttemptAt === 'number' ? request.lastAttemptAt : null,
  };
}

function getCronPaths({
  controlDir = process.env.PLATFORM_CRON_CONTROL_DIR || CRON_CONTROL_DIR,
  runtimeDir = process.env.PLATFORM_CRON_MONITORING_DIR || CRON_RUNTIME_DIR,
} = {}) {
  return {
    controlDir,
    executionDir: path.join(runtimeDir, 'executions'),
    runRequestsDir: path.join(controlDir, 'cron-run-requests'),
    statusFile: path.join(runtimeDir, 'status.json'),
    stateFile: path.join(runtimeDir, 'state.json'),
    controlFile: path.join(controlDir, 'cron-control.json'),
    runtimeDir,
    watcherRecoveryRequestFile: path.join(
      controlDir,
      WATCHER_RECOVERY_REQUEST_FILE
    ),
  };
}

function loadCronParser(rootDir = ROOT_DIR) {
  return require(
    path.join(rootDir, 'apps', 'web', 'node_modules', 'cron-parser')
  );
}

function getPreviousScheduledAt(schedule, now, rootDir = ROOT_DIR) {
  const { CronExpressionParser } = loadCronParser(rootDir);
  const expression = CronExpressionParser.parse(schedule, {
    currentDate: new Date(now),
    tz: 'UTC',
  });
  return expression.prev().getTime();
}

function getNextScheduledAt(schedule, now, rootDir = ROOT_DIR) {
  const { CronExpressionParser } = loadCronParser(rootDir);
  const expression = CronExpressionParser.parse(schedule, {
    currentDate: new Date(now),
    tz: 'UTC',
  });
  return expression.next().getTime();
}

function getDueScheduledJobs({ config, now, rootDir = ROOT_DIR, state }) {
  return config.jobs.flatMap((job) => {
    if (!job.enabled) {
      return [];
    }

    const scheduledAt = getPreviousScheduledAt(job.schedule, now, rootDir);
    const lastScheduledAt = state.lastScheduledAtByJobId?.[job.id];

    if (typeof lastScheduledAt !== 'number') {
      return [];
    }

    return scheduledAt > lastScheduledAt ? [{ job, scheduledAt }] : [];
  });
}

function initializeScheduleState({ config, now, rootDir = ROOT_DIR, state }) {
  const nextState = {
    ...state,
    lastScheduledAtByJobId: {
      ...(state.lastScheduledAtByJobId ?? {}),
    },
  };

  for (const job of config.jobs) {
    if (typeof nextState.lastScheduledAtByJobId[job.id] === 'number') {
      continue;
    }

    nextState.lastScheduledAtByJobId[job.id] = getPreviousScheduledAt(
      job.schedule,
      now,
      rootDir
    );
  }

  return nextState;
}

function readControl(paths, fsImpl = fs) {
  const control = {
    enabled: true,
    jobs: {},
    ...readJsonFile(paths.controlFile, {}, fsImpl),
  };

  return {
    ...control,
    jobs: control.jobs && typeof control.jobs === 'object' ? control.jobs : {},
  };
}

function getJobControlEnabled(control, jobId) {
  const override = control.jobs[jobId];
  return typeof override?.enabled === 'boolean' ? override.enabled : null;
}

function getEffectiveJobEnabled(job, control) {
  if (control.enabled === false) {
    return false;
  }

  return getJobControlEnabled(control, job.id) ?? job.enabled;
}

function normalizeRunRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return null;
  }

  const jobId = typeof request.jobId === 'string' ? request.jobId : null;
  if (!jobId) {
    return null;
  }

  return {
    id:
      typeof request.id === 'string' && request.id
        ? request.id
        : crypto.randomUUID(),
    jobId,
    requestedAt:
      typeof request.requestedAt === 'number'
        ? request.requestedAt
        : Date.now(),
    requestedBy:
      typeof request.requestedBy === 'string' ? request.requestedBy : null,
    requestedByEmail:
      typeof request.requestedByEmail === 'string'
        ? request.requestedByEmail
        : null,
  };
}

function readRunRequests(paths, fsImpl = fs) {
  if (!fsImpl.existsSync(paths.runRequestsDir)) {
    return [];
  }

  return fsImpl
    .readdirSync(paths.runRequestsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .flatMap((fileName) => {
      const filePath = path.join(paths.runRequestsDir, fileName);
      const request = normalizeRunRequest(readJsonFile(filePath, null, fsImpl));
      return request ? [{ ...request, filePath }] : [];
    });
}

function removeRunRequest(request, fsImpl = fs) {
  if (request.filePath && fsImpl.existsSync(request.filePath)) {
    fsImpl.unlinkSync(request.filePath);
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = (options.spawnImpl ?? spawn)(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'pipe',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeout = null;

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, options.timeoutMs);
    }

    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        code: code ?? 1,
        signal: signal ?? null,
        stderr,
        stdout,
        timedOut,
      });
    });
  });
}

function getWatcherRuntimeDir(paths) {
  return path.dirname(paths.controlDir);
}

async function processWatcherRecoveryRequest({
  env = process.env,
  fsImpl = fs,
  now = Date.now(),
  paths,
  rootDir = ROOT_DIR,
  run = runCommand,
} = {}) {
  const request = normalizeWatcherRecoveryRequest(
    readJsonFile(paths.watcherRecoveryRequestFile, null, fsImpl)
  );

  if (!request) {
    return null;
  }

  if (
    request.lastAttemptAt &&
    now - request.lastAttemptAt < WATCHER_RECOVERY_RETRY_MS
  ) {
    return { request, status: 'backoff' };
  }

  const attemptCount = request.attemptCount + 1;
  writeJsonFile(
    paths.watcherRecoveryRequestFile,
    {
      ...request,
      attemptCount,
      lastAttemptAt: now,
    },
    fsImpl
  );

  const watcherRuntimeDir = getWatcherRuntimeDir(paths);
  fsImpl.rmSync(path.join(watcherRuntimeDir, 'blue-green-auto-deploy.lock'), {
    force: true,
  });
  fsImpl.rmSync(
    path.join(watcherRuntimeDir, 'blue-green-auto-deploy.status.json'),
    { force: true }
  );

  const composeEnv = getWatcherComposeEnv({
    baseEnv: {
      ...env,
      PLATFORM_HOST_WORKSPACE_DIR: env.PLATFORM_HOST_WORKSPACE_DIR || rootDir,
    },
    fsImpl,
    rootDir,
  });
  const result = await run(
    'docker',
    [
      'compose',
      '-f',
      path.join(rootDir, 'docker-compose.web.prod.yml'),
      '--profile',
      'redis',
      'up',
      '--build',
      '--detach',
      '--force-recreate',
      '--remove-orphans',
      WATCHER_SERVICE_NAME,
    ],
    {
      env: composeEnv,
      stdio: 'pipe',
    }
  );

  if (result.code !== 0) {
    writeJsonFile(
      paths.watcherRecoveryRequestFile,
      {
        ...request,
        attemptCount,
        lastAttemptAt: now,
        lastError:
          result.stderr?.trim() ||
          result.stdout?.trim() ||
          `docker compose exited with code ${result.code}`,
      },
      fsImpl
    );

    return { request, status: 'failed' };
  }

  fsImpl.rmSync(paths.watcherRecoveryRequestFile, { force: true });

  return { request, status: 'recreated' };
}

async function listWebContainers({
  composeFile = process.env.PLATFORM_WEB_CRON_COMPOSE_FILE ||
    path.join(ROOT_DIR, 'docker-compose.web.prod.yml'),
  env = process.env,
  run = runCommand,
} = {}) {
  const composeEnv = getWatcherComposeEnv({
    baseEnv: env,
    rootDir: env.PLATFORM_HOST_WORKSPACE_DIR || ROOT_DIR,
  });
  getBlueGreenFrontend(composeEnv);
  const containers = [];

  for (const deploymentColor of ['blue', 'green']) {
    const serviceName = getBlueGreenServiceName(deploymentColor, composeEnv);
    const result = await run(
      'docker',
      ['compose', '-f', composeFile, 'ps', '-q', serviceName],
      {
        env: composeEnv,
        stdio: 'pipe',
        timeoutMs: getDockerTelemetryTimeoutMs(env),
      }
    );

    if (result.code !== 0) {
      continue;
    }

    const containerId = result.stdout.trim().split(/\s+/u).filter(Boolean)[0];
    if (containerId) {
      containers.push({ containerId, deploymentColor });
    }
  }

  return containers;
}

async function readRouteConsoleLogs({
  env = process.env,
  endedAt,
  run = runCommand,
  startedAt,
} = {}) {
  const containers = await listWebContainers({ env, run });
  const logs = [];

  for (const container of containers) {
    const result = await run(
      'docker',
      [
        'logs',
        '--timestamps',
        '--since',
        new Date(Math.max(0, startedAt - 250)).toISOString(),
        container.containerId,
      ],
      {
        env,
        stdio: 'pipe',
        timeoutMs: getDockerTelemetryTimeoutMs(env),
      }
    );

    if (result.code !== 0) {
      continue;
    }

    logs.push(
      ...parseContainerConsoleLogEntries(result.stdout, {
        containerId: container.containerId,
        deploymentColor: container.deploymentColor,
        source: 'route',
      })
    );
  }

  return logs
    .filter((log) => log.time >= startedAt - 250 && log.time <= endedAt + 250)
    .sort((left, right) => left.time - right.time)
    .slice(0, 50)
    .map(({ rawLine: _rawLine, ...log }) => log);
}

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getExecutionFile(executionDir, time) {
  const day = new Date(time).toISOString().slice(0, 10);
  return path.join(executionDir, `${day}.jsonl`);
}

function appendExecution(paths, execution, fsImpl = fs) {
  ensureDir(paths.executionDir, fsImpl);
  fsImpl.appendFileSync(
    getExecutionFile(paths.executionDir, execution.startedAt),
    `${JSON.stringify(execution)}\n`
  );
}

function getExecutionRunStatus(execution) {
  return execution.status === 'success'
    ? 'success'
    : execution.status === 'timeout'
      ? 'timeout'
      : execution.status === 'skipped'
        ? 'skipped'
        : 'failed';
}

function buildRunRecordFromRequest({ execution = null, job, request, status }) {
  const now = Date.now();
  const startedAt = execution?.startedAt ?? null;
  const endedAt =
    status === 'processing' || status === 'queued'
      ? null
      : (execution?.endedAt ?? null);

  return {
    consoleLogs: execution?.consoleLogs ?? [],
    description: job.description,
    durationMs:
      typeof execution?.durationMs === 'number'
        ? execution.durationMs
        : startedAt
          ? Math.max(0, now - startedAt)
          : null,
    endedAt,
    error: execution?.error ?? null,
    executionId: execution?.id ?? null,
    httpStatus: execution?.httpStatus ?? null,
    id: request.id,
    jobId: job.id,
    path: job.path,
    requestedAt: request.requestedAt,
    requestedBy: request.requestedBy ?? null,
    requestedByEmail: request.requestedByEmail ?? null,
    response: execution?.response ?? null,
    schedule: job.schedule,
    source: 'manual',
    startedAt,
    status,
    updatedAt: now,
  };
}

function upsertRunStatus(paths, runRecord, fsImpl = fs) {
  const current = readJsonFile(paths.statusFile, {}, fsImpl);
  const currentRuns = Array.isArray(current.runs) ? current.runs : [];
  const runs = [
    runRecord,
    ...currentRuns.filter((run) => run?.id !== runRecord.id),
  ]
    .sort((left, right) => {
      const leftTime =
        typeof left?.requestedAt === 'number' ? left.requestedAt : 0;
      const rightTime =
        typeof right?.requestedAt === 'number' ? right.requestedAt : 0;
      return rightTime - leftTime;
    })
    .slice(0, 25);

  writeJsonFile(
    paths.statusFile,
    {
      ...current,
      runs,
      updatedAt: Date.now(),
    },
    fsImpl
  );
}

function touchCronStatus(paths, patch = {}, fsImpl = fs) {
  const current = readJsonFile(paths.statusFile, {}, fsImpl);

  writeJsonFile(
    paths.statusFile,
    {
      ...current,
      ...patch,
      status: 'live',
      updatedAt: Date.now(),
    },
    fsImpl
  );
}

function createCronStatusHeartbeat({
  env = process.env,
  execution,
  fsImpl = fs,
  job,
  paths,
  source,
}) {
  const intervalMs = getStatusHeartbeatIntervalMs(env);
  const heartbeat = () =>
    touchCronStatus(
      paths,
      {
        activeExecution: {
          id: execution.id,
          jobId: job.id,
          path: job.path,
          scheduledAt: execution.scheduledAt ?? null,
          source,
          startedAt: execution.startedAt,
          status: 'processing',
        },
      },
      fsImpl
    );

  heartbeat();

  const timer = setInterval(heartbeat, intervalMs);
  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

function createManualRunLogRefresher({
  env,
  execution,
  fsImpl,
  job,
  paths,
  request,
  run,
}) {
  if (!request?.id) {
    return {
      async flush() {},
      stop() {},
    };
  }

  let timer = null;
  let refreshing = false;
  let stopped = false;
  const refresh = async () => {
    if (refreshing || stopped) {
      return;
    }

    refreshing = true;
    try {
      const now = Date.now();
      const consoleLogs = await readRouteConsoleLogs({
        env,
        endedAt: now,
        run,
        startedAt: execution.startedAt,
      });
      execution.consoleLogs = consoleLogs;
      execution.endedAt = now;
      execution.durationMs = Math.max(0, now - execution.startedAt);
      if (!stopped) {
        upsertRunStatus(
          paths,
          buildRunRecordFromRequest({
            execution,
            job,
            request,
            status: 'processing',
          }),
          fsImpl
        );
      }
    } finally {
      refreshing = false;
    }
  };

  upsertRunStatus(
    paths,
    buildRunRecordFromRequest({
      execution,
      job,
      request,
      status: 'processing',
    }),
    fsImpl
  );

  timer = setInterval(() => {
    void refresh().catch(() => {});
  }, 1500);

  return {
    flush: refresh,
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
      }
    },
  };
}

async function executeJob({
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
  job,
  paths,
  run = runCommand,
  scheduledAt = null,
  source,
  triggerId = null,
  triggerRequest = null,
} = {}) {
  const startedAt = Date.now();
  const cronSecret = env.CRON_SECRET || env.VERCEL_CRON_SECRET;
  const origin = env.INTERNAL_WEB_API_ORIGIN || DEFAULT_INTERNAL_WEB_API_ORIGIN;
  const timeoutMs = Number.parseInt(
    env.PLATFORM_CRON_REQUEST_TIMEOUT_MS || '',
    10
  );
  const requestTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const execution = {
    consoleLogs: [],
    description: job.description,
    durationMs: 0,
    endedAt: startedAt,
    error: null,
    httpStatus: null,
    id: crypto.randomUUID(),
    jobId: job.id,
    path: job.path,
    response: null,
    schedule: job.schedule,
    scheduledAt,
    source,
    startedAt,
    status: 'failed',
    triggerId,
  };
  const statusHeartbeat = createCronStatusHeartbeat({
    env,
    execution,
    fsImpl,
    job,
    paths,
    source,
  });
  const manualRunRefresher =
    source === 'manual' && triggerRequest
      ? createManualRunLogRefresher({
          env,
          execution,
          fsImpl,
          job,
          paths,
          request: triggerRequest,
          run,
        })
      : null;

  try {
    if (!cronSecret) {
      throw new Error('CRON_SECRET or VERCEL_CRON_SECRET is not set.');
    }

    const url = new URL(job.path, origin);
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
        method: 'GET',
      },
      requestTimeoutMs,
      fetchImpl
    );
    const text = await response.text();

    execution.httpStatus = response.status;
    execution.response = text.slice(0, 12_000);
    execution.status = response.ok ? 'success' : 'failed';
  } catch (error) {
    execution.error = error instanceof Error ? error.message : String(error);
    execution.status = error?.name === 'AbortError' ? 'timeout' : 'failed';
  } finally {
    execution.endedAt = Date.now();
    execution.durationMs = Math.max(0, execution.endedAt - execution.startedAt);
    statusHeartbeat.stop();
    manualRunRefresher?.stop();
    execution.consoleLogs = await readRouteConsoleLogs({
      env,
      endedAt: execution.endedAt,
      run,
      startedAt: execution.startedAt,
    });
    appendExecution(paths, execution, fsImpl);
    if (source === 'manual' && triggerRequest) {
      upsertRunStatus(
        paths,
        buildRunRecordFromRequest({
          execution,
          job,
          request: triggerRequest,
          status: getExecutionRunStatus(execution),
        }),
        fsImpl
      );
    }
  }

  return execution;
}

function readExecutionRecords(paths, fsImpl = fs) {
  if (!fsImpl.existsSync(paths.executionDir)) {
    return [];
  }

  return fsImpl
    .readdirSync(paths.executionDir)
    .filter((fileName) => fileName.endsWith('.jsonl'))
    .sort()
    .flatMap((fileName) => {
      const content = fsImpl.readFileSync(
        path.join(paths.executionDir, fileName),
        'utf8'
      );
      return content
        .split(/\r?\n/u)
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        });
    });
}

function getLastExecutionByJobId(executions) {
  const map = new Map();

  for (const execution of executions) {
    const current = map.get(execution.jobId);
    if (!current || execution.startedAt > current.startedAt) {
      map.set(execution.jobId, execution);
    }
  }

  return map;
}

function getFailureStreak(jobId, executions) {
  let streak = 0;

  for (const execution of [...executions]
    .filter((entry) => entry.jobId === jobId)
    .sort((left, right) => right.startedAt - left.startedAt)) {
    if (execution.status === 'success') {
      return streak;
    }
    streak += 1;
  }

  return streak;
}

function buildStatus({
  config,
  control,
  executions,
  intervalMs,
  now,
  rootDir = ROOT_DIR,
  runs = [],
  state,
}) {
  const lastByJobId = getLastExecutionByJobId(executions);
  const jobs = config.jobs.map((job) => {
    const lastExecution = lastByJobId.get(job.id) ?? null;
    const enabled = getEffectiveJobEnabled(job, control);
    const nextRunAt = enabled
      ? getNextScheduledAt(job.schedule, now, rootDir)
      : null;

    return {
      ...job,
      configuredEnabled: job.enabled,
      controlEnabled: getJobControlEnabled(control, job.id),
      enabled,
      failureStreak: getFailureStreak(job.id, executions),
      lastExecution,
      lastScheduledAt: state.lastScheduledAtByJobId?.[job.id] ?? null,
      nextRunAt,
    };
  });
  const nextRunAt =
    jobs
      .map((job) => job.nextRunAt)
      .filter((value) => typeof value === 'number')
      .sort((left, right) => left - right)[0] ?? null;

  return {
    control,
    enabled: control.enabled !== false,
    intervalMs,
    jobs,
    lastExecution:
      [...executions].sort(
        (left, right) => right.startedAt - left.startedAt
      )[0] ?? null,
    nextRunAt,
    retainedExecutionCount: executions.length,
    runs,
    status: 'live',
    updatedAt: now,
  };
}

function pruneExecutionFiles(paths, retentionDays, fsImpl = fs) {
  if (!fsImpl.existsSync(paths.executionDir)) {
    return;
  }

  const cutoff = Date.now() - retentionDays * 86_400_000;

  for (const fileName of fsImpl.readdirSync(paths.executionDir)) {
    if (!fileName.endsWith('.jsonl')) {
      continue;
    }

    const day = Date.parse(fileName.slice(0, 10));
    if (Number.isFinite(day) && day < cutoff) {
      fsImpl.unlinkSync(path.join(paths.executionDir, fileName));
    }
  }
}

async function runCronCycle({
  configPath = WEB_CRON_CONFIG_PATH,
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
  intervalMs = DEFAULT_INTERVAL_MS,
  paths = getCronPaths(),
  rootDir = ROOT_DIR,
  run = runCommand,
} = {}) {
  ensureDir(paths.runtimeDir, fsImpl);
  ensureDir(paths.executionDir, fsImpl);
  ensureDir(paths.runRequestsDir, fsImpl);
  touchCronStatus(paths, { intervalMs }, fsImpl);
  await processWatcherRecoveryRequest({
    env,
    fsImpl,
    paths,
    rootDir,
    run,
  });

  const now = Date.now();
  const config = readCronConfig({ configPath, fsImpl });
  const control = readControl(paths, fsImpl);
  let state = initializeScheduleState({
    config,
    now,
    rootDir,
    state: readJsonFile(paths.stateFile, {}, fsImpl),
  });
  const executions = [];
  const requests =
    control.enabled === false ? [] : readRunRequests(paths, fsImpl);

  for (const request of requests) {
    const job = config.jobs.find((candidate) => candidate.id === request.jobId);
    if (!job) {
      removeRunRequest(request, fsImpl);
      continue;
    }

    if (!getEffectiveJobEnabled(job, control)) {
      upsertRunStatus(
        paths,
        buildRunRecordFromRequest({
          execution: {
            consoleLogs: [],
            durationMs: 0,
            endedAt: Date.now(),
            error: 'Cron job is disabled.',
            httpStatus: null,
            id: crypto.randomUUID(),
            response: null,
            startedAt: Date.now(),
          },
          job,
          request,
          status: 'skipped',
        }),
        fsImpl
      );
      removeRunRequest(request, fsImpl);
      continue;
    }

    executions.push(
      await executeJob({
        env,
        fetchImpl,
        fsImpl,
        job,
        paths,
        run,
        source: 'manual',
        triggerId: request.id,
        triggerRequest: request,
      })
    );
    removeRunRequest(request, fsImpl);
  }

  if (control.enabled !== false) {
    const dueJobs = getDueScheduledJobs({
      config: {
        ...config,
        jobs: config.jobs.map((job) => ({
          ...job,
          enabled: getEffectiveJobEnabled(job, control),
        })),
      },
      now,
      rootDir,
      state,
    });

    for (const due of dueJobs) {
      executions.push(
        await executeJob({
          env,
          fetchImpl,
          fsImpl,
          job: due.job,
          paths,
          run,
          scheduledAt: due.scheduledAt,
          source: 'scheduled',
        })
      );
      state = {
        ...state,
        lastScheduledAtByJobId: {
          ...(state.lastScheduledAtByJobId ?? {}),
          [due.job.id]: due.scheduledAt,
        },
      };
    }
  }

  state.updatedAt = Date.now();
  writeJsonFile(paths.stateFile, state, fsImpl);

  const retentionDays = Number.parseInt(
    env.PLATFORM_CRON_RETENTION_DAYS || '',
    10
  );
  pruneExecutionFiles(
    paths,
    Number.isFinite(retentionDays) && retentionDays > 0
      ? retentionDays
      : DEFAULT_RETENTION_DAYS,
    fsImpl
  );

  const allExecutions = readExecutionRecords(paths, fsImpl);
  const previousStatus = readJsonFile(paths.statusFile, {}, fsImpl);
  const status = buildStatus({
    config,
    control,
    executions: allExecutions,
    intervalMs,
    now: Date.now(),
    rootDir,
    runs: Array.isArray(previousStatus.runs) ? previousStatus.runs : [],
    state,
  });
  writeJsonFile(paths.statusFile, status, fsImpl);

  return {
    executions,
    status,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let shouldContinue = true;

  while (shouldContinue) {
    try {
      await runCronCycle({ intervalMs: args.intervalMs });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }

    if (args.once) {
      shouldContinue = false;
      continue;
    }

    await sleep(args.intervalMs);
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  CRON_CONTROL_DIR,
  CRON_RUN_REQUESTS_DIR,
  CRON_RUNTIME_DIR,
  DEFAULT_INTERNAL_WEB_API_ORIGIN,
  buildStatus,
  executeJob,
  getCronPaths,
  getDueScheduledJobs,
  getNextScheduledAt,
  getPreviousScheduledAt,
  initializeScheduleState,
  listWebContainers,
  parseArgs,
  processWatcherRecoveryRequest,
  readControl,
  readExecutionRecords,
  readRunRequests,
  runCronCycle,
};
