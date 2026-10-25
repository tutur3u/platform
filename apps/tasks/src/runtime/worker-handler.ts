import start from '@tanstack/react-start/server-entry';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import { decideCohort, tagResponse } from '@tuturuuu/start-bridge/canary';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { appBasePath } from '@tuturuuu/start-bridge/start/base-path';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
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
  /** Native share read by the canary router (start-bridge `canary`). */
  TUTURUUU_NATIVE_CANARY_PERCENT?: string;
}

export interface TasksExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}

export const tasksBasePath = createBasePath({
  app: 'tasks',
  basePath: appBasePath(),
});

const bridge = createBridgeHandler<TasksWorkerEnv, TasksExecutionContext>({
  basePath: tasksBasePath,
  start,
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
 * Every response this Worker serves is the native runtime. Cohort selection
 * (and the legacy proxy) belongs to the canary router; here the decision is
 * forced so the runtime header is always present and nothing is persisted.
 */
const NATIVE = decideCohort({ percent: undefined, force: 'native' });

export async function handleTasksRequest(
  incoming: Request,
  env: TasksWorkerEnv,
  ctx: TasksExecutionContext
): Promise<Response> {
  // Only the proxy may name a page rewrite.
  const request = withoutPageRewrite(incoming);
  const appRequest = tasksBasePath.stripRequest(request);
  const response =
    (appRequest && workerBuildInfo(appRequest, 'tasks')) ??
    (await bridge(request, env, ctx));
  const tagged = tagResponse(response, NATIVE, {
    path: tasksBasePath.basePath || '/',
  });
  if (env.TUTURUUU_NOINDEX === '1')
    tagged.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return tagged;
}
