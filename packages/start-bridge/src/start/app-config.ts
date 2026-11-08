import type { AppSeoPolicy } from '@tuturuuu/utils/seo-robots';
import type { AppMountConfig } from '../core/mounts';

/**
 * The Worker options an app owns in its `start-bridge.config.ts`. The codemod
 * creates that file once and never overwrites it; the generated Worker passes
 * these to `createBridgeHandler`, so apps enforce a CSP, reject unknown hosts
 * or decorate responses (usually in their cutover-prep PR) without editing
 * generated files.
 */
export interface BridgeAppConfig<Env = unknown> {
  /**
   * Content-Security-Policy for each response's nonce (`createBridgeHandler`
   * `csp`); `null` keeps the response's own policy. Framable paths (Web's
   * uploaded WebGL builds) always keep their upstream policy.
   */
  csp?: (
    nonce: string,
    context: { request: Request; response: Response; path: string }
  ) => string | null | undefined;
  /**
   * App-relative paths other origins may frame, beyond the platform list
   * (`@tuturuuu/utils/framable-paths`): the handler `csp` and the response
   * policy leave their upstream CSP untouched and set no `X-Frame-Options`.
   */
  framablePaths?: readonly RegExp[];
  /** Overrides of the generated mounts: hosts, `basePath`, `unknownHost`. */
  mounts?: Partial<Omit<AppMountConfig, 'app'>>;
  /**
   * Origin for one unowned `/api/*` request (`createBridgeHandler`
   * `apiOrigin`); `undefined` keeps the central Web API. Forwarding keeps the
   * central forward's base stripping, loop guard and header removal.
   */
  apiOrigin?: (
    request: Request,
    context: { env: Env; path: string }
  ) => string | undefined;
  /**
   * Generated Worker settings, applied by the codemod to `void.config.ts`,
   * the sealed artifact identity and the runtime test (re-run it after a
   * change; the runtime test fails on drift). `workersDev` defaults to off
   * when `mounts.unknownHost` is `reject`, otherwise on; `compatibilityFlags`
   * add to the always-on `nodejs_compat` and `global_fetch_strictly_public`.
   */
  worker?: {
    workersDev?: boolean;
    compatibilityFlags?: readonly string[];
  };
  /**
   * Decorates every response the Worker returns; use
   * `createRootResponsePolicy` from `@tuturuuu/start-bridge/response-policy`
   * (robots, framing, sniffing, referrer and private caching). The generated
   * Worker passes its effective `mounts` and `publicAssets`, so the config
   * never imports generated modules.
   */
  wrapResponse?: (
    response: Response,
    context: {
      request: Request;
      env: Env;
      /** Passed by Workers generated since the shared response policy. */
      mounts?: Omit<AppMountConfig, 'app'> & { app?: string };
      publicAssets?: ReadonlySet<string>;
      framablePaths?: readonly RegExp[];
      /** The app's seo-policy.json entry, emitted into the generated Worker. */
      seoPolicy?: AppSeoPolicy | null;
    }
  ) => Response | Promise<Response>;
}

export function defineBridgeAppConfig<Env = unknown>(
  config: BridgeAppConfig<Env>
) {
  return config;
}
