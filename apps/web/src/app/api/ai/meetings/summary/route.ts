import { createPOST } from '@tuturuuu/ai/meetings/summary/route';

export const maxDuration = 90;
export const preferredRegion = 'sin1';
export const runtime = 'edge';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
