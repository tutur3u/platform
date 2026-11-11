import handler from '@tanstack/react-start/server-entry';
import { buildInfoResponse, isBuildInfoPath } from './build-info.ts';
import { isHashedAssetPath, withRoadmapCachePolicy } from './cache-policy.ts';
import { withContentSecurityPolicy } from './csp.ts';
import { hostsResponse, isHostsPath } from './live/host-probe.ts';
import { SITEMAP_PATH, sitemapResponse } from './seo.ts';
import {
  normalizeLocalHost,
  prepareRoadmapRequest,
  roadmapBoundary,
  selectedBasepath,
} from './request-boundary.ts';

function assetFetch(
  env: unknown
): ((request: Request) => Promise<Response>) | undefined {
  if (!env || typeof env !== 'object' || !('ASSETS' in env)) return undefined;
  const assets = (env as { ASSETS?: { fetch?: unknown } }).ASSETS;
  if (!assets || typeof assets.fetch !== 'function') return undefined;
  return assets.fetch.bind(assets);
}

async function hashedAssetResponse(
  request: Request,
  env: unknown
): Promise<Response | undefined> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
  const url = new URL(request.url);
  if (!isHashedAssetPath(url.pathname)) return undefined;
  const fetchAsset = assetFetch(env);
  if (!fetchAsset) return undefined;
  const upstream = await fetchAsset(
    new Request(url, { method: request.method })
  );
  if (!upstream.ok) return undefined;
  return withRoadmapCachePolicy(request, upstream);
}

export default {
  ...handler,
  async fetch(...args: Parameters<typeof handler.fetch>) {
    const [incoming, ...options] = args;
    const request = normalizeLocalHost(incoming);
    const basepath = selectedBasepath(request);
    const boundary = roadmapBoundary(request, basepath);
    if (boundary) return withRoadmapCachePolicy(request, boundary);
    const url = new URL(request.url);
    if (
      isBuildInfoPath(url.pathname) &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      return withRoadmapCachePolicy(
        request,
        buildInfoResponse(__ROADMAP_BUILD_SHA__, request.method)
      );
    }
    if (url.pathname === SITEMAP_PATH) {
      return withRoadmapCachePolicy(
        request,
        sitemapResponse(request.method, __ROADMAP_BUILD_TIME__)
      );
    }
    if (isHostsPath(url.pathname)) {
      return withRoadmapCachePolicy(
        request,
        await hostsResponse(
          request.method,
          (url, init) => fetch(url, init),
          /^[a-f0-9]{40}$/.test(__ROADMAP_BUILD_SHA__)
            ? __ROADMAP_BUILD_SHA__
            : null
        )
      );
    }
    const asset = await hashedAssetResponse(request, options[0]);
    if (asset) return asset;
    const response = await handler.fetch(
      prepareRoadmapRequest(request, basepath),
      ...options
    );
    return withRoadmapCachePolicy(
      request,
      await withContentSecurityPolicy(response)
    );
  },
};
