import {
  CRON_JOBS,
  type CronJob,
  DATABASE_MAINTENANCE_RPCS,
  leaseMs,
  MAX_CONCURRENT_DISPATCHES,
  MAX_CONSECUTIVE_FAILURES,
  maxAttempts,
  parseEnabledJobs,
  processorDeadlineMs,
  scheduleSlot,
  TARGET_ORIGIN_VARS,
  TARGET_SECRET_VARS,
} from './jobs';
import type { ClaimResult, Ledger, RunOutcome } from './ledger';
import { WORKER_PROCESSORS } from './processors';
import { withinDeadline } from './processors/deadline';
import type { ProcessorEnv } from './processors/types';
import { isWebJob } from './web-gate';

export type DispatchEnv = Partial<Record<string, string>> & {
  CRON_CONTROL_ENABLED_JOBS?: string;
  CRON_CONTROL_WORKER_PROCESSORS?: string;
  CRON_CONTROL_WEB_MODE?: string;
};

export interface DispatchDeps {
  fetch: typeof fetch;
  ledger: () => Ledger;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

export type JobReport =
  | {
      attempts: number;
      detail?: Record<string, number>;
      id: string;
      outcome: RunOutcome;
      status?: number;
    }
  | { id: string; outcome: 'misconfigured'; problem: string }
  | { id: string; outcome: 'skipped'; reason: string };

export const USER_AGENT = 'Tuturuuu-Cron-Control/1.0';
const RETRY_BACKOFF_MS = 2_000;

type Target = { problem: string } | { secret: string; url: URL };

function resolveTarget(cronJob: CronJob, env: DispatchEnv): Target {
  const maintenanceRpc = cronJob.workerProcessor
    ? DATABASE_MAINTENANCE_RPCS[cronJob.workerProcessor]
    : undefined;
  if (maintenanceRpc) {
    if (!env.SUPABASE_SECRET_KEY)
      return { problem: 'SUPABASE_SECRET_KEY unset' };
    try {
      const url = new URL(`/rest/v1/rpc/${maintenanceRpc}`, env.SUPABASE_URL);
      const loopback =
        url.hostname === '127.0.0.1' || url.hostname === 'localhost';
      if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
        return { problem: 'SUPABASE_URL must be https' };
      return { secret: env.SUPABASE_SECRET_KEY, url };
    } catch {
      return { problem: 'SUPABASE_URL invalid' };
    }
  }
  const origin = env[TARGET_ORIGIN_VARS[cronJob.target]];
  const secret = env[TARGET_SECRET_VARS[cronJob.target]];
  if (!origin)
    return { problem: `${TARGET_ORIGIN_VARS[cronJob.target]} unset` };
  if (!secret || secret.length < 16)
    return { problem: `${TARGET_SECRET_VARS[cronJob.target]} unset` };
  let url: URL;
  try {
    url = new URL(cronJob.path, origin);
  } catch {
    return { problem: `${TARGET_ORIGIN_VARS[cronJob.target]} invalid` };
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
    return { problem: `${TARGET_ORIGIN_VARS[cronJob.target]} must be https` };
  return { secret, url };
}

// Legacy ports are selected separately so schedules and processors can move
// independently. Native database maintenance has no legacy HTTP fallback.
function workerProcessorFor(cronJob: CronJob, env: DispatchEnv) {
  if (!cronJob.workerProcessor) return null;
  const selected = (env.CRON_CONTROL_WORKER_PROCESSORS ?? '')
    .split(',')
    .map((id) => id.trim());
  if (
    !DATABASE_MAINTENANCE_RPCS[cronJob.workerProcessor] &&
    !selected.includes(cronJob.id)
  )
    return null;
  return WORKER_PROCESSORS[cronJob.workerProcessor];
}

type Attempt = 'degraded' | 'failed' | 'ok' | 'retryable' | 'unknown';

// Existing processors return JSON objects, some without an ok field. A partial,
// unreadable or oversized summary cannot establish success, even after 200 headers.
export const MAX_OUTCOME_BODY_BYTES = 64 * 1024;

async function readOutcome(
  response: Response,
  allowDegraded: boolean
): Promise<Exclude<RunOutcome, 'stopped'>> {
  const reader = response.body?.getReader();
  if (!reader) return 'unknown';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_OUTCOME_BODY_BYTES - size) return 'unknown';
      chunks.push(value);
      size += value.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    );
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      return 'unknown';
    if ('ok' in body) {
      if (body.ok === false) return 'failed';
      if (body.ok !== true) return 'unknown';
      if (allowDegraded && 'degraded' in body && body.degraded !== false) {
        if (body.degraded !== true || !('transientProviders' in body))
          return 'unknown';
        const providers = body.transientProviders;
        return Array.isArray(providers) &&
          providers.length > 0 &&
          providers.length <= 2 &&
          new Set(providers).size === providers.length &&
          providers.every(
            (provider) => provider === 'google' || provider === 'microsoft'
          )
          ? 'degraded'
          : 'unknown';
      }
      return 'ok';
    }
    return 'ok';
  } catch {
    return 'unknown';
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

async function invoke(
  cronJob: CronJob,
  target: { secret: string; url: URL },
  deps: DispatchDeps,
  slot: string
): Promise<{ result: Attempt; status?: number }> {
  let response: Response;
  try {
    response = await deps.fetch(target.url, {
      method: cronJob.method,
      headers: {
        Authorization: `Bearer ${target.secret}`,
        'User-Agent': USER_AGENT,
        ...(isWebJob(cronJob.id)
          ? { 'X-Tuturuuu-Cron-Slot': String(Date.parse(slot)) }
          : {}),
        ...(cronJob.method === 'POST'
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body: cronJob.method === 'POST' ? '{}' : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(cronJob.timeoutMs),
    });
  } catch (error) {
    // A deadline leaves the processor outcome unknown: never retry it.
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError')
      return { result: 'unknown' };
    return { result: isWebJob(cronJob.id) ? 'unknown' : 'retryable' };
  }
  if (response.ok)
    return {
      result: await readOutcome(
        response,
        cronJob.id === 'calendar-provider-sync'
      ),
      status: response.status,
    };
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 502 || response.status === 503)
    return { result: 'retryable', status: response.status };
  return { result: 'failed', status: response.status };
}

async function runJob(
  cronJob: CronJob,
  slot: string,
  env: DispatchEnv,
  deps: DispatchDeps
): Promise<JobReport> {
  if (isWebJob(cronJob.id) && env.CRON_CONTROL_WEB_MODE !== 'active')
    return {
      id: cronJob.id,
      outcome: 'skipped',
      reason:
        env.CRON_CONTROL_WEB_MODE === 'shadow' ? 'shadow' : 'web-disabled',
    };
  const target = resolveTarget(cronJob, env);
  if ('problem' in target) {
    console.error('Cron Control job misconfigured', {
      id: cronJob.id,
      problem: target.problem,
    });
    return {
      id: cronJob.id,
      outcome: 'misconfigured',
      problem: target.problem,
    };
  }
  const ledger = deps.ledger();
  const claimedAt = deps.now();
  const processor = workerProcessorFor(cronJob, env);
  const clock = {
    deadline: claimedAt + processorDeadlineMs(cronJob),
    now: deps.now,
    signal: processor
      ? AbortSignal.timeout(processorDeadlineMs(cronJob))
      : undefined,
  };
  const claimOperation = () =>
    ledger.claim({
      jobId: cronJob.id,
      leaseMs: leaseMs(cronJob),
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      now: claimedAt,
      slot,
    });
  let claim: ClaimResult;
  try {
    claim = processor
      ? await withinDeadline(clock, claimOperation)
      : await claimOperation();
  } catch (error) {
    if (!processor) throw error;
    console.error('Worker processor claim unconfirmed', {
      error,
      id: cronJob.id,
    });
    return { attempts: 0, id: cronJob.id, outcome: 'unknown' };
  }
  if (!claim.granted)
    return { id: cronJob.id, outcome: 'skipped', reason: claim.reason };

  if (processor) {
    // Worker processors run once per slot; the next slot is the retry. Their
    // HTTP and ledger RPC waits share one deadline. If completion cannot be
    // confirmed in time, leave the lease for unknown-outcome reconciliation.
    try {
      const result = await withinDeadline(clock, () =>
        processor({
          ...clock,
          env: env as unknown as ProcessorEnv,
          fetch: deps.fetch,
          fence: () => ledger.checkFence(cronJob.id, claim.generation),
          now: deps.now,
          sleep: deps.sleep,
          pending: {
            add: (items) => ledger.addPendingWork(cronJob.id, items),
            fail: (items) =>
              ledger.failPendingWork(cronJob.id, items, {
                generation: claim.generation,
                slot,
              }),
            quarantined: () => ledger.quarantinedWork(cronJob.id),
            list: () => ledger.pendingWork(cronJob.id),
            settle: (items) =>
              ledger.settlePendingWork(cronJob.id, items, {
                generation: claim.generation,
                slot,
              }),
          },
          userAgent: USER_AGENT,
        })
      );
      await withinDeadline(clock, () =>
        ledger.complete({
          generation: claim.generation,
          jobId: cronJob.id,
          maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
          now: deps.now(),
          outcome: result.outcome,
          slot,
        })
      );
      return {
        attempts: 1,
        detail: result.detail,
        id: cronJob.id,
        outcome: result.outcome,
      };
    } catch (error) {
      console.error('Worker processor outcome unconfirmed', {
        error,
        id: cronJob.id,
      });
      return { attempts: 1, id: cronJob.id, outcome: 'unknown' };
    }
  }

  let outcome: RunOutcome = 'failed';
  let attempts = 0;
  let status: number | undefined;
  for (let attempt = 1; attempt <= maxAttempts(cronJob); attempt++) {
    if (attempt > 1) {
      await deps.sleep(RETRY_BACKOFF_MS * 2 ** (attempt - 2));
      // An operator stop between attempts wins over the retry.
      if (!(await ledger.checkFence(cronJob.id, claim.generation))) {
        outcome = 'stopped';
        break;
      }
    }
    if (
      isWebJob(cronJob.id) &&
      !(await ledger.checkFence(cronJob.id, claim.generation))
    ) {
      outcome = 'stopped';
      break;
    }
    attempts = attempt;
    const result = await invoke(cronJob, target, deps, slot);
    status = result.status;
    if (result.result === 'retryable') continue;
    outcome = result.result;
    break;
  }
  await ledger.complete({
    generation: claim.generation,
    jobId: cronJob.id,
    maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
    now: deps.now(),
    outcome,
    slot,
  });
  return { attempts, id: cronJob.id, outcome, status };
}

export async function dispatchScheduledJobs(
  cron: string,
  scheduledTime: number,
  env: DispatchEnv,
  deps: DispatchDeps
): Promise<JobReport[]> {
  const { enabled, unknown } = parseEnabledJobs(env.CRON_CONTROL_ENABLED_JOBS);
  if (unknown.length > 0)
    console.error('Cron Control ignored unknown enabled jobs', { unknown });
  // Disabled jobs cost nothing beyond this check: no storage or network.
  const due = CRON_JOBS.filter(
    (cronJob) => cronJob.cron === cron && enabled.has(cronJob.id)
  );
  const slot = scheduleSlot(scheduledTime);
  const reports: JobReport[] = [];
  let next = 0;
  async function lane() {
    while (next < due.length) {
      const cronJob = due[next++];
      try {
        reports.push(await runJob(cronJob, slot, env, deps));
      } catch (error) {
        // A failed claim fails closed before the processor is called; a lost
        // completion leaves the lease to expire.
        console.error('Cron Control job errored', { error, id: cronJob.id });
        reports.push({ id: cronJob.id, outcome: 'skipped', reason: 'error' });
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_DISPATCHES, due.length) },
      lane
    )
  );
  return reports;
}
