import { decideCohort, tagResponse } from '@tuturuuu/start-bridge/canary';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { withoutPageRewrite } from '../lib/page-rewrite';

/** One artifact serves `tasks.tuturuuu.com` and `tuturuuu.com/tasks`. */
export const TASKS_MOUNTS: AppMountConfig = {
  app: 'tasks',
  rootHosts: ['tasks.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/tasks',
};

export interface TasksWorkerEnv {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Central Web API origin for unowned `/api/*` (default tuturuuu.com). */
  INTERNAL_WEB_API_ORIGIN?: string;
  /** `1` on staging: every response carries `X-Robots-Tag: noindex`. */
  TUTURUUU_NOINDEX?: string;
}

export interface TasksExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}

type BridgeHandler = (
  request: Request,
  env: TasksWorkerEnv,
  ctx: TasksExecutionContext
) => Promise<Response>;

/**
 * Every response this Worker serves is tagged `x-tuturuuu-runtime: native` so
 * the post-cutover watch can attribute traffic; nothing is persisted.
 */
const NATIVE = decideCohort({ percent: undefined, force: 'native' });

function decorate(response: Response, env: TasksWorkerEnv) {
  const tagged = tagResponse(response, NATIVE);
  // Parity with the Next build's anti-framing headers (createTuturuuuNextConfig).
  tagged.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  tagged.headers.set('X-Frame-Options', 'DENY');
  if (env.TUTURUUU_NOINDEX === '1')
    tagged.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return tagged;
}

/**
 * The Worker's outer request step around the bridge: drop client-sent page
 * rewrites, resolve the mount first (a mount host outside `/tasks` is not
 * this app, including `/api/build-info`), answer build-info, then decorate.
 */
export function createTasksRequestHandler(bridge: BridgeHandler) {
  return async function handleTasksRequest(
    incoming: Request,
    env: TasksWorkerEnv,
    ctx: TasksExecutionContext
  ): Promise<Response> {
    // Only the proxy may name a page rewrite.
    const request = withoutPageRewrite(incoming);
    const url = new URL(request.url);
    const mount = resolveAppBase(url, TASKS_MOUNTS);
    if (!mount)
      return decorate(new Response('Not Found', { status: 404 }), env);
    const appPath = url.pathname.slice(mount.basePath.length) || '/';
    const buildInfo =
      appPath === '/api/build-info'
        ? workerBuildInfo(
            new Request(new URL(appPath, url), { method: request.method }),
            'tasks'
          )
        : null;
    return decorate(buildInfo ?? (await bridge(request, env, ctx)), env);
  };
}
