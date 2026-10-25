import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { proxy } from '../src/proxy';
import { endpoints } from '../src/start-bridge/api-registry.bridge.gen';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';
import { financeEndpoints } from '../src/start-bridge/reserved-api.server';

export interface FinanceEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

const start = createBridgeStartHandler();
const functionProxy = createFunctionProxy({ targetApp: 'finance' });

export default {
  fetch(request: Request, env: FinanceEnvironment, context: WorkerContext) {
    const origin = env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com';
    const handle = createBridgeHandler<FinanceEnvironment, WorkerContext>({
      mounts: {
        app: 'finance',
        rootHosts: ['finance.tuturuuu.com'],
        mountHosts: ['tuturuuu.com'],
        basePath: '/finance',
      },
      start,
      serverFnBase: '/_serverFn',
      proxy,
      endpoints: financeEndpoints({ local: endpoints, origin }),
      functionBase: '/_serverFn',
      functionProxy,
      publicAssets,
      assets: (binding) => binding.ASSETS,
      centralApiOrigin: () => origin,
    });
    return handle(request, env, context);
  },
};
