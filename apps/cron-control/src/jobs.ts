// Scheduled jobs owned by Cron Control. Every job is disabled until its id is
// listed in CRON_CONTROL_ENABLED_JOBS; see the Cron Control runbook for the
// per-job cutover sequence away from the legacy Vercel/pg_cron owner.

export type ProcessorTarget =
  | 'infrastructure'
  | 'inventory'
  | 'pay'
  | 'tasks'
  | 'web';

// claim-fenced: the processor atomically claims its work.
// idempotent: repeated runs converge.
// handover: a concurrent run can duplicate a side effect, so the legacy owner
// must be removed before this job is enabled, and failures are not retried.
export type OverlapClass = 'claim-fenced' | 'handover' | 'idempotent';

export interface CronJob {
  cron: string;
  id: string;
  method: 'GET' | 'POST';
  overlap: OverlapClass;
  path: string;
  target: ProcessorTarget;
  timeoutMs: number;
  // Legacy ports require CRON_CONTROL_WORKER_PROCESSORS selection. Native
  // maintenance always uses its Worker processor once the job is enabled.
  workerProcessor?: 'checkout-expiry' | 'cron-history-retention';
}

export const IMMEDIATE_NOTIFICATIONS_CRON = '*/5 * * * *';
export const MAX_CONCURRENT_DISPATCHES = 4;
export const MAX_CONSECUTIVE_FAILURES = 5;
const DEFAULT_TIMEOUT_MS = 120_000;
// Processors declaring maxDuration = 300 get the full window plus margin.
const LONG_TIMEOUT_MS = 310_000;

function job(
  id: string,
  cron: string,
  target: ProcessorTarget,
  path: string,
  overlap: OverlapClass,
  options: Partial<
    Pick<CronJob, 'method' | 'timeoutMs' | 'workerProcessor'>
  > = {}
): CronJob {
  return {
    cron,
    id,
    method: options.method ?? 'GET',
    overlap,
    path,
    target,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(options.workerProcessor
      ? { workerProcessor: options.workerProcessor }
      : {}),
  };
}

// Cadences preserve the live legacy owner, not the stale source catalogs.
export const CRON_JOBS: readonly CronJob[] = Object.freeze([
  job(
    'database-cron-history-retention',
    '*/10 * * * *',
    'web',
    '/rest/v1/rpc/prune_cron_history',
    'idempotent',
    { workerProcessor: 'cron-history-retention', timeoutMs: 30_000 }
  ),
  job(
    'tasks-cleanup-media',
    '17 3 * * *',
    'tasks',
    '/api/cron/tasks/cleanup-media',
    'idempotent',
    { timeoutMs: LONG_TIMEOUT_MS }
  ),
  job(
    'pay-products',
    '0 */12 * * *',
    'pay',
    '/api/cron/payment/products',
    'idempotent'
  ),
  job(
    'finance-exchange-rates',
    '0 6 * * *',
    'web',
    '/api/cron/finance/exchange-rates',
    'idempotent',
    { method: 'POST' }
  ),
  job(
    'calendar-smart-schedule',
    '0 */6 * * *',
    'infrastructure',
    '/api/cron/calendar/smart-schedule',
    'handover',
    { timeoutMs: LONG_TIMEOUT_MS }
  ),
  job(
    'infrastructure-sync-trust-cache',
    '*/10 * * * *',
    'infrastructure',
    '/api/cron/infrastructure/sync-trust-cache',
    'idempotent'
  ),
  job(
    'web-notification-batches',
    '*/15 * * * *',
    'web',
    '/api/cron/process-notification-batches',
    'claim-fenced'
  ),
  job(
    'web-report-automation',
    '*/15 * * * *',
    'web',
    '/api/cron/process-report-automation',
    'claim-fenced'
  ),
  job(
    'web-topic-announcements',
    '*/15 * * * *',
    'web',
    '/api/cron/process-topic-announcement-queue',
    'claim-fenced'
  ),
  job(
    'calendar-provider-sync',
    '*/15 * * * *',
    'infrastructure',
    '/api/cron/calendar/provider-sync',
    'claim-fenced',
    { timeoutMs: LONG_TIMEOUT_MS }
  ),
  job(
    'web-post-email-queue',
    '*/30 * * * *',
    'web',
    '/api/cron/process-post-email-queue',
    'claim-fenced'
  ),
  job(
    'inventory-checkout-expiry',
    '*/5 * * * *',
    'inventory',
    '/api/cron/inventory/checkout-expiry',
    'claim-fenced',
    { workerProcessor: 'checkout-expiry' }
  ),
  job(
    'web-deadline-reminders',
    '*/5 * * * *',
    'web',
    '/api/cron/tasks/deadline-reminders',
    'handover'
  ),
  job(
    'infrastructure-docker-recovery-alerts',
    '*/5 * * * *',
    'infrastructure',
    '/api/cron/infrastructure/docker-recovery-alerts',
    'handover'
  ),
  job(
    'infrastructure-sample-resources',
    '* * * * *',
    'infrastructure',
    '/api/cron/infrastructure/sample-resources',
    'idempotent',
    { timeoutMs: 50_000 }
  ),
]);

export const CRON_TRIGGERS: readonly string[] = Object.freeze([
  ...new Set([IMMEDIATE_NOTIFICATIONS_CRON, ...CRON_JOBS.map((j) => j.cron)]),
]);

export const TARGET_ORIGIN_VARS = {
  infrastructure: 'INFRASTRUCTURE_ORIGIN',
  inventory: 'INVENTORY_ORIGIN',
  pay: 'PAY_ORIGIN',
  tasks: 'TASKS_ORIGIN',
  web: 'WEB_ORIGIN',
} as const satisfies Record<ProcessorTarget, string>;

// Each legacy project authenticates its scheduler with its own CRON_SECRET.
export const TARGET_SECRET_VARS = {
  infrastructure: 'CRON_SECRET_INFRASTRUCTURE',
  inventory: 'CRON_SECRET_INVENTORY',
  pay: 'CRON_SECRET_PAY',
  tasks: 'CRON_SECRET_TASKS',
  web: 'CRON_SECRET_WEB',
} as const satisfies Record<ProcessorTarget, string>;

export function maxAttempts(cronJob: CronJob) {
  return cronJob.overlap === 'handover' ? 1 : 2;
}

// Long enough for every attempt and backoff; an expired lease lets a later
// slot run even if a completion write was lost.
export function leaseMs(cronJob: CronJob) {
  return cronJob.timeoutMs * maxAttempts(cronJob) + 30_000;
}

// Worker processors must finish, and record their outcome, inside the lease
// so a later slot never claims while a run is still working.
export const PROCESSOR_LEASE_MARGIN_MS = 30_000;
export function processorDeadlineMs(cronJob: CronJob) {
  return leaseMs(cronJob) - PROCESSOR_LEASE_MARGIN_MS;
}

export function findJob(id: string) {
  return CRON_JOBS.find((cronJob) => cronJob.id === id);
}

export function parseEnabledJobs(value: string | undefined) {
  const enabled = new Set<string>();
  const unknown: string[] = [];
  for (const id of (value ?? '').split(',')) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    if (findJob(trimmed)) enabled.add(trimmed);
    else unknown.push(trimmed);
  }
  return { enabled, unknown };
}

// The minute a tick was scheduled for, independent of delivery delay.
export function scheduleSlot(scheduledTime: number) {
  return new Date(Math.floor(scheduledTime / 60_000) * 60_000).toISOString();
}
