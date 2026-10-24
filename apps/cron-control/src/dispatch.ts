import {
  CRON_JOBS,
  type CronJob,
  leaseMs,
  MAX_CONCURRENT_DISPATCHES,
  MAX_CONSECUTIVE_FAILURES,
  maxAttempts,
  parseEnabledJobs,
  scheduleSlot,
  TARGET_ORIGIN_VARS,
  TARGET_SECRET_VARS,
} from './jobs';
import type { Ledger, RunOutcome } from './ledger';

export type DispatchEnv = Partial<Record<string, string>> & {
  CRON_CONTROL_ENABLED_JOBS?: string;
};

export interface DispatchDeps {
  fetch: typeof fetch;
  ledger: () => Ledger;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

export type JobReport =
  | { attempts: number; id: string; outcome: RunOutcome; status?: number }
  | { id: string; outcome: 'misconfigured'; problem: string }
  | { id: string; outcome: 'skipped'; reason: string };

export const USER_AGENT = 'Tuturuuu-Cron-Control/1.0';
const RETRY_BACKOFF_MS = 2_000;

type Target = { problem: string } | { secret: string; url: URL };

function resolveTarget(cronJob: CronJob, env: DispatchEnv): Target {
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

type Attempt = 'failed' | 'ok' | 'retryable' | 'unknown';

// Processor bodies are bounded summaries. Some report partial failure with a
// 200 and `{ ok: false }` (Calendar provider sync), so read at most this many
// bytes and treat an explicit `ok: false` as a failed run. Anything else,
// including non-JSON or oversized bodies, keeps the status-based outcome.
export const MAX_OUTCOME_BODY_BYTES = 64 * 1024;

async function reportsFailure(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return false;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size <= MAX_OUTCOME_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (size > MAX_OUTCOME_BODY_BYTES) return false;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return (
      typeof body === 'object' &&
      body !== null &&
      (body as { ok?: unknown }).ok === false
    );
  } catch {
    return false;
  }
}

async function invoke(
  cronJob: CronJob,
  target: { secret: string; url: URL },
  deps: DispatchDeps
): Promise<{ result: Attempt; status?: number }> {
  let response: Response;
  try {
    response = await deps.fetch(target.url, {
      method: cronJob.method,
      headers: {
        Authorization: `Bearer ${target.secret}`,
        'User-Agent': USER_AGENT,
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
    return { result: 'retryable' };
  }
  if (response.ok)
    return {
      result: (await reportsFailure(response)) ? 'failed' : 'ok',
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
  const claim = await ledger.claim({
    jobId: cronJob.id,
    leaseMs: leaseMs(cronJob),
    maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
    now: deps.now(),
    slot,
  });
  if (!claim.granted)
    return { id: cronJob.id, outcome: 'skipped', reason: claim.reason };

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
    attempts = attempt;
    const result = await invoke(cronJob, target, deps);
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
