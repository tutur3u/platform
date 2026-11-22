import { type DispatchDeps, type DispatchEnv, runJob } from './dispatch';
import { findJob, parseEnabledJobs } from './jobs';
import { SHIP_JOB } from './processors/mastermind-ship';

// "Check now" for the Mastermind ship collector: Web calls
// `POST /mastermind-ship/check` with MASTERMIND_SHIP_CHECK_TOKEN on behalf of
// the owner. The run goes through the same ledger claim as the schedule, so
// the job's durable stop fence, failure budget and lease apply, and the last
// claimed slot rate-limits checks to one per 30 seconds across both paths. A
// check also resumes a job its own failure budget stopped; an operator stop
// is never lifted here.

export const SHIP_CHECK_PATH = '/mastermind-ship/check';
export const SHIP_CHECK_INTERVAL_MS = 30_000;
const MIN_TOKEN_LENGTH = 32;
const FAILURE_STOP = 'failure-budget-exhausted';

export interface ShipCheckEnv {
  MASTERMIND_SHIP_CHECK_TOKEN?: string;
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

function reply(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function limited(retryAfterMs: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return reply(
    429,
    { state: 'rate_limited', retryAfterMs: seconds * 1000 },
    { 'Retry-After': String(seconds) }
  );
}

/** A millisecond slot, never a whole minute, so it cannot collide with a tick. */
export function checkSlot(now: number) {
  const slot = new Date(now).toISOString();
  return slot.endsWith(':00.000Z') ? new Date(now + 1).toISOString() : slot;
}

export async function handleShipCheck(
  request: Request,
  env: DispatchEnv & ShipCheckEnv,
  deps: DispatchDeps
): Promise<Response | null> {
  if (new URL(request.url).pathname !== SHIP_CHECK_PATH) return null;
  const token = env.MASTERMIND_SHIP_CHECK_TOKEN ?? '';
  if (
    request.method !== 'POST' ||
    token.length < MIN_TOKEN_LENGTH ||
    !constantTimeEqual(
      request.headers.get('Authorization') ?? '',
      `Bearer ${token}`
    )
  )
    return reply(404, { message: 'Not found' });
  const cronJob = findJob(SHIP_JOB)!;
  if (!parseEnabledJobs(env.CRON_CONTROL_ENABLED_JOBS).enabled.has(SHIP_JOB))
    return reply(409, { state: 'disabled' });
  const now = deps.now();
  const ledger = deps.ledger();
  const state = (await ledger.status())[SHIP_JOB];
  // The owner's Check now is the resume for a job its own failure budget
  // stopped (Cron Control has no public ingress for the operator resume). An
  // operator stop stays in force. A resumed job that keeps failing stops
  // again after five slots.
  const failedStop = state?.stopped && state.stopReason === FAILURE_STOP;
  if (state?.stopped && !failedStop) return reply(409, { state: 'stopped' });
  const last = state?.lastSlot ? Date.parse(state.lastSlot) : Number.NaN;
  if (Number.isFinite(last) && now - last < SHIP_CHECK_INTERVAL_MS)
    return limited(SHIP_CHECK_INTERVAL_MS - (now - last));
  if (failedStop) {
    // Atomic in the ledger: an operator stop that landed since the read
    // stays, and a concurrent check that resumed first leaves this one to
    // the claim below (busy or duplicate, so 429).
    const { state: current } = await ledger.resumeIf(SHIP_JOB, FAILURE_STOP);
    if (current.stopped) return reply(409, { state: 'stopped' });
  }
  const report = await runJob(cronJob, checkSlot(now), env, deps);
  switch (report.outcome) {
    case 'ok':
    case 'degraded':
      return reply(200, { state: 'checked', outcome: report.outcome });
    case 'skipped':
      return report.reason === 'stopped'
        ? reply(409, { state: 'stopped' })
        : limited(SHIP_CHECK_INTERVAL_MS);
    case 'stopped':
      return reply(409, { state: 'stopped' });
    case 'misconfigured':
      return reply(503, { state: 'unconfigured' });
    default:
      return reply(502, { state: 'failed' });
  }
}
