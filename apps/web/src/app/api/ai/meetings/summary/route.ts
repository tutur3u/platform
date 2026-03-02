import { createPOST } from '@tuturuuu/ai/meetings/summary/route';

export const preferredRegion = 'sin1';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
