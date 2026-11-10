import {
  bypassReason,
  hasAuthCookie,
  cacheKey,
  inspectAssetBody,
  FRESH_SECONDS,
  freshness,
  isStorable,
  localeBucket,
  STALE_SECONDS,
  type StoreDecision,
} from './cache-rules';
import {
  type Manifest,
  manifest as defaultManifest,
  matchRoute,
  type RouteMatch,
} from './manifest';

export interface Env {
  /** `passthrough` is the rollback flag: transparent proxy, no cache. */
  GATEWAY_MODE?: string;
  /** Origin of the Vercel production web deployment, e.g. https://host. */
  WEB_ORIGIN?: string;
  /** Hostname clients use; origin redirects to the origin host map to it. */
  PUBLIC_HOST?: string;
  /** Comma-separated page groups served by MARKETING_ORIGIN (empty: none). */
  GATEWAY_MARKETING_GROUPS?: string;
  /** Origin of the apps/marketing Worker, e.g. https://marketing.tuturuuu.com. */
  MARKETING_ORIGIN?: string;
  /** `true` honours origin `no-store`/`private` on cacheable routes. */
  GATEWAY_RESPECT_ORIGIN_CACHE_CONTROL?: string;
  /**
   * Comma-separated mount paths of apps served at `tuturuuu.com/<app>` (for
   * example `/learn,/tasks`). Their zone routes cannot match the bare path
   * once a query string is present, so the gateway hands exactly `/<app>`
   * (any query) to the app Worker through the service binding
   * `MOUNT_<SEGMENT>` (`MOUNT_LEARN`). Unlisted or unbound paths keep going to
   * WEB_ORIGIN. Clearing an entry is part of that app's one-step rollback.
   */
  GATEWAY_MOUNTED_PATHS?: string;
  [name: string]: string | undefined;
}

/** A Worker service binding. */
export interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

const MOUNT_PATH_PATTERN = /^\/[a-z][a-z0-9-]*$/u;

/** The service binding serving this exact bare mount path, if any. */
export function mountedAppBinding(
  request: Request,
  env: Env
): ServiceBinding | null {
  const { pathname } = new URL(request.url);
  if (!MOUNT_PATH_PATTERN.test(pathname)) return null;
  const listed = (env.GATEWAY_MOUNTED_PATHS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => MOUNT_PATH_PATTERN.test(entry));
  if (!listed.includes(pathname)) return null;
  const name = `MOUNT_${pathname.slice(1).replace(/-/gu, '_').toUpperCase()}`;
  const binding = (env as unknown as Record<string, unknown>)[name];
  return binding &&
    typeof (binding as Partial<ServiceBinding>).fetch === 'function'
    ? (binding as ServiceBinding)
    : null;
}

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export interface HandlerDeps {
  cache: () => CacheLike | Promise<CacheLike>;
  now: () => number;
  manifest: Manifest;
}

const HOP_HEADER = 'x-gateway-hop';
const STORED_AT = 'x-gateway-stored-at';
const PAGE_CLIENT_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

function plain(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' },
  });
}

function resolveOrigin(env: Env, manifest: Manifest, originName: string) {
  const envName = manifest.origins[originName]?.env;
  const raw = envName ? env[envName] : undefined;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Requests that depend on a signed-in session or on the Next app (RSC and
 * server actions) always go to the web origin, even for a flagged group, so a
 * signed-in visitor keeps today's behavior (for example `/` redirects them to
 * their workspace).
 */
function needsWebOrigin(request: Request) {
  const headers = request.headers;
  return (
    headers.has('authorization') ||
    headers.has('rsc') ||
    headers.has('next-router-prefetch') ||
    headers.has('next-router-state-tree') ||
    headers.has('next-action') ||
    new URL(request.url).searchParams.has('_rsc') ||
    hasAuthCookie(headers.get('cookie'))
  );
}

