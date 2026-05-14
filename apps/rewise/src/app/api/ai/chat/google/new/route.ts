import { createPOST } from '@tuturuuu/ai/chat/google/new/route';
import {
  createAppSessionUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const preferredRegion = 'sin1';

const POST = createPOST({
  async resolveGatewayAuth(request) {
    const appSessionToken = getAppSessionTokenFromRequest(request);

    if (!appSessionToken) {
      return null;
    }

    const verification = verifyAppSessionRequest(request, {
      targetApp: 'rewise',
    });

    if (!verification.ok) {
      return {
        ok: false,
        response: new Response('Unauthorized', { status: 401 }),
      };
    }

    return {
      auth: {
        supabase: (await createAdminClient({
          noCookie: true,
        })) as TypedSupabaseClient,
        user: createAppSessionUser(verification.claims),
      },
      ok: true,
    };
  },
});

export { POST };
