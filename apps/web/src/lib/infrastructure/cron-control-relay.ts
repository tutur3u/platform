import 'server-only';

import { z } from 'zod';

/**
 * Owner relay to Cron Control, which has no public ingress. Web's api-core
 * Worker reaches it through the CRON_CONTROL service binding and sends
 * CRON_CONTROL_RELAY_TOKEN, a bearer that only lists jobs and resumes an
 * enabled job its own failure budget stopped. Web never holds Cron Control's
 * operator token, and there is no HTTPS-origin fallback.
 */
export interface CronControlBinding {
  fetch: typeof fetch;
}

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 64 * 1024;
const MIN_TOKEN_LENGTH = 32;
/** Cron Control job ids; the same shape its own route accepts. */
export const CRON_JOB_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
// A service binding ignores the URL host.
const BINDING_ORIGIN = 'https://cron-control.internal';

const stateSchema = z.object({
  consecutiveFailures: z.number().int().nonnegative(),
  generation: z.number().int().positive(),
  lastCompletedAt: z.number().nullable(),
  lastOutcome: z
    .enum(['degraded', 'failed', 'ok', 'stopped', 'unknown'])
    .nullable(),
  lastSlot: z.string().max(40).nullable(),
  leaseUntil: z.number().nonnegative(),
  runs: z.number().int().nonnegative(),
  stopReason: z.string().max(80).nullable(),
  stopped: z.boolean(),
});

const jobsSchema = z.object({
  jobs: z
    .array(
      z.object({
        cron: z.string().max(40),
        enabled: z.boolean(),
        id: z.string().regex(CRON_JOB_ID),
        overlap: z.string().max(40),
        state: stateSchema,
      })
    )
    .max(200),
});

const resumeSchema = z.union([
  z.object({
    id: z.string().regex(CRON_JOB_ID),
    result: z.enum(['resumed', 'operator_stopped', 'not_stopped']),
    state: stateSchema,
  }),
  z.object({
    id: z.string().regex(CRON_JOB_ID),
    result: z.literal('disabled'),
  }),
]);

export type CronJobsListing = z.infer<typeof jobsSchema>;
export type CronResumeResult = z.infer<typeof resumeSchema>;

export type CronRelayOutcome<T> =
  | { ok: true; status: number; body: T }
  | {
      ok: false;
      status: number;
      error: 'failed' | 'not_found' | 'unconfigured';
    };

export interface CronRelayEnv {
  CRON_CONTROL_RELAY_TOKEN?: string;
}

/** The body as text, or null past MAX_BYTES (the stream is cancelled). */
async function cappedText(response: Response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function relay<T>(
  env: CronRelayEnv,
  binding: CronControlBinding | null,
  method: 'GET' | 'POST',
  path: string,
  schema: z.ZodType<T>,
  accepted: readonly number[]
): Promise<CronRelayOutcome<T>> {
  const token = env.CRON_CONTROL_RELAY_TOKEN ?? '';
  if (!binding || token.length < MIN_TOKEN_LENGTH)
    return { ok: false, status: 503, error: 'unconfigured' };
  let response: Response;
  try {
    response = await binding.fetch(`${BINDING_ORIGIN}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Tuturuuu-Web-Cron-Relay/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 502, error: 'failed' };
  }
  // Cron Control answers 404 for an unknown job and for a bearer it does not
  // accept alike.
  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, status: 404, error: 'not_found' };
  }
  if (!accepted.includes(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, status: 502, error: 'failed' };
  }
  try {
    const text = await cappedText(response);
    if (text === null) return { ok: false, status: 502, error: 'failed' };
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, status: 502, error: 'failed' };
    return { ok: true, status: response.status, body: parsed.data };
  } catch {
    return { ok: false, status: 502, error: 'failed' };
  }
}

export async function listCronJobs(
  env: CronRelayEnv,
  binding: CronControlBinding | null
) {
  const outcome = await relay(
    env,
    binding,
    'GET',
    '/control/jobs',
    jobsSchema,
    [200]
  );
  // The listing names no job, so a 404 there is a refused bearer.
  return !outcome.ok && outcome.status === 404
    ? ({ ok: false, status: 502, error: 'failed' } as const)
    : outcome;
}

export async function resumeCronJob(
  env: CronRelayEnv,
  binding: CronControlBinding | null,
  id: string
): Promise<CronRelayOutcome<CronResumeResult>> {
  if (!CRON_JOB_ID.test(id))
    return { ok: false, status: 404, error: 'not_found' };
  const outcome = await relay(
    env,
    binding,
    'POST',
    `/control/jobs/${id}/resume`,
    resumeSchema,
    [200, 409]
  );
  // An answer about another job, or a result under the wrong status, is
  // never passed on.
  return outcome.ok &&
    (outcome.body.id !== id ||
      (outcome.body.result === 'resumed') !== (outcome.status === 200))
    ? { ok: false, status: 502, error: 'failed' }
    : outcome;
}
