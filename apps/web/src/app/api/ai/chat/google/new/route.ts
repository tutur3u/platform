import { createPOST } from '@ncthub/ai/chat/google/new/route';

export const config = {
  maxDuration: 90,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
