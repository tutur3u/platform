import type { FinanceRouteAuthContext } from '@tuturuuu/apis/finance/request-access';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
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

export async function resolveFinanceRouteAuthContext(
  request: Request
): Promise<FinanceRouteAuthContext | undefined> {
  const appSessionToken = getAppSessionTokenFromRequest(request);

  if (!appSessionToken) {
    return undefined;
  }

  const verification = verifyCliAccessToken(appSessionToken);

  if (!verification.ok) {
    return undefined;
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;

  return {
    sbAdmin,
    supabase: sbAdmin,
    user: createCliSessionUser(verification.claims),
  };
}
