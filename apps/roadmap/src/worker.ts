import handler from '@tanstack/react-start/server-entry';
import { buildInfoResponse, isBuildInfoPath } from './build-info.ts';
import { isHashedAssetPath, withRoadmapCachePolicy } from './cache-policy.ts';
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
    const request = normalizeLocalHost(args[0]);
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
    const asset = await hashedAssetResponse(request, args[1]);
    if (asset) return asset;
    const response = await handler.fetch(
      prepareRoadmapRequest(request, basepath),
      ...args.slice(1)
    );
    return withRoadmapCachePolicy(request, response);
  },
};
