import {
  createPOST,
  maxDuration as routeMaxDuration,
  preferredRegion as routePreferredRegion,
  runtime as routeRuntime,
} from '@tuturuuu/ai/chat/google/route';

export const preferredRegion = routePreferredRegion;
export const maxDuration = routeMaxDuration;
export const runtime = routeRuntime;

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
