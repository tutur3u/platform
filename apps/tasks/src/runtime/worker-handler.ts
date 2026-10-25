import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { proxy } from '../proxy';
import { endpoints } from './api-registry.bridge.gen';
import { PUBLIC_ASSETS } from './public-assets';
import {
  createTasksRequestHandler,
  TASKS_MOUNTS,
  type TasksExecutionContext,
  type TasksWorkerEnv,
} from './worker-request';

export type { TasksExecutionContext, TasksWorkerEnv } from './worker-request';

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

export const handleTasksRequest = createTasksRequestHandler(bridge);
