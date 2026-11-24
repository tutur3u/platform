/**
 * Shared pieces for the CMS edge caches (published delivery and published
 * assets): the Workers Cache API handle, the stop fence, a short in-isolate
 * memo with single-flight, and the only function allowed to store a response.
 * Nothing here touches the network, so every dependency is injectable.
 */

export const EDGE_CACHE_ORIGIN = 'https://cms-cache.internal';

/** A version read is reused for at most this long inside one isolate. */
export const VERSION_MEMO_TTL_MS = 2000;

export type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

export type EdgeCacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export type EdgeCacheEnv = Record<string, string | undefined>;

/** `CMS_DELIVERY_EDGE_CACHE=0` turns every CMS edge cache off. */
export function isCmsEdgeCacheEnabled(
  env: EdgeCacheEnv | undefined = typeof process === 'undefined'
    ? undefined
    : process.env
) {
  return env?.CMS_DELIVERY_EDGE_CACHE?.trim() !== '0';
}

/** The Workers default cache, or null where the runtime has none. */
export function resolveDefaultEdgeCache(): EdgeCache | null {
  const cacheStorage = (globalThis as { caches?: { default?: unknown } })
    .caches;
  const cache = cacheStorage?.default as Partial<EdgeCache> | undefined;
  return cache &&
    typeof cache.match === 'function' &&
    typeof cache.put === 'function'
    ? (cache as EdgeCache)
    : null;
}

/**
 * Stores one response. Only a complete 200 may be stored: errors, redirects,
 * 304s, partial content and anything marked private or no-store are refused,
 * and a cache failure never fails the request.
 */
export async function putEdgeCacheEntry(
  cache: EdgeCache,
  request: Request,
  response: Response
) {
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (response.status !== 200 || /\b(?:private|no-store)\b/i.test(cacheControl))
    return false;
  try {
    await cache.put(request, response);
    return true;
  } catch (error) {
    console.warn('CMS edge cache put failed', error);
    return false;
  }
}

/**
 * Reads a value, reuses it for `ttlMs`, and shares one in-flight read between
 * concurrent callers. A failed read is dropped so the next call retries.
 */
export function createSingleFlightMemo<Value>({
  now = Date.now,
  read,
  ttlMs = VERSION_MEMO_TTL_MS,
  maxEntries = 512,
}: {
  now?: () => number;
  read: (key: string) => Promise<Value>;
  ttlMs?: number;
  maxEntries?: number;
}) {
  const entries = new Map<
    string,
    { expiresAt: number; value: Promise<Value> }
  >();

  function prune(at: number) {
    for (const [key, entry] of entries)
      if (entry.expiresAt <= at) entries.delete(key);
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    get(key: string): Promise<Value> {
      const at = now();
      const existing = entries.get(key);
      if (existing && existing.expiresAt > at) return existing.value;
      if (entries.size >= maxEntries) prune(at);
      const value = read(key);
      const entry = { expiresAt: at + ttlMs, value };
      entries.set(key, entry);
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return value;
    },
    clear() {
      entries.clear();
    },
    get ttlMs() {
      return ttlMs;
    },
  };
}

/** Shares one in-flight build per key. */
export function createSingleFlight<Value>() {
  const pending = new Map<string, Promise<Value>>();
  return (key: string, run: () => Promise<Value>) => {
    const existing = pending.get(key);
    if (existing) return existing;
    const started = run().finally(() => pending.delete(key));
    pending.set(key, started);
    return started;
  };
}
