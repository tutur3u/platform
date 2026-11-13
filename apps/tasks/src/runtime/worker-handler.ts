import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { proxy } from '../proxy';
import { endpoints } from './api-registry.bridge.gen';
import { TASKS_CENTRAL_FIRST_API_PATTERNS } from './app-base';
import { PUBLIC_ASSETS } from './public-assets';
import {
  createTasksRequestHandler,
  type TasksExecutionContext,
  type TasksWorkerEnv,
} from './worker-request';

export type { TasksExecutionContext, TasksWorkerEnv } from './worker-request';

/** `/offline.html` loads only its own same-origin `offline.js`. */
export const OFFLINE_PAGE_POLICY =
  "script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/** Tasks' page script policy: the bridge default plus same-origin forms. */
export function tasksPagePolicy(nonce: string) {
  return `${defaultContentSecurityPolicy(nonce)}; form-action 'self'`;
}

export const handleTasksRequest = createTasksRequestHandler((mounts) =>
  createBridgeHandler<TasksWorkerEnv, TasksExecutionContext>({
    mounts,
    // Nonce + strict-dynamic scripts, no plugins, no base rewrites (the policy
    // Track enforces). The Worker's outer step keeps it report-only until
    // `TTR_CSP_TASKS=enforce` (D87 per-app gate). The static offline page has
    // no nonce, so it gets a same-origin script policy instead.
    csp: (nonce, { path }) =>
      path === '/offline.html' ? OFFLINE_PAGE_POLICY : tasksPagePolicy(nonce),
    start: createBridgeStartHandler(),
    serverFnBase: '/_serverFn',
    proxy,
    endpoints,
    centralFirst: TASKS_CENTRAL_FIRST_API_PATTERNS,
    functionBase: '/_serverFn',
    functionProxy: createFunctionProxy({ targetApp: 'tasks' }),
    publicAssets: PUBLIC_ASSETS,
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) =>
      env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
  })
);