function flaggedGroups(env: Env) {
  return new Set(
    (env.GATEWAY_MARKETING_GROUPS ?? '')
      .split(',')
      .map((group) => group.trim())
      .filter(Boolean)
  );
}

/** The origin a matched route uses: its flagged origin when the group flag is on and that origin is configured, otherwise its default. */
function chooseOrigin(
  env: Env,
  manifest: Manifest,
  match: RouteMatch,
  request: Request
) {
  if (
    match.group &&
    !needsWebOrigin(request) &&
    match.flagOrigin &&
    flaggedGroups(env).has(match.group)
  ) {
    const flagged = resolveOrigin(env, manifest, match.flagOrigin);
    if (flagged) return { url: flagged, flagged: true };
  }
  const own = resolveOrigin(env, manifest, match.origin);
  // A route that names an optional origin (for example the marketing assets)
  // falls back to the default origin while that origin is not configured.
  const url = own ?? resolveOrigin(env, manifest, manifest.default.origin);
  return { url, flagged: false };
}

const FORWARDED_HOST = 'x-forwarded-host';
const FORWARDED_PROTO = 'x-forwarded-proto';

/**
 * The origin request. Client-supplied X-Forwarded-Host/-Proto never reach the
 * origin: the gateway states the public host itself, so an origin that trusts
 * these headers (the marketing Worker) builds public URLs, never spoofed ones.
 */
function originRequest(
  request: Request,
  origin: URL,
  publicHost: string | undefined
) {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const outgoing = new Request(target, request);
  outgoing.headers.set(HOP_HEADER, '1');
  outgoing.headers.delete(FORWARDED_HOST);
  outgoing.headers.delete(FORWARDED_PROTO);
  if (publicHost) {
    outgoing.headers.set(FORWARDED_HOST, publicHost);
    outgoing.headers.set(FORWARDED_PROTO, 'https');
  }
  return outgoing;
}

const NO_FOLLOW = { redirect: 'manual' } as const;

/** Maps origin-host URLs in a Link header (hreflang alternates) to the public host. */
/** A copy of the response whose Link header names the public host. */
function withPublicLink(
  response: Response,
  origin: URL,
  publicHost: string | undefined
) {
  const copy = new Response(response.body, response);
  rewriteLinkHeader(copy, origin, publicHost);
  return copy;
}

export function rewriteLinkHeader(
  response: Response,
  origin: URL,
  publicHost: string | undefined
) {
  const link = response.headers.get('link');
  if (!link || !publicHost) return;
  const escaped = origin.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rewritten = link.replace(
    new RegExp(`https?://${escaped}`, 'gi'),
    `https://${publicHost}`
  );
  if (rewritten !== link) response.headers.set('link', rewritten);
}

/**
 * Absolute origin-host URLs carried in a public-host Location's query (for
 * example the sign-in `returnUrl`) point at the public host instead. Only
 * top-level parameters whose whole value is an origin-host URL change.
 */
function rewriteOriginQueryUrls(target: URL, origin: URL, publicHost: string) {
  const raw = target.search.slice(1);
  if (!raw) return false;
  let changed = false;
  // Only the changed parameter is re-encoded; every other byte of the query
  // (sibling encodings, signatures, duplicate keys, order) is kept verbatim.
  const segments = raw.split('&').map((segment) => {
    const equals = segment.indexOf('=');
    if (equals < 0) return segment;
    let value: string;
    try {
      value = decodeURIComponent(segment.slice(equals + 1).replace(/\+/g, ' '));
    } catch {
      return segment;
    }
    let nested: URL;
    try {
      nested = new URL(value);
    } catch {
      return segment;
    }
    if (nested.host !== origin.host) return segment;
    nested.protocol = 'https:';
    nested.host = publicHost;
    changed = true;
    return `${segment.slice(0, equals + 1)}${encodeURIComponent(nested.toString())}`;
  });
  if (changed) target.search = `?${segments.join('&')}`;
  return changed;
}

