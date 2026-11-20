/// <reference types="@vitejs/plugin-rsc/types" />
import { withHstsResponsePolicy } from '@tuturuuu/start-bridge/response-policy';
import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import {
  resolveAppBase,
  type AppMountConfig,
} from '@tuturuuu/start-bridge/mounts';
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

export interface TeachEnvironment {
  ASSETS: AssetsBinding;
  INTERNAL_WEB_API_ORIGIN?: string;
  NODE_ENV?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiEntry = typeof import('../src/start-bridge/api-entry');

// Robots policy: this app's entry in packages/utils/src/seo-policy.json.
const seoPolicy = {
  origin: 'https://teach.tuturuuu.com',
  localePrefix: 'never',
  publicPaths: [''],
  publicPatterns: [],
};

// One artifact: the subdomain root and the tuturuuu.com/teach mount.
const legacyMounts = {
  app: 'teach',
  rootHosts: ['teach.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/teach',
  ...appConfig.mounts,
};

// Route handlers are server code (`server-only` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const endpoints = (
  import.meta.viteRsc.loadModule('rsc', 'bridge-api') as Promise<ApiEntry>
).then((entry) => entry.endpoints);

function createHandler(mounts: AppMountConfig) {
  return endpoints.then((endpoints) =>
    createBridgeHandler<TeachEnvironment, WorkerContext>({
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
      functionProxy: createFunctionProxy({ targetApp: 'teach' }),
      publicAssets,
      assets: (env) => env.ASSETS,
      centralApiOrigin: (env) =>
        env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
    })
  );
}

const lmsMounts = {
  ...legacyMounts,
  rootHosts: [],
  basePath: '/lms/teach',
  unknownHost: 'reject',
} as const;
const legacyHandler = createHandler(legacyMounts);
const lmsHandler = createHandler(lmsMounts);

export default {
  fetch: withHstsResponsePolicy(
    async (request: Request, env: TeachEnvironment, ctx: WorkerContext) => {
      const url = new URL(request.url);
      const isLms = resolveAppBase(url, lmsMounts) !== null;
      const mounts = isLms ? lmsMounts : legacyMounts;
      const handler = isLms ? lmsHandler : legacyHandler;
      let response: Response;
      try {
        const staging =
          env.NODE_ENV !== 'production' && env.TUTURUUU_NOINDEX === '1';
        const admitted =
          staging || resolveAppBase(url, { ...mounts, unknownHost: 'reject' });
        response = admitted
          ? await (
              await handler
            )(request, env, ctx)
          : new Response('Not Found', { status: 404 });
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
            seoPolicy: isLms
              ? {
                  ...seoPolicy,
                  origin: 'https://tuturuuu.com/lms/teach',
                  publicPaths: [],
                }
              : seoPolicy,
          })
        : response;
    }
  ),
};
