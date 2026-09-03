import { createPATCH } from '@tuturuuu/ai/chat/google/summary/route';
import { resolveRewiseAiRouteAuth } from '../route-auth';

const PATCH = createPATCH({
  requireWorkspaceId: true,
  resolveAuth: resolveRewiseAiRouteAuth,
});

export { PATCH };
