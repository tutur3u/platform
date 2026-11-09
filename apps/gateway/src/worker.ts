import {
  bypassReason,
  cacheKey,
  FRESH_SECONDS,
  freshness,
  isStorable,
  localeBucket,
  STALE_SECONDS,
} from './cache-rules';
import {
  type Manifest,
  manifest as defaultManifest,
  matchRoute,
} from './manifest';

export interface Env {
  /** `passthrough` is the rollback flag: transparent proxy, no cache. */
  GATEWAY_MODE?: string;
  /** Origin of the Vercel production web deployment, e.g. https://host. */
  WEB_ORIGIN?: string;
  /** Hostname clients use; origin redirects to the origin host map to it. */
  PUBLIC_HOST?: string;
  /** `true` honours origin `no-store`/`private` on cacheable routes. */
  GATEWAY_RESPECT_ORIGIN_CACHE_CONTROL?: string;
  [name: string]: string | undefined;
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

function originRequest(request: Request, origin: URL) {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const outgoing = new Request(target, request);
  outgoing.headers.set(HOP_HEADER, '1');
  return outgoing;
}

const NO_FOLLOW = { redirect: 'manual' } as const;

/** Maps an origin-host Location back to the public host; nothing else moves. */
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
  try {
    const target = new URL(location);
    if (target.host !== origin.host) return;
    target.protocol = 'https:';
    target.host = publicHost;
    response.headers.set('location', target.toString());
  } catch {
    // Relative Location values already resolve against the public host.
  }
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
    response = await fetch(originRequest(request, origin), NO_FOLLOW);
  } catch {
    return plain(502, 'gateway origin unreachable');
  }
  const next = withGatewayHeader(response, state, extra);
  rewriteLocation(next, origin, env.PUBLIC_HOST);
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
    options: { respectOriginCacheControl: boolean }
  ) {
    try {
      const response = await fetch(originRequest(request, origin), NO_FOLLOW);
      if (!isStorable(response, options).store) {
        await response.body?.cancel();
        return;
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
    const match = matchRoute(new URL(request.url).pathname, deps.manifest);
    const origin = resolveOrigin(env, deps.manifest, match.origin);
    if (!origin) return plain(500, 'gateway origin not configured');

    if (env.GATEWAY_MODE === 'passthrough') {
      return proxy(request, origin, env, 'PASSTHROUGH');
    }

    const reason = bypassReason(request, match);
    if (reason) return proxy(request, origin, env, 'BYPASS');

    const options = {
      respectOriginCacheControl:
        env.GATEWAY_RESPECT_ORIGIN_CACHE_CONTROL === 'true',
    };
    const isPage = match.cache === 'page';
    const head = request.method === 'HEAD';
    const key = cacheKey(request, localeBucket(request, match, deps.manifest));
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
        const revalidate = refresh(new Request(request), origin, key, options);
        if (ctx) ctx.waitUntil(revalidate);
        else await revalidate;
        return servedFromCache(cached, 'STALE', storedAt, nowMs, head, isPage);
      }
    }

    if (head) return proxy(request, origin, env, 'MISS');

    let response: Response;
    try {
      response = await fetch(originRequest(request, origin), NO_FOLLOW);
    } catch {
      return plain(502, 'gateway origin unreachable');
    }
    const decision = isStorable(response, options);
    if (!decision.store) {
      const next = withGatewayHeader(response, 'BYPASS');
      rewriteLocation(next, origin, env.PUBLIC_HOST);
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
