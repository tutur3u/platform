import handler from '@tanstack/react-start/server-entry';
import { buildInfoResponse, isBuildInfoPath } from './build-info.ts';
import { withRoadmapCachePolicy } from './cache-policy.ts';
import {
  normalizeLocalHost,
  prepareRoadmapRequest,
  roadmapBoundary,
  selectedBasepath,
} from './request-boundary.ts';

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
    const response = await handler.fetch(
      prepareRoadmapRequest(request, basepath),
      ...args.slice(1)
    );
    return withRoadmapCachePolicy(request, response);
  },
};
