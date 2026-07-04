import { createPOST } from '@tuturuuu/ai/generate/route';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
