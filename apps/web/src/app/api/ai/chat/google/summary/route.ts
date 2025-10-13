import {
  createPATCH,
  maxDuration,
  preferredRegion,
  runtime,
} from '@tuturuuu/ai/chat/google/summary/route';

const PATCH = createPATCH({
  serverAPIKeyFallback: true,
});

export { maxDuration, PATCH, preferredRegion, runtime };
