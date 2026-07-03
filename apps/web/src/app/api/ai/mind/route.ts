import { resolveAiRouteAuth } from '@tuturuuu/ai/chat/google/route-auth';
import { createPOST } from '@tuturuuu/ai/mind/route';
import {
  applyMindAiPatch,
  createMindAiPatch,
  ensureMindAiThread,
  getMindBoardSnapshot,
  listMindBoards,
  persistMindAiMessage,
  searchMindNodes,
} from '@tuturuuu/mind-core';
import { requireMindAccess } from '@tuturuuu/mind-core/access';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export const POST = createPOST({
  applyPatch: applyMindAiPatch,
  createPatch: createMindAiPatch,
  ensureThread: ensureMindAiThread,
  getSnapshot: getMindBoardSnapshot,
  listBoards: listMindBoards,
  persistMessage: persistMindAiMessage,
  resolveAuth: async (request) => {
    const aiAuth = await resolveAiRouteAuth(request);
    if (aiAuth.ok) return aiAuth;

    const appSessionAuth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'mind' },
    });
    if (appSessionAuth.ok) return appSessionAuth;

    return aiAuth;
  },
  resolveAccess: async ({ auth, request, wsId }) => {
    const access = await requireMindAccess({
      context: {
        supabase: auth.supabase,
        user: auth.user,
      },
      request,
      wsId,
    });

    if (!access.ok) {
      return {
        ok: false,
        response: access.response,
      };
    }

    return {
      ok: true,
      wsId: access.normalizedWsId,
    };
  },
  searchNodes: searchMindNodes,
});
