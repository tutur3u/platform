/**
 * The shared response policy for a bridged app's Worker, used as
 * `wrapResponse` in the app-owned start-bridge.config.ts. It replaces the
 * hand-rolled versions that each repeated the same bugs: a cache policy set
 * only as a default (a handler's `public, max-age` survived), an asset
 * exemption that ignored the method, and an existing CSP passing through
 * without `frame-ancestors`.
 *
 * Web APIs only, and no relative runtime imports: start-bridge.config.ts is
 * loaded with Node's type stripping by the codemod and the runtime test.
 *
 * Framable paths (the platform list in `@tuturuuu/utils/framable-paths`, the
 * app's `framablePaths` and `framable` here) keep the upstream CSP untouched:
 * Web's uploaded WebGL builds carry a `sandbox` CSP that must reach the
 * browser as served. Matching is case-sensitive, like central's routes.
 */
import { createFramablePathMatcher } from '@tuturuuu/utils/framable-paths';
import { type AppSeoPolicy, robotsForUrl } from '@tuturuuu/utils/seo-robots';
import { enforceStagingCookiePolicy } from '@tuturuuu/utils/staging-cookie-policy';

export interface ResponsePolicyContext<Env = unknown> {
  request: Request;
  env?: Env;
  /** The Worker's effective mounts (from the generated Worker). */
  mounts?: {
    mountHosts?: readonly string[];
    basePath?: string;
  };
  /** App-relative public files served from ASSETS (from the generated Worker). */
  publicAssets?: ReadonlySet<string>;
  /** The app's `framablePaths` (from the generated Worker). */
  framablePaths?: readonly RegExp[];
  /**
   * The app's `seo-policy.json` entry (from the generated Worker), or `null`
   * for an app without one (always private).
   */
  seoPolicy?: AppSeoPolicy | null;
}

export interface RootResponsePolicyOptions<Env = unknown> {
  /**
   * `X-Robots-Tag` for a response, or a resolver; `null` leaves the response
   * indexable. Use `appRobots` (the app's `seo-policy.json` allowlist). An
   * upstream `noindex` is never overridden.
   */
  seo: string | ((context: ResponsePolicyContext<Env>) => string | null);
  /**
   * More app-relative paths that other origins may frame, beyond the
   * platform list and the app's `framablePaths`: no `X-Frame-Options`, and this policy leaves
   * the CSP it receives untouched. The handler `csp` does not see these
   * extra paths. Prefer app-config `framablePaths` when the app sets `csp`.
   */
  framable?: readonly RegExp[];
  /**
   * The CSP for a non-framable response that has none, so `frame-ancestors`
   * is still enforced; default `frame-ancestors 'none'`.
   */
  csp?: string;
}

const NO_ANCESTORS = "frame-ancestors 'none'";
const CACHEABLE_METHODS = new Set(['GET', 'HEAD']);

/** Each policy keeps its directives, with any `frame-ancestors` replaced. */
export function denyFrameAncestors(value: string): string {
  return value
    .split(',')
    .map((policy) => {
      const directives = policy
        .split(';')
        .map((directive) => directive.trim())
        .filter(
          (directive) =>
            directive &&
            directive.split(/\s+/u)[0]?.toLowerCase() !== 'frame-ancestors'
        );
      return [...directives, NO_ANCESTORS].join('; ');
    })
    .join(', ');
}

/** Adds `token` to a `Vary` value once (case-insensitive); `*` stays `*`. */
function varyWith(value: string | null, token: string) {
  const tokens = (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (tokens.includes('*')) return '*';
  if (tokens.some((part) => part.toLowerCase() === token.toLowerCase()))
    return tokens.join(', ');
  return [...tokens, token].join(', ');
}

/** The request path relative to the app (the apex mount stripped). */
function appPathOf(url: URL, mounts: ResponsePolicyContext['mounts']) {
  const base = (mounts?.basePath ?? '').replace(/\/+$/u, '');
  const mounted =
    base &&
    (mounts?.mountHosts ?? []).some(
      (host) => host.toLowerCase() === url.host.toLowerCase()
    );
  if (!mounted) return url.pathname;
  if (url.pathname === base) return '/';
  return url.pathname.startsWith(`${base}/`)
    ? url.pathname.slice(base.length)
    : url.pathname;
}

/**
 * Robots from the app's `seo-policy.json` entry: indexable only on its public
 * allowlist on its canonical origin; reserved paths, other hosts, apps
 * without a policy and `TUTURUUU_NOINDEX=1` deployments stay private.
 */
export function appRobots(context: ResponsePolicyContext<unknown>) {
  const env = context.env as { TUTURUUU_NOINDEX?: string } | undefined;
  return robotsForUrl(context.seoPolicy, new URL(context.request.url), {
    noindex: env?.TUTURUUU_NOINDEX === '1',
  });
}

const appMatchers = new WeakMap<readonly RegExp[], (path: string) => boolean>();
function appFramable(patterns: readonly RegExp[] | undefined) {
  if (!patterns?.length) return () => false;
  // One stateless matcher per config array (g/y patterns are cloned).
  let matcher = appMatchers.get(patterns);
  if (!matcher) {
    matcher = createFramablePathMatcher(patterns);
    appMatchers.set(patterns, matcher);
  }
  return matcher;
}

export function createRootResponsePolicy<Env = unknown>(
  options: RootResponsePolicyOptions<Env>
) {
  const isFramable = createFramablePathMatcher(options.framable);
  const fallbackCsp = options.csp ?? NO_ANCESTORS;
  return function applyRootResponsePolicy(
    response: Response,
    context: ResponsePolicyContext<Env>
  ): Response {
    response = enforceStagingCookiePolicy(context.request, response);
    // A WebSocket upgrade cannot be rebuilt; it carries no document.
    if (response.status === 101) return response;
    const secured = new Response(response.body, response);
    const headers = secured.headers;
    const url = new URL(context.request.url);
    const path = appPathOf(url, context.mounts);

    // Never weaken an upstream noindex (e.g. a private page from Web).
    if (!/\bnoindex\b/iu.test(headers.get('X-Robots-Tag') ?? '')) {
      const robots =
        typeof options.seo === 'function' ? options.seo(context) : options.seo;
      if (robots !== null) headers.set('X-Robots-Tag', robots);
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const framed = isFramable(path) || appFramable(context.framablePaths)(path);
    if (framed) {
      // Embeddable: the upstream CSP stays byte-for-byte, with no XFO.
      headers.delete('X-Frame-Options');
    } else {
      headers.set('X-Frame-Options', 'DENY');
      const csp = headers.get('Content-Security-Policy');
      headers.set(
        'Content-Security-Policy',
        csp ? denyFrameAncestors(csp) : denyFrameAncestors(fallbackCsp)
      );
    }

    // Only static files fetched with a safe method keep their own caching;
    // an asset path answering HTML is an app page, so it stays private.
    const staticAsset =
      CACHEABLE_METHODS.has(context.request.method.toUpperCase()) &&
      (path.startsWith('/assets/') ||
        (context.publicAssets?.has(path) ?? false)) &&
      !headers.get('Content-Type')?.toLowerCase().includes('text/html');
    if (!staticAsset) {
      headers.set('Cache-Control', 'private, no-store');
      headers.set('Vary', varyWith(headers.get('Vary'), 'Cookie'));
    }
    return secured;
  };
}
