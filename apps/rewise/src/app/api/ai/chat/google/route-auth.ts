import type { AiRouteAuthResult } from '@tuturuuu/ai/chat/google/route-auth';
import {
  attachSupabaseAuthUser,
  createAppSessionUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function resolveRewiseGatewayAuth(
  request: Request,
  { targetApp = 'rewise' }: { targetApp?: 'rewise' } = {}
) {
  const appSessionToken = getAppSessionTokenFromRequest(request);
  if (!appSessionToken) return null;

  const verification = verifyAppSessionRequest(request, {
    targetApp,
  });
  if (!verification.ok) {
    return {
      ok: false as const,
      response: new Response('Unauthorized', { status: 401 }),
    };
  }

  const user = createAppSessionUser(verification.claims);
  const supabase = attachSupabaseAuthUser(
    (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
    user
  );

  return {
    auth: { supabase, user },
    ok: true as const,
  };
}

export async function resolveRewiseAiRouteAuth(
  request: Request
): Promise<AiRouteAuthResult | null> {
  const resolution = await resolveRewiseGatewayAuth(request, {
    targetApp: 'rewise',
  });
  if (!resolution?.ok) return resolution;

  return {
    messageInsertMode: 'direct',
    ok: true,
    supabase: resolution.auth.supabase,
    user: resolution.auth.user,
  };
}
