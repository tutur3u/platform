import { createPATCH } from '@tuturuuu/ai/chat/google/summary/route';

export const config = {
  maxDuration: 90,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

const PATCH = createPATCH({
  serverAPIKeyFallback: false,
});

export { PATCH };