/** Maps an origin-host Location (and origin-host URLs in its query) to the public host. */
export function rewriteLocation(
  response: Response,
  origin: URL,
  publicHost: string | undefined
) {
  const location = response.headers.get('location');
  if (
    !location ||
    !publicHost ||
    response.status < 300 ||
    response.status > 399
  ) {
    return;
  }
  let target: URL;
  let relative = false;
  try {
    target = new URL(location);
  } catch {
    // A relative Location resolves against the public host; only its query
    // can still name the origin host.
    try {
      target = new URL(location, `https://${publicHost}`);
      relative = true;
    } catch {
      return;
    }
  }
  let changed = false;
  if (!relative && target.host === origin.host) {
    target.protocol = 'https:';
    target.host = publicHost;
    changed = true;
  }
  if (
    target.host === publicHost &&
    rewriteOriginQueryUrls(target, origin, publicHost)
  ) {
    changed = true;
  }
  if (!changed) return;
  response.headers.set(
    'location',
    relative
      ? `${target.pathname}${target.search}${target.hash}`
      : target.toString()
  );
}

function withGatewayHeader(
  response: Response,
  state: string,
  extra: Record<string, string> = {}
) {
  const next = new Response(response.body, response);
  next.headers.set('x-gateway-cache', state);
  for (const [name, value] of Object.entries(extra)) {
    next.headers.set(name, value);
  }
  return next;
}

async function proxy(
  request: Request,
  origin: URL,
  env: Env,
  state: string,
  extra: Record<string, string> = {}
) {
  let response: Response;
  try {
    response = await fetch(
      originRequest(request, origin, env.PUBLIC_HOST),
      NO_FOLLOW
    );
  } catch {
    return plain(502, 'gateway origin unreachable');
  }
  const next = withGatewayHeader(response, state, extra);
  rewriteLocation(next, origin, env.PUBLIC_HOST);
  rewriteLinkHeader(next, origin, env.PUBLIC_HOST);
  return next;
}

function servedFromCache(
  cached: Response,
  state: 'HIT' | 'STALE',
  storedAt: number,
  nowMs: number,
  head: boolean,
  isPage: boolean
) {
  const response = new Response(head ? null : cached.body, cached);
  response.headers.delete(STORED_AT);
  response.headers.set('x-gateway-cache', state);
  response.headers.set('age', String(Math.floor((nowMs - storedAt) / 1000)));
  if (isPage) response.headers.set('cache-control', PAGE_CLIENT_CACHE_CONTROL);
  return response;
}

function storedCopy(response: Response, nowMs: number) {
  const copy = new Response(response.body, response);
  copy.headers.set(
    'cache-control',
    `public, max-age=${FRESH_SECONDS + STALE_SECONDS}`
  );
  copy.headers.delete('set-cookie');
  copy.headers.set(STORED_AT, String(nowMs));
  return copy;
}

