import handler from '@tanstack/react-start/server-entry';
import { roadmapBoundary } from './request-boundary';

export default {
  ...handler,
  fetch(...args: Parameters<typeof handler.fetch>) {
    return roadmapBoundary(args[0]) ?? handler.fetch(...args);
  },
};
