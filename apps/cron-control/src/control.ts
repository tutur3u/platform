import { CRON_JOBS, findJob, parseEnabledJobs } from './jobs';
import { initialJobState, type JobState, type Ledger } from './ledger';
import { TASKS_RECURRENCE_JOB } from './processors/tasks-recurrence';
import { stopTaskRecurrence } from './tasks-recurrence-stop';

// Operator stop/resume/status over HTTP, independent of the processors' public
// ingress. Without a configured token every control path is indistinguishable
// from an unknown route. Resume clears a stop; it never enables a job.
//
// Web's api-core relays an owner's request over its service binding with
// CRON_CONTROL_RELAY_TOKEN. That bearer only lists jobs and resumes an enabled
// job its own failure budget stopped: it cannot stop a job, lift an operator
// stop or reach any other control route.

export interface ControlEnv {
  CRON_CONTROL_ENABLED_JOBS?: string;
  CRON_CONTROL_OPERATOR_TOKEN?: string;
  CRON_CONTROL_RELAY_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
}

const MIN_TOKEN_LENGTH = 32;
const JOB_ACTION = /^\/control\/jobs\/([a-z0-9-]+)\/(stop|resume)$/;
const FAILURE_STOP = 'failure-budget-exhausted';

function notFound() {
  return Response.json({ message: 'Not found' }, { status: 404 });
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function bearerIs(request: Request, token: string | undefined) {
  if (!token || token.length < MIN_TOKEN_LENGTH) return false;
  return constantTimeEqual(
    request.headers.get('Authorization') ?? '',
    `Bearer ${token}`
  );
}

// The relay sees a job's run and stop facts, never its queued work or cursors.
function relayState(state: JobState) {
  return {
    consecutiveFailures: state.consecutiveFailures,
    generation: state.generation,
    lastCompletedAt: state.lastCompletedAt,
    lastOutcome: state.lastOutcome,
    lastSlot: state.lastSlot,
    leaseUntil: state.leaseUntil,
    runs: state.runs,
    stopReason: state.stopReason,
    stopped: state.stopped,
  };
}

// Both comparisons always run, so timing does not say which token matched.
function caller(request: Request, env: ControlEnv) {
  const operator = bearerIs(request, env.CRON_CONTROL_OPERATOR_TOKEN);
  const relay = bearerIs(request, env.CRON_CONTROL_RELAY_TOKEN);
  return operator ? 'operator' : relay ? 'relay' : null;
}

export async function handleControlRequest(
  request: Request,
  env: ControlEnv,
  ledger: () => Ledger,
  fetcher: typeof fetch = fetch
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/control/')) return null;
  const role = caller(request, env);
  if (!role) return notFound();
  const headers = { 'Cache-Control': 'no-store' };

  if (pathname === '/control/jobs' && request.method === 'GET') {
    const { enabled } = parseEnabledJobs(env.CRON_CONTROL_ENABLED_JOBS);
    const states = await ledger().status();
    return Response.json(
      {
        jobs: CRON_JOBS.map((cronJob) => {
          const state = states[cronJob.id] ?? initialJobState();
          return {
            cron: cronJob.cron,
            enabled: enabled.has(cronJob.id),
            id: cronJob.id,
            overlap: cronJob.overlap,
            state: role === 'relay' ? relayState(state) : state,
          };
        }),
      },
      { headers }
    );
  }

  const [, id, verb] = JOB_ACTION.exec(pathname) ?? [];
  if (!id || !verb || request.method !== 'POST' || !findJob(id))
    return notFound();
  if (role === 'relay') {
    if (verb !== 'resume') return notFound();
    const { enabled } = parseEnabledJobs(env.CRON_CONTROL_ENABLED_JOBS);
    if (!enabled.has(id))
      return Response.json(
        { id, result: 'disabled' },
        { headers, status: 409 }
      );
    // Atomic in the ledger: an operator stop stays in force, and a job that
    // is running is not fenced out by a needless generation bump.
    const { resumed, state } = await ledger().resumeIf(id, FAILURE_STOP);
    console.warn('Cron Control relay action', {
      action: 'resume',
      id,
      resumed,
    });
    return Response.json(
      {
        id,
        result: resumed
          ? 'resumed'
          : state.stopped
            ? 'operator_stopped'
            : 'not_stopped',
        state: relayState(state),
      },
      { headers, status: resumed ? 200 : 409 }
    );
  }
  const state =
    verb === 'stop'
      ? await ledger().stop(id, 'operator')
      : await ledger().resume(id);
  console.warn('Cron Control operator action', {
    action: verb,
    id,
  });
  if (id === TASKS_RECURRENCE_JOB && verb === 'stop') {
    const epoch = await stopTaskRecurrence(env, fetcher);
    if (epoch === null) {
      return Response.json(
        { id, state, databaseStop: 'pending' },
        { headers, status: 503 }
      );
    }
    return Response.json(
      { id, state, databaseStop: 'confirmed', epoch },
      { headers }
    );
  }
  return Response.json({ id, state }, { headers });
}
