/// <reference types="@vitejs/plugin-rsc/types" />
import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { defaultProxyMatches } from '@tuturuuu/start-bridge/proxy-bridge';
import { createProxyMatcher } from '@tuturuuu/start-bridge/proxy-matcher';
import {
  bridgeErrorResponse,
  createBridgeHandler,
} from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { config as proxyConfig, proxy } from '../src/proxy';
import appConfig from '../start-bridge.config';
import { centralFirst } from '../src/start-bridge/central-first';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';

export interface GitEnvironment {
  ASSETS: AssetsBinding;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  ENCRYPTION_MASTER_KEY?: string;
  TUTURUUU_APP_COORDINATION_SECRET?: string;
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiEntry = typeof import('../src/start-bridge/api-entry');

const seoPolicy = {"origin":"https://git.tuturuuu.com","localePrefix":"never","publicPaths":["tutur3u/platform"],"publicPatterns":["","[^/]+/[^/]+(?:/.*)?"]};

const mounts = {
  app: 'git',
  rootHosts: ['git.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/git',
  ...appConfig.mounts,
};

const handler = () => (
  import.meta.viteRsc.loadModule('rsc', 'bridge-api') as Promise<ApiEntry>
).then(({ endpoints }) =>
  createBridgeHandler<GitEnvironment, WorkerContext>({
    mounts,
    csp: appConfig.csp,
    apiOrigin: appConfig.apiOrigin,
    framablePaths: appConfig.framablePaths,
    start: createBridgeStartHandler(),
    serverFnBase: '/_serverFn',
    proxy,
    matches: createProxyMatcher(proxyConfig.matcher, defaultProxyMatches),
    endpoints,
    centralFirst,
    functionBase: '/_serverFn',
    functionProxy: createFunctionProxy({ targetApp: 'git' }),
    publicAssets,
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) =>
      env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
  })
);

export default {
  async fetch(request: Request, env: GitEnvironment, ctx: WorkerContext) {
    let response: Response;
    try {
      if (process.env.NODE_ENV !== 'production') throw new Error('Production runtime required');
      const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        'SUPABASE_SECRET_KEY', 'TUTURUUU_APP_COORDINATION_SECRET', 'ENCRYPTION_MASTER_KEY'] as const;
      if (!env.ASSETS || required.some((name) => !env[name]?.trim())) {
        throw new Error('Missing required Worker bindings');
      }
      response = await (await handler())(request, env, ctx);
    } catch (error) {
      console.error('[start-bridge] worker failed', error);
      response = bridgeErrorResponse();
    }
    return appConfig.wrapResponse
      ? appConfig.wrapResponse(response, {
          request,
          env,
          mounts,
          publicAssets,
          framablePaths: appConfig.framablePaths,
          seoPolicy,
        })
      : response;
  },
};
