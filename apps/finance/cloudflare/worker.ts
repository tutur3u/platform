/// <reference types="@vitejs/plugin-rsc/types" />
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { defaultProxyMatches } from '@tuturuuu/start-bridge/proxy-bridge';
import { createProxyMatcher } from '@tuturuuu/start-bridge/proxy-matcher';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { proxy, config as proxyConfig } from '../src/proxy';
import { centralFirst } from '../src/start-bridge/central-first';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';

export interface FinanceEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiEntry = typeof import('../src/start-bridge/api-entry');

// Route handlers are server code (`server-only` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const handler = (
  import.meta.viteRsc.loadModule('rsc', 'bridge-api') as Promise<ApiEntry>
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
    // The proxy's own `config.matcher`, evaluated like Next.
    matches: createProxyMatcher(proxyConfig.matcher, defaultProxyMatches),
    endpoints,
    centralFirst,
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
    const response = await (await handler)(request, env, ctx);
    if (env.TUTURUUU_NOINDEX !== '1') return response;
    const staging = new Response(response.body, response);
    staging.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
    return staging;
  },
};
