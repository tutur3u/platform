import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CronExecutionRecord,
  CronMonitoringControl,
  CronMonitoringJob,
  CronMonitoringSnapshot,
  CronRunRecord,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

const DEFAULT_CRON_STATUS_STALE_MS = 120_000;

function readJsonFile<T>(filePath: string, fallback: T, fsImpl = fs): T {
  if (!fsImpl.existsSync(/*turbopackIgnore: true*/ filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(
      fsImpl.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8')
    ) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(/*turbopackIgnore: true*/ filePath), {
    recursive: true,
  });
  fsImpl.writeFileSync(
    /*turbopackIgnore: true*/ filePath,
    `${JSON.stringify(value, null, 2)}\n`
  );
}

function resolveDockerWebRuntimeDir() {
  return (
    process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), 'tmp', 'docker-web')
  );
}

function resolveDockerWebControlDir() {
  return (
    process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR ||
    path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      'tmp',
      'docker-web',
      'watch',
      'control'
    )
  );
}

function resolveCronConfigPath() {
  if (process.env.PLATFORM_WEB_CRON_CONFIG_PATH) {
    return process.env.PLATFORM_WEB_CRON_CONFIG_PATH;
  }

  const candidates = [
    path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      'apps',
      'web',
      'cron.config.json'
    ),
    path.join(/*turbopackIgnore: true*/ process.cwd(), 'cron.config.json'),
  ];

  return (
    candidates.find((candidate) =>
      fs.existsSync(/*turbopackIgnore: true*/ candidate)
    ) ??
    path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      'apps',
      'web',
      'cron.config.json'
    )
  );
}

export function getCronMonitoringPaths() {
  const runtimeRoot = resolveDockerWebRuntimeDir();
  const runtimeDir =
    process.env.PLATFORM_CRON_MONITORING_DIR || path.join(runtimeRoot, 'cron');
  const controlDir =
    process.env.PLATFORM_CRON_CONTROL_DIR || resolveDockerWebControlDir();

  return {
    configFile: resolveCronConfigPath(),
    controlDir,
    controlFile: path.join(controlDir, 'cron-control.json'),
    executionDir: path.join(runtimeDir, 'executions'),
    runRequestsDir: path.join(controlDir, 'cron-run-requests'),
    runtimeDir,
    statusFile: path.join(runtimeDir, 'status.json'),
  };
}

function readCronConfig(paths = getCronMonitoringPaths(), fsImpl = fs) {
  const parsed = readJsonFile<{ jobs?: CronMonitoringJob[] }>(
    paths.configFile,
    { jobs: [] },
    fsImpl
  );

  return {
    jobs: Array.isArray(parsed.jobs)
      ? parsed.jobs.map((job) => ({
          configuredEnabled: job.enabled !== false,
          controlEnabled: null,
          description: String(job.description ?? ''),
          enabled: job.enabled !== false,
          failureStreak: 0,
          id: String(job.id),
          lastExecution: null,
          lastScheduledAt: null,
          nextRunAt: null,
          path: String(job.path),
          schedule: String(job.schedule),
        }))
      : [],
  };
}

function readExecutionRecords(
  paths = getCronMonitoringPaths(),
  fsImpl = fs
): CronExecutionRecord[] {
  if (!fsImpl.existsSync(/*turbopackIgnore: true*/ paths.executionDir)) {
    return [];
  }

  return fsImpl
    .readdirSync(/*turbopackIgnore: true*/ paths.executionDir)
    .filter((fileName) => fileName.endsWith('.jsonl'))
    .sort()
    .flatMap((fileName) =>
      fsImpl
        .readFileSync(
          path.join(/*turbopackIgnore: true*/ paths.executionDir, fileName),
          'utf8'
        )
        .split(/\r?\n/u)
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as CronExecutionRecord];
          } catch {
            return [];
          }
        })
    )
    .sort((left, right) => right.startedAt - left.startedAt);
}

function getDefaultControl(): CronMonitoringControl {
  return {
    enabled: true,
    jobs: {},
    updatedAt: null,
    updatedBy: null,
    updatedByEmail: null,
  };
}

function readControl(
  paths = getCronMonitoringPaths(),
  fsImpl = fs
): CronMonitoringControl {
  const control = {
    ...getDefaultControl(),
    ...readJsonFile<Partial<CronMonitoringControl>>(
      paths.controlFile,
      {},
      fsImpl
    ),
  };

  return {
    ...control,
    jobs: control.jobs && typeof control.jobs === 'object' ? control.jobs : {},
  };
}

