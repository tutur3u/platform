import { createPOST } from '@ncthub/ai/chat/google/route';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
