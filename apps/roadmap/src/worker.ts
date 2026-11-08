import handler from '@tanstack/react-start/server-entry';
import { withRoadmapCachePolicy } from './cache-policy';
import {
  prepareRoadmapRequest,
  roadmapBoundary,
  selectedBasepath,
} from './request-boundary';

export default {
  ...handler,
  async fetch(...args: Parameters<typeof handler.fetch>) {
    const basepath = selectedBasepath(args[0]);
    const boundary = roadmapBoundary(args[0], basepath);
    if (boundary) return withRoadmapCachePolicy(args[0], boundary);
    const [request, ...options] = args;
    const response = await handler.fetch(
      prepareRoadmapRequest(request, basepath),
      ...options
    );
    return withRoadmapCachePolicy(request, response);
  },
};
