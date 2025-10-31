import { createPATCH } from '@ncthub/ai/chat/google/summary/route';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const PATCH = createPATCH({
  serverAPIKeyFallback: true,
});

export { PATCH };
