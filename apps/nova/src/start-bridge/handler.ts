import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import type { BridgeEndpoint } from '@tuturuuu/start-bridge/endpoints';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { proxy } from '../proxy';

export interface NovaBridgeEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

export interface NovaWorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

export function createNovaHandler({
  start,
  endpoints,
  publicAssets,
  basePath,
}: {
  start: { fetch(request: Request): Promise<Response> | Response };
  endpoints: readonly BridgeEndpoint[];
  publicAssets: ReadonlySet<string>;
  basePath?: string;
}) {
  return createBridgeHandler<NovaBridgeEnvironment, NovaWorkerContext>({
    ...(basePath === undefined
      ? {
          mounts: {
            app: 'nova',
            rootHosts: ['nova.tuturuuu.com'],
            mountHosts: ['tuturuuu.com'],
            basePath: '/nova',
          },
        }
      : { basePath: createBasePath({ app: 'nova', basePath }) }),
    start,
    proxy,
    endpoints,
    functionBase: '/_serverFn',
    functionProxy: createFunctionProxy({ targetApp: 'nova' }),
    publicAssets,
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) =>
      env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
  });
}
