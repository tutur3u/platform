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
import { proxy, config as proxyConfig } from '../src/proxy';
import { centralFirst } from '../src/start-bridge/central-first';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';
import appConfig from '../start-bridge.config';
import { assertRequiredSecrets } from './required-secrets';

export interface MindEnvironment {
  ASSETS: AssetsBinding;
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiEntry = typeof import('../src/start-bridge/api-entry');

// Robots policy: this app's entry in packages/utils/src/seo-policy.json.
const seoPolicy = {
  origin: 'https://mind.tuturuuu.com',
  localePrefix: 'never',
  publicPaths: [],
  publicPatterns: [],
};

// Root-only: served at mind.tuturuuu.com; no apex mount, and unknown hosts are rejected.
const mounts = {
  app: 'mind',
  rootHosts: ['mind.tuturuuu.com'],
  mountHosts: [],
  unknownHost: 'reject' as const,
  ...appConfig.mounts,
};

// Route handlers are server code (`server-only` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const handler = (
  import.meta.viteRsc.loadModule('rsc', 'bridge-api') as Promise<ApiEntry>
).then(({ endpoints }) =>
  createBridgeHandler<MindEnvironment, WorkerContext>({
    mounts,
    csp: appConfig.csp,
    apiOrigin: appConfig.apiOrigin,
    framablePaths: appConfig.framablePaths,
    start: createBridgeStartHandler(),
    serverFnBase: '/_serverFn',
    proxy,
    // The proxy's own `config.matcher`, evaluated like Next.
    matches: createProxyMatcher(proxyConfig.matcher, defaultProxyMatches),
    endpoints,
    centralFirst,
    functionBase: '/_serverFn',
    functionProxy: createFunctionProxy({ targetApp: 'mind' }),
    publicAssets,
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) =>
      env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
  })
);

export default {
  async fetch(request: Request, env: MindEnvironment, ctx: WorkerContext) {
    let response: Response;
    try {
      assertRequiredSecrets(env);
      response = await (await handler)(request, env, ctx);
    } catch (error) {
      // Even a failed route load answers through the response policy.
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
