import { createPOST } from '@tuturuuu/ai/chat/google/route';

// Unified chat endpoint — accepts any gateway model ID (e.g. "google/gemini-2.5-flash").
// The Google route's createPOST already handles full gateway model IDs via the
// `model.includes('/')` check, so it works as a universal handler.
const POST = createPOST({
  serverAPIKeyFallback: true,
});

export { POST };
