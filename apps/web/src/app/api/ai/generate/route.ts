import { createPOST } from '@tuturuuu/ai/generate/route';

export const preferredRegion = 'sin1';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
