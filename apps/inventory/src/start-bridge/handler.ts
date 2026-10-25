import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import type { BridgeEndpoint } from '@tuturuuu/start-bridge/endpoints';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS } from '@tuturuuu/utils/next-config';
import { proxy } from '../proxy';

export interface InventoryBridgeEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
}

export interface InventoryWorkerContext {
  waitUntil(work: Promise<unknown>): void;
}

export function createInventoryHandler({
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
  return createBridgeHandler<
    InventoryBridgeEnvironment,
    InventoryWorkerContext
  >({
    ...(basePath === undefined
      ? {
          mounts: {
            app: 'inventory',
            rootHosts: ['inventory.tuturuuu.com'],
            mountHosts: ['tuturuuu.com'],
            basePath: '/inventory',
          },
        }
      : { basePath: createBasePath({ app: 'inventory', basePath }) }),
    start,
    proxy,
    endpoints,
    centralFirst: TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS,
    functionBase: '/_serverFn',
    functionProxy: createFunctionProxy({ targetApp: 'inventory' }),
    publicAssets,
    matches: (pathname) =>
      !pathname.startsWith('/_next') && !pathname.includes('.'),
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) =>
      env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com',
  });
}
