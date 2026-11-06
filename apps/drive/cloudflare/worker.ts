// Drive staging entry. Keep the environment fence before loading bridge routes.
/// <reference types="@vitejs/plugin-rsc/types" />

import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { defaultProxyMatches } from '@tuturuuu/start-bridge/proxy-bridge';
import { createProxyMatcher } from '@tuturuuu/start-bridge/proxy-matcher';
import {
  bridgeErrorResponse,
  createBridgeHandler,
} from '@tuturuuu/start-bridge/start/handler';
import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { enforceStagingCookiePolicy } from '@tuturuuu/utils/staging-cookie-policy';
import { proxy, config as proxyConfig } from '../src/proxy';
import { centralFirst } from '../src/start-bridge/central-first';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';
import {
  isDriveStagingEnvironment,
  type stagingVars,
} from '../src/start-candidate/staging-policy';
import appConfig from '../start-bridge.config';

export interface DriveEnvironment
  extends Partial<Record<keyof typeof stagingVars, string>> {
  ASSETS: AssetsBinding;
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

interface WorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

type ApiEntry = typeof import('../src/start-bridge/api-entry');

const mounts = {
  app: 'drive',
  rootHosts: [],
  ...appConfig.mounts,
};

// Route handlers are server code (`server-only` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const createHandler = () =>
  (
    import.meta.viteRsc.loadModule('rsc', 'bridge-api') as Promise<ApiEntry>
  ).then(({ endpoints }) =>
    createBridgeHandler<DriveEnvironment, WorkerContext>({
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
      functionProxy: createFunctionProxy({ targetApp: 'drive' }),
      publicAssets,
      assets: (env) => env.ASSETS,
      centralApiOrigin: (env) =>
        env.INTERNAL_WEB_API_ORIGIN ?? 'https://web.tutur3u.com',
    })
  );

let handler: ReturnType<typeof createHandler> | undefined;

export default {
  async fetch(request: Request, env: DriveEnvironment, ctx: WorkerContext) {
    if (!resolveAppBase(new URL(request.url), mounts)) {
      const notFound = new Response('Not Found', {
        status: 404,
        headers: { 'Strict-Transport-Security': 'max-age=63072000' },
      });
      return enforceStagingCookiePolicy(
        request,
        (await appConfig.wrapResponse?.(notFound, {
          request,
          env,
        })) ?? notFound
      );
    }
    if (!isDriveStagingEnvironment(env)) {
      return new Response('Staging configuration unavailable', {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
          'Strict-Transport-Security': 'max-age=63072000',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
    let response: Response;
    try {
      handler ??= createHandler();
      response = await (await handler)(request, env, ctx);
    } catch (error) {
      // Even a failed route load answers through the response policy.
      console.error('[start-bridge] worker failed', error);
      response = bridgeErrorResponse();
    }
    return enforceStagingCookiePolicy(
      request,
      appConfig.wrapResponse
        ? await appConfig.wrapResponse(response, {
            request,
            env,
            mounts,
            publicAssets,
            framablePaths: appConfig.framablePaths,
          })
        : response
    );
  },
};
