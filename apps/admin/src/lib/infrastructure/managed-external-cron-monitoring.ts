import 'server-only';

import type {
  ManagedExternalCronApp,
  ManagedExternalCronExecution,
  ManagedExternalCronJob,
  ManagedExternalCronMonitoring,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import cronstrue from 'cronstrue';
import { validate as validateUUID } from 'uuid';
import {
  getExternalAppById,
  listExternalApps,
} from '@/lib/app-coordination/external-apps';
import { callManagedCronRpc } from '@/lib/managed-cron/rpc';
import { runExternalManagedCronJobNow } from '@/lib/managed-cron/service';
import {
  assertValidManagedCronSchedule,
  getNextManagedCronRunAt,
  normalizeManagedCronTimezone,
} from '@/lib/managed-cron/validation';

type RawManagedExternalCronExecution = {
  durationMs?: number | null;
  endedAt?: string | null;
  error?: string | null;
  httpStatus?: number | null;
  id?: string | null;
  jobKey?: string | null;
  jobName?: string | null;
  responseSummary?: string | null;
  response?: string | null;
  source?: string | null;
  startedAt?: string | null;
  status?: string | null;
  workspaceId?: string | null;
};

type RawManagedExternalCronJob = {
  active?: boolean | null;
  enabled?: boolean | null;
  failureStreak?: number | null;
  isOverdue?: boolean | null;
  jobKey?: string | null;
  jobName?: string | null;
  lastExecution?: RawManagedExternalCronExecution | null;
  name?: string | null;
  nextRunAt?: string | null;
  overdueReason?: string | null;
  overdueSince?: string | null;
  schedule?: string | null;
  scheduleDescription?: string | null;
  scheduleTimezone?: string | null;
};

type RawManagedExternalCronStatus = {
  configured?: boolean | null;
  enabled?: boolean | null;
  generatedAt?: string | null;
  jobs?: RawManagedExternalCronJob[] | null;
  serverNow?: string | null;
};

type RawManagedExternalCronApp = {
  externalAppId?: string | null;
  status?: RawManagedExternalCronStatus | null;
  workspaceId?: string | null;
};

type RawManagedExternalCronMonitoring = {
  apps?: RawManagedExternalCronApp[] | null;
  available?: boolean | null;
  error?: string | null;
  executions?: RawManagedExternalCronExecution[] | null;
  generatedAt?: string | null;
  serverNow?: string | null;
};

export type UpdateManagedExternalCronJobInput = {
  enabled?: boolean;
  externalAppId: string;
  jobKey: string;
  schedule?: string;
  scheduleTimezone?: string;
  wsId: string;
};

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function describeSchedule(schedule: string, timezone: string) {
  try {
    return cronstrue.toString(schedule, {
      throwExceptionOnParseError: false,
      verbose: true,
    });
  } catch {
    return `${schedule} (${timezone})`;
  }
}

function normalizeExecution(
  execution: RawManagedExternalCronExecution | null | undefined
): ManagedExternalCronExecution | null {
  const id = cleanString(execution?.id);
  const jobKey = cleanString(execution?.jobKey);
  const startedAt = cleanString(execution?.startedAt);
  const workspaceId = cleanString(execution?.workspaceId);

  if (!id || !jobKey || !startedAt || !workspaceId) {
    return null;
  }

  const status = cleanString(execution?.status) ?? 'failed';
  const source = execution?.source === 'manual' ? 'manual' : 'scheduled';

  return {
    durationMs: cleanNumber(execution?.durationMs),
    endedAt: cleanString(execution?.endedAt),
    error: cleanString(execution?.error),
    httpStatus: cleanNumber(execution?.httpStatus),
    id,
    jobKey,
    jobName: cleanString(execution?.jobName) ?? jobKey,
    responseSummary:
      cleanString(execution?.responseSummary) ??
      cleanString(execution?.response),
    source,
    startedAt,
    status:
      status === 'configuration_error' ||
      status === 'failed' ||
      status === 'skipped' ||
      status === 'success' ||
      status === 'timeout'
        ? status
        : 'failed',
    workspaceId,
  };
}

function normalizeJob(job: RawManagedExternalCronJob): ManagedExternalCronJob {
  const jobKey = cleanString(job.jobKey) ?? 'unknown';
  const schedule = cleanString(job.schedule) ?? '* * * * *';
  const scheduleTimezone = cleanString(job.scheduleTimezone) ?? 'UTC';

  return {
    enabled: job.enabled ?? job.active ?? false,
    failureStreak: cleanNumber(job.failureStreak) ?? 0,
    isOverdue: job.isOverdue === true,
    jobKey,
    jobName: cleanString(job.jobName) ?? cleanString(job.name) ?? jobKey,
    lastExecution: normalizeExecution(job.lastExecution),
    nextRunAt: cleanString(job.nextRunAt),
    overdueReason: cleanString(job.overdueReason),
    overdueSince: cleanString(job.overdueSince),
    schedule,
    scheduleDescription:
      cleanString(job.scheduleDescription) ??
      describeSchedule(schedule, scheduleTimezone),
    scheduleTimezone,
  };
}

function normalizeApp({
  appDisplayName,
  externalAppId,
  status,
  workspaceId,
}: {
  appDisplayName: string;
  externalAppId: string;
  status: RawManagedExternalCronStatus | null | undefined;
  workspaceId: string;
}): ManagedExternalCronApp {
  const generatedAt = cleanString(status?.generatedAt) ?? nowIso();
  const serverNow = cleanString(status?.serverNow) ?? generatedAt;

  return {
    appDisplayName,
    appId: externalAppId,
    configured: status?.configured === true,
    enabled: status?.enabled === true,
    generatedAt,
    jobs: Array.isArray(status?.jobs)
      ? status.jobs.map((job) => normalizeJob(job))
      : [],
    serverNow,
    workspaceId,
  };
}

export function unavailableManagedExternalCronMonitoring(): ManagedExternalCronMonitoring {
  const generatedAt = nowIso();
  return {
    apps: [],
    available: false,
    error: 'Managed external cron monitoring is unavailable.',
    executions: [],
    generatedAt,
    serverNow: generatedAt,
  };
}

export async function readManagedExternalCronMonitoring(): Promise<ManagedExternalCronMonitoring> {
  const [apps, raw] = await Promise.all([
    listExternalApps(),
    callManagedCronRpc<RawManagedExternalCronMonitoring>(
      'external_app_managed_cron_monitoring',
      {
        p_execution_limit: 50,
      }
    ),
  ]);
  const appNameById = new Map(apps.map((app) => [app.id, app.displayName]));
  const generatedAt = cleanString(raw.generatedAt) ?? nowIso();

  return {
    apps: (raw.apps ?? []).flatMap((app) => {
      const externalAppId = cleanString(app.externalAppId);
      const workspaceId = cleanString(app.workspaceId);

      if (!externalAppId || !workspaceId || !validateUUID(workspaceId)) {
        return [];
      }

      return [
        normalizeApp({
          appDisplayName: appNameById.get(externalAppId) ?? externalAppId,
          externalAppId,
          status: app.status,
          workspaceId,
        }),
      ];
    }),
    available: raw.available !== false,
    error: cleanString(raw.error),
    executions: (raw.executions ?? []).flatMap((execution) => {
      const normalized = normalizeExecution(execution);
      return normalized ? [normalized] : [];
    }),
    generatedAt,
    serverNow: cleanString(raw.serverNow) ?? generatedAt,
  };
}

export async function runManagedExternalCronJobNow({
  externalAppId,
  jobKey,
  wsId,
}: {
  externalAppId: string;
  jobKey: string;
  wsId: string;
}) {
  if (!validateUUID(wsId)) {
    throw new Error('Invalid workspace ID');
  }

  const result = await runExternalManagedCronJobNow({
    externalAppId,
    jobKey,
    wsId,
  });

  if (!result) {
    throw new Error('Managed cron job not found');
  }

  return result;
}

export async function updateManagedExternalCronJob({
  enabled,
  externalAppId,
  jobKey,
  schedule,
  scheduleTimezone,
  wsId,
}: UpdateManagedExternalCronJobInput): Promise<ManagedExternalCronApp> {
  if (!validateUUID(wsId)) {
    throw new Error('Invalid workspace ID');
  }

  let nextRunAt: string | null = null;
  let normalizedSchedule: string | null = null;
  let normalizedTimezone: string | null = null;

  if (scheduleTimezone && !schedule) {
    throw new Error('Schedule timezone changes require a schedule value');
  }

  if (schedule) {
    normalizedTimezone = normalizeManagedCronTimezone(scheduleTimezone);
    assertValidManagedCronSchedule(schedule, normalizedTimezone);
    normalizedSchedule = schedule.trim();
    nextRunAt = getNextManagedCronRunAt(
      normalizedSchedule,
      new Date(),
      normalizedTimezone
    ).toISOString();
  }

  const rawStatus = await callManagedCronRpc<RawManagedExternalCronStatus>(
    'external_app_managed_cron_update_job',
    {
      p_enabled: typeof enabled === 'boolean' ? enabled : null,
      p_external_app_id: externalAppId,
      p_external_job_key: jobKey,
      p_next_run_at: nextRunAt,
      p_schedule: normalizedSchedule,
      p_schedule_timezone: normalizedTimezone,
      p_ws_id: wsId,
    }
  );
  const app = await getExternalAppById(externalAppId);

  return normalizeApp({
    appDisplayName: app?.displayName ?? externalAppId,
    externalAppId,
    status: rawStatus,
    workspaceId: wsId,
  });
}
