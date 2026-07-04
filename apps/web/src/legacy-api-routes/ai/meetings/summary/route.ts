import { createPOST } from '@tuturuuu/ai/meetings/summary/route';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
