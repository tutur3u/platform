import handler from '@tanstack/react-start/server-entry';
import {
  prepareRoadmapRequest,
  roadmapBoundary,
  selectedBasepath,
} from './request-boundary';

export default {
  ...handler,
  fetch(...args: Parameters<typeof handler.fetch>) {
    const basepath = selectedBasepath(args[0]);
    const boundary = roadmapBoundary(args[0], basepath);
    if (boundary) return boundary;
    const [request, ...options] = args;
    return handler.fetch(prepareRoadmapRequest(request, basepath), ...options);
  },
};
