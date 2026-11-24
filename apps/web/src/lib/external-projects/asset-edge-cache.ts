import type { ImageTransformOptions } from '@tuturuuu/types';
import { sliceByteRange } from './asset-byte-range';
import {
  EDGE_CACHE_ORIGIN,
  type EdgeCache,
  type EdgeCacheStatus,
  putEdgeCacheEntry,
} from './edge-cache-core';
import { ifNoneMatchMatches } from './http-cache';

/**
 * Not `immutable`: the URL carries the asset's updated_at, not a content
 * hash, and an unpublish must be able to retract within the hour.
 */
export const ASSET_PUBLIC_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';

/** Canonical, order-independent form of the transform parameters. */
export function assetTransformKey(
  transform: ImageTransformOptions | undefined
) {
  if (!transform) return 'original';
  const parts = [
    ['f', transform.format],
    ['h', transform.height],
    ['q', transform.quality],
    ['r', transform.resize],
    ['w', transform.width],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}${value}`);
  return parts.length > 0 ? parts.join('-') : 'original';
}

/**
 * Synthetic cache key: workspace, asset, requested revision, transform and
 * the workspace's delivery version. A publish or unpublish moves the version,
 * so the next lookup misses and the publication is verified again.
 */
export function assetCacheKey(input: {
  assetId: string;
  deliveryVersion: number;
  revision: string;
  transform: ImageTransformOptions | undefined;
  workspaceId: string;
}) {
  return [
    `${EDGE_CACHE_ORIGIN}/asset/v1`,
    encodeURIComponent(input.workspaceId),
    encodeURIComponent(input.assetId),
    encodeURIComponent(input.revision),
    assetTransformKey(input.transform),
    input.deliveryVersion,
  ].join('/');
}

/** Strong tag from the publication proof's sha256; variants add their transform. */
export function assetEtag(
  digest: string,
  transform: ImageTransformOptions | undefined
) {
  return `"${digest}${transform ? `+${assetTransformKey(transform)}` : ''}"`;
}

type OpenInput = {
  assetId: string;
  revision: string | null;
  transform: ImageTransformOptions | undefined;
  workspaceId: string;
};

export type AssetEdgeSlot = ReturnType<typeof createSlot>;

function createSlot(
  cache: EdgeCache | null,
  request: Request,
  deliveryVersion: number,
  transform: ImageTransformOptions | undefined
) {
  const missStatus: EdgeCacheStatus = cache ? 'MISS' : 'BYPASS';

  function finalize(
    full: Response,
    status: EdgeCacheStatus,
    options: { ifNoneMatch: string | null; range: string | null }
  ) {
    const headers = new Headers(full.headers);
    headers.set('Cache-Control', ASSET_PUBLIC_CACHE_CONTROL);
    headers.set('X-Tuturuuu-Delivery-Cache', status);
    headers.set('X-Tuturuuu-Delivery-Version', String(deliveryVersion));
    const etag = headers.get('etag');
    if (etag && ifNoneMatchMatches(options.ifNoneMatch, etag)) {
      void full.body?.cancel().catch(() => {});
      const notModified = new Headers();
      for (const name of [
        'Access-Control-Allow-Origin',
        'Cache-Control',
        'ETag',
        'X-Tuturuuu-Delivery-Cache',
        'X-Tuturuuu-Delivery-Version',
      ])
        if (headers.has(name)) notModified.set(name, headers.get(name) ?? '');
      return new Response(null, { headers: notModified, status: 304 });
    }
    if (options.range && !transform)
      return ranged(full, headers, options.range);
    return new Response(full.body, { headers, status: full.status });
  }

  async function ranged(full: Response, headers: Headers, range: string) {
    const bytes = new Uint8Array(await full.arrayBuffer());
    headers.delete('content-length');
    const sliced = sliceByteRange(bytes, range, headers);
    headers.set('Accept-Ranges', 'bytes');
    if (sliced.status === 416)
      return new Response(null, { headers, status: 416 });
    return new Response(new Uint8Array(sliced.body), {
      headers,
      status: sliced.status,
    });
  }

  return {
    deliveryVersion,
    key: request.url,
    /** Headers for the full response a miss builds. */
    headers(digest: string): Record<string, string> {
      return {
        'Cache-Control': ASSET_PUBLIC_CACHE_CONTROL,
        ETag: assetEtag(digest, transform),
        'X-Tuturuuu-Delivery-Cache': missStatus,
        'X-Tuturuuu-Delivery-Version': String(deliveryVersion),
      };
    },
    /** The stored response for this key, shaped for the caller, or null. */
    async hit(options: { ifNoneMatch: string | null; range: string | null }) {
      if (!cache) return null;
      let stored: Response | undefined;
      try {
        stored = await cache.match(request);
      } catch (error) {
        console.warn('CMS asset edge cache match failed', error);
        return null;
      }
      if (!stored || stored.status !== 200 || !stored.headers.get('etag'))
        return null;
      return finalize(stored, 'HIT', options);
    },
    /** Stores a verified full 200; anything else is refused. */
    async store(full: Response) {
      if (cache) await putEdgeCacheEntry(cache, request, full);
    },
    /** Shapes a freshly built full 200 (conditional and range handling). */
    respond(
      full: Response,
      options: { ifNoneMatch: string | null; range: string | null }
    ) {
      return finalize(full, missStatus, options);
    },
  };
}

export function createAssetEdgeCache({
  getCache,
  isEnabled,
  readVersion,
}: {
  getCache: () => EdgeCache | null;
  isEnabled: () => boolean;
  readVersion: (workspaceId: string) => Promise<number>;
}) {
  return {
    /**
     * A slot for a published, revision-pinned request, or null when the
     * request must take the private path: no `v`, the fence is set, or the
     * delivery version cannot be read.
     */
    async open(input: OpenInput): Promise<AssetEdgeSlot | null> {
      if (!input.revision || !isEnabled()) return null;
      let version: number;
      try {
        version = await readVersion(input.workspaceId);
      } catch (error) {
        console.warn('CMS asset edge cache version read failed', error);
        return null;
      }
      const request = new Request(
        assetCacheKey({
          assetId: input.assetId,
          deliveryVersion: version,
          revision: input.revision,
          transform: input.transform,
          workspaceId: input.workspaceId,
        })
      );
      return createSlot(getCache(), request, version, input.transform);
    },
  };
}
