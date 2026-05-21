import type { FinanceRouteAuthContext } from '@tuturuuu/apis/finance/request-access';
import {
  attachSupabaseAuthUser,
  createAppSessionUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

function createCliSessionUser(claims: { email: string | null; sub: string }) {
  return {
    aud: 'authenticated',
    email: claims.email ?? undefined,
    id: claims.sub,
  } as SupabaseUser;
}

async function createFinanceAuthContext(
  user: SupabaseUser
): Promise<FinanceRouteAuthContext> {
  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;

  return {
    sbAdmin,
    supabase: attachSupabaseAuthUser(sbAdmin, user),
    user,
  };
}

export async function resolveFinanceRouteAuthContext(
  request: Request
): Promise<FinanceRouteAuthContext | undefined> {
  const appSessionVerification = verifyAppSessionRequest(request, {
    targetApp: ['finance', 'platform'],
  });

  if (appSessionVerification.ok) {
    return createFinanceAuthContext(
      createAppSessionUser(appSessionVerification.claims)
    );
  }

  const appSessionToken = getAppSessionTokenFromRequest(request);

  if (!appSessionToken) {
    return undefined;
  }

  const verification = verifyCliAccessToken(appSessionToken);

  if (!verification.ok) {
    return undefined;
  }

  return createFinanceAuthContext(createCliSessionUser(verification.claims));
}
