import { createPOST } from '@tuturuuu/ai/chat/google/route';

export const config = {
  maxDuration: 60,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

const POST = createPOST({
  serverAPIKeyFallback: false,
});

export { POST };
