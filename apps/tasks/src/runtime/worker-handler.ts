import { decideCohort, tagResponse } from '@tuturuuu/start-bridge/canary';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { withoutPageRewrite } from '../lib/page-rewrite';
import { proxy } from '../proxy';
import { endpoints } from './api-registry.bridge.gen';
import { PUBLIC_ASSETS } from './public-assets';

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

/** One artifact serves `tasks.tuturuuu.com` and `tuturuuu.com/tasks`. */
export const TASKS_MOUNTS: AppMountConfig = {
  app: 'tasks',
  rootHosts: ['tasks.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/tasks',
};

const bridge = createBridgeHandler<TasksWorkerEnv, TasksExecutionContext>({
  mounts: TASKS_MOUNTS,
  start: createBridgeStartHandler(),
  serverFnBase: '/_serverFn',
  proxy,
  endpoints,
  functionBase: '/_serverFn',
  functionProxy: createFunctionProxy({ targetApp: 'tasks' }),
  publicAssets: PUBLIC_ASSETS,
  assets: (env) => env.ASSETS,
  centralApiOrigin: (env) =>
    env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
});

/**
 * Every response this Worker serves is tagged `x-tuturuuu-runtime: native` so
 * the post-cutover watch can attribute traffic; nothing is persisted.
 */
const NATIVE = decideCohort({ percent: undefined, force: 'native' });

export async function handleTasksRequest(
  incoming: Request,
  env: TasksWorkerEnv,
  ctx: TasksExecutionContext
): Promise<Response> {
  // Only the proxy may name a page rewrite.
  const request = withoutPageRewrite(incoming);
  const url = new URL(request.url);
  const base = resolveAppBase(url, TASKS_MOUNTS)?.basePath ?? '';
  const appPath = base ? url.pathname.slice(base.length) || '/' : url.pathname;
  const buildInfo =
    appPath === '/api/build-info'
      ? workerBuildInfo(
          new Request(new URL(appPath, url), { method: request.method }),
          'tasks'
        )
      : null;
  const response = buildInfo ?? (await bridge(request, env, ctx));
  const tagged = tagResponse(response, NATIVE);
  // Parity with the Next build's anti-framing headers (createTuturuuuNextConfig).
  tagged.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  tagged.headers.set('X-Frame-Options', 'DENY');
  if (env.TUTURUUU_NOINDEX === '1')
    tagged.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return tagged;
}