function getJobControlEnabled(control: CronMonitoringControl, jobId: string) {
  const override = control.jobs[jobId];
  return typeof override?.enabled === 'boolean' ? override.enabled : null;
}

function getEffectiveJobEnabled(
  job: Pick<CronMonitoringJob, 'enabled' | 'id'>,
  control: CronMonitoringControl
) {
  if (control.enabled === false) {
    return false;
  }

  return getJobControlEnabled(control, job.id) ?? job.enabled;
}

function readQueuedRunRequests(
  jobs: CronMonitoringJob[],
  paths = getCronMonitoringPaths(),
  fsImpl = fs
): CronRunRecord[] {
  if (!fsImpl.existsSync(/*turbopackIgnore: true*/ paths.runRequestsDir)) {
    return [];
  }

  return fsImpl
    .readdirSync(/*turbopackIgnore: true*/ paths.runRequestsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .flatMap((fileName) => {
      const request = readJsonFile<{
        id?: string;
        jobId?: string;
        requestedAt?: number;
        requestedBy?: string | null;
        requestedByEmail?: string | null;
      } | null>(path.join(paths.runRequestsDir, fileName), null, fsImpl);
      const job = jobs.find((candidate) => candidate.id === request?.jobId);

      if (!request?.id || !request.jobId || !job) {
        return [];
      }

      const requestedAt =
        typeof request.requestedAt === 'number'
          ? request.requestedAt
          : Date.now();

      return [
        {
          consoleLogs: [],
          description: job.description,
          durationMs: null,
          endedAt: null,
          error: null,
          executionId: null,
          httpStatus: null,
          id: request.id,
          jobId: request.jobId,
          path: job.path,
          requestedAt,
          requestedBy:
            typeof request.requestedBy === 'string'
              ? request.requestedBy
              : null,
          requestedByEmail:
            typeof request.requestedByEmail === 'string'
              ? request.requestedByEmail
              : null,
          response: null,
          schedule: job.schedule,
          source: 'manual' as const,
          startedAt: null,
          status: 'queued' as const,
          updatedAt: requestedAt,
        },
      ];
    });
}

function mergeCronRunRecords(runs: CronRunRecord[]) {
  const byId = new Map<string, CronRunRecord>();

  for (const run of runs) {
    const current = byId.get(run.id);
    if (!current || run.updatedAt >= current.updatedAt) {
      byId.set(run.id, run);
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.requestedAt - left.requestedAt)
    .slice(0, 25);
}

function normalizeStatusHealth(updatedAt: number | null, now: number) {
  if (updatedAt == null) {
    return 'missing' as const;
  }

  return now - updatedAt > DEFAULT_CRON_STATUS_STALE_MS
    ? ('stale' as const)
    : ('live' as const);
}

export function readCronMonitoringSnapshot({
  fsImpl = fs,
  now = Date.now(),
  paths = getCronMonitoringPaths(),
}: {
  fsImpl?: typeof fs;
  now?: number;
  paths?: ReturnType<typeof getCronMonitoringPaths>;
} = {}): CronMonitoringSnapshot {
  const config = readCronConfig(paths, fsImpl);
  const persistedStatus = readJsonFile<Partial<CronMonitoringSnapshot>>(
    paths.statusFile,
    {},
    fsImpl
  );
  const executions = readExecutionRecords(paths, fsImpl);
  const control = readControl(paths, fsImpl);
  const persistedJobs = Array.isArray(persistedStatus.jobs)
    ? persistedStatus.jobs
    : [];
  const jobs = config.jobs.map((job) => ({
    ...job,
    ...(persistedJobs.find((candidate) => candidate.id === job.id) ?? {}),
  }));
  const effectiveJobs = jobs.map((job) => ({
    ...job,
    configuredEnabled: job.configuredEnabled ?? job.enabled,
    controlEnabled: getJobControlEnabled(control, job.id),
    enabled: getEffectiveJobEnabled(job, control),
  }));
  const persistedRuns = Array.isArray(persistedStatus.runs)
    ? (persistedStatus.runs as CronRunRecord[])
    : [];
  const runs = mergeCronRunRecords([
    ...readQueuedRunRequests(effectiveJobs, paths, fsImpl),
    ...persistedRuns,
  ]);
  const lastExecution = executions[0] ?? persistedStatus.lastExecution ?? null;
  const failedExecutions = executions.filter(
    (execution) => execution.status !== 'success'
  );
  const failedJobs = effectiveJobs.filter(
    (job) => (job.failureStreak ?? 0) > 0
  ).length;
  const nextRunAt =
    effectiveJobs
      .map((job) => job.nextRunAt)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right)[0] ?? null;
  const updatedAt =
    typeof persistedStatus.updatedAt === 'number'
      ? persistedStatus.updatedAt
      : null;

  return {
    control,
    enabled: control.enabled,
    jobs: effectiveJobs,
    lastExecution,
    nextRunAt,
    overview: {
      enabledJobs: effectiveJobs.filter((job) => job.enabled).length,
      failedExecutions: failedExecutions.length,
      failedJobs,
      processingRuns: runs.filter((run) => run.status === 'processing').length,
      queuedRuns: runs.filter((run) => run.status === 'queued').length,
      retainedExecutions: executions.length,
      totalJobs: effectiveJobs.length,
    },
    retainedExecutionCount: executions.length,
    runs,
    source: {
      configAvailable: fsImpl.existsSync(
        /*turbopackIgnore: true*/ paths.configFile
      ),
      controlAvailable: fsImpl.existsSync(
        /*turbopackIgnore: true*/ paths.controlFile
      ),
      runtimeDirAvailable: fsImpl.existsSync(
        /*turbopackIgnore: true*/ paths.runtimeDir
      ),
      statusAvailable: fsImpl.existsSync(
        /*turbopackIgnore: true*/ paths.statusFile
      ),
    },
    status: normalizeStatusHealth(updatedAt, now),
    updatedAt,
  };
}

export function readCronExecutionArchive({
  fsImpl = fs,
  jobId = null,
  page = 1,
  pageSize = 25,
  paths = getCronMonitoringPaths(),
}: {
  fsImpl?: typeof fs;
  jobId?: string | null;
  page?: number;
  pageSize?: number;
  paths?: ReturnType<typeof getCronMonitoringPaths>;
} = {}) {
  const boundedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const boundedPageSize =
    Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;
  const executions = readExecutionRecords(paths, fsImpl).filter(
    (execution) => !jobId || execution.jobId === jobId
  );
  const offset = (boundedPage - 1) * boundedPageSize;
  const items = executions.slice(offset, offset + boundedPageSize);
  const pageCount = Math.max(1, Math.ceil(executions.length / boundedPageSize));

  return {
    hasNextPage: boundedPage < pageCount,
    hasPreviousPage: boundedPage > 1,
    items,
    limit: boundedPageSize,
    offset,
    page: boundedPage,
    pageCount,
    total: executions.length,
    window: {
      newestAt: executions[0]?.startedAt ?? null,
      oldestAt: executions.at(-1)?.startedAt ?? null,
    },
  };
}

export function updateCronMonitoringControl({
  enabled,
  fsImpl = fs,
  jobId = null,
  paths = getCronMonitoringPaths(),
  updatedBy,
  updatedByEmail,
}: {
  enabled: boolean;
  fsImpl?: typeof fs;
  jobId?: string | null;
  paths?: ReturnType<typeof getCronMonitoringPaths>;
  updatedBy: string;
  updatedByEmail: string | null;
}) {
  const previous = readControl(paths, fsImpl);
  const control: CronMonitoringControl = jobId
    ? {
        ...previous,
        jobs: {
          ...previous.jobs,
          [jobId]: {
            enabled,
            updatedAt: Date.now(),
            updatedBy,
            updatedByEmail,
          },
        },
      }
    : {
        ...previous,
        enabled,
      };

  control.updatedAt = Date.now();
  control.updatedBy = updatedBy;
  control.updatedByEmail = updatedByEmail;

  const nextControl: CronMonitoringControl = {
    ...control,
    updatedAt: Date.now(),
    updatedBy,
    updatedByEmail,
  };

  writeJsonFile(paths.controlFile, nextControl, fsImpl);
  return nextControl;
}

export function queueCronRunRequest({
  fsImpl = fs,
  jobId,
  paths = getCronMonitoringPaths(),
  requestedBy,
  requestedByEmail,
}: {
  fsImpl?: typeof fs;
  jobId: string;
  paths?: ReturnType<typeof getCronMonitoringPaths>;
  requestedBy: string;
  requestedByEmail: string | null;
}) {
  const request = {
    id: crypto.randomUUID(),
    jobId,
    requestedAt: Date.now(),
    requestedBy,
    requestedByEmail,
  };

  writeJsonFile(
    path.join(
      paths.runRequestsDir,
      `${request.requestedAt}-${request.id}.json`
    ),
    request,
    fsImpl
  );

  return request;
}
