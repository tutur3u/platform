import { createPATCH } from '@tuturuuu/ai/chat/google/summary/route';

export const config = {
  maxDuration: 60,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

const PATCH = createPATCH({
  serverAPIKeyFallback: true,
});

export { PATCH };
