import { createPOST } from '@tuturuuu/ai/generate/route';

export const config = {
  maxDuration: 90,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
