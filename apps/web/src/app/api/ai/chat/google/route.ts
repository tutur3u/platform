import { createPOST } from '@tuturuuu/ai/chat/google/route';

export const preferredRegion = 'sin1';
export const runtime = 'edge';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