export function createHandler(deps: HandlerDeps) {
  async function refresh(
    request: Request,
    origin: URL,
    key: string,
    options: { respectOriginCacheControl: boolean },
    publicHost: string | undefined,
    isPage: boolean
  ) {
    try {
      let response = withPublicLink(
        await fetch(originRequest(request, origin, publicHost), NO_FOLLOW),
        origin,
        publicHost
      );
      if (!isStorable(response, options).store) {
        await response.body?.cancel();
        return;
      }
      if (!isPage) {
        const checked = await inspectAssetBody(response);
        if (checked.problem) {
          await checked.response.body?.cancel();
          return;
        }
        response = checked.response;
      }
      await (
        await deps.cache()
      ).put(new Request(key), storedCopy(response, deps.now()));
    } catch {
      // A failed refresh leaves the stale entry for the next attempt.
    }
  }

  return async function handle(request: Request, env: Env, ctx?: WaitUntil) {
    if (request.headers.has(HOP_HEADER)) {
      return plain(508, 'gateway loop detected');
    }
    // A mounted app owns its bare path; only a query string brings it here.
    const mounted = mountedAppBinding(request, env);
    if (mounted) {
      try {
        return withGatewayHeader(await mounted.fetch(request), 'MOUNT');
      } catch {
        return plain(502, 'gateway mounted app unreachable');
      }
    }
    const match = matchRoute(new URL(request.url).pathname, deps.manifest);
    const chosen = chooseOrigin(env, deps.manifest, match, request);
    const origin = chosen.url;
    if (!origin) return plain(500, 'gateway origin not configured');

    if (env.GATEWAY_MODE === 'passthrough') {
      return proxy(request, origin, env, 'PASSTHROUGH');
    }

    const reason = bypassReason(request, match);
    if (reason) {
      return proxy(request, origin, env, 'BYPASS', {
        'x-gateway-bypass': reason,
      });
    }

    const options = {
      respectOriginCacheControl:
        env.GATEWAY_RESPECT_ORIGIN_CACHE_CONTROL === 'true',
    };
    const isPage = match.cache === 'page';
    const head = request.method === 'HEAD';
    const locale = localeBucket(request, match, deps.manifest);
    const key = cacheKey(
      request,
      chosen.flagged ? `${locale}|marketing` : locale
    );
    const cache = await deps.cache();
    const nowMs = deps.now();

    const cached = await cache.match(new Request(key));
    if (cached) {
      const storedAt = Number(cached.headers.get(STORED_AT));
      const state = Number.isFinite(storedAt)
        ? freshness(storedAt, nowMs)
        : 'expired';
      if (state === 'hit') {
        return servedFromCache(cached, 'HIT', storedAt, nowMs, head, isPage);
      }
      if (state === 'stale') {
        const revalidate = refresh(
          new Request(request),
          origin,
          key,
          options,
          env.PUBLIC_HOST,
          isPage
        );
        if (ctx) ctx.waitUntil(revalidate);
        else await revalidate;
        return servedFromCache(cached, 'STALE', storedAt, nowMs, head, isPage);
      }
    }

    if (head) return proxy(request, origin, env, 'MISS');

    let response: Response;
    try {
      response = withPublicLink(
        await fetch(originRequest(request, origin, env.PUBLIC_HOST), NO_FOLLOW),
        origin,
        env.PUBLIC_HOST
      );
    } catch {
      return plain(502, 'gateway origin unreachable');
    }
    let decision: StoreDecision = isStorable(response, options);
    if (decision.store && !isPage) {
      const checked = await inspectAssetBody(response);
      response = checked.response;
      if (checked.problem) decision = { store: false, reason: checked.problem };
    }
    if (!decision.store) {
      const brokenBody =
        decision.reason === 'empty-body' || decision.reason === 'truncated-body';
      const next = withGatewayHeader(response, 'BYPASS', {
        'x-gateway-bypass': decision.reason ?? 'not-storable',
        // A broken body must not be kept by the edge either.
        ...(brokenBody ? { 'cache-control': 'no-store' } : {}),
      });
      rewriteLocation(next, origin, env.PUBLIC_HOST);
      rewriteLinkHeader(next, origin, env.PUBLIC_HOST);
      return next;
    }
    const put = cache.put(
      new Request(key),
      storedCopy(response.clone(), nowMs)
    );
    if (ctx) ctx.waitUntil(put);
    else await put;
    const out = withGatewayHeader(response, 'MISS');
    if (isPage) out.headers.set('cache-control', PAGE_CLIENT_CACHE_CONTROL);
    return out;
  };
}

const handler = createHandler({
  cache: () =>
    (globalThis as unknown as { caches: { default: CacheLike } }).caches
      .default,
  now: () => Date.now(),
  manifest: defaultManifest,
});

export default {
  fetch(request: Request, env: Env, ctx: WaitUntil) {
    return handler(request, env, ctx);
  },
};
