/// <reference types="@vitejs/plugin-rsc/types" />
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { proxy } from '../src/proxy';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';
import { financeCentralFirst } from '../src/start-bridge/reserved-api.server';

export interface FinanceEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiRegistry = typeof import('../src/start-bridge/api-registry.bridge.gen');

// Route handlers are server code (`server-only` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const handler = (
  import.meta.viteRsc.loadModule('rsc', 'bridge-api') as Promise<ApiRegistry>
).then(({ endpoints }) =>
  createBridgeHandler<FinanceEnvironment, WorkerContext>({
    // One artifact: the subdomain root and the tuturuuu.com/finance mount.
    mounts: {
      app: 'finance',
      rootHosts: ['finance.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/finance',
    },
    start: createBridgeStartHandler(),
    serverFnBase: '/_serverFn',
    proxy,
    endpoints,
    centralFirst: financeCentralFirst,
    functionBase: '/_serverFn',
    functionProxy: createFunctionProxy({ targetApp: 'finance' }),
    publicAssets,
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) =>
      env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
  })
);

export default {
  async fetch(request: Request, env: FinanceEnvironment, ctx: WorkerContext) {
    return (await handler)(request, env, ctx);
  },
};
