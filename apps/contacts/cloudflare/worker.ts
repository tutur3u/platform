/// <reference types="@vitejs/plugin-rsc/types" />
import { withHstsResponsePolicy } from '@tuturuuu/start-bridge/response-policy';
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
import { hasContactsBindings } from './native-profile';
import { config as proxyConfig, proxy } from '../src/proxy';
import appConfig from '../start-bridge.config';
import { centralFirst } from '../src/start-bridge/central-first';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';

export interface ContactsEnvironment {
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
  origin: 'https://contacts.tuturuuu.com',
  localePrefix: 'never',
  publicPaths: [],
  publicPatterns: [],
};

// One artifact: the subdomain root and the tuturuuu.com/contacts mount.
const mounts = {
  app: 'contacts',
  rootHosts: ['contacts.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/contacts',
  ...appConfig.mounts,
};

function hasAmbiguousAppPath(request: Request) {
  const url = new URL(request.url);
  const doubleSlash = url.pathname.indexOf('//');
  if (doubleSlash < 0) return false;
  const mount = resolveAppBase(url, mounts);
  return mount !== null && doubleSlash === mount.basePath.length;
}

// Route handlers are server code (`server-only` is valid only in the rsc
// environment), while this entry is bundled in ssr: load them from rsc.
const createHandler = () =>
  (
    import.meta.viteRsc.loadModule('rsc', 'bridge-api') as Promise<ApiEntry>
  ).then(({ endpoints }) =>
    createBridgeHandler<ContactsEnvironment, WorkerContext>({
      mounts,
      csp: appConfig.csp,
      apiOrigin: appConfig.apiOrigin,
      webApiOrigin: appConfig.webApiOrigin,
      framablePaths: appConfig.framablePaths,
      start: createBridgeStartHandler(),
      serverFnBase: '/_serverFn',
      proxy,
      // The proxy's own `config.matcher`, evaluated like Next.
      matches: createProxyMatcher(proxyConfig.matcher, defaultProxyMatches),
      endpoints,
      centralFirst,
      functionBase: '/_serverFn',
      functionProxy: createFunctionProxy({ targetApp: 'contacts' }),
      publicAssets,
      assets: (env) => env.ASSETS,
      centralApiOrigin: (env) =>
        env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
    })
  );

let handler: ReturnType<typeof createHandler> | undefined;

export default {
  fetch: withHstsResponsePolicy(
    async (request: Request, env: ContactsEnvironment, ctx: WorkerContext) => {
      let response: Response;
      try {
        if (!hasContactsBindings(env)) {
          response = new Response('Contacts configuration unavailable', {
            status: 503,
          });
        } else if (hasAmbiguousAppPath(request)) {
          // Dotted paths skip the application proxy and still enter Start.
          response = new Response('Invalid workspace path', { status: 400 });
        } else {
          handler ??= createHandler();
          response = await (await handler)(request, env, ctx);
        }
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
    }
  ),
};
