import { createPOST } from '@tuturuuu/ai/chat/google/route';

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
