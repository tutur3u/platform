import type { AppMountConfig } from '../core/mounts';

/**
 * The Worker options an app owns in its `start-bridge.config.ts`. The codemod
 * creates that file once and never overwrites it; the generated Worker passes
 * these to `createBridgeHandler`, so apps enforce a CSP, reject unknown hosts
 * or decorate responses (usually in their cutover-prep PR) without editing
 * generated files.
 */
export interface BridgeAppConfig<Env = unknown> {
  /** Content-Security-Policy for each response's nonce (`createBridgeHandler` `csp`). */
  csp?: (nonce: string) => string;
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
  /** Decorates every response the Worker returns (e.g. a staging noindex header). */
  wrapResponse?: (
    response: Response,
    context: { request: Request; env: Env }
  ) => Response | Promise<Response>;
}

export function defineBridgeAppConfig<Env = unknown>(
  config: BridgeAppConfig<Env>
) {
  return config;
}
