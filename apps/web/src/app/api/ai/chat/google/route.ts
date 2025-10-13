import {
  createPOST,
  maxDuration,
  preferredRegion,
  runtime,
} from '@tuturuuu/ai/chat/google/route';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { maxDuration, POST, preferredRegion, runtime };
