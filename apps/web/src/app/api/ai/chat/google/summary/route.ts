import {
  createPATCH,
  maxDuration as routeMaxDuration,
  preferredRegion as routePreferredRegion,
  runtime as routeRuntime,
} from '@tuturuuu/ai/chat/google/summary/route';

export const preferredRegion = routePreferredRegion;
export const maxDuration = routeMaxDuration;
export const runtime = routeRuntime;

const PATCH = createPATCH({
  serverAPIKeyFallback: true,
});

export { PATCH };
