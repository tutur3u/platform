import { CRON_JOBS, findJob, parseEnabledJobs } from './jobs';
import { initialJobState, type Ledger } from './ledger';

// Operator stop/resume/status over HTTP, independent of the processors' public
// ingress. Without a configured token every control path is indistinguishable
// from an unknown route. Resume clears a stop; it never enables a job.

export interface ControlEnv {
  CRON_CONTROL_ENABLED_JOBS?: string;
  CRON_CONTROL_OPERATOR_TOKEN?: string;
}

const MIN_TOKEN_LENGTH = 32;
const JOB_ACTION = /^\/control\/jobs\/([a-z0-9-]+)\/(stop|resume)$/;

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

function authorized(request: Request, env: ControlEnv) {
  const token = env.CRON_CONTROL_OPERATOR_TOKEN ?? '';
  if (token.length < MIN_TOKEN_LENGTH) return false;
  return constantTimeEqual(
    request.headers.get('Authorization') ?? '',
    `Bearer ${token}`
  );
}

export async function handleControlRequest(
  request: Request,
  env: ControlEnv,
  ledger: () => Ledger
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/control/')) return null;
  if (!authorized(request, env)) return notFound();
  const headers = { 'Cache-Control': 'no-store' };

  if (pathname === '/control/jobs' && request.method === 'GET') {
    const { enabled } = parseEnabledJobs(env.CRON_CONTROL_ENABLED_JOBS);
    const states = await ledger().status();
    return Response.json(
      {
        jobs: CRON_JOBS.map((cronJob) => ({
          cron: cronJob.cron,
          enabled: enabled.has(cronJob.id),
          id: cronJob.id,
          overlap: cronJob.overlap,
          state: states[cronJob.id] ?? initialJobState(),
        })),
      },
      { headers }
    );
  }

  const action = JOB_ACTION.exec(pathname);
  if (!action || request.method !== 'POST' || !findJob(action[1]))
    return notFound();
  const state =
    action[2] === 'stop'
      ? await ledger().stop(action[1], 'operator')
      : await ledger().resume(action[1]);
  console.warn('Cron Control operator action', {
    action: action[2],
    id: action[1],
  });
  return Response.json({ id: action[1], state }, { headers });
}
