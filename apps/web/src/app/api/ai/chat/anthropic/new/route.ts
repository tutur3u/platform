import { POST } from '@repo/ai/chat/anthropic/new/route';

export const config = {
  maxDuration: 60,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

export { POST };
