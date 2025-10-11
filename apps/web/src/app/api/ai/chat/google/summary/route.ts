import { createPATCH } from '@tuturuuu/ai/chat/google/summary/route';

export const maxDuration = 90;
export const preferredRegion = 'sin1';
export const runtime = 'edge';

const PATCH = createPATCH({
  serverAPIKeyFallback: true,
});

export { PATCH };
