import type { DeliveryState } from './delivery-state';
import {
  createSingleFlight,
  createSingleFlightMemo,
  EDGE_CACHE_ORIGIN,
  type EdgeCache,
  type EdgeCacheStatus,
  putEdgeCacheEntry,
  VERSION_MEMO_TTL_MS,
} from './edge-cache-core';
import { ifNoneMatchMatches } from './http-cache';

/** Browsers always revalidate; shared caches may reuse a copy for 5 s. */
export const DELIVERY_PUBLIC_CACHE_CONTROL =
  'public, max-age=0, s-maxage=5, stale-while-revalidate=30';

/**
 * Stored copies are never served as stored: the response headers are rebuilt
 * on every hit. The long lifetime is safe because the key carries the
 * workspace's delivery version, so a content change moves to a new key.
 */
const STORED_CACHE_CONTROL = 'public, max-age=86400';

/**
 * Synthetic cache key. It names the workspace, the delivery version and the
 * binding fingerprint, so two workspaces never share an entry and a version
 * bump is a miss.
 */
export function deliveryCacheKey(
  workspaceId: string,
  version: number,
  bindingFingerprint: string
) {
  return `${EDGE_CACHE_ORIGIN}/delivery/v1/${encodeURIComponent(workspaceId)}/${version}/${encodeURIComponent(bindingFingerprint || 'none')}`;
}

type DeliveryPayload = { revision: string };

/**
 * The payload revision follows max(updated_at), which a hard delete does not
 * move; the delivery version does, so the tag carries both.
 */
export function deliveryEtag(revision: string | number, version: number) {
  return `W/"${revision}-v${version}"`;
}

type ServeOptions<Payload extends DeliveryPayload> = {
  build: (state: DeliveryState) => Promise<Payload>;
  /** Drafts are never cached; any value other than `false` is refused. */
  includeDrafts: false;
  ifNoneMatch: string | null;
  workspaceId: string;
};

function publicHeaders(status: EdgeCacheStatus, version: number, etag: string) {
  return {
    'Cache-Control': DELIVERY_PUBLIC_CACHE_CONTROL,
    ETag: etag,
    'X-Tuturuuu-Asset-Publication': 'v1',
    'X-Tuturuuu-Delivery-Cache': status,
    'X-Tuturuuu-Delivery-Version': String(version),
  };
}

export function createDeliveryEdgeCache({
  getCache,
  now,
  readState,
  stateTtlMs = VERSION_MEMO_TTL_MS,
}: {
  getCache: () => EdgeCache | null;
  now?: () => number;
  readState: (workspaceId: string) => Promise<DeliveryState>;
  stateTtlMs?: number;
}) {
  const states = createSingleFlightMemo<DeliveryState>({
    now,
    read: readState,
    ttlMs: Math.min(stateTtlMs, VERSION_MEMO_TTL_MS),
  });
  const builds = createSingleFlight<{ body: string; etag: string }>();

  async function match(cache: EdgeCache, request: Request) {
    try {
      return await cache.match(request);
    } catch (error) {
      console.warn('CMS delivery edge cache match failed', error);
      return undefined;
    }
  }

  /**
   * Serves the published payload for a workspace. Returns null when the
   * workspace has no enabled CMS binding (the caller answers 404).
   */
  async function serve<Payload extends DeliveryPayload>(
    options: ServeOptions<Payload>
  ): Promise<Response | null> {
    if ((options.includeDrafts as boolean) !== false)
      throw new Error('Draft deliveries are never edge-cached');

    const { workspaceId } = options;
    const state = await states.get(workspaceId);
    if (!state.enabled || !state.canonicalProject) return null;

    const cache = getCache();
    const key = deliveryCacheKey(
      workspaceId,
      state.version,
      state.bindingFingerprint
    );
    const request = new Request(key);

    const stored = cache ? await match(cache, request) : undefined;
    const storedEtag = stored?.headers.get('etag') ?? null;
    if (stored && storedEtag) {
      const headers = publicHeaders('HIT', state.version, storedEtag);
      if (ifNoneMatchMatches(options.ifNoneMatch, storedEtag)) {
        void stored.body?.cancel().catch(() => {});
        return new Response(null, { headers, status: 304 });
      }
      return new Response(stored.body, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const built = await builds(key, async () => {
      const payload = await options.build(state);
      const result = {
        body: JSON.stringify(payload),
        etag: deliveryEtag(payload.revision, state.version),
      };
      if (cache)
        await putEdgeCacheEntry(
          cache,
          request,
          new Response(result.body, {
            headers: {
              'Cache-Control': STORED_CACHE_CONTROL,
              'Content-Type': 'application/json',
              ETag: result.etag,
            },
            status: 200,
          })
        );
      return result;
    });

    const headers = publicHeaders(
      cache ? 'MISS' : 'BYPASS',
      state.version,
      built.etag
    );
    if (ifNoneMatchMatches(options.ifNoneMatch, built.etag))
      return new Response(null, { headers, status: 304 });
    return new Response(built.body, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  return { serve, states };
}

/** Headers for a delivery served without any shared cache (fenced or legacy). */
export function bypassDeliveryHeaders(etag: string | null) {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(etag ? { ETag: etag } : {}),
    'X-Tuturuuu-Asset-Publication': 'v1',
    'X-Tuturuuu-Delivery-Cache': 'BYPASS' satisfies EdgeCacheStatus,
  };
}
