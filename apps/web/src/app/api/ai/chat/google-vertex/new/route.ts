import { POST } from '@repo/ai/chat/google-vertex/new/route';

export const config = {
  maxDuration: 60,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

export { POST };
