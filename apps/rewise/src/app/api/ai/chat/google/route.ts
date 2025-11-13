import { createPOST } from '@tuturuuu/ai/chat/google/route';

export const maxDuration = 90;
export const preferredRegion = 'sin1';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
