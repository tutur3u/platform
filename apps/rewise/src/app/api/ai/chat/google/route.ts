import { createPOST } from '@tuturuuu/ai/chat/google/route';
import { resolveRewiseAiRouteAuth } from './route-auth';

const POST = createPOST({
  requireWorkspaceId: true,
  resolveAuth: resolveRewiseAiRouteAuth,
  serverAPIKeyFallback: true,
});

export { POST };
