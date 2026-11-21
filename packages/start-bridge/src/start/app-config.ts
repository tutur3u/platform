import { defaultContentSecurityPolicy } from '../core/csp';
import { secureBridgeDocument } from '../core/document-security';
import type { AppSeoPolicy } from '@tuturuuu/utils/seo-robots';
import {
  isolateMountedRequest,
  reduceMountedSessionRequest,
  scopeMountedResponseCookies,
  stripMountedSupabaseWrites,
} from '../core/mount-isolation';
import { type AppMountConfig, resolveAppBase } from '../core/mounts';
import {
  isMountedLogoutPath,
  stripMountedSessionWrites,
} from './mounted-session-guard';

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
   * Trusted Web origin resolver. Throws on invalid bindings before app code
   * runs, and supplies the shared internal-api credentialed-read policy.
   * Apps without this hook retain their configured-origin behavior.
   */
  webApiOrigin?: (env: Env) => string;
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

type WrapContext<Env> = Parameters<
  NonNullable<BridgeAppConfig<Env>['wrapResponse']>
>[1];

/**
 * The mount a wrapped response belongs to, from the Worker's effective mounts
 * (or the config's own), or `null` at a root host.
 */
function mountedBase<Env>(
  context: WrapContext<Env>,
  fallback: BridgeAppConfig<Env>['mounts']
) {
  const mounts = context.mounts ?? fallback;
  if (!mounts?.basePath || !mounts.mountHosts?.length) return null;
  const mount = resolveAppBase(new URL(context.request.url), {
    app: context.mounts?.app ?? 'app',
    rootHosts: mounts.rootHosts ?? [],
    mountHosts: mounts.mountHosts,
    basePath: mounts.basePath,
    isolation: mounts.isolation,
  });
  return mount?.mode === 'mounted'
    ? { basePath: mount.basePath, isolation: mounts.isolation }
    : null;
}

/**
 * Declares an app's Worker options. `wrapResponse` runs after the bridge, so
 * on a mount it receives the reduced request and its result is guarded again:
 * whatever it adds, a mounted response never writes the Supabase or
 * first-party session, `Clear-Site-Data`, or (with isolation) a cookie the
 * app does not own outside its base.
 */
export function defineBridgeAppConfig<Env = unknown>(
  config: BridgeAppConfig<Env>
): BridgeAppConfig<Env> {
  const wrap = config.wrapResponse;
  if (!wrap) return config;
  return {
    ...config,
    async wrapResponse(response, context) {
      const mount = mountedBase(context, config.mounts);
      if (!mount) return wrap(response, context);
      const request = mount.isolation
        ? isolateMountedRequest(context.request, mount.isolation)
        : reduceMountedSessionRequest(context.request);
      const wrapped = await wrap(response, { ...context, request });
      const appPath =
        new URL(context.request.url).pathname.slice(mount.basePath.length) ||
        '/';
      const logout = isMountedLogoutPath(appPath);
      const guarded = stripMountedSupabaseWrites(
        stripMountedSessionWrites(wrapped),
        logout
      );
      return mount.isolation
        ? scopeMountedResponseCookies(
            guarded,
            mount.basePath,
            mount.isolation,
            logout
          )
        : guarded;
    },
  };
}

/** Stages Trusted Types independently for each app while enforcing script nonces. */
export function withDocumentSecurity<Env>(
  app: string,
  config: BridgeAppConfig<Env>,
  policies: readonly string[] = ['dompurify']
): BridgeAppConfig<Env> {
  return {
    ...config,
    csp: config.csp ?? defaultContentSecurityPolicy,
    async wrapResponse(response, context) {
      const secured = config.wrapResponse
        ? await config.wrapResponse(response, context)
        : response;
      const mount =
        context.mounts &&
        resolveAppBase(new URL(context.request.url), {
          ...context.mounts,
          app,
        });
      return secureBridgeDocument(secured, {
        request: context.request,
        env: context.env,
        app,
        basePath: mount?.basePath ?? '',
        policies,
      });
    },
  };
}

export {
  CSP_REPORT_PATH,
  collectDocumentSecurityReport,
  secureBridgeDocument,
} from '../core/document-security';
